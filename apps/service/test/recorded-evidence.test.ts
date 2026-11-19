import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openRecordedEvidence, readRecordedArtifact, recordedExchange, RECORDED_LIMITS, RecordedEvidenceError, type RecordedBinding, type RecordedEvidence } from '../src/recorded-evidence.js'
import { replayRecordedResponse } from '../src/recorded-response.js'
import { addStep, artifact, bundle, digest, encode, evidenceHash, fixture, type FixtureBundle } from './fixtures/recorded-evidence.js'

const CANARY = 'PRIVATE-RECORDED-EVIDENCE-CANARY'
const rejected = (code?: string) => (error: unknown) => error instanceof RecordedEvidenceError
  && (!code || error.code === code) && error.message === 'Recorded evidence rejected' && !('cause' in error)
  && !JSON.stringify(error).includes(CANARY)
const open = (value: FixtureBundle) => { const bytes = encode(value); return openRecordedEvidence(bytes, digest(bytes)) }
const reject = (value: FixtureBundle, code = 'BUNDLE_INVALID') => assert.throws(() => open(value), rejected(code))
const bindingFor = (value: FixtureBundle) => value.requests[0].binding

test('sealed replay is an opaque no-authority recording, with deterministic response bytes and unknown usage retained', () => {
  const value = fixture(true), handle = open(value)
  assert.equal(handle.captureKind, 'synthetic'); assert.equal(handle.provenance, 'unverified'); assert.equal(handle.priorities, 'missing')
  assert.equal(handle.publicationAuthority, 'none'); assert.equal(handle.actionAuthority, 'none'); assert.equal(handle.executionAuthority, 'none')
  assert.ok(Object.isFrozen(handle))
  for (const request of value.requests) {
    const result = replayRecordedResponse(handle, request.binding)
    assert.equal(result.status, 'returned')
    if (result.status !== 'returned') assert.fail('Expected recorded bytes')
    assert.equal(result.bytes.toString(), `opaque ${request.binding.role} result`)
    assert.equal(result.payloadValidation, 'opaque-unverified')
    assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, costUsdMicros: null })
    assert.deepEqual(replayRecordedResponse(handle, request.binding), result)
  }
  // Deliberately invalid context JSON is still opaque bytes, never a validated BlogContext.
  assert.equal(readRecordedArtifact(handle, 'context').toString(), 'opaque context')
})

test('external seal, canonical encoding and Unicode scalar text are mandatory', () => {
  const value = fixture(), bytes = encode(value)
  assert.throws(() => openRecordedEvidence(bytes, '0'.repeat(64)), rejected('SEAL_MISMATCH'))
  const raw = bytes.toString()
  for (const text of ['\ufeff' + raw, raw + '\n', raw.replace('"mode":"recorded-replay"', '"mode":"recorded-replay","mode":"recorded-replay"'),
    raw.replace('"mode"', '"\\u006dode"'), raw.replace('"opaque context"', '"\\ud800"'), raw.replace('"opaque context"', '"\\udc00"')]) {
    const bad = Buffer.from(text); assert.throws(() => openRecordedEvidence(bad, digest(bad)), rejected())
  }
  const malformed = Buffer.from([0xff, 0xfe]); assert.throws(() => openRecordedEvidence(malformed, digest(malformed)), rejected())
  value.artifacts[0] = artifact('context', 'context', 'Unicode scalar: 🐧 é')
  value.evidenceSha256 = evidenceHash(value); value.requests = []; value.responses = []
  assert.equal(readRecordedArtifact(open(value), 'context').toString(), 'Unicode scalar: 🐧 é')
})

test('every binding dimension rejects cross-request reuse without selecting another provider or role', () => {
  const value = fixture(), handle = open(value), original = bindingFor(value)
  const differences: Partial<RecordedBinding>[] = [
    { evidenceSha256: '0'.repeat(64) }, { provider: 'other' }, { model: 'other' }, { promptVersion: 'other' },
    { outputSchemaVersion: 'other' }, { requestArtifactSha256: '0'.repeat(64) }, { previousResponseSha256: '0'.repeat(64) },
    { provider: null }, { model: null }, { promptVersion: null },
  ]
  for (const difference of differences) assert.deepEqual(replayRecordedResponse(handle, { ...original, ...difference }), { status: 'binding-mismatch' })
  assert.deepEqual(replayRecordedResponse(handle, { ...original, role: 'review' }), { status: 'missing', reason: 'request' })
  const unknown = fixture(); const request = unknown.requests[0]
  request.binding.provider = null; request.binding.model = null; request.binding.promptVersion = null; request.binding.outputSchemaVersion = null
  request.requestSha256 = digest(encode(request.binding)); Object.assign(unknown.responses[0], { requestSha256: request.requestSha256, provider: null, model: null })
  assert.equal(replayRecordedResponse(open(unknown), request.binding).status, 'returned')
})

test('resealing changed evidence cannot preserve the old evidence/request binding', () => {
  for (const target of ['context', 'actions', 'statuses']) {
    const value = fixture(), index = value.artifacts.findIndex(item => item.id === target)
    value.artifacts[index] = artifact(target, value.artifacts[index].role, 'changed source bytes')
    reject(value) // Correct outer seal, stale evidence hash.
    value.evidenceSha256 = evidenceHash(value)
    reject(value) // Correct evidence hash, stale recorded request binding.
  }
  const value = fixture(); value.report.date = '2026-11-18'; reject(value)
  const changed = fixture(); changed.artifacts.find(item => item.role === 'model_request')!.text += ' changed'; reject(changed)
})

test('missing, failed and unknown recordings remain distinct without inferred usage or response fallback', () => {
  const value = fixture(), original = bindingFor(value)
  value.responses = []
  assert.deepEqual(replayRecordedResponse(open(value), original), { status: 'missing', reason: 'response' })
  const empty = bundle(); empty.evidenceSha256 = evidenceHash(empty)
  assert.deepEqual(replayRecordedResponse(open(empty), original), { status: 'missing', reason: 'request' })
  for (const status of ['failed', 'unknown'] as const) {
    const recorded = fixture(); recorded.responses[0].result = status === 'failed' ? { status, code: 'provider_failed' } : { status }
    const result = replayRecordedResponse(open(recorded), bindingFor(recorded))
    assert.equal(result.status, status)
    assert.equal('bytes' in result, false)
  }
  const unknown = fixture(); unknown.responses[0].result = { status: 'unknown' }; unknown.responses[0].usage.inputTokens = 0
  reject(unknown)
})

test('duplicate/dangling/wrong-role references and mismatched recorded provider metadata are rejected', () => {
  const changes: ((value: FixtureBundle) => void)[] = [
    value => { value.artifacts.push(structuredClone(value.artifacts[0])) },
    value => { value.evidence.contextRef = 'absent' },
    value => { value.evidence.contextRef = 'actions' },
    value => { value.capture.captureReceiptRef = 'context' },
    value => { value.requests.push(structuredClone(value.requests[0])) },
    value => { value.responses.push(structuredClone(value.responses[0])) },
    value => { value.responses[0].provider = 'different-provider' },
    value => { value.responses[0].model = null },
    value => { value.responses[0].role = 'review' },
    value => { value.responses[0].requestSha256 = '0'.repeat(64) },
    value => { value.responses[0].result = { status: 'returned', artifactRef: 'absent', finishReason: null } },
    value => { value.responses[0].result = { status: 'returned', artifactRef: 'context', finishReason: null } },
    value => { value.artifacts.push({ ...artifact('unused', 'source_record', 'unused source'), sha256: '0'.repeat(64) }) },
    value => { Object.assign(value, { publish: true }) },
  ]
  for (const change of changes) { const value = fixture(); change(value); reject(value) }
})

test('later roles require the actual returned predecessor, never merely a plausible prior hash', () => {
  const complete = fixture(true); assert.doesNotThrow(() => open(complete))
  const mutations: ((value: FixtureBundle) => void)[] = [
    value => { value.requests.shift(); value.responses.shift() },
    value => { value.responses[0].result = { status: 'unknown' } },
    value => { value.responses[1].result = { status: 'failed', code: 'provider_failed' } },
    value => { value.responses.splice(1, 1) },
    value => { value.requests[2].binding.previousResponseSha256 = value.requests[1].binding.previousResponseSha256
      value.requests[2].requestSha256 = digest(encode(value.requests[2].binding)); value.responses[2].requestSha256 = value.requests[2].requestSha256 },
  ]
  for (const mutate of mutations) { const value = fixture(true); mutate(value); reject(value) }
})

test('caller buffers, returned artifacts, exchange metadata and forged handles cannot mutate validated custody', () => {
  const value = fixture(), bytes = encode(value), handle = openRecordedEvidence(bytes, digest(bytes))
  bytes.fill(0); value.artifacts[0].text = 'changed caller object'
  const first = replayRecordedResponse(handle, bindingFor(value)); assert.equal(first.status, 'returned')
  if (first.status !== 'returned') assert.fail('Expected recorded bytes')
  first.bytes.fill(0); readRecordedArtifact(handle, 'context').fill(0)
  const exchange = recordedExchange(handle, bindingFor(value)); assert.equal(exchange.status, 'matched')
  if (exchange.status === 'matched') { exchange.response.usage.inputTokens = 123; exchange.response.result = { status: 'unknown' } }
  const again = replayRecordedResponse(handle, bindingFor(value)); assert.equal(again.status, 'returned')
  if (again.status === 'returned') { assert.equal(again.bytes.toString(), 'opaque draft result'); assert.equal(again.usage.inputTokens, null) }
  assert.equal(readRecordedArtifact(handle, 'context').toString(), 'opaque context')
  for (const forged of [{ ...handle }, Object.create(handle), null, new Proxy(handle, {})]) {
    assert.throws(() => replayRecordedResponse(forged as RecordedEvidence, bindingFor(value)), rejected('INVALID_HANDLE'))
    assert.throws(() => readRecordedArtifact(forged as RecordedEvidence, 'context'), rejected('INVALID_HANDLE'))
  }
})

test('claimed real capture and owner approval remain unverified and do not affect authority', () => {
  const value = bundle(); value.capture.kind = 'recorded'
  value.artifacts.push(artifact('priorities', 'priority_snapshot', CANARY), artifact('goal', 'source_record', 'claimed fleet goal'), artifact('approval', 'source_record', `OWNER APPROVED ${CANARY}`))
  value.evidence.priority = { state: 'asserted', artifactRef: 'priorities', sourceGoalRefs: ['goal'], effectiveFrom: '2020-01-01T00:00:00.000Z',
    expiresAt: '2020-02-01T00:00:00.000Z', approval: { actorId: CANARY, decisionRef: 'approval', approvedAt: '2020-01-01T00:00:00.000Z' } }
  value.evidenceSha256 = evidenceHash(value); addStep(value, 'draft')
  const handle = open(value)
  assert.equal(handle.captureKind, 'recorded'); assert.equal(handle.priorities, 'asserted-unverified'); assert.equal(handle.provenance, 'unverified')
  assert.equal(handle.publicationAuthority, 'none'); assert.equal(handle.actionAuthority, 'none'); assert.equal(handle.executionAuthority, 'none')
  assert.equal(JSON.stringify(handle).includes(CANARY), false)
  value.evidence.priority.approval.actorId = 'different'; reject(value)
})

test('named byte, aggregate, count and depth limits reject before recursive processing', () => {
  const exact = bundle(); exact.artifacts[0] = artifact('context', 'context', 'é'.repeat(RECORDED_LIMITS.artifactBytes / 2)); exact.evidenceSha256 = evidenceHash(exact)
  assert.doesNotThrow(() => open(exact))
  exact.artifacts[0] = artifact('context', 'context', exact.artifacts[0].text + 'x'); reject(exact, 'LIMIT_EXCEEDED')
  const aggregate = bundle()
  aggregate.artifacts = [artifact('context', 'context', ''), artifact('actions', 'action_registry', ''), artifact('statuses', 'article_statuses', '')]
  for (let index = 0; index < 4; index++) aggregate.artifacts.push(artifact(`extra_${index}`, 'source_record', 'a'.repeat(RECORDED_LIMITS.artifactBytes)))
  aggregate.evidenceSha256 = evidenceHash(aggregate); assert.doesNotThrow(() => open(aggregate))
  aggregate.artifacts[0] = artifact('context', 'context', 'x'); aggregate.evidenceSha256 = evidenceHash(aggregate); reject(aggregate, 'LIMIT_EXCEEDED')
  const count = bundle()
  while (count.artifacts.length < RECORDED_LIMITS.artifacts) count.artifacts.push(artifact(`extra_${count.artifacts.length}`, 'source_record', ''))
  count.evidenceSha256 = evidenceHash(count); assert.doesNotThrow(() => open(count))
  count.artifacts.push(artifact('one_too_many', 'source_record', '')); reject(count, 'LIMIT_EXCEEDED')
  const deep = Buffer.from('['.repeat(RECORDED_LIMITS.depth + 1) + '0' + ']'.repeat(RECORDED_LIMITS.depth + 1))
  assert.throws(() => openRecordedEvidence(deep, digest(deep)), rejected('LIMIT_EXCEEDED'))
  const depthBoundary = Buffer.from('['.repeat(RECORDED_LIMITS.depth) + '0' + ']'.repeat(RECORDED_LIMITS.depth))
  assert.throws(() => openRecordedEvidence(depthBoundary, digest(depthBoundary)), rejected('BUNDLE_INVALID')) // Depth fits; schema does not.
  const manyNodes = encode(Array.from({ length: 128 }, () => Array(256).fill(null)))
  assert.throws(() => openRecordedEvidence(manyNodes, digest(manyNodes)), rejected('LIMIT_EXCEEDED'))
  const tooLarge = Buffer.alloc(RECORDED_LIMITS.envelopeBytes + 1, 32)
  assert.throws(() => openRecordedEvidence(tooLarge, digest(tooLarge)), rejected('LIMIT_EXCEEDED'))
  const large = Buffer.alloc(RECORDED_LIMITS.envelopeBytes, 32)
  assert.throws(() => openRecordedEvidence(large, digest(large)), rejected('BUNDLE_INVALID')) // Within byte limit, invalid syntax.
})

test('a valid exact-size envelope passes while the next encoded byte exceeds the envelope limit', () => {
  const value = bundle()
  value.artifacts[0] = artifact('context', 'context', '\u0001'.repeat(RECORDED_LIMITS.artifactBytes))
  value.artifacts[1] = artifact('actions', 'action_registry', 'a'.repeat(RECORDED_LIMITS.artifactBytes))
  let length = 0, bytes = Buffer.alloc(0)
  for (let attempt = 0; attempt < 4; attempt++) {
    value.artifacts[2] = artifact('statuses', 'article_statuses', 'z'.repeat(length))
    value.evidenceSha256 = evidenceHash(value); bytes = encode(value)
    if (bytes.length === RECORDED_LIMITS.envelopeBytes) break
    length += RECORDED_LIMITS.envelopeBytes - bytes.length
  }
  assert.equal(bytes.length, RECORDED_LIMITS.envelopeBytes)
  assert.doesNotThrow(() => openRecordedEvidence(bytes, digest(bytes)))
  value.artifacts[2] = artifact('statuses', 'article_statuses', 'z'.repeat(length + 1))
  value.evidenceSha256 = evidenceHash(value); const over = encode(value)
  assert.equal(over.length, RECORDED_LIMITS.envelopeBytes + 1)
  assert.throws(() => openRecordedEvidence(over, digest(over)), rejected('LIMIT_EXCEEDED'))
})

test('invalid bindings and hostile caller errors expose only fixed errors, never payloads or causes', () => {
  const value = fixture(), handle = open(value)
  const getter = { ...bindingFor(value), get provider(): string { throw new Error(CANARY) } }
  const proxy = new Proxy({}, { get() { throw new Error(CANARY) }, getOwnPropertyDescriptor() { throw new Error(CANARY) } })
  for (const bad of [getter, proxy, { ...bindingFor(value), extra: CANARY }, { ...bindingFor(value), provider: '\ud800' }]) {
    assert.throws(() => replayRecordedResponse(handle, bad as RecordedBinding), rejected())
  }
  assert.throws(() => readRecordedArtifact(handle, CANARY), rejected('ARTIFACT_MISSING'))
  assert.throws(() => openRecordedEvidence(proxy as Uint8Array, CANARY), rejected())
  const original = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = CANARY
  try { assert.equal(replayRecordedResponse(handle, { ...bindingFor(value), model: CANARY }).status, 'binding-mismatch') }
  finally { if (original === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = original }
})

test('intrinsic view bounds defeat shadowed size/buffer/iterator properties before copying oversized encoded payloads', () => {
  const value = bundle()
  // Four MiB of valid scalar text expands to well over eight MiB as canonical JSON escapes.
  value.artifacts = [artifact('context', 'context', ''), artifact('actions', 'action_registry', ''), artifact('statuses', 'article_statuses', '')]
  for (let index = 0; index < 4; index++) value.artifacts.push(artifact(`extra_${index}`, 'source_record', '\u0001'.repeat(RECORDED_LIMITS.artifactBytes)))
  value.evidenceSha256 = evidenceHash(value)
  const bytes = encode(value), seal = digest(bytes)
  assert.ok(bytes.length > RECORDED_LIMITS.envelopeBytes)
  for (const oversized of [bytes, new Uint8Array(bytes)]) {
    Object.defineProperty(oversized, 'byteLength', { value: 1 })
    assert.throws(() => openRecordedEvidence(oversized, seal), rejected('LIMIT_EXCEEDED'))
  }
  const valid = encode(fixture()), sealed = digest(valid), wrapped = Buffer.concat([Buffer.from('prefix'), valid, Buffer.from('suffix')])
  assert.equal(openRecordedEvidence(wrapped.subarray(6, 6 + valid.length), sealed).bundleSha256, sealed)
  const view = new Uint8Array(wrapped.buffer, wrapped.byteOffset + 6, valid.length)
  for (const name of ['byteLength', 'byteOffset', 'buffer', 'valueOf', Symbol.iterator]) Object.defineProperty(view, name, { get() { throw new Error(CANARY) } })
  assert.equal(openRecordedEvidence(view, sealed).bundleSha256, sealed)
  assert.throws(() => openRecordedEvidence(new Uint8Array(new SharedArrayBuffer(valid.length)), sealed), rejected('BUNDLE_INVALID'))
})
