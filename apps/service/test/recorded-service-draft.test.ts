import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Ajv } from 'ajv'
import { ARTICLE_PROMPT_VERSION, ARTICLE_TOOL_V2 } from '@ojfbot/daily-logger-journal/article-prompts'
import { ArticleDataSchema } from '@ojfbot/daily-logger-journal/article-schema'
import { SERVICE_DRAFT_REQUEST, SERVICE_DRAFT_SCHEMA, serviceDraftRequest, serviceDraftTool } from '../src/article-output-contract.js'
import { openRecordedEvidence, recordedRequestExchange, RecordedEvidenceError, type RecordedEvidence } from '../src/recorded-evidence.js'
import { replayRecordedResponse } from '../src/recorded-response.js'
import { validateRecordedServiceDraft } from '../src/recorded-service-draft.js'
import { artifact, digest, encode, evidenceHash, fixture, type FixtureBundle } from './fixtures/recorded-evidence.js'

const CANARY = 'PRIVATE-SERVICE-DRAFT-CANARY'
const draft = () => ({ schemaVersion: 2, date: '2026-11-17', title: 'Synthetic service draft', summary: 'A bounded fixture.',
  lede: '', tags: [], whatShipped: [], decisions: [], roadmapPulse: '', whatsNext: '', suggestedActions: [],
  commitCount: 0, reposActive: [], activityType: 'rest', codeReferences: [] })
const request = () => serviceDraftRequest({ reportDate: '2026-11-17', provider: 'synthetic-provider', model: 'synthetic-model',
  hasTelemetry: false, userPrompt: 'Synthetic opaque evidence; no semantic admission.', maxOutputTokens: 8192 })
const telemetry = () => ({ adoptionSummary: 'Synthetic', qualityCoverage: 0, suggestionsGiven: 0, suggestionsFollowed: 0, prSkillReports: [], narrative: 'Synthetic fixture.' })

function replaceRequest(value: FixtureBundle, input: unknown) {
  const item = artifact('draft_request', 'model_request', JSON.stringify(input))
  Object.assign(item, { format: SERVICE_DRAFT_REQUEST, mediaType: 'application/json' })
  value.artifacts[value.artifacts.findIndex(candidate => candidate.id === item.id)] = item
  const binding = value.requests[0].binding
  binding.requestArtifactSha256 = item.sha256
  value.requests[0].requestSha256 = digest(encode(binding))
  value.responses[0].requestSha256 = value.requests[0].requestSha256
}
function recording(input: unknown = draft()) {
  const value = fixture()
  value.requests[0].binding.promptVersion = ARTICLE_PROMPT_VERSION
  value.requests[0].binding.outputSchemaVersion = SERVICE_DRAFT_SCHEMA
  replaceRequest(value, request())
  value.artifacts[value.artifacts.findIndex(item => item.id === 'draft_response')] = artifact('draft_response', 'model_response', JSON.stringify(input))
  return value
}
const open = (value: FixtureBundle) => { const bytes = encode(value); return openRecordedEvidence(bytes, digest(bytes)) }
const validate = (value: FixtureBundle) => validateRecordedServiceDraft(open(value), value.requests[0].binding)
function rejects(value: FixtureBundle, code: string) {
  const result = validate(value)
  assert.equal(result.status, 'invalid')
  if (result.status !== 'invalid') assert.fail('Expected rejection')
  assert.equal(result.code, code)
  assert.equal('article' in result, false); assert.equal('bytes' in result, false); assert.equal('cause' in result, false)
  assert.equal(JSON.stringify(result).includes(CANARY), false)
}

test('the complete recorded request and original output pass without enriching fields or granting authority', () => {
  const selected = request()
  assert.equal(selected.systemPrompt.match(/Call the `([a-z_]+)` tool/)?.[1], selected.toolChoice.name)
  assert.equal(selected.tools[0].name, selected.toolChoice.name)
  const raw = { ...draft(), skillTelemetry: telemetry() }
  const result = validate(recording(raw))
  assert.equal(result.status, 'validated')
  if (result.status !== 'validated') assert.fail('Expected validated draft')
  assert.deepEqual(result.article, raw)
  assert.equal(ArticleDataSchema.safeParse(result.article).success, true)
  assert.equal(result.requestValidation, SERVICE_DRAFT_REQUEST); assert.equal(result.payloadValidation, SERVICE_DRAFT_SCHEMA)
  assert.equal(result.provenance, 'unverified'); assert.equal(result.publicationAuthority, 'none')
  assert.equal(result.actionAuthority, 'none'); assert.equal(result.executionAuthority, 'none')
  assert.equal('status' in result.article, false); assert.equal('outcome' in result.article, false)
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, costUsdMicros: null })
  assert.equal(validate(recording()).status, 'validated') // Telemetry itself remains optional.
})

test('the legacy date and telemetry omissions are accepted by its request shape but rejected by the service contract', () => {
  const legacy = new Ajv().compile(ARTICLE_TOOL_V2.input_schema)
  const withoutDate = { ...draft() } as Record<string, unknown>; delete withoutDate.date
  const partial = { ...draft(), skillTelemetry: { adoptionSummary: 'Synthetic', qualityCoverage: 0, narrative: 'Synthetic' } }
  assert.equal(legacy(withoutDate), true); assert.equal(legacy(partial), true)
  rejects(recording(withoutDate), 'ARTICLE_INVALID'); rejects(recording(partial), 'ARTICLE_INVALID')
  for (const key of Object.keys(telemetry())) {
    const data = { ...telemetry() } as Record<string, unknown>; delete data[key]
    rejects(recording({ ...draft(), skillTelemetry: data }), 'ARTICLE_INVALID')
  }
})

test('wrong dates, schema versions and missing authored fields fail without repair or coercion', () => {
  for (const delta of [{ date: '2026-11-18' }, { date: null }, { schemaVersion: 1 }, { schemaVersion: '2' }, { commitCount: '0' }]) {
    rejects(recording({ ...draft(), ...delta }), 'ARTICLE_INVALID')
  }
  for (const key of Object.keys(draft())) {
    const raw = { ...draft() } as Record<string, unknown>; delete raw[key]
    rejects(recording(raw), 'ARTICLE_INVALID')
  }
  const raw = { ...draft(), date: null }; validate(recording(raw)); assert.equal(raw.date, null)
})

test('validly resealed schema labels cannot substitute a different actual tool, request date, route or prompt', () => {
  for (const delta of [{ tools: [ARTICLE_TOOL_V2] }, { reportDate: '2026-11-18' }, { provider: 'other' },
    { model: 'other' }, { promptVersion: 'old' }, { systemPrompt: CANARY }, { outputSchemaVersion: 'old' },
    { toolChoice: { type: 'auto' } }, { extra: CANARY }, { maxOutputTokens: 0 }]) {
    const value = recording(); replaceRequest(value, { ...request(), ...delta }); rejects(value, 'REQUEST_INVALID')
  }
  const value = recording(), changed = request()
  const properties = changed.tools[0].input_schema.properties as Record<string, unknown>
  properties.date = { type: 'string' }
  replaceRequest(value, changed); rejects(value, 'REQUEST_INVALID')
  for (const delta of [{ format: 'opaque-v1' }, { mediaType: 'text/plain' }]) {
    const value = recording(); Object.assign(value.artifacts.find(item => item.id === 'draft_request')!, delta)
    rejects(value, 'REQUEST_INVALID')
  }
})

test('the response date binds to the sealed report rather than just to a mutually matching request and response', () => {
  const value = recording()
  value.report.date = '2026-11-18'
  value.evidenceSha256 = evidenceHash(value)
  value.requests[0].binding.evidenceSha256 = value.evidenceSha256
  replaceRequest(value, request())
  rejects(value, 'REQUEST_INVALID')
})

test('human verdicts, closure claims and canonical action identifiers reject while open candidate ideas remain unadmitted', () => {
  for (const delta of [{ status: 'draft' }, { status: 'accepted' }, { outcome: 'edited' }, { closedActions: [] }, { unknown: CANARY }]) {
    rejects(recording({ ...draft(), ...delta }), 'ARTICLE_INVALID')
  }
  const candidate = { command: '/validate', description: 'Synthetic idea', repo: 'daily-logger', status: 'open', sourceDate: '2026-11-17' }
  assert.equal(validate(recording({ ...draft(), suggestedActions: [candidate] })).status, 'validated')
  for (const delta of [{ id: 'canonical-id' }, { status: 'done' }, { resolution: CANARY }, { sourceDate: '2026-11-18' }]) {
    rejects(recording({ ...draft(), suggestedActions: [{ ...candidate, ...delta }] }), 'ARTICLE_INVALID')
  }
  rejects(recording({ ...draft(), suggestedActions: Array(6).fill(candidate) }), 'ARTICLE_INVALID')
})

test('tool validation is followed by shared semantic shape checks such as same-repository PR references', () => {
  const raw = { ...draft(), whatShipped: [{ repo: 'daily-logger', description: 'Synthetic', commits: [], prs: ['https://github.com/ojfbot/core/pull/1'] }] }
  assert.equal(new Ajv().compile(serviceDraftTool(raw.date).input_schema)(raw), true)
  rejects(recording(raw), 'ARTICLE_INVALID')
})

test('missing, failed and uncertain responses retain their exact replay disposition without claiming request validation', () => {
  for (const status of ['failed', 'unknown', 'missing-response', 'missing-request'] as const) {
    const value = recording(), binding = value.requests[0].binding
    if (status === 'failed') value.responses[0].result = { status: 'failed', code: 'provider_failed' }
    else if (status === 'unknown') value.responses[0].result = { status: 'unknown' }
    else { value.responses = []; if (status === 'missing-request') value.requests = [] }
    const handle = open(value)
    assert.deepEqual(validateRecordedServiceDraft(handle, binding), replayRecordedResponse(handle, binding))
  }
})

test('binding mismatch and caller accessors cannot redirect the selected request; forged handles reject', () => {
  const value = recording(), handle = open(value), binding = value.requests[0].binding
  assert.deepEqual(validateRecordedServiceDraft(handle, { ...binding, model: 'different' }), { status: 'binding-mismatch' })
  let reads = 0
  const adversarial = { ...binding, get outputSchemaVersion() { return reads++ === 0 ? SERVICE_DRAFT_SCHEMA : 'old' } }
  assert.equal(validateRecordedServiceDraft(handle, adversarial).status, 'validated')
  assert.equal(reads, 1)
  assert.throws(() => validateRecordedServiceDraft({ ...handle } as RecordedEvidence, binding),
    (error: unknown) => error instanceof RecordedEvidenceError && error.code === 'INVALID_HANDLE')
})

test('returned request, tool and article mutations cannot alter subsequent validation', () => {
  const value = recording(), handle = open(value), binding = value.requests[0].binding
  const observed = recordedRequestExchange(handle, binding)
  assert.equal(observed.status, 'matched')
  if (observed.status !== 'matched') assert.fail('Expected request')
  observed.request.bytes.fill(0); observed.report.date = '2026-11-18'; observed.binding.model = 'other'
  serviceDraftTool('2026-11-17').input_schema.properties = {}
  const first = validateRecordedServiceDraft(handle, binding)
  if (first.status !== 'validated') assert.fail('Expected draft')
  first.article.title = CANARY
  assert.deepEqual(validateRecordedServiceDraft(handle, binding), validate(recording()))
})

test('malformed request/response payloads return closed codes and bounded JSON parsing remains active', () => {
  for (const target of ['draft_request', 'draft_response']) {
    for (const text of ['{', `not JSON ${CANARY}`, '['.repeat(33) + '0' + ']'.repeat(33)]) {
      const value = recording(), item = value.artifacts.find(entry => entry.id === target)!
      Object.assign(item, { text, bytes: Buffer.byteLength(text), sha256: digest(text) })
      if (target === 'draft_request') {
        value.requests[0].binding.requestArtifactSha256 = item.sha256
        value.requests[0].requestSha256 = digest(encode(value.requests[0].binding))
        value.responses[0].requestSha256 = value.requests[0].requestSha256
      }
      rejects(value, text.startsWith('[') ? 'LIMIT_EXCEEDED' : target === 'draft_request' ? 'REQUEST_INVALID' : 'JSON_INVALID')
    }
  }
})

test('valid shape with a length finish reason is not upgraded into known provider completion', () => {
  const value = recording(); Object.assign(value.responses[0].result, { finishReason: 'length' })
  const result = validate(value)
  assert.equal(result.status, 'validated')
  if (result.status === 'validated') {
    assert.equal(result.finishReason, 'length'); assert.equal(result.provenance, 'unverified')
    assert.equal(result.publicationAuthority, 'none')
  }
})
