import { isAbsolute } from 'node:path'
import { isIP } from 'node:net'
import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs'

export const EXPORT_LIMITS = Object.freeze({ startupMs: 3000, ipcMs: 100, heartbeatMs: 1000, shutdownMs: 230, records: 128, segments: 16, segmentMs: 60_000, spans: 128, batch: 16, bodyBytes: 65_536, responseBytes: 4096, requestMs: 2000 })
export interface ExportConfig {
  mode: 'langfuse'
  endpoint: string
  publicKeyFile: string
  secretKeyFile: string
  caFile: string
  environment: 'qualification' | 'production'
}

export function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  return isIP(address) === 6 && (address === '::1' || /^(fc|fd)/i.test(address))
}

/** No cloud fallback, URL credentials, query, proxy settings or arbitrary config fields. */
export function projectExportConfig(input: unknown): Readonly<ExportConfig> | null {
  try {
    if (!input || typeof input !== 'object') return null
    const get = (key: string) => Object.getOwnPropertyDescriptor(input, key)?.value
    if (get('mode') !== 'langfuse') return null
    const endpoint = get('endpoint')
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return null
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api/public/otel/v1/traces') return null
    // The exact endpoint is operator supplied. The transport restricts every
    // resolved address to private ranges, without publishing fleet DNS topology.
    const paths = ['publicKeyFile', 'secretKeyFile', 'caFile'].map(key => get(key))
    if (!paths.every(path => typeof path === 'string' && path.length <= 4096 && isAbsolute(path) && !path.includes('\0'))) return null
    const environment = get('environment')
    if (environment !== 'qualification' && environment !== 'production') return null
    return Object.freeze({ mode: 'langfuse', endpoint: url.href, publicKeyFile: paths[0], secretKeyFile: paths[1], caFile: paths[2], environment })
  } catch { return null }
}

/** Child-only, bounded regular-file reads. Secret files must be owner-readable only. */
export function readExportFile(path: string, secret: boolean): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd), cap = secret ? 4096 : 131_072
    if (!stat.isFile() || stat.size < 1 || stat.size > cap || (secret && ((stat.mode & 0o077) !== 0 || stat.uid !== process.geteuid?.()))) throw new Error('export_file')
    const bytes = Buffer.alloc(cap + 1)
    let count = 0, read = 0
    do { read = readSync(fd, bytes, count, bytes.length - count, null); count += read } while (read && count < bytes.length)
    if (count > cap) throw new Error('export_file')
    const value = bytes.subarray(0, count).toString('utf8').trim()
    if (secret && !/^[\x21-\x7e]{1,4096}$/.test(value)) throw new Error('export_file')
    if (!value) throw new Error('export_file')
    return value
  } finally { closeSync(fd) }
}
