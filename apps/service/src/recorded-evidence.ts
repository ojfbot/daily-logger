import { createHash } from 'node:crypto'
import { z } from 'zod'

export const RECORDED_LIMITS = Object.freeze({ envelopeBytes: 8 * 1024 * 1024, artifacts: 256,
  artifactBytes: 1024 * 1024, totalArtifactBytes: 4 * 1024 * 1024, depth: 32, nodes: 32_768, arrayItems: 256 })
const ERROR_CODES = ['BUNDLE_INVALID', 'LIMIT_EXCEEDED', 'SEAL_MISMATCH', 'INVALID_HANDLE', 'INVALID_BINDING', 'ARTIFACT_MISSING'] as const
export type RecordedErrorCode = typeof ERROR_CODES[number]
export class RecordedEvidenceError extends Error {
  readonly code: RecordedErrorCode
  constructor(code: RecordedErrorCode) {
    super('Recorded evidence rejected')
    this.code = ERROR_CODES.includes(code) ? code : 'BUNDLE_INVALID'
    Object.freeze(this)
  }
}
function closedError(error: unknown, fallback: RecordedErrorCode) {
  try {
    const code = Object.getOwnPropertyDescriptor(error, 'code')?.value
    if (error instanceof RecordedEvidenceError && ERROR_CODES.includes(code)) return new RecordedEvidenceError(code)
  } catch { /* Hostile caller objects do not supply diagnostics. */ }
  return new RecordedEvidenceError(fallback)
}
function fail(code: RecordedErrorCode): never { throw new RecordedEvidenceError(code) }
const requireValue = (condition: unknown, code: RecordedErrorCode = 'BUNDLE_INVALID'): void => { if (!condition) fail(code) }
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)
const descriptor = z.string().min(1).max(160)
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value)
const role = z.enum(['draft', 'review', 'revision'])
const referenceList = z.array(id).max(RECORDED_LIMITS.artifacts)
const artifactRole = z.enum(['context', 'action_registry', 'article_statuses', 'previous_article', 'source_record',
  'priority_snapshot', 'capture_receipt', 'model_request', 'model_response'])
const origin = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('synthetic') }),
  z.strictObject({ kind: z.literal('git'), repository: descriptor, commit: z.string().regex(/^[a-f0-9]{40}$/), blob: z.string().regex(/^[a-f0-9]{40}$/) }),
  z.strictObject({ kind: z.literal('api-snapshot'), sourceId: descriptor, observedAt: timestamp, revision: descriptor.nullable() }),
])
const artifact = z.strictObject({ id, role: artifactRole, format: descriptor, mediaType: z.enum(['application/json', 'text/plain', 'text/markdown']),
  sha256: hash, bytes: z.number().int().min(0).max(RECORDED_LIMITS.artifactBytes), text: z.string(), origin: origin.nullable() })
const priority = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('missing') }),
  z.strictObject({ state: z.literal('asserted'), artifactRef: id, sourceGoalRefs: referenceList.min(1), effectiveFrom: timestamp, expiresAt: timestamp,
    approval: z.strictObject({ actorId: descriptor, decisionRef: id, approvedAt: timestamp }) }),
])
const evidence = z.strictObject({ contextRef: id, actionRegistryRef: id, articleStatusesRef: id,
  previousArticleRefs: referenceList, sourceRefs: referenceList, priority })
const binding = z.strictObject({ role, evidenceSha256: hash, provider: descriptor.nullable(), model: descriptor.nullable(),
  promptVersion: descriptor.nullable(), outputSchemaVersion: descriptor.nullable(), requestArtifactSha256: hash,
  previousResponseSha256: hash.nullable() })
const request = z.strictObject({ binding, requestSha256: hash, artifactRef: id })
const usage = z.strictObject({ inputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  outputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(), costUsdMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable() })
const response = z.strictObject({ requestSha256: hash, role, provider: descriptor.nullable(), model: descriptor.nullable(), usage,
  result: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('returned'), artifactRef: id, finishReason: z.enum(['stop', 'length', 'tool', 'other']).nullable() }),
    z.strictObject({ status: z.literal('failed'), code: z.enum(['provider_failed', 'invalid_recording']) }),
    z.strictObject({ status: z.literal('unknown') }),
  ]) })
const envelope = z.strictObject({ schemaVersion: z.literal('dailylogger-recorded-evidence-v1'), encoding: z.literal('dailylogger-canonical-json-v1'),
  mode: z.literal('recorded-replay'),
  capture: z.strictObject({ kind: z.enum(['synthetic', 'recorded']), capturedAt: timestamp, collectorVersion: descriptor.nullable(),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/).nullable(), captureReceiptRef: id.nullable() }),
  report: z.strictObject({ date, policy: z.literal('chicago-0330-v1'), startInclusive: timestamp, endExclusive: timestamp }),
  evidence, evidenceSha256: hash, artifacts: z.array(artifact).min(3).max(RECORDED_LIMITS.artifacts),
  requests: z.array(request).max(3), responses: z.array(response).max(3) })

export type RecordedBinding = z.infer<typeof binding>
type Envelope = z.infer<typeof envelope>
type Artifact = z.infer<typeof artifact>
export interface RecordedEvidence {
  readonly bundleSha256: string
  readonly evidenceSha256: string
  readonly captureKind: 'synthetic' | 'recorded'
  readonly provenance: 'unverified'
  readonly priorities: 'missing' | 'asserted-unverified'
  readonly publicationAuthority: 'none'
  readonly actionAuthority: 'none'
  readonly executionAuthority: 'none'
}
const opened = new WeakMap<RecordedEvidence, Envelope>()
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const intrinsicByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!
const intrinsicByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!
const intrinsicBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!

function copyInput(input: Uint8Array): Buffer {
  requireValue(input instanceof Uint8Array)
  // Own properties, valueOf, iterators and species are not an input-size authority.
  const length: number = Reflect.apply(intrinsicByteLength, input, [])
  requireValue(length > 0)
  requireValue(length <= RECORDED_LIMITS.envelopeBytes, 'LIMIT_EXCEEDED')
  const backing: ArrayBuffer = Reflect.apply(intrinsicBuffer, input, [])
  const offset: number = Reflect.apply(intrinsicByteOffset, input, [])
  requireValue(backing instanceof ArrayBuffer) // Shared/cross-realm/proxy inputs are outside this first contract.
  const bytes = Buffer.from(new Uint8Array(backing, offset, length))
  requireValue(bytes.length === length && bytes.length <= RECORDED_LIMITS.envelopeBytes, 'LIMIT_EXCEEDED')
  return bytes
}

/** Local v1 encoding: sorted object keys, JSON strings/numbers, preserved array order, no whitespace/BOM. Not an RFC canonicalization claim. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)!
}

/** Structural scan before parsing or any recursive encoder/Zod operation. Braces in strings do not count. */
function depthBound(text: string) {
  let depth = 0, containers = 0, quoted = false, escaped = false
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === '{' || character === '[') {
      requireValue(++depth <= RECORDED_LIMITS.depth && ++containers <= RECORDED_LIMITS.nodes, 'LIMIT_EXCEEDED')
    } else if (character === '}' || character === ']') depth--
  }
}

/** Validate scalar text, collection lengths and total work without recursive traversal. */
function valueBounds(value: unknown) {
  const pending: unknown[] = [value]
  let nodes = 0
  while (pending.length) {
    const item = pending.pop(); requireValue(++nodes <= RECORDED_LIMITS.nodes, 'LIMIT_EXCEEDED')
    if (typeof item === 'string') {
      requireValue(Buffer.byteLength(item, 'utf8') <= RECORDED_LIMITS.artifactBytes, 'LIMIT_EXCEEDED')
      for (let index = 0; index < item.length; index++) {
        const code = item.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) { const next = item.charCodeAt(++index); requireValue(next >= 0xdc00 && next <= 0xdfff) }
        else requireValue(code < 0xdc00 || code > 0xdfff)
      }
    } else if (Array.isArray(item)) {
      requireValue(item.length <= RECORDED_LIMITS.arrayItems, 'LIMIT_EXCEEDED'); pending.push(...item)
    } else if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item)
      requireValue(entries.length <= RECORDED_LIMITS.arrayItems, 'LIMIT_EXCEEDED')
      for (const [key, child] of entries) pending.push(key, child)
    } else requireValue(item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))
  }
}

function validateReferences(value: Envelope) {
  const artifacts = new Map<string, Artifact>(); let bytes = 0
  for (const item of value.artifacts) {
    requireValue(!artifacts.has(item.id)); artifacts.set(item.id, item)
    const length = Buffer.byteLength(item.text, 'utf8')
    requireValue(length === item.bytes && sha(item.text) === item.sha256)
    requireValue((bytes += length) <= RECORDED_LIMITS.totalArtifactBytes, 'LIMIT_EXCEEDED')
    if (item.role === 'source_record') requireValue(item.origin !== null)
  }
  const ref = (key: string, expected: Artifact['role']) => {
    const item = artifacts.get(key); requireValue(item?.role === expected); return item!
  }
  const refs = (keys: string[], expected: Artifact['role']) => {
    requireValue(new Set(keys).size === keys.length); for (const key of keys) ref(key, expected)
  }
  const ev = value.evidence
  ref(ev.contextRef, 'context'); ref(ev.actionRegistryRef, 'action_registry'); ref(ev.articleStatusesRef, 'article_statuses')
  refs(ev.previousArticleRefs, 'previous_article'); refs(ev.sourceRefs, 'source_record')
  if (value.capture.captureReceiptRef !== null) ref(value.capture.captureReceiptRef, 'capture_receipt')
  if (ev.priority.state === 'asserted') {
    ref(ev.priority.artifactRef, 'priority_snapshot'); refs(ev.priority.sourceGoalRefs, 'source_record'); ref(ev.priority.approval.decisionRef, 'source_record')
    requireValue(ev.priority.effectiveFrom < ev.priority.expiresAt)
  }
  // The evidence identity includes descriptors AND every referenced byte digest, not merely mutable artifact IDs.
  const evidenceIds = new Set([ev.contextRef, ev.actionRegistryRef, ev.articleStatusesRef, ...ev.previousArticleRefs, ...ev.sourceRefs,
    ...(ev.priority.state === 'asserted' ? [ev.priority.artifactRef, ...ev.priority.sourceGoalRefs, ev.priority.approval.decisionRef] : [])])
  const evidenceArtifacts = [...evidenceIds].sort().map(key => { const { text: _text, ...descriptor } = artifacts.get(key)!; return descriptor })
  requireValue(value.evidenceSha256 === sha(canonical({ report: value.report, evidence: ev, artifacts: evidenceArtifacts })))
  const requests = new Map<string, Envelope['requests'][number]>()
  const byRole = new Map<RecordedBinding['role'], Envelope['requests'][number]>()
  for (const item of value.requests) {
    requireValue(!requests.has(item.requestSha256) && !byRole.has(item.binding.role))
    requireValue(item.binding.evidenceSha256 === value.evidenceSha256 && item.requestSha256 === sha(canonical(item.binding)))
    requireValue(ref(item.artifactRef, 'model_request').sha256 === item.binding.requestArtifactSha256)
    requests.set(item.requestSha256, item); byRole.set(item.binding.role, item)
  }
  const responses = new Map<string, Envelope['responses'][number]>()
  for (const item of value.responses) {
    const requested = requests.get(item.requestSha256)
    requireValue(requested && !responses.has(item.requestSha256)); responses.set(item.requestSha256, item)
    requireValue(requested!.binding.role === item.role && requested!.binding.provider === item.provider && requested!.binding.model === item.model)
    if (item.result.status === 'returned') ref(item.result.artifactRef, 'model_response')
    if (item.result.status === 'unknown') requireValue(Object.values(item.usage).every(value => value === null))
  }
  // Empty, draft-only and draft+review prefixes are allowed; later roles require an actually returned predecessor.
  for (const item of value.requests) {
    if (item.binding.role === 'draft') requireValue(item.binding.previousResponseSha256 === null)
    else {
      const previous = byRole.get(item.binding.role === 'review' ? 'draft' : 'review')
      const recorded = previous && responses.get(previous.requestSha256)
      requireValue(recorded?.result.status === 'returned')
      if (recorded?.result.status === 'returned') requireValue(item.binding.previousResponseSha256 === ref(recorded.result.artifactRef, 'model_response').sha256)
    }
  }
}

/** No source authenticity, priority approval, payload semantics, model invocation or execution authority is established here. */
export function openRecordedEvidence(input: Uint8Array, expectedBundleSha256: string): RecordedEvidence {
  try {
    requireValue(typeof expectedBundleSha256 === 'string' && /^[a-f0-9]{64}$/.test(expectedBundleSha256))
    const bytes = copyInput(input)
    requireValue(sha(bytes) === expectedBundleSha256, 'SEAL_MISMATCH')
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    depthBound(text)
    const parsed: unknown = JSON.parse(text)
    valueBounds(parsed)
    // Reject duplicate keys, escapes/spacing variants, BOM and noncanonical numbers rather than silently normalizing them.
    requireValue(canonical(parsed) === text)
    const result = envelope.safeParse(parsed); requireValue(result.success)
    const value = result.data!
    requireValue(value.report.startInclusive < value.report.endExclusive)
    validateReferences(value)
    const handle: RecordedEvidence = Object.freeze({ bundleSha256: expectedBundleSha256, evidenceSha256: value.evidenceSha256,
      captureKind: value.capture.kind, provenance: 'unverified', priorities: value.evidence.priority.state === 'missing' ? 'missing' : 'asserted-unverified',
      publicationAuthority: 'none', actionAuthority: 'none', executionAuthority: 'none' })
    opened.set(handle, value); return handle
  } catch (error) { throw closedError(error, 'BUNDLE_INVALID') }
}

function state(handle: RecordedEvidence): Envelope {
  const value = opened.get(handle); if (!value) fail('INVALID_HANDLE'); return value
}
export function readRecordedArtifact(handle: RecordedEvidence, artifactId: string): Buffer {
  const artifact = state(handle).artifacts.find(item => item.id === artifactId)
  if (!artifact) fail('ARTIFACT_MISSING')
  return Buffer.from(artifact.text, 'utf8')
}

/** Module boundary for the response adapter. Returns copies; the validated backing state never escapes. */
export function recordedExchange(handle: RecordedEvidence, requested: RecordedBinding) {
  try {
    const value = state(handle)
    const validated = binding.safeParse(requested)
    if (!validated.success) fail('INVALID_BINDING')
    valueBounds(validated.data)
    const item = value.requests.find(item => item.binding.role === validated.data.role)
    if (!item) return { status: 'missing' as const, reason: 'request' as const }
    if (canonical(item.binding) !== canonical(validated.data)) return { status: 'binding-mismatch' as const }
    const recorded = value.responses.find(response => response.requestSha256 === item.requestSha256)
    return recorded ? { status: 'matched' as const, requestSha256: item.requestSha256, response: structuredClone(recorded) }
      : { status: 'missing' as const, reason: 'response' as const }
  } catch (error) { throw closedError(error, 'INVALID_BINDING') }
}
