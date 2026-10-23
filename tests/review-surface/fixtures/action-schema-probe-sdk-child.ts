/** Sole actual SDK test: isolated process, no inherited credentials and no network escape. */
import { createRequire, syncBuiltinESMExports } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
let trappedNetworkAttempts = 0
function deny(): never { trappedNetworkAttempts += 1; throw new Error('OFFLINE_NETWORK_DENIED') }
for (const module of ['node:http', 'node:https']) {
  const value = require(module); value.request = deny; value.get = deny
}
const net = require('node:net'); net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny
const tls = require('node:tls'); tls.connect = deny
globalThis.fetch = deny
syncBuiltinESMExports()
for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'DEBUG', 'GH_TOKEN', 'GH_PAT', 'GITHUB_TOKEN']) assert.equal(process.env[key], undefined)
const { default: SDK } = await import('@anthropic-ai/sdk')
const { CASE_IDS, loadFixtures, runProbe } = await import('../../../scripts/probe-action-schema.js')
const loaded = loadFixtures(process.cwd())
const empty = { changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] }
let calls = 0; let clientFetchInjected = false
const result = await runProbe(loaded, 'offline-not-a-real-key', options => {
  assert.equal(options?.apiKey, 'offline-not-a-real-key'); assert.equal(options?.authToken, null)
  assert.equal(options?.baseURL, 'https://api.anthropic.com'); assert.equal(options?.maxRetries, 0); assert.equal(options?.timeout, 120000)
  assert.equal(typeof options?.fetch, 'function')
  const client = new SDK(options); clientFetchInjected = Object.getOwnPropertyDescriptor(client, 'fetch')?.value === options?.fetch
  return { post: (path, request) => client.post<Record<string, unknown>, unknown>(path, request) }
}, async (url, init) => {
  calls += 1; assert.equal(init.redirect, 'error'); assert.ok(init.signal)
  assert.equal(new URL(url).origin, 'https://api.anthropic.com')
  const body = url.endsWith('count_tokens') ? { input_tokens: 20 } : {
    stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'review_actions', input: empty }], usage: { input_tokens: 20, output_tokens: 20 },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'request-id': 'req_offline' } })
})
assert.equal(result.errorCode, undefined); assert.equal(trappedNetworkAttempts, 0)
assert.equal(calls, 12); assert.deepEqual(result.protocolSuccess, [...CASE_IDS])
assert.equal(result.version, 2); assert.equal(result.runtimeAcceptance, 'not_evaluated')
assert.deepEqual(result.authorityGranted, { runtimeAdoption: false, articleAttempt: false, publication: false })
let failingCalls = 0
const failure = await runProbe(loaded, 'offline-not-a-real-key', options => {
  const client = new SDK(options)
  return { post: (path, request) => client.post<Record<string, unknown>, unknown>(path, request) }
}, async url => {
  failingCalls += 1
  return url.endsWith('count_tokens') ? new Response('{"input_tokens":20}', { status: 200 })
    : new Response('{"error":{"message":"UNTRUSTED_PROVIDER_BODY_MUST_NOT_ESCAPE"}}', { status: 400 })
})
assert.equal(failure.errorCode, 'PROVIDER_400'); assert.equal(failingCalls, 2)
assert.deepEqual(failure.messagesHttp200, []); assert.deepEqual(failure.protocolSuccess, [])
assert.ok(!JSON.stringify(failure).includes('UNTRUSTED_PROVIDER_BODY_MUST_NOT_ESCAPE'))
assert.equal(trappedNetworkAttempts, 0)
console.log(JSON.stringify({ trappedNetworkAttempts, clientFetchInjected, protocolSuccess: result.protocolSuccess, messagesWireBytes: result.calls.filter(call => call.endpoint === 'messages').map(call => call.wireBytes), calls, compiler400Calls: failingCalls }))
