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
    const unknown = await run([new Error(secret)]); expect(unknown.errorCode).toBe('TRANSPORT_FAILURE'); expect(JSON.stringify(unknown)).not.toContain(secret)
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
  it('marks a generic stream rejection on the current200 call without leaking its message or qualifying the compiler', async () => {
    const partial = new Response(new ReadableStream({ pull(controller) { controller.error(new Error('PRIVATE_STREAM_ERROR_MUST_NOT_ESCAPE')) } }))
    const result = await run([{ input_tokens: 1 }, partial])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('TRANSPORT_FAILURE'); expect(result.calls[1].failureCode).toBe('TRANSPORT_FAILURE')
    expect(result.compilerAcceptance).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(JSON.stringify(result)).not.toContain('PRIVATE_STREAM_ERROR')
  })
  it('does not reassign a later pre-network rejection to an earlier successful call', async () => {
    const receipts: Parameters<typeof createGuardedFetch>[2] = []
    const guarded = createGuardedFetch(loaded, async () => response({}), receipts, 'offline-not-a-real-key')
    for (const kind of ['count', 'messages'] as const) {
      const body = JSON.stringify(loaded.data.get(`proposer.synthetic-${kind}-request.json`), null, 2)
      await guarded(`https://api.anthropic.com/v1/messages${kind === 'count' ? '/count_tokens' : ''}`, { method: 'POST', body, signal: new AbortController().signal, headers: expectedSdkHeaders('offline-not-a-real-key', Buffer.byteLength(body)) })
    }
    const prior = structuredClone(receipts)
    await expect(guarded('https://unapproved.test/v1/messages/count_tokens', { method: 'POST' })).rejects.toThrow()
    expect(receipts).toEqual(prior); expect(receipts[1].failureCode).toBeUndefined()
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
  it.each<Record<string, string>>([
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

describe('provider error diagnostics — factory doubles only, no SDK construction', () => {
  const documented = 'Schema is too complex for compilation.'
  const earlier = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.'
  const envelope = (message: unknown, type: unknown = 'invalid_request_error') => ({ type: 'error', error: { type, message } })
  const failed = (value: unknown, headers = { 'content-type': 'application/json' }) => response(value, 400, headers)
  const diagnostic = async (value: unknown) => {
    const result = await run([{ input_tokens: 1 }, failed(value)])
    expect(result.calls).toHaveLength(2); expect(result.errorCode).toBe('PROVIDER_400')
    expect(result.compilerAcceptance).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.usage).toEqual({})
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
    expect(result.compilerAcceptance).toEqual([]); expect(result.protocolSuccess).toEqual([]); expect(result.counts).toEqual({})
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
    cwd: root, env: { PATH: process.env.PATH, HOME: tmpdir() }, encoding: 'utf8', timeout: 20000,
  })
  expect(child.stderr).toBe(''); expect(child.status).toBe(0)
  const proof = JSON.parse(child.stdout)
  expect(proof).toMatchObject({ trappedNetworkAttempts: 0, clientFetchInjected: true, protocolSuccess: ['proposer', 'verifier'], messagesWireBytes: [22099, 11585], calls: 4 })
})
