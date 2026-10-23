import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ActionProposalSchema, ActionVerificationSchema } from '../../src/review-actions.js'
import { assertEmptyOutput, assertSafeEnvironment, CASE_IDS, PURPOSE, serializeSafeSummary, consume, createGuardedFetch, expectedSdkHeaders, FIXTURES, loadFixtures, MANIFEST_SHA, parseContext, prepare, runProbe, type CaseId, type ProbeClientFactory, type ProbeContext, type Wire } from '../../scripts/probe-action-schema.js'

function childEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(['PATH', 'TMPDIR', 'HOME', 'COREPACK_HOME', 'COREPACK_ENABLE_NETWORK', 'COREPACK_ENABLE_DOWNLOAD_PROMPT', 'NODE_OPTIONS', 'RESPONSE_FORM_NETWORK_AUDIT'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]))
}
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
  it('pins immutable public fixed-response data and proves the exact raw-empty validator against adopted native schemas', () => {
    expect(loaded.manifest.runtimeSource).toBe('898143e26116dae54e029a8eabd27ec7ace844b3')
    expect(loaded.data.size).toBe(18)
    expect(ActionProposalSchema.parse(empty)).toEqual(empty)
    expect(ActionVerificationSchema.parse(empty)).toEqual(empty)
    for (const bad of [{}, { ...empty, extra: [] }, { ...empty, changes: [{}] }, { ...empty, suggestions: null }]) expect(() => assertEmptyOutput(bad)).toThrow()
    expect(() => assertEmptyOutput(empty)).not.toThrow()
  })
  it('uses required fixed rows and the reviewed scalar-null cells rather than object alternatives', () => {
    const proposer = loaded.data.get('full-fixed-form.tool-schema.json')
    expect(proposer).toHaveProperty('required', ['changes', 'suggestions', 'candidateDispositions', 'closingOptions'])
    expect(proposer).toHaveProperty('properties.candidateDispositions.items.required', ['candidateId', 'reason', 'kind', 'suggestionIndex', 'actionKey', 'citations'])
    expect(proposer).toHaveProperty('properties.candidateDispositions.items.properties.kind.enum', ['promote', 'map-existing', 'reject', 'verified-closure'])
    expect(proposer).toHaveProperty('properties.candidateDispositions.items.properties.suggestionIndex.anyOf', [{ type: 'integer' }, { type: 'null' }])
    expect(proposer).toHaveProperty('properties.closingOptions.items.properties.kind.enum', ['action', 'candidate', 'checkpoint'])
    expect(proposer).toHaveProperty('properties.closingOptions.items.required', expect.arrayContaining(['replaces', 'kind', 'actionKey', 'candidateIndex', 'target']))
    expect(proposer).not.toHaveProperty('properties.candidateDispositions.items.anyOf')
    expect(proposer).not.toHaveProperty('properties.closingOptions.items.anyOf')
    expect(loaded.data.get('changes-only.tool-schema.json')).toHaveProperty('required', ['changes', 'suggestions', 'candidateDispositions', 'closingOptions'])
  })
  it('retains the first case success but refuses a nonempty second case response', async () => {
    const badVerifier = { ...reply, content: [{ type: 'tool_use', name: 'review_actions', input: { ...empty, closingOptions: [{}] } }] }
    const result = await run([{ input_tokens: 1 }, reply, { input_tokens: 1 }, badVerifier])
    expect(result.calls).toHaveLength(4)
    expect(result.protocolSuccess).toEqual(['minimal-control'])
    expect(result.messagesHttp200).toEqual(['minimal-control', 'changes-only'])
    expect(result.errorCode).toBeDefined()
  })
  it('consumes exactly six counts and six Messages sequentially and distinguishes SDK pretty bytes', async () => {
    const calls: string[] = []; const result = await run(CASE_IDS.flatMap((_caseId, index) => [{ input_tokens: index === 0 ? 199872 : 0 }, reply]), calls)
    expect(result.errorCode).toBeUndefined(); expect(result.protocolSuccess).toEqual([...CASE_IDS])
    expect(calls.map(url => new URL(url).pathname)).toEqual(CASE_IDS.flatMap(() => ['/v1/messages/count_tokens', '/v1/messages']))
    expect(result.calls.filter(call => call.endpoint === 'messages').map(call => call.wireBytes)).toEqual(CASE_IDS.map(caseId => Buffer.byteLength(JSON.stringify(loaded.data.get(`${caseId}.synthetic-messages-request.json`), null, 2))))
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
    const result = await run([{ input_tokens: 1 }, bad]); expect(result.calls).toHaveLength(2); expect(result.messagesHttp200).toEqual(['minimal-control']); expect(result.protocolSuccess).toEqual([]); expect(result.errorCode).toBeDefined()
  })
  it('does not retry, leak provider text/IDs, or confuse compiler400 with protocol success', async () => {
    const secret = 'UNTRUSTED_PROVIDER_ERROR_CONTAINING_PRIVATE_DATA'
    const result = await run([{ input_tokens: 1 }, response({ error: { message: secret } }, 400, { 'request-id': 'bad\tvalue' })])
    expect(result.calls).toHaveLength(2); expect(result.messagesHttp200).toEqual([]); expect(result.errorCode).toBe('PROVIDER_400')
    expect(JSON.stringify(result)).not.toContain(secret); expect(result.calls[1].requestId).toBeNull()
    const unknown = await run([new Error(secret)]); expect(unknown.errorCode).toBe('TRANSPORT_FAILURE'); expect(JSON.stringify(unknown)).not.toContain(secret)
  })
  it.each([201, 202, 204, 302, 307, 429, 500])('requires exact200, stops at %s without retry/redirect', async status => {
    const result = await run([status === 204 ? new Response(null, { status }) : response({}, status)]); expect(result.calls).toHaveLength(1); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
  })
  it.each([201, 202])('does not call a non200 messages response protocol/compiler success (%s)', async status => {
    const result = await run([{ input_tokens: 1 }, response(reply, status)])
    expect(result.calls).toHaveLength(2); expect(result.messagesHttp200).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
  })
  it('does not qualify a rejected redirected200 response as compiler acceptance', async () => {
    const redirected = response(reply)
    Object.defineProperty(redirected, 'redirected', { value: true }) // Fake response only; no redirect/network is performed.
    const result = await run([{ input_tokens: 1 }, redirected])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
    expect(result.messagesHttp200).toEqual([]); expect(result.protocolSuccess).toEqual([])
  })
  it('bounds all response bytes before SDK parsing', async () => {
    const result = await run([new Response('x'.repeat(131073))]); expect(result.errorCode).toBe('RESPONSE_BYTE_LIMIT'); expect(result.calls).toHaveLength(1)
  })
  it('marks a generic stream rejection on the current200 call without leaking its message or claiming protocol success', async () => {
    const partial = new Response(new ReadableStream({ pull(controller) { controller.error(new Error('PRIVATE_STREAM_ERROR_MUST_NOT_ESCAPE')) } }))
    const result = await run([{ input_tokens: 1 }, partial])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('TRANSPORT_FAILURE'); expect(result.calls[1].failureCode).toBe('TRANSPORT_FAILURE')
    expect(result.messagesHttp200).toEqual(['minimal-control']); expect(result.protocolSuccess).toEqual([]); expect(JSON.stringify(result)).not.toContain('PRIVATE_STREAM_ERROR')
  })
  it('does not reassign a later pre-network rejection to an earlier successful call', async () => {
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => response({}), receipts, 'offline-not-a-real-key')
    for (const kind of ['count', 'messages'] as const) {
      const body = JSON.stringify(loaded.data.get(`minimal-control.synthetic-${kind}-request.json`), null, 2)
      await guarded(`https://api.anthropic.com/v1/messages${kind === 'count' ? '/count_tokens' : ''}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
    }
    const prior = structuredClone(receipts)
    await expect(guarded('https://unapproved.test/v1/messages/count_tokens', { method: 'POST' })).rejects.toThrow()
    expect(receipts).toEqual(prior); expect(receipts[1].failureCode).toBeUndefined()
  })
  it('consumes permission before an unknown transport result and denies a thirteenth call', async () => {
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => { expect(receipts).toHaveLength(1); throw new Error('unknown transport') }, receipts, 'offline-not-a-real-key')
    const invoke = (fetch: typeof guarded, caseId: CaseId, kind: 'count' | 'messages') => {
      const body = JSON.stringify(loaded.data.get(`${caseId}.synthetic-${kind}-request.json`), null, 2)
      return fetch(`https://api.anthropic.com/v1/messages${kind === 'count' ? '/count_tokens' : ''}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
    }
    await expect(invoke(guarded, 'minimal-control', 'count')).rejects.toThrow('unknown transport')
    await expect(invoke(guarded, 'minimal-control', 'count')).rejects.toThrow('TRANSPORT_ALREADY_STOPPED')
    let calls = 0
    const finite = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
    for (const caseId of CASE_IDS) for (const kind of ['count', 'messages'] as const) await invoke(finite, caseId, kind)
    await expect(invoke(finite, 'minimal-control', 'count')).rejects.toThrow(); expect(calls).toBe(12)
  })
  it('cancels unread failure streams and never copies an exact secret into request-ID receipts', async () => {
    let canceled = false
    const stopped = await run([new Response(new ReadableStream({ cancel: () => { canceled = true } }), { status: 400 })])
    expect(canceled).toBe(true); expect(stopped.errorCode).toBe('PROVIDER_400')
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => response({}, 200, { 'request-id': 'req_Secret123' }), receipts, 'Secret123')
    const body = JSON.stringify(loaded.data.get('minimal-control.synthetic-count-request.json'), null, 2)
    await guarded('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('Secret123', Buffer.byteLength(body)) })
    expect(receipts[0].requestId).toBeNull(); expect(JSON.stringify(receipts)).not.toContain('Secret123')
  })
  it('pre-network guard rejects origin/query/path/method/body/length and permanently stops after a failure', async () => {
    let transport = 0
    for (const variant of ['origin', 'query', 'method', 'body', 'length']) {
      const receipts: Parameters<typeof createGuardedFetch>[2] = []
      const guarded = createGuardedFetch(loaded, async () => { transport += 1; return response({}) }, receipts, 'offline-not-a-real-key')
      const body = JSON.stringify(loaded.data.get('minimal-control.synthetic-count-request.json'), null, 2)
      const url = variant === 'origin' ? 'https://example.test/v1/messages/count_tokens' : `https://api.anthropic.com/v1/messages/count_tokens${variant === 'query' ? '?beta=true' : ''}`
      const options = { method: variant === 'method' ? 'GET' : 'POST', body: variant === 'body' ? '{}' : body, signal: new AbortController().signal, headers: { ...expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)), 'content-length': variant === 'length' ? '1' : String(Buffer.byteLength(body)) } }
      await expect(guarded(url, options)).rejects.toThrow()
      await expect(guarded('https://api.anthropic.com/v1/messages/count_tokens', { ...options, method: 'POST', body, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })).rejects.toThrow('TRANSPORT_ALREADY_STOPPED')
    }
    expect(transport).toBe(0)
  })
  it.each<Record<string, string>>([
    { 'x-api-key': 'wrong-key' }, { authorization: 'Bearer forbidden' }, { 'x-unapproved-header': 'forbidden' },
    { 'anthropic-version': 'future' }, { 'x-stainless-retry-count': '1' }, { 'content-type': 'text/plain' }, { 'x-stainless-package-version': 'future' },
  ])('closes actual key/SDK header drift before transport', async patch => {
    let calls = 0
    const guarded = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
    const body = JSON.stringify(loaded.data.get('minimal-control.synthetic-count-request.json'), null, 2)
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
    context = parseContext({ version: 2, purpose: PURPOSE, repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', capabilitySha: head, actualSha: head, workflowSha: head, workflowRef: 'ojfbot/daily-logger/.github/workflows/action-schema-probe.yml@refs/heads/main', manifestSha: MANIFEST_SHA, runId: '123', runAttempt: '1', probeId: '12345678-1234-4234-9234-123456789abc', approvalReceipt: 'call_FUTURETESTDOUBLEONLY' })
  })
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  it('reserves before execution, denies prepare/consume reentry and process reentry after unknown completion', () => {
    const dir = join(scratch, 'reservation'); prepare(checkout, dir, context)
    expect(() => prepare(checkout, dir, context)).toThrow(); consume(checkout, dir, context)
    expect(JSON.parse(readFileSync(join(dir, 'consumed.json'), 'utf8')).permissionConsumed).toBe(true)
    expect(() => consume(checkout, dir, context)).toThrow()
    const code = `import {consume} from ${JSON.stringify(resolve('scripts/probe-action-schema.ts'))};consume(${JSON.stringify(checkout)},${JSON.stringify(dir)},${JSON.stringify(context)})`
    const reentry = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: root, env: childEnvironment(), encoding: 'utf8', timeout: 20000 })
    expect(reentry.status).toBe(1); expect(reentry.stderr).toContain('EEXIST')
  }, 20000)
  it('rejects a v1 reservation or a changed diagnostic purpose before consuming v2', () => {
    const dir = join(scratch, 'v1-reservation'); prepare(checkout, dir, context)
    const path = join(dir, 'reservation.json'); const original = readFileSync(path)
    const value = JSON.parse(original.toString())
    for (const patch of [{ version: 1 }, { purpose: 'role-based-probe' }]) {
      writeFileSync(path, JSON.stringify({ ...value, ...patch }))
      expect(() => consume(checkout, dir, context)).toThrow()
      expect(() => readFileSync(join(dir, 'consumed.json'))).toThrow()
    }
    writeFileSync(path, original); consume(checkout, dir, context)
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
    const fixture = join(checkout, FIXTURES, 'minimal-control.synthetic-count-request.json'); const bytes = readFileSync(fixture)
    try { writeFileSync(fixture, '{}'); expect(() => prepare(checkout, join(scratch, 'bad-fixture'), context)).toThrow('FIXTURE_FILE_PIN') } finally { writeFileSync(fixture, bytes) }
  })
  it('rejects old prep authority, rerun/fork/branch/source mismatches', () => {
    for (const patch of [{ approvalReceipt: 'call_7b31265ee4994084ad41ca97a6ae4a6d' }, { approvalReceipt: 'call_7d9b3db53550499184fb6c002b86fcab' }, { approvalReceipt: 'call_b2c40b1e97cb46eca57715621e133b4b' }, { approvalReceipt: 'call_0dd2adeda1c64d6ab5994b0ae17d437b' }, { approvalReceipt: 'call_3588e08b56544c2bb948a7205176d65a' }, { approvalReceipt: 'call_owner109f17d835e14f4d937e636c37542803' }, { runAttempt: '2' }, { ref: 'refs/heads/test' }, { actor: 'unknown' }, { workflowSha: '0'.repeat(40) }]) expect(() => parseContext({ ...context, ...patch })).toThrow()
  })
})

describe('provider error diagnostics — factory doubles only, no SDK construction', () => {
  const documented = 'Schema is too complex for compilation.'
  const earlier = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.'
  const envelope = (message: unknown, type: unknown = 'invalid_request_error') => ({ type: 'error', error: { type, message } })
  const failed = (value: unknown, headers = { 'content-type': 'application/json' }) => response(value, 400, headers)
  const diagnostic = async (value: unknown) => {
    const result = await run([{ input_tokens: 1 }, failed(value)])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('PROVIDER_400')
    expect(result.messagesHttp200).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.usage).toEqual({})
    expect(result.calls[0]).not.toHaveProperty('providerErrorType'); expect(result.calls[0]).not.toHaveProperty('providerErrorReason')
    return result.calls[1]
  }
  it.each([documented, earlier, `  ${documented.toUpperCase()}\n`, `\n${earlier.toUpperCase()}  `])('matches only either exact normalized known complexity sentence', async message => {
    expect(await diagnostic(envelope(message))).toMatchObject({ providerErrorType: 'invalid_request_error', providerErrorReason: 'schema_complexity' })
  })
  it.each([`Prefix ${documented}`, `${documented} More text.`, `${earlier} ${documented}`, 'schema complex', documented.replace('too complex', 'not too complex'), earlier.replace('too large', 'not too large'), documented.replace(' is ', '  is ')])('keeps approximate, negated or extra text unclassified', async message => {
    expect(await diagnostic(envelope(message))).toMatchObject({ providerErrorType: 'invalid_request_error', providerErrorReason: 'unclassified' })
  })
  it.each(["tools.0.custom: Schema type 'oneOf' is not supported", "tools.1.input_schema: Schema type '$ref' is not supported.", "Schema type '$defs' is not supported"])('matches the full bounded unsupported-feature template without retaining its identifier', async message => {
    const receipt = await diagnostic(envelope(message))
    expect(receipt).toMatchObject({ providerErrorType: 'invalid_request_error', providerErrorReason: 'schema_feature_unsupported' })
    expect(JSON.stringify(receipt)).not.toContain(message)
  })
  it.each(["Prefix Schema type 'oneOf' is not supported", "Schema type 'oneOf' is not supported. secret", `Schema type '${'x'.repeat(65)}' is not supported`, "tools.12345.custom: Schema type 'oneOf' is not supported"])('rejects widened unsupported-template interpretations', async message => {
    expect(await diagnostic(envelope(message))).toMatchObject({ providerErrorType: 'invalid_request_error', providerErrorReason: 'unclassified' })
  })
  it.each(['invalid_request_error', 'authentication_error', 'billing_error', 'permission_error', 'not_found_error', 'conflict_error', 'request_too_large', 'rate_limit_error', 'api_error', 'timeout_error', 'overloaded_error'])('retains an allowlisted provider type only', async type => {
    expect(await diagnostic(envelope('arbitrary provider text', type))).toMatchObject({ providerErrorType: type, providerErrorReason: 'unclassified' })
  })
  it('never claims a schema reason for another known type', async () => {
    expect(await diagnostic(envelope(documented, 'authentication_error'))).toMatchObject({ providerErrorType: 'authentication_error', providerErrorReason: 'unclassified' })
  })
  it.each([401, 429, 500, 529])('classifies a first counter HTTP%s failure without forwarding messages', async status => {
    const result = await run([response(envelope('arbitrary', 'rate_limit_error'), status, { 'content-type': 'application/json' })])
    expect(result.calls).toHaveLength(1); expect(result.errorCode).toBe('PROVIDER_HTTP_FAILURE')
    expect(result.calls[0]).toMatchObject({ status, failureCode: 'PROVIDER_HTTP_FAILURE', providerErrorType: 'rate_limit_error', providerErrorReason: 'unclassified' })
    expect(result.messagesHttp200).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.counts).toEqual({})
  })
  it('does not classify an error body received through a rejected redirect', async () => {
    const redirected = failed(envelope(documented)); Object.defineProperty(redirected, 'redirected', { value: true })
    const result = await run([redirected])
    expect(result.calls).toHaveLength(1); expect(result.errorCode).toBe('PROVIDER_400')
    expect(result.calls[0]).not.toHaveProperty('providerErrorType'); expect(result.calls[0]).not.toHaveProperty('providerErrorReason')
  })
  it.each([{}, [], { error: { type: 'invalid_request_error', message: documented } }, { type: 'wrong', error: { type: 'invalid_request_error', message: documented } }, envelope(documented, 'PRIVATE_UNKNOWN_TYPE'), envelope(documented, ['invalid_request_error']), envelope(null), { type: 'error', error: [] }])('rejects malformed, unauthenticated or unknown envelopes without echo', async value => {
    expect(await diagnostic(value)).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
  })
  it('retains no arbitrary field, error text or dummy selected key', async () => {
    const canary = 'offline-not-a-real-key'
    for (const value of [
      { ...envelope(documented), request_id: canary, extra: canary, nested: { value: canary } },
      { type: 'error', error: { type: 'invalid_request_error', message: documented, arbitrary: canary } },
      envelope(canary), envelope(`${documented}${canary}`), envelope(documented, canary),
    ]) expect(JSON.stringify(await diagnostic(value))).not.toContain(canary)
  })
  it.each(['text/plain', 'application/problem+json'])('ignores an unsupported media type without replacing HTTP400', async media => {
    const result = await run([{ input_tokens: 1 }, failed(envelope(documented), { 'content-type': media })])
    expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls[1]).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
  })
  it('accepts JSON charset media and exact UTF-8 cap, rejects cap+1 without replacing HTTP400', async () => {
    for (const bytes of [131072, 131073]) {
      const value = { ...envelope(documented), padding: '' }
      value.padding = 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(value)))
      const result = await run([{ input_tokens: 1 }, new Response(JSON.stringify(value), { status: 400, headers: { 'content-type': 'Application/JSON; charset=utf-8' } })])
      expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls).toHaveLength(2)
      expect(result.calls[1]).toMatchObject(bytes === 131072 ? { providerErrorType: 'invalid_request_error', providerErrorReason: 'schema_complexity' } : { providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
    }
  })
  it('malformed JSON, missing body and interrupted error-body read preserve HTTP400', async () => {
    for (const body of [new Response('{', { status: 400, headers: { 'content-type': 'application/json' } }), new Response(null, { status: 400 }),
      new Response(new ReadableStream({ pull(controller) { controller.error(new Error('PRIVATE_ERROR_BODY_STREAM_CANARY')) } }), { status: 400, headers: { 'content-type': 'application/json' } })]) {
      const result = await run([{ input_tokens: 1 }, body])
      expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls[1]).toMatchObject({ status: 400, failureCode: 'PROVIDER_400', providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR_BODY')
    }
  })
  it('invalid UTF-8 and a locked diagnostic stream preserve the primary HTTP failure', async () => {
    const locked = failed(envelope(documented)); const reader = locked.body?.getReader()
    try {
      for (const body of [new Response(new Uint8Array([0xff]), { status: 400, headers: { 'content-type': 'application/json' } }), locked]) {
        const result = await run([{ input_tokens: 1 }, body])
        expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls[1]).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
      }
    } finally { await reader?.cancel() }
  })
  it('stops on a nonprogressing empty diagnostic chunk before consuming later text', async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array())
      controller.enqueue(new TextEncoder().encode(JSON.stringify(envelope(documented))))
      controller.close()
    } })
    const result = await run([{ input_tokens: 1 }, new Response(body, { status: 400, headers: { 'content-type': 'application/json' } })])
    expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls).toHaveLength(2)
    expect(result.calls[1]).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
  })
  it('the existing signal interrupts a hung error reader even when cancel never resolves', async () => {
    const controller = new AbortController(); let posts = 0; let canceled = false
    const localFactory: ProbeClientFactory = options => ({ post: async (path, request) => {
      posts += 1; const body = JSON.stringify(request.body, null, 2)
      const fetch = options?.fetch; if (!fetch) throw new Error('missing fake')
      const result = await fetch(`https://api.anthropic.com${path}`, { method: 'POST', body, signal: controller.signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
      return result.json()
    } })
    let wireCalls = 0
    const operation = runProbe(loaded, 'offline-not-a-real-key', localFactory, async () => {
      wireCalls += 1
      if (wireCalls === 1) return response({ input_tokens: 1 })
      setImmediate(() => controller.abort())
      return new Response(new ReadableStream({ pull() { return new Promise(() => undefined) }, cancel() { canceled = true; return new Promise(() => undefined) } }), { status: 400, headers: { 'content-type': 'application/json' } })
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('test-only hung reader deadline')), 1000) })])
      expect(result.errorCode).toBe('PROVIDER_400'); expect(posts).toBe(2); expect(wireCalls).toBe(2); expect(canceled).toBe(true)
      expect(result.calls[1]).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
    } finally { if (timer) clearTimeout(timer) }
  })
  it('does not await a never-ending or throwing cancel on a skipped diagnostic', async () => {
    for (const throws of [true, false]) {
      const body = new ReadableStream({ cancel() { if (throws) throw new Error('PRIVATE_CANCEL_CANARY'); return new Promise(() => undefined) } }, { highWaterMark: 0 })
      const result = await run([{ input_tokens: 1 }, new Response(body, { status: 400, headers: { 'content-type': 'text/plain' } })])
      expect(result.errorCode).toBe('PROVIDER_400'); expect(result.calls[1]).toMatchObject({ providerErrorType: 'unknown', providerErrorReason: 'unclassified' })
    }
  })
})

it('runs the sole actual SDK observation only inside a network-trapped, credential-free child', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', resolve('tests/review-surface/fixtures/action-schema-probe-sdk-child.ts')], {
    cwd: root, env: childEnvironment(), encoding: 'utf8', timeout: 20000,
  })
  expect(child.stderr).toBe(''); expect(child.status).toBe(0)
  const proof = JSON.parse(child.stdout)
  expect(proof).toMatchObject({ trappedNetworkAttempts: 0, clientFetchInjected: true, protocolSuccess: [...CASE_IDS], messagesWireBytes: CASE_IDS.map(caseId => Buffer.byteLength(JSON.stringify(loaded.data.get(`${caseId}.synthetic-messages-request.json`), null, 2))), calls: 12 })
}, 20000)

describe('v2 fixed compiler diagnostics only', () => {
  const passAnswers = () => CASE_IDS.flatMap(() => [{ input_tokens: 10 }, reply])
  const assertDiagnostic = (result: Awaited<ReturnType<typeof runProbe>>) => {
    expect(result).toMatchObject({ version: 2, purpose: PURPOSE, syntheticOnly: true, runtimeAcceptance: 'not_evaluated', authorityGranted: { runtimeAdoption: false, articleAttempt: false, publication: false } })
    expect(result).not.toHaveProperty('compilerAcceptance')
    expect(result.cases.map(item => item.caseId)).toEqual([...CASE_IDS])
    for (const item of result.cases) {
      expect(item.countBodySha256).toBe(loaded.manifest.files[`${item.caseId}.synthetic-count-request.json`].bodySha256)
      expect(item.messagesBodySha256).toBe(loaded.manifest.files[`${item.caseId}.synthetic-messages-request.json`].bodySha256)
    }
  }
  it('completes exactly the closed ordered six-case prefix with no runtime authority', async () => {
    const result = await run(passAnswers()); assertDiagnostic(result)
    expect(result.outcome).toBe('completed_fixed_cases'); expect(result.calls).toHaveLength(12)
    expect(result.cases.map(item => item.outcome)).toEqual(CASE_IDS.map(() => 'pass'))
    expect(result.messagesHttp200).toEqual([...CASE_IDS]); expect(result.protocolSuccess).toEqual([...CASE_IDS])
    expect(result.calls.map(item => [item.caseId, item.endpoint])).toEqual(CASE_IDS.flatMap(caseId => [[caseId, 'count'], [caseId, 'messages']]))
    expect(Object.keys(result.counts)).toEqual([...CASE_IDS]); expect(Object.keys(result.usage)).toEqual([...CASE_IDS])
  })
  it.each(CASE_IDS.flatMap((caseId, index) => ['count', 'messages', 'protocol'].map(stage => ({ caseId, index, stage }))))('stops at $caseId $stage and leaves the later cases unattempted', async ({ index, stage }) => {
    const answers: unknown[] = passAnswers()
    const failedCall = index * 2 + (stage === 'count' ? 0 : 1)
    answers[failedCall] = stage === 'protocol' ? { ...reply, content: [{ type: 'tool_use', name: 'review_actions', input: { ...empty, changes: ['forbidden'] } }] }
      : response({ type: 'error', error: { type: 'invalid_request_error', message: 'Schema is too complex for compilation.' } }, 400, { 'content-type': 'application/json' })
    const result = await run(answers); assertDiagnostic(result)
    expect(result.outcome).toBe('stopped'); expect(result.calls).toHaveLength(failedCall + 1)
    expect(result.protocolSuccess).toEqual(CASE_IDS.slice(0, index))
    expect(result.messagesHttp200).toEqual(CASE_IDS.slice(0, stage === 'protocol' ? index + 1 : index))
    expect(result.cases.map(item => item.outcome)).toEqual(CASE_IDS.map((_caseId, position) => position < index ? 'pass' : position === index ? 'stopped' : 'not_attempted'))
    expect(result.cases[index]).toMatchObject({ outcome: 'stopped', stoppedAt: stage })
    expect(result.calls.map(item => [item.caseId, item.endpoint])).toEqual(CASE_IDS.flatMap(caseId => [[caseId, 'count'], [caseId, 'messages']]).slice(0, failedCall + 1))
  })
  it.each(CASE_IDS.flatMap((caseId, index) => ['malformed', 'overflow', 'unknown'].map(failure => ({ caseId, index, failure }))))('preserves the exact prefix at $caseId on a $failure Messages outcome', async ({ index, failure }) => {
    const answers: unknown[] = passAnswers()
    answers[index * 2 + 1] = failure === 'malformed' ? new Response('{') : failure === 'overflow' ? new Response('x'.repeat(131073)) : new Error('PRIVATE_UNKNOWN_OUTCOME')
    const result = await run(answers); assertDiagnostic(result)
    expect(result.calls).toHaveLength(index * 2 + 2); expect(result.protocolSuccess).toEqual(CASE_IDS.slice(0, index))
    expect(result.messagesHttp200).toEqual(CASE_IDS.slice(0, failure === 'unknown' ? index : index + 1))
    expect(result.cases[index]).toMatchObject({ outcome: 'stopped', stoppedAt: 'messages' })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UNKNOWN_OUTCOME')
  })
  it('pins closed schema relationships while only input_schema differs across the six cases', () => {
    const full = JSON.parse(JSON.stringify(loaded.data.get('full-fixed-form.synthetic-messages-request.json')))
    const properties = full.tools[0].input_schema.properties
    expect(loaded.manifest).toMatchObject({ version: 2, purpose: PURPOSE, model: 'claude-sonnet-4-6', cases: [...CASE_IDS], maxCalls: 12, outputTokens: 128, contextLimit: 200000, requestByteLimit: 655360, responseByteLimit: 131072, timeoutMs: 120000, maxRetries: 0 })
    for (const caseId of CASE_IDS) {
      const message = JSON.parse(JSON.stringify(loaded.data.get(`${caseId}.synthetic-messages-request.json`)))
      const schema = message.tools[0].input_schema
      expect(schema.required).toEqual(Object.keys(properties)); expect(schema.additionalProperties).toBe(false)
      for (const key of Object.keys(properties)) expect(schema.properties[key]).toEqual(caseId === 'full-fixed-form' || caseId === `${key}-only` ? properties[key] : { type: 'array', items: { type: 'string' } })
      message.tools[0].input_schema = full.tools[0].input_schema
      expect(message).toEqual(full)
    }
    expect(full.tools[0].strict).toBe(true); expect(full.tool_choice).toEqual({ type: 'tool', name: 'review_actions' })
  })
  it.each(['model', 'prompt', 'tool', 'schema', 'body'] as const)('closes altered %s before any transport and never reopens the guard', async change => {
    let calls = 0
    const guard = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
    const request = JSON.parse(JSON.stringify(loaded.data.get('minimal-control.synthetic-count-request.json')))
    if (change === 'model') request.model = 'claude-opus-4-6'
    if (change === 'prompt') request.messages[0].content = 'different prompt'
    if (change === 'tool') request.tools[0].strict = false
    if (change === 'schema') request.tools[0].input_schema.properties.changes.items.type = 'integer'
    const body = change === 'body' ? '{}' : JSON.stringify(request)
    await expect(guard('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })).rejects.toThrow('WIRE_FIXTURE_DRIFT')
    expect(calls).toBe(0)
  })
  it('rejects the second case before its turn and rejects Messages before its count', async () => {
    for (const [caseId, endpoint] of [['changes-only', 'count'], ['minimal-control', 'messages']] as const) {
      let calls = 0
      const guard = createGuardedFetch(loaded, async () => { calls += 1; return response({}) }, [], 'offline-not-a-real-key')
      const body = JSON.stringify(loaded.data.get(`${caseId}.synthetic-${endpoint}-request.json`))
      await expect(guard(`https://api.anthropic.com/v1/messages${endpoint === 'count' ? '/count_tokens' : ''}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })).rejects.toThrow()
      expect(calls).toBe(0)
    }
  })
  it('closes the fixture directory, rejects v1 manifest data and rejects modified model/prompt/schema bytes', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'diagnostic-fixture-'))
    try {
      cpSync(join(root, FIXTURES), join(scratch, FIXTURES), { recursive: true })
      const extra = join(scratch, FIXTURES, 'unapproved.json'); writeFileSync(extra, '{}')
      expect(() => loadFixtures(scratch)).toThrow('CLOSED_FIXTURE_DIRECTORY'); rmSync(extra)
      const path = join(scratch, FIXTURES, 'manifest.json'); const original = readFileSync(path)
      writeFileSync(path, JSON.stringify({ version: 1 })); expect(() => loadFixtures(scratch)).toThrow('MANIFEST_PIN'); writeFileSync(path, original)
      for (const name of ['minimal-control.synthetic-count-request.json', 'changes-only.synthetic-messages-request.json', 'full-fixed-form.tool-schema.json']) {
        const path = join(scratch, FIXTURES, name); const original = readFileSync(path)
        writeFileSync(path, '{}'); expect(() => loadFixtures(scratch)).toThrow('FIXTURE_FILE_PIN'); writeFileSync(path, original)
      }
    } finally { rmSync(scratch, { recursive: true, force: true }) }
  })
  it('retains the single manual workflow and no runtime driver imports or execution alternatives', () => {
    const workflow = readFileSync(join(root, '.github/workflows/action-schema-probe.yml'), 'utf8')
    const driver = readFileSync(join(root, 'scripts/probe-action-schema.ts'), 'utf8')
    expect(workflow).toContain('timeout-minutes: 12'); expect(workflow).toContain('github.run_attempt == 1')
    expect(workflow).toContain('synthetic-action-schema-compiler-diagnostic-v2-safe'); expect(workflow).toContain('probe-safe-v2/summary.json')
    for (const denied of ['matrix:', 'schedule:', 'case_id:', 'continue-on-error:', 'workflow_run:']) expect(workflow).not.toContain(denied)
    expect(driver).not.toMatch(/from ['"][^'"]*(?:src|review-actions|editorial)[^'"]*['"]/)
    expect(driver).toContain("'action-schema-compiler-diagnostic-v2'")
  })
  it('bounds a maximum-width result and rejects an over-cap summary', async () => {
    const context = parseContext({ version: 2, purpose: PURPOSE, repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', capabilitySha: 'a'.repeat(40), actualSha: 'a'.repeat(40), workflowSha: 'a'.repeat(40), workflowRef: 'ojfbot/daily-logger/.github/workflows/action-schema-probe.yml@refs/heads/main', manifestSha: MANIFEST_SHA, runId: '1'.repeat(20), runAttempt: '1', probeId: '12345678-1234-4234-9234-123456789abc', approvalReceipt: `call_${'a'.repeat(128)}` })
    const result = await run(passAnswers())
    for (const call of result.calls) { call.requestId = `req_${'a'.repeat(96)}`; call.wireBytes = 655360 }
    for (const caseId of CASE_IDS) { result.counts[caseId] = 199872; result.usage[caseId] = { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 128 } }
    const output = serializeSafeSummary(result, context); expect(Buffer.byteLength(output)).toBeLessThanOrEqual(32768)
    expect(JSON.parse(output)).toMatchObject({ version: 2, runtimeAcceptance: 'not_evaluated', manifestSha256: MANIFEST_SHA, context })
    expect(() => serializeSafeSummary({ ...result, errorCode: 'x'.repeat(32768) }, context)).toThrow('SAFE_ARTIFACT_LIMIT')
    expect(() => parseContext({ ...context, version: 1 })).toThrow()
    const { version: _version, purpose: _purpose, ...v1Context } = context
    expect(() => parseContext(v1Context)).toThrow()
    expect(() => parseContext({ ...context, approvalReceipt: `call_${'a'.repeat(129)}` })).toThrow()
  })
})
