import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import { createHttpsTransport } from '../src/telemetry-transport.js'
import { tlsFixture, until } from './fixtures/telemetry-tls.js'

let fixture: ReturnType<typeof tlsFixture>
before(() => { fixture = tlsFixture() })
after(() => fixture.remove())
const authorization = 'Basic SYNTHETIC-HEADER-ONLY'

test('HTTPS exact body cap, one in-flight request and response limit', async () => {
  const received: Buffer[] = []
  const server = await fixture.receiver((req, res) => { const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { received.push(Buffer.concat(chunks)); setTimeout(() => { res.end('{}') }, 25) }) })
  const transport = createHttpsTransport({ endpoint: server.endpoint, ca: fixture.ca, authorization, maxBytes: 32 })
  try {
    assert.equal((await transport.send(Buffer.alloc(33), 500)).status, 'failure')
    assert.equal(received.length, 0)
    const data = Buffer.alloc(32, 'x')
    const first = transport.send(data, 500)
    const rest = await Promise.all(Array.from({ length: 50 }, () => transport.send(data, 500)))
    assert.ok(rest.every(result => result.status === 'failure'))
    assert.equal((await first).status, 'success')
    assert.deepEqual(received, [data])
    assert.equal(transport.diagnostics().inFlight, 0)
  } finally { transport.shutdown(); await server.close() }
  const oversized = await fixture.receiver((_req, res) => res.end(Buffer.alloc(8192)))
  const second = createHttpsTransport({ endpoint: oversized.endpoint, ca: fixture.ca, authorization })
  try { assert.equal((await second.send(Buffer.from('{}'), 500)).status, 'failure'); assert.equal(second.diagnostics().closed, true) }
  finally { second.shutdown(); await oversized.close() }
})

test('all redirect classes refuse same/cross origin authorization forwarding; failures never retry', async () => {
  let targetHits = 0, sourceHits = 0
  const target = await fixture.receiver((_req, res) => { targetHits++; res.end('{}') })
  let status = 301, location = target.endpoint
  const source = await fixture.receiver((req, res) => { sourceHits++; assert.equal(req.headers.authorization, authorization); res.writeHead(status, { location }); res.end() })
  try {
    for (const code of [301, 302, 303, 307, 308, 401, 429, 503]) {
      status = code
      for (const destination of [target.endpoint, source.endpoint + '/redirected']) {
        location = destination
        const transport = createHttpsTransport({ endpoint: source.endpoint, ca: fixture.ca, authorization })
        try { assert.equal((await transport.send(Buffer.from('{}'), 500)).status, 'failure') } finally { transport.shutdown() }
      }
    }
    assert.equal(sourceHits, 16); assert.equal(targetHits, 0)
  } finally { await source.close(); await target.close() }
})

test('wrong CA and wrong hostname reject before credentials reach HTTP handler', async () => {
  let hits = 0
  const server = await fixture.receiver((_req, res) => { hits++; res.end('{}') })
  const wrongHost = await fixture.receiver((_req, res) => { hits++; res.end('{}') }, true)
  try {
    for (const [endpoint, ca] of [[server.endpoint, fixture.wrongCa], [wrongHost.endpoint, fixture.ca]]) {
      const transport = createHttpsTransport({ endpoint, ca, authorization })
      try { assert.equal((await transport.send(Buffer.from('{}'), 500)).status, 'failure') } finally { transport.shutdown() }
    }
    assert.equal(hits, 0)
  } finally { await server.close(); await wrongHost.close() }
})

test('public numeric destinations are rejected before opening a request', async () => {
  const transport = createHttpsTransport({ endpoint: 'https://203.0.113.9/api/public/otel/v1/traces', ca: fixture.ca, authorization })
  assert.equal((await transport.send(Buffer.from('{}'), 100)).status, 'failure')
  assert.equal(transport.diagnostics().requests, 0)
  transport.shutdown()
})

test('private endpoint DNS cannot return public or mixed destinations', async () => {
  const original = dns.lookup
  try {
    for (const addresses of [[{ address: '203.0.113.9', family: 4 }], [{ address: '127.0.0.1', family: 4 }, { address: '203.0.113.9', family: 4 }]]) {
      dns.lookup = ((_hostname: unknown, _options: unknown, callback: (error: null, records: typeof addresses) => void) => callback(null, addresses)) as typeof dns.lookup
      syncBuiltinESMExports()
      const transport = createHttpsTransport({ endpoint: 'https://receiver.fixture.invalid/api/public/otel/v1/traces', ca: fixture.ca, authorization })
      try { assert.equal((await transport.send(Buffer.from('{}'), 500)).status, 'failure'); assert.equal(transport.diagnostics().inFlight, 0) }
      finally { transport.shutdown() }
    }
  } finally { dns.lookup = original; syncBuiltinESMExports() }
})

test('header/body blackholes abort and quarantine; shutdown aborts before drain', async () => {
  for (const headers of [false, true]) {
    const server = await fixture.receiver((_req, res) => { if (headers) { res.writeHead(200); res.write('{') } })
    const transport = createHttpsTransport({ endpoint: server.endpoint, ca: fixture.ca, authorization })
    try {
      const started = performance.now()
      assert.equal((await transport.send(Buffer.from('{}'), 80)).status, 'failure')
      assert.ok(performance.now() - started < 500)
      assert.equal(transport.diagnostics().closed, true)
      assert.equal((await transport.send(Buffer.from('{}'), 80)).status, 'failure')
      assert.equal(transport.diagnostics().requests, 1)
      await until(() => server.sockets.size === 0)
    } finally { transport.shutdown(); await server.close() }
  }
  const server = await fixture.receiver(() => {})
  const transport = createHttpsTransport({ endpoint: server.endpoint, ca: fixture.ca, authorization })
  try { const result = transport.send(Buffer.from('{}'), 2000); transport.shutdown(); assert.equal((await result).status, 'failure'); assert.equal(transport.diagnostics().inFlight, 0) }
  finally { await server.close() }
})
