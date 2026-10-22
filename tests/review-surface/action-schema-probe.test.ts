import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ActionProposalSchema, ActionVerificationSchema } from '../../src/review-actions.js'
import { assertEmptyOutput, assertSafeEnvironment, consume, createGuardedFetch, expectedSdkHeaders, FIXTURES, loadFixtures, MANIFEST_SHA, parseContext, prepare, runProbe, type ProbeClientFactory, type ProbeContext, type Wire } from '../../scripts/probe-action-schema.js'

const root = process.cwd()
const loaded = loadFixtures(root)
const empty = { changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] }
const reply = { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'review_actions', input: empty }], usage: { input_tokens: 10, output_tokens: 20 } }
const response = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers })
const factory: ProbeClientFactory = options => {
  expect(options).toMatchObject({ apiKey: 'offline-not-a-real-key', authToken: null, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: 120000 })
  const fetch = options?.fetch; if (!fetch) throw new Error('mandatory injected fetch')
  return { post: async (path, request) => {
    // SDK source-matched factory double; actual SDK is exercised only in the isolated child.
    const body = JSON.stringify(request.body, null, 2)
    const value = await fetch(`https://api.anthropic.com${path}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
    return value.json()
  } }
}
function fakeWire(answers: unknown[], calls: string[] = []): Wire {
  return async (url, init) => { calls.push(url); expect(init.redirect).toBe('error'); expect(init.signal).toBeDefined(); const value = answers.shift(); if (value instanceof Error) throw value; return value instanceof Response ? value : response(value) }
}
const run = (answers: unknown[], calls?: string[]) => runProbe(loaded, 'offline-not-a-real-key', factory, fakeWire(answers, calls))

describe('manual synthetic probe — no transport', () => {
  it('pins immutable public31c data and proves the exact raw-empty validator against adopted native schemas', () => {
    expect(loaded.manifest.candidateCommit).toBe('31c45e2331f2997be55fa8e261682d1368cc40df')
    expect(loaded.data.size).toBe(6)
    expect(ActionProposalSchema.parse(empty)).toEqual(empty)
    expect(ActionVerificationSchema.parse(empty)).toEqual(empty)
    for (const bad of [{}, { ...empty, extra: [] }, { ...empty, changes: [{}] }, { ...empty, suggestions: null }]) expect(() => assertEmptyOutput(bad)).toThrow()
    expect(() => assertEmptyOutput(empty)).not.toThrow()
  })
  it('consumes exactly2counts+2messages sequentially and distinguishes SDK pretty bytes', async () => {
    const calls: string[] = []; const result = await run([{ input_tokens: 199872 }, reply, { input_tokens: 0 }, reply], calls)
    expect(result.errorCode).toBeUndefined(); expect(result.protocolSuccess).toEqual(['proposer', 'verifier'])
    expect(calls.map(url => new URL(url).pathname)).toEqual(['/v1/messages/count_tokens', '/v1/messages', '/v1/messages/count_tokens', '/v1/messages'])
    expect(result.calls.filter(call => call.endpoint === 'messages').map(call => call.wireBytes)).toEqual([22099, 11585])
    expect(result.calls.every(call => call.canonicalBodySha256 !== call.wireSha256)).toBe(true)
  })
  it.each([199873, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '10', null])('holds invalid or overflowing counter %s before any message', async input_tokens => {
    const result = await run([{ input_tokens }]); expect(result.calls).toHaveLength(1); expect(result.protocolSuccess).toEqual([]); expect(result.errorCode).toBeDefined()
  })
  it.each([
    { ...reply, stop_reason: 'max_tokens' }, { ...reply, content: [] }, { ...reply, content: [...reply.content, ...reply.content] },
    { ...reply, content: [{ type: 'text', text: 'not a tool' }] },
    { ...reply, content: [{ type: 'tool_use', name: 'wrong', input: empty }] },
    { ...reply, content: [{ type: 'tool_use', name: 'review_actions', input: {} }] },
    { ...reply, content: [{ type: 'tool_use', name: 'review_actions', input: { ...empty, suggestions: [{}] } }] },
  ])('stops all later calls on protocol failure', async bad => {
    const result = await run([{ input_tokens: 1 }, bad]); expect(result.calls).toHaveLength(2); expect(result.compilerAcceptance).toEqual(['proposer']); expect(result.protocolSuccess).toEqual([]); expect(result.errorCode).toBeDefined()
  })
  it('does not retry, leak provider text/IDs, or confuse compiler400 with protocol success', async () => {
    const secret = 'UNTRUSTED_PROVIDER_ERROR_CONTAINING_PRIVATE_DATA'
    const result = await run([{ input_tokens: 1 }, response({ error: { message: secret } }, 400, { 'request-id': 'bad\tvalue' })])
    expect(result.calls).toHaveLength(2); expect(result.compilerAcceptance).toEqual([]); expect(result.errorCode).toBe('PROVIDER_400')
    expect(JSON.stringify(result)).not.toContain(secret); expect(result.calls[1].requestId).toBeNull()
    const unknown = await run([new Error(secret)]); expect(unknown.errorCode).toBe('PROBE_STOPPED'); expect(JSON.stringify(unknown)).not.toContain(secret)
  })
  it.each([201, 202, 204, 302, 307, 429, 500])('requires exact200, stops at %s without retry/redirect', async status => {
    const result = await run([status === 204 ? new Response(null, { status }) : response({}, status)]); expect(result.calls).toHaveLength(1); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
  })
  it.each([201, 202])('does not call a non200 messages response protocol/compiler success (%s)', async status => {
    const result = await run([{ input_tokens: 1 }, response(reply, status)])
    expect(result.calls).toHaveLength(2); expect(result.compilerAcceptance).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
  })
  it('does not qualify a rejected redirected200 response as compiler acceptance', async () => {
    const redirected = response(reply)
    Object.defineProperty(redirected, 'redirected', { value: true }) // Fake response only; no redirect/network is performed.
    const result = await run([{ input_tokens: 1 }, redirected])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
    expect(result.compilerAcceptance).toEqual([]); expect(result.protocolSuccess).toEqual([])
  })
  it('bounds all response bytes before SDK parsing', async () => {
    const result = await run([new Response('x'.repeat(131073))]); expect(result.errorCode).toBe('RESPONSE_BYTE_LIMIT'); expect(result.calls).toHaveLength(1)
  })
  it('consumes permission before an unknown transport result and denies a fifth call', async () => {
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => { expect(receipts).toHaveLength(1); throw new Error('unknown transport') }, receipts, 'offline-not-a-real-key')
    const invoke = (fetch: typeof guarded, role: 'proposer' | 'verifier', kind: 'count' | 'messages') => {
      const body = JSON.stringify(loaded.data.get(`${role}.synthetic-${kind}-request.json`), null, 2)
      return fetch(`https://api.anthropic.com/v1/messages${kind === 'count' ? '/count_tokens' : ''}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
    }
    await expect(invoke(guarded, 'proposer', 'count')).rejects.toThrow('unknown transport')
    await expect(invoke(guarded, 'proposer', 'count')).rejects.toThrow('TRANSPORT_ALREADY_STOPPED')
    let calls = 0
    const finite = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
    for (const role of ['proposer', 'verifier'] as const) for (const kind of ['count', 'messages'] as const) await invoke(finite, role, kind)
    await expect(invoke(finite, 'proposer', 'count')).rejects.toThrow(); expect(calls).toBe(4)
  })
  it('cancels unread failure streams and never copies an exact secret into request-ID receipts', async () => {
    let canceled = false
    const stopped = await run([new Response(new ReadableStream({ cancel: () => { canceled = true } }), { status: 400 })])
    expect(canceled).toBe(true); expect(stopped.errorCode).toBe('PROVIDER_400')
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => response({}, 200, { 'request-id': 'req_Secret123' }), receipts, 'Secret123')
    const body = JSON.stringify(loaded.data.get('proposer.synthetic-count-request.json'), null, 2)
    await guarded('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('Secret123', Buffer.byteLength(body)) })
    expect(receipts[0].requestId).toBeNull(); expect(JSON.stringify(receipts)).not.toContain('Secret123')
  })
  it('pre-network guard rejects origin/query/path/method/body/length and permanently stops after a failure', async () => {
    let transport = 0
    for (const variant of ['origin', 'query', 'method', 'body', 'length']) {
      const receipts: Parameters<typeof createGuardedFetch>[2] = []
      const guarded = createGuardedFetch(loaded, async () => { transport += 1; return response({}) }, receipts, 'offline-not-a-real-key')
      const body = JSON.stringify(loaded.data.get('proposer.synthetic-count-request.json'), null, 2)
      const url = variant === 'origin' ? 'https://example.test/v1/messages/count_tokens' : `https://api.anthropic.com/v1/messages/count_tokens${variant === 'query' ? '?beta=true' : ''}`
      const options = { method: variant === 'method' ? 'GET' : 'POST', body: variant === 'body' ? '{}' : body, signal: new AbortController().signal, headers: { ...expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)), 'content-length': variant === 'length' ? '1' : String(Buffer.byteLength(body)) } }
      await expect(guarded(url, options)).rejects.toThrow()
      await expect(guarded('https://api.anthropic.com/v1/messages/count_tokens', { ...options, method: 'POST', body, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })).rejects.toThrow('TRANSPORT_ALREADY_STOPPED')
    }
    expect(transport).toBe(0)
  })
  it.each([
    { 'x-api-key': 'wrong-key' }, { authorization: 'Bearer forbidden' }, { 'x-unapproved-header': 'forbidden' },
    { 'anthropic-version': 'future' }, { 'x-stainless-retry-count': '1' }, { 'content-type': 'text/plain' }, { 'x-stainless-package-version': 'future' },
  ])('closes actual key/SDK header drift before transport', async patch => {
    let calls = 0
    const guarded = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
    const body = JSON.stringify(loaded.data.get('proposer.synthetic-count-request.json'), null, 2)
    await expect(guarded('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', body, signal: new AbortController().signal,
      headers: { ...expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)), ...patch } })).rejects.toThrow('WIRE_HEADERS_DENIED')
    expect(calls).toBe(0)
  })
  it('denies debug/alternate routes or credentials and key-bearing preflight', () => {
    for (const key of ['DEBUG', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'GH_PAT', 'GH_TOKEN', 'GITHUB_TOKEN']) expect(() => assertSafeEnvironment({ [key]: 'not-a-secret' }, false)).toThrow()
    expect(() => assertSafeEnvironment({ ANTHROPIC_API_KEY: 'offline-not-a-real-key' }, true)).toThrow()
  })
})

describe('native exclusive runner custody', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'manual-schema-test-')); const checkout = join(scratch, 'repo')
  let context: ProbeContext
  beforeAll(() => {
    for (const path of ['.github/workflows/action-schema-probe.yml', 'scripts/probe-action-schema.ts', 'package.json', 'pnpm-lock.yaml', FIXTURES]) cpSync(join(root, path), join(checkout, path), { recursive: true })
    execFileSync('git', ['init', '-q', checkout]); execFileSync('git', ['-C', checkout, 'add', '.'])
    execFileSync('git', ['-C', checkout, '-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.test', 'commit', '-qm', 'offline fixture'])
    const head = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    context = parseContext({ repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', capabilitySha: head, actualSha: head, workflowSha: head, workflowRef: 'ojfbot/daily-logger/.github/workflows/action-schema-probe.yml@refs/heads/main', manifestSha: MANIFEST_SHA, runId: '123', runAttempt: '1', probeId: '12345678-1234-4234-9234-123456789abc', approvalReceipt: 'call_FUTURETESTDOUBLEONLY' })
  })
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  it('reserves before execution, denies prepare/consume reentry and process reentry after unknown completion', () => {
    const dir = join(scratch, 'reservation'); prepare(checkout, dir, context)
    expect(() => prepare(checkout, dir, context)).toThrow(); consume(checkout, dir, context)
    expect(JSON.parse(readFileSync(join(dir, 'consumed.json'), 'utf8')).permissionConsumed).toBe(true)
    expect(() => consume(checkout, dir, context)).toThrow()
    const code = `import {consume} from ${JSON.stringify(resolve('scripts/probe-action-schema.ts'))};consume(${JSON.stringify(checkout)},${JSON.stringify(dir)},${JSON.stringify(context)})`
    const reentry = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, env: { PATH: process.env.PATH, HOME: tmpdir() }, encoding: 'utf8' })
    expect(reentry.status).toBe(1); expect(reentry.stderr).toContain('EEXIST')
  })
  it('holds context/source drift without consuming fresh execution', () => {
    const dir = join(scratch, 'drift'); prepare(checkout, dir, context)
    expect(() => consume(checkout, dir, { ...context, runId: '124' })).toThrow('RESERVATION_CONTEXT_DRIFT')
  })
  it('holds changed script/fixture bytes before consuming or reserving execution', () => {
    const dir = join(scratch, 'source-drift'); prepare(checkout, dir, context)
    const path = join(checkout, 'scripts/probe-action-schema.ts'); const prior = readFileSync(path)
    try { writeFileSync(path, '// drift\n'); expect(() => consume(checkout, dir, context)).toThrow('SOURCE_BLOB_DRIFT') } finally { writeFileSync(path, prior) }
    consume(checkout, dir, context)
    const fixture = join(checkout, FIXTURES, 'proposer.synthetic-count-request.json'); const bytes = readFileSync(fixture)
    try { writeFileSync(fixture, '{}'); expect(() => prepare(checkout, join(scratch, 'bad-fixture'), context)).toThrow('FIXTURE_FILE_PIN') } finally { writeFileSync(fixture, bytes) }
  })
  it('rejects old prep authority, rerun/fork/branch/source mismatches', () => {
    for (const patch of [{ approvalReceipt: 'call_7b31265ee4994084ad41ca97a6ae4a6d' }, { approvalReceipt: 'call_7d9b3db53550499184fb6c002b86fcab' }, { approvalReceipt: 'call_b2c40b1e97cb46eca57715621e133b4b' }, { approvalReceipt: 'call_0dd2adeda1c64d6ab5994b0ae17d437b' }, { runAttempt: '2' }, { ref: 'refs/heads/test' }, { actor: 'unknown' }, { workflowSha: '0'.repeat(40) }]) expect(() => parseContext({ ...context, ...patch })).toThrow()
  })
})

it('runs the sole actual SDK observation only inside a network-trapped, credential-free child', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', resolve('tests/review-surface/fixtures/action-schema-probe-sdk-child.ts')], {
    cwd: root, env: { PATH: process.env.PATH, HOME: tmpdir() }, encoding: 'utf8', timeout: 20000,
  })
  expect(child.stderr).toBe(''); expect(child.status).toBe(0)
  const proof = JSON.parse(child.stdout)
  expect(proof).toMatchObject({ trappedNetworkAttempts: 0, clientFetchInjected: true, protocolSuccess: ['proposer', 'verifier'], messagesWireBytes: [22099, 11585], calls: 4 })
})
