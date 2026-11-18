import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:https'
import type { RequestListener } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ExportConfig } from '../../src/telemetry-export-config.js'

/** Disposable synthetic identities only. Never installs trust or touches a real CA. */
export function tlsFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dailylogger-telemetry-fixture-'))
  const file = (name: string) => join(directory, name)
  const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' })
  openssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'root.key', '-out', 'root.pem', '-days', '1', '-subj', '/CN=Disposable fixture root', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
  openssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'wrong.key', '-out', 'wrong.pem', '-days', '1', '-subj', '/CN=Wrong disposable fixture root', '-addext', 'basicConstraints=critical,CA:TRUE')
  openssl('req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr', '-subj', '/CN=receiver.fixture.invalid')
  for (const [name, san] of [['leaf', 'DNS:localhost,IP:127.0.0.1'], ['mismatch', 'DNS:wrong.fixture.invalid']]) {
    writeFileSync(file(`${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`)
    openssl('x509', '-req', '-in', 'leaf.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '1', '-extfile', `${name}.ext`)
  }
  writeFileSync(file('public-key'), 'pk-synthetic-qualification', { mode: 0o600 })
  writeFileSync(file('secret-key'), 'sk-SYNTHETIC-SECRET-CANARY', { mode: 0o600 })
  return {
    file,
    ca: readFileSync(file('root.pem'), 'utf8'),
    wrongCa: readFileSync(file('wrong.pem'), 'utf8'),
    remove: () => rmSync(directory, { recursive: true, force: true }),
    async receiver(handler: RequestListener, mismatch = false) {
      const sockets = new Set<Duplex>()
      const server = createServer({ key: readFileSync(file('leaf.key')), cert: readFileSync(file(mismatch ? 'mismatch.pem' : 'leaf.pem')) }, handler)
      server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
      server.on('tlsClientError', () => {})
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('fixture_address')
      const endpoint = `https://127.0.0.1:${address.port}/api/public/otel/v1/traces`
      const config: ExportConfig = { mode: 'langfuse', endpoint, caFile: file('root.pem'), publicKeyFile: file('public-key'), secretKeyFile: file('secret-key'), environment: 'qualification' }
      return { endpoint, config, sockets, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())) } }
    },
  }
}

export async function until(predicate: () => boolean, ms = 4000) {
  const deadline = performance.now() + ms
  while (!predicate()) { if (performance.now() >= deadline) throw new Error('fixture_deadline'); await new Promise(resolve => setTimeout(resolve, 10)) }
}
