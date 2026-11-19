import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { projectExportConfig, type ExportConfig } from './telemetry-export-config.js'
import { createLangfuseTelemetry } from './telemetry-export-process.js'
import { NOOP_TELEMETRY } from './telemetry.js'

export const TELEMETRY_CONFIG_BYTES = 16_384
export class TelemetryConfigurationError extends Error {
  readonly code = 'TELEMETRY_CONFIG_INVALID'
  constructor() { super('Private fixture telemetry configuration invalid') }
}

/** Explicit startup input, never ambient SDK configuration. No key bytes are read here. */
export function readTelemetryConfig(path: string): Readonly<ExportConfig> {
  let fd: number | undefined
  try {
    if (typeof path !== 'string' || path.length > 4096 || !isAbsolute(path) || path.includes('\0')) throw new Error()
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.geteuid?.() || (stat.mode & 0o077) !== 0
      || stat.size < 1 || stat.size > TELEMETRY_CONFIG_BYTES) throw new Error()
    const bytes = Buffer.alloc(TELEMETRY_CONFIG_BYTES + 1)
    let count = 0
    for (;;) {
      const read = readSync(fd, bytes, count, bytes.length - count, null)
      count += read
      if (count > TELEMETRY_CONFIG_BYTES) throw new Error()
      if (!read) break
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)))
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== ['mode', 'endpoint', 'publicKeyFile', 'secretKeyFile', 'caFile', 'environment'].sort().join(',')) throw new Error()
    const config = projectExportConfig(value)
    if (!config) throw new Error()
    return config
  } catch { throw new TelemetryConfigurationError() }
  finally {
    if (fd !== undefined) { try { closeSync(fd) } catch { throw new TelemetryConfigurationError() } }
  }
}

/** One separately owned adapter per serve/work invocation. Remote failure is optional. */
export function createRuntimeTelemetry(path?: string): ReturnType<typeof createLangfuseTelemetry> {
  return path === undefined ? NOOP_TELEMETRY : createLangfuseTelemetry(readTelemetryConfig(path))
}
