import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { callJournalModel, journalRouting, modelRequest } from '../src/journal-model.js'

test('model transport distinguishes rejection, uncertainty and invalid replies without hidden retries', async () => {
  const received: string[] = []
  const server = createServer((request, response) => {
    received.push(request.url ?? '')
    request.resume()
    if (request.url === '/timeout') return
    if (request.url === '/rate') { response.writeHead(429).end(); return }
    if (request.url === '/server-error') { response.writeHead(503).end(); return }
    if (request.url === '/redirect') { response.writeHead(307, { Location: '/rate' }).end(); return }
    if (request.url === '/oversize') { response.end('x'.repeat(513 * 1024)); return }
    const output = request.url === '/invalid' ? { findings: [''], surplus: true } : { findings: ['A bounded finding.'] }
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const invoke = async (path: string) => {
    const route = { endpoint: `http://127.0.0.1:${address.port}/${path}`, model: 'review-test', maxOutputTokens: 512,
      timeoutMs: path === 'timeout' ? 150 : 5000 }
    const input = { key: 'transport-proof', reportDate: '2026-11-17', evidence: 'Synthetic model transport test.' }
    return callJournalModel('review', input.reportDate, modelRequest('review', input, journalRouting.parse({ writer: route, reviewer: route })))
  }
  try {
    assert.deepEqual(await invoke('rate'), { status: 'rejected' })
    assert.deepEqual(await invoke('server-error'), { status: 'uncertain' })
    assert.deepEqual(await invoke('redirect'), { status: 'uncertain' })
    assert.deepEqual(await invoke('timeout'), { status: 'uncertain' })
    assert.deepEqual(await invoke('invalid'), { status: 'invalid' })
    assert.deepEqual(await invoke('oversize'), { status: 'invalid' })
    assert.deepEqual(await invoke('valid'), { status: 'complete', result: { findings: ['A bounded finding.'] } })
    assert.deepEqual(received, ['/rate', '/server-error', '/redirect', '/timeout', '/invalid', '/oversize', '/valid'])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
