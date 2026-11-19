import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ArticleDataSchema } from '@ojfbot/daily-logger-journal/article-schema'
import { RECORDED_ARTICLE_SCHEMA, validateRecordedDraft } from '../src/recorded-article.js'
import { openRecordedEvidence, RECORDED_LIMITS, RecordedEvidenceError, type RecordedEvidence } from '../src/recorded-evidence.js'
import { replayRecordedResponse } from '../src/recorded-response.js'
import { artifact, digest, encode, fixture, type FixtureBundle } from './fixtures/recorded-evidence.js'

const CANARY = 'PRIVATE-ARTICLE-PAYLOAD-CANARY'
const article = () => ({ schemaVersion: 2, date: '2026-11-17', title: 'Recorded draft', summary: 'Synthetic article.',
  tags: [], whatShipped: [], decisions: [], suggestedActions: [], commitCount: 0, reposActive: [], activityType: 'build' })
function recorded(text = JSON.stringify(article())) {
  const value = fixture()
  value.artifacts[value.artifacts.findIndex(item => item.id === 'draft_response')] = artifact('draft_response', 'model_response', text)
  selectSchema(value, RECORDED_ARTICLE_SCHEMA)
  return value
}
function selectSchema(value: FixtureBundle, schema: string | null) {
  const request = value.requests[0]
  request.binding.outputSchemaVersion = schema
  request.requestSha256 = digest(encode(request.binding))
  value.responses[0].requestSha256 = request.requestSha256
}
const open = (value: FixtureBundle) => { const bytes = encode(value); return openRecordedEvidence(bytes, digest(bytes)) }
const validate = (value: FixtureBundle) => validateRecordedDraft(open(value), value.requests[0].binding)
const invalid = (text: string, code: string) => {
  const result = validate(recorded(text))
  assert.equal(result.status, 'invalid')
  if (result.status !== 'invalid') assert.fail('Expected invalid response')
  assert.equal(result.code, code)
  assert.equal('article' in result, false); assert.equal('bytes' in result, false)
  assert.equal(JSON.stringify(result).includes(CANARY), false)
  assert.equal('cause' in result, false)
}

test('recorded draft uses the original shared V2 schema without granting authority or inferring usage', () => {
  const raw = { ...article(), extra: CANARY, status: 'accepted', outcome: 'edited' }
  const result = validate(recorded(JSON.stringify(raw, null, 2)))
  assert.equal(result.status, 'validated')
  if (result.status !== 'validated') assert.fail('Expected validated article shape')
  assert.deepEqual(result.article, ArticleDataSchema.parse(raw))
  assert.equal(result.article.outcome, 'edited') // A recorded assertion, not an owner decision.
  assert.equal(result.payloadValidation, 'article-v2-original'); assert.equal(result.provenance, 'unverified')
  assert.equal(result.publicationAuthority, 'none'); assert.equal(result.actionAuthority, 'none'); assert.equal(result.executionAuthority, 'none')
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, costUsdMicros: null })
  assert.equal(JSON.stringify(result).includes(CANARY), false)
  assert.equal('bytes' in result, false)
})

test('the reviewed synthetic image fixture validates through the installed service boundary', () => {
  const bytes = readFileSync(new URL('./fixtures/recorded-article-v2.json', import.meta.url))
  const value = JSON.parse(bytes.toString()) as FixtureBundle
  const result = validateRecordedDraft(openRecordedEvidence(bytes, digest(bytes)), value.requests[0].binding)
  assert.equal(result.status, 'validated')
  if (result.status === 'validated') assert.equal(result.article.title, 'Recorded draft')
})

test('malformed, salvageable and V1 outputs reject instead of manufacturing V2 articles', () => {
  for (const value of [{}, { title: CANARY }, { ...article(), schemaVersion: 1 }, { ...article(), commitCount: CANARY },
    { title: CANARY, summary: '', tags: [], whatShipped: '', theDecisions: '', roadmapPulse: '', whatsNext: '' }]) {
    invalid(JSON.stringify(value), 'ARTICLE_INVALID')
  }
  for (const text of ['', '{', `not JSON ${CANARY}`, '```json\n{}\n```', '\ufeff{}', '1e999', '"\\ud800"', '{"\\udc00":0}']) invalid(text, 'JSON_INVALID')
  for (const value of [null, 3, [], true]) invalid(JSON.stringify(value), 'ARTICLE_INVALID')
})

test('unsupported recorded schema and role reject; exact-binding mismatch does not select another response', () => {
  for (const schema of [null, 'opaque-synthetic-v1', 'dailylogger-article-v1']) {
    const value = recorded(); selectSchema(value, schema)
    const result = validate(value); assert.equal(result.status, 'invalid')
    if (result.status === 'invalid') assert.equal(result.code, 'UNSUPPORTED_SCHEMA')
  }
  const chain = fixture(true), review = chain.requests[1].binding
  const result = validateRecordedDraft(open(chain), review)
  assert.equal(result.status, 'invalid')
  if (result.status === 'invalid') assert.equal(result.code, 'UNSUPPORTED_ROLE')
  const value = recorded()
  assert.deepEqual(validateRecordedDraft(open(value), { ...value.requests[0].binding, model: 'different' }), { status: 'binding-mismatch' })
})

test('missing, failed and uncertain results preserve the opaque replay states without validation fallback', () => {
  for (const status of ['failed', 'unknown', 'missing-response', 'missing-request'] as const) {
    const value = recorded(), binding = value.requests[0].binding
    if (status === 'failed') value.responses[0].result = { status: 'failed', code: 'provider_failed' }
    else if (status === 'unknown') value.responses[0].result = { status: 'unknown' }
    else { value.responses = []; if (status === 'missing-request') value.requests = [] }
    const handle = open(value)
    assert.deepEqual(validateRecordedDraft(handle, binding), replayRecordedResponse(handle, binding))
  }
})

test('nested artifact JSON has independent depth, collection and work limits before schema traversal', () => {
  const limit = RECORDED_LIMITS
  invalid('['.repeat(limit.depth + 1) + '0' + ']'.repeat(limit.depth + 1), 'LIMIT_EXCEEDED')
  invalid('['.repeat(limit.depth) + '0' + ']'.repeat(limit.depth), 'ARTICLE_INVALID')
  invalid(JSON.stringify(Array(limit.arrayItems + 1).fill(0)), 'LIMIT_EXCEEDED')
  invalid(JSON.stringify(Array(limit.arrayItems).fill(0)), 'ARTICLE_INVALID')
  invalid(JSON.stringify(Object.fromEntries(Array.from({ length: limit.arrayItems + 1 }, (_, i) => [i, 0]))), 'LIMIT_EXCEEDED')
  invalid(JSON.stringify(Array.from({ length: 128 }, () => Array(256).fill(null))), 'LIMIT_EXCEEDED')
  const raw = { ...article(), summary: '[{'.repeat(200) + '\\" 🐧 é' }
  assert.equal(validate(recorded(JSON.stringify(raw))).status, 'validated')
})

test('validated output is a defensive parse and caller binding accessors cannot change the selected schema', () => {
  const value = recorded(), handle = open(value)
  const first = validateRecordedDraft(handle, value.requests[0].binding)
  assert.equal(first.status, 'validated')
  if (first.status === 'validated') first.article.title = CANARY
  assert.deepEqual(validateRecordedDraft(handle, value.requests[0].binding), validate(recorded()))
  // Zod snapshots the caller binding once; selection must use that stored matched binding afterward.
  const wrong = recorded(); selectSchema(wrong, 'opaque-synthetic-v1')
  let reads = 0
  const binding = { ...wrong.requests[0].binding,
    get outputSchemaVersion() { return reads++ === 0 ? 'opaque-synthetic-v1' : RECORDED_ARTICLE_SCHEMA } }
  const selected = validateRecordedDraft(open(wrong), binding)
  assert.equal(selected.status, 'invalid')
  if (selected.status === 'invalid') assert.equal(selected.code, 'UNSUPPORTED_SCHEMA')
  assert.throws(() => validateRecordedDraft({ ...handle } as RecordedEvidence, value.requests[0].binding),
    (error: unknown) => error instanceof RecordedEvidenceError && error.code === 'INVALID_HANDLE' && !('cause' in error))
})

test('shape success preserves incomplete finish metadata and does not establish reporting eligibility', () => {
  const value = recorded(JSON.stringify({ ...article(), date: 'not-a-reporting-date' }))
  // Fixture typing deliberately covers only its ordinary stop/null cases; the protocol supports length.
  Object.assign(value.responses[0].result, { finishReason: 'length' })
  const result = validate(value)
  assert.equal(result.status, 'validated')
  if (result.status === 'validated') {
    assert.equal(result.finishReason, 'length'); assert.equal(result.article.date, 'not-a-reporting-date')
    assert.equal(result.publicationAuthority, 'none')
  }
})
