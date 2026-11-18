import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { checkedRunDir } from '../src/storage.js'

export const PROXY_IMAGE = 'caddy:2.11.9-alpine@sha256:4851e54a46b206517c574821bb5cc67f170d2156041e9fbc4c9193b45e84a75b'
const ipv4 = (value: string) => value.split('.').reduce((result, octet) => result * 256 + Number(octet), 0)
const privateRanges = [['10.0.0.0', '10.255.255.255'], ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'], ['127.0.0.0', '127.255.255.255']].map(([start, end]) => [ipv4(start), ipv4(end)])
const privateRange = (start: number, end: number) => privateRanges.some(range => start >= range[0] && end <= range[1])
const privateAddress = z.string().refine(value => isIP(value) === 4 && privateRange(ipv4(value), ipv4(value)), 'Private IPv4 bind required')
const privateCidr = z.string().refine(value => {
  const [address, bits, ...extra] = value.split('/')
  const prefix = Number(bits)
  if (extra.length || bits === undefined || !/^\d{1,2}$/.test(bits) || prefix > 32 || isIP(address) !== 4) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const start = (ipv4(address) & mask) >>> 0
  const end = (start | (~mask >>> 0)) >>> 0
  return start === ipv4(address) && privateRange(start, end)
}, 'Canonical private IPv4 source CIDR required')
const configurationSchema = z.strictObject({
  origin: z.string().refine(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.origin === value && url.port !== '0'
        && isIP(url.hostname) === 0 && /^[a-z0-9.-]+$/.test(url.hostname)
    } catch { return false }
  }, 'Exact HTTPS DNS origin required'),
  bindIpv4: privateAddress,
  allowedPeerCidrs: z.array(privateCidr).min(1).max(16),
})

export function privateIngressConfiguration(value: unknown) { return configurationSchema.parse(value) }

/** Configuration contains addresses only; leaf keys and application credentials never enter this renderer. */
export function renderPrivateIngress(value: unknown) {
  const config = privateIngressConfiguration(value)
  const origin = new URL(config.origin)
  const peers = [...new Set(config.allowedPeerCidrs)].sort().join(' ')
  const forbidden = JSON.stringify({ schemaVersion: 1, error: 'forbidden' })
  const unavailable = JSON.stringify({ schemaVersion: 1, error: 'operation_unavailable' })
  const readUnavailable = JSON.stringify({ schemaVersion: 1, error: 'read_unavailable' })
  const caddyfile = `{
  admin off
  persist_config off
  auto_https off
  log default {
    exclude http
  }
  servers {
    protocols h1 h2
  }
}

https://:8443 {
  bind 0.0.0.0
  tls /tls/current/fullchain.pem /tls/current/privkey.pem
  @outside not remote_ip ${peers}
  @foreign expression {http.request.hostport} != ${JSON.stringify(origin.host)}
  @read method GET HEAD
  route {
    header Cache-Control no-store
    header Content-Type application/json
    respond @outside ${JSON.stringify(forbidden)} 403
    respond @foreign ${JSON.stringify(forbidden)} 403
    reverse_proxy http://api:4300 {
      header_up Host {http.request.hostport}
      lb_retries 0
    }
  }
  handle_errors {
    header Cache-Control no-store
    header Content-Type application/json
    header Retry-After 2
    respond @read ${JSON.stringify(readUnavailable)} 503
    respond ${JSON.stringify(unavailable)} 503
  }
}
`
  const overlay = {
    services: {
      api: { environment: { DAILYLOGGER_HTTP_HOST: '0.0.0.0' } },
      proxy: {
        image: PROXY_IMAGE, user: '1000:1000', init: true, read_only: true,
        cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
        entrypoint: ['caddy'], command: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
        tmpfs: ['/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m',
          '/config:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=700,size=16m',
          '/data:rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=700,size=16m'],
        volumes: [
          { type: 'bind', source: '${DAILYLOGGER_INGRESS_CONFIG_DIR:?Set private ingress configuration directory}/Caddyfile', target: '/etc/caddy/Caddyfile', read_only: true, bind: { create_host_path: false } },
          { type: 'bind', source: '${DAILYLOGGER_TLS_DIRECTORY:?Set protected parent TLS directory}', target: '/tls', read_only: true, bind: { create_host_path: false } },
        ],
        ports: [{ host_ip: config.bindIpv4, published: origin.port || '443', target: 8443, protocol: 'tcp' }],
        networks: ['oauth-outbound'], depends_on: { api: { condition: 'service_started' } }, stop_grace_period: '10s',
      },
    },
    networks: { application: { enable_ipv6: false }, 'oauth-outbound': { enable_ipv6: false } },
  }
  return { caddyfile, overlay }
}

export function preparePrivateIngress(value: unknown, destination: string) {
  if (existsSync(destination)) throw new Error('Private ingress destination must be new')
  const target = checkedRunDir(destination)
  const rendered = renderPrivateIngress(value)
  mkdirSync(target, { mode: 0o700 })
  try {
    writeFileSync(join(target, 'Caddyfile'), rendered.caddyfile, { mode: 0o644 })
    writeFileSync(join(target, 'compose.json'), `${JSON.stringify(rendered.overlay, null, 2)}\n`, { mode: 0o600 })
    return { schemaVersion: 1, configurationSha256: createHash('sha256').update(rendered.caddyfile).digest('hex'),
      files: ['Caddyfile', 'compose.json'], liveDeployment: false }
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputFile, destination, ...extra] = process.argv.slice(2)
  try {
    if (!inputFile || !destination || extra.length) throw new Error('Usage: pnpm service:ingress:prepare INPUT_JSON NEW_ABSOLUTE_OUTPUT')
    console.log(JSON.stringify(preparePrivateIngress(JSON.parse(readFileSync(inputFile, 'utf8')), destination)))
  } catch { process.stderr.write('Private ingress preparation failed; verify private addresses, HTTPS origin and new destination\n'); process.exitCode = 1 }
}
