import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { httpListenHost } from '../../src/http-server.js'
import { preparePrivateIngress, renderPrivateIngress } from '../../runtime/prepare-ingress.js'

const configuration = { origin: 'https://dailylogger.test:8443', bindIpv4: '127.0.0.1', allowedPeerCidrs: ['10.123.45.0/24'] }

test('the listener keeps loopback by default and requires an exact IPv4 bridge opt-in', () => {
  assert.equal(httpListenHost({}), '127.0.0.1')
  assert.equal(httpListenHost({ DAILYLOGGER_HTTP_HOST: '0.0.0.0' }), '0.0.0.0')
  for (const host of ['::', '192.0.2.5', 'localhost', '']) assert.throws(() => httpListenHost({ DAILYLOGGER_HTTP_HOST: host }))
})

test('private ingress renders only one explicit proxy binding and no signing or app secrets', () => {
  const value = renderPrivateIngress(configuration)
  assert.deepEqual(value.overlay.services.proxy.ports, [{ host_ip: '127.0.0.1', published: '8443', target: 8443, protocol: 'tcp' }])
  assert.deepEqual(value.overlay.services.proxy.networks, ['oauth-outbound'])
  assert.ok(value.caddyfile.includes('admin off'))
  assert.ok(value.caddyfile.includes('exclude http'))
  assert.ok(value.caddyfile.includes('remote_ip 10.123.45.0/24'))
  assert.equal(/trusted_proxies|client_ip|log_credentials|tls internal/.test(value.caddyfile), false)
  for (const invalid of [
    { bindIpv4: '0.0.0.0' }, { bindIpv4: '::' }, { bindIpv4: '203.0.113.5' },
    { allowedPeerCidrs: ['0.0.0.0/0'] }, { allowedPeerCidrs: ['203.0.113.0/24'] },
    { allowedPeerCidrs: ['10.123.45.5/24'] }, { origin: 'https://dailylogger.test:8443/path' },
    { origin: 'https://dailylogger.test:0' },
  ]) assert.throws(() => renderPrivateIngress({ ...configuration, ...invalid }))
})

test('private configuration is written outside Git without replacing prior output', () => {
  const root = mkdtempSync(join(tmpdir(), 'dailylogger-ingress-'))
  try {
    const output = join(root, 'private')
    preparePrivateIngress(configuration, output)
    const original = readFileSync(join(output, 'Caddyfile'))
    assert.throws(() => preparePrivateIngress(configuration, output), /must be new/)
    assert.deepEqual(readFileSync(join(output, 'Caddyfile')), original)
    assert.equal(existsSync(join(output, 'privkey.pem')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
