import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ActionSourceSchema, type ActionSource } from './action-registry-contract.js'
import { packActionIndexRows, unpackActionIndexRows } from './action-model-view.js'

export const ACTION_EVIDENCE_SELECTION_VERSION = 'progressive-action-evidence-v7-exact-coverage-views'
export const COVERAGE_SOURCE = 'action-evidence-coverage'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const ActionEvidenceCoverageSchema = z.object({
  version: z.literal(ACTION_EVIDENCE_SELECTION_VERSION), unit: z.literal('UTF-8 bytes'),
  collection: z.literal('Bounded collector output, not an exhaustive repository/discussion census. Missing or omitted content is unknown, never evidence of absence or approval.'),
  selection: z.literal('Whole-source model views; collector-proved lossless metadata factoring is allowed, with raw identity retained. No chronological comment window or excerpt. Only current carried actions, explicit feedback and retained draft continuation context require GitHub discussions. Shipment prose does not.'),
  authority: z.literal('This coverage index is context only. Hashes, identities, omission reasons and missing evidence cannot justify completion, supersession, dismissal or human approval.'),
  requiredReferences: z.array(z.string().regex(/^[\w-]+#\d+$/)), contextReferences: z.array(z.string().regex(/^[\w-]+#\d+$/)),
  referenceRequirements: z.array(z.object({ reference: z.string().regex(/^[\w-]+#\d+$/), classification: z.enum(['required', 'context']), source: z.string(), reason: z.string().max(512), role: z.enum(['target', 'lifecycle', 'owner', 'gate', 'counterevidence', 'retained-context']).optional() }).strict()),
  reviewActionKeys: z.array(z.string()), preservedTerminalActionKeys: z.array(z.string()), expandedActionKeys: z.array(z.string()), resolvedRequests: z.array(digest),
  sources: z.array(z.object({ id: z.string(), kind: ActionSourceSchema.shape.kind, locator: z.string(), fullContentSha256: digest, collectedContentSha256: digest, bytes: z.number().int().nonnegative(), modelBytes: z.number().int().nonnegative(), modelContentSha256: digest, modelPolicySha256: digest, lines: z.number().int().positive(), required: z.boolean(), included: z.boolean(), reason: z.enum(['outside current action/feedback scope', 'source bytes do not match their full-content identity (excerpt or corruption)', 'exceeds 128 KiB source limit', 'whole source does not fit total budget', 'complete artifact retained; bounded question view selected', 'exact ranges pinned to immutable complete artifact for one open question', 'complete current-action/feedback dependency', 'complete goal or contextual source', 'complete optional whole source omitted so selected sources and complete coverage receipt fit total budget']) }).strict()),
}).strict()

const HEADER = 'CONTEXT ONLY GENERATED COVERAGE (original L1 is NOT citable): '
const ENCODING = 'coverage-source-rows-v1'
const RULE = 'Only coverage.sources is shape-grouped. Each group lists columns once. Each row starts with its original zero-based ordinal, followed by column values. Restore rows by ordinal. All fields, values and order are retained; this index grants no authority.'
const MAX_BYTES = 8 * 1024 * 1024
const MAX_ROWS = 4096
const columns = Object.keys(ActionEvidenceCoverageSchema.shape.sources.element.shape)
const packedRow = z.tuple([z.number().int().min(0).max(MAX_ROWS - 1)]).rest(z.unknown())
  .refine(row => row.length === columns.length + 1)
const packedGroups = z.array(z.object({
  columns: z.array(z.enum(columns)).length(columns.length).refine(value => new Set(value).size === value.length),
  rows: z.array(packedRow).min(1).max(MAX_ROWS),
}).strict()).max(MAX_ROWS).refine(groups => groups.reduce((count, group) => count + group.rows.length, 0) <= MAX_ROWS)
const packedDocument = z.object({ version: z.literal(ENCODING), rule: z.literal(RULE),
  coverage: ActionEvidenceCoverageSchema.omit({ sources: true }).extend({ sources: packedGroups }).strict(),
}).strict()
const record = z.record(z.string(), z.unknown())
const records = z.array(record).max(MAX_ROWS)
const bytes = (content: string) => Buffer.byteLength(content, 'utf8')
const sha256 = (content: string) => createHash('sha256').update(content).digest('hex')

export const COVERAGE_MODEL_VIEW_POLICY_SHA256 = sha256(JSON.stringify({ encoding: ENCODING, header: HEADER, rule: RULE,
  selection: ACTION_EVIDENCE_SELECTION_VERSION, columns, maxBytes: MAX_BYTES, maxRows: MAX_ROWS }))

function canonicalRecord(content: string): Record<string, unknown> | undefined {
  if (bytes(content) > MAX_BYTES || content.includes('\n') || content.includes('\r')) return undefined
  try {
    const value: unknown = JSON.parse(content)
    const parsed = record.safeParse(value)
    return parsed.success && JSON.stringify(parsed.data) === content ? parsed.data : undefined
  } catch { return undefined }
}

/** Pure decoding proves representation only; source provenance is checked below. */
export function expandCoverageModelView(content: string): string | undefined {
  if (!content.startsWith(HEADER) || bytes(content) > MAX_BYTES) return undefined
  const document = canonicalRecord(content.slice(HEADER.length))
  if (!document || !packedDocument.safeParse(document).success) return undefined
  // Preserve the original JSON field order rather than Zod's schema key order.
  const coverage = record.safeParse(document.coverage)
  if (!coverage.success) return undefined
  const groups = packedGroups.safeParse(coverage.data.sources)
  if (!groups.success) return undefined
  try {
    const expanded = { ...coverage.data, sources: unpackActionIndexRows(groups.data) }
    return ActionEvidenceCoverageSchema.safeParse(expanded).success ? JSON.stringify(expanded) : undefined
  } catch { return undefined }
}

export type ActionEvidenceCoverageModelView = Readonly<{
  content: string
  hiddenLines: readonly number[]
  policySha256: string
}>

/** Pack only native-shaped, content-addressed coverage; retain its raw identity. */
export function coverageModelView(source: ActionSource): ActionEvidenceCoverageModelView | undefined {
  const parsed = ActionSourceSchema.safeParse(source)
  if (!parsed.success) return undefined
  const input = parsed.data
  if (input.kind !== 'report' || input.locator !== ACTION_EVIDENCE_SELECTION_VERSION
    || input.trustedContent !== undefined || input.projection !== undefined || input.response !== undefined
    || input.id !== `${COVERAGE_SOURCE}@${sha256(input.content)}`
    || input.fullContentSha256 !== undefined && input.fullContentSha256 !== sha256(input.content)) return undefined
  const coverage = canonicalRecord(input.content)
  if (!coverage || !ActionEvidenceCoverageSchema.safeParse(coverage).success) return undefined
  const rows = records.safeParse(coverage.sources)
  if (!rows.success) return undefined
  const content = HEADER + JSON.stringify({ version: ENCODING, rule: RULE, coverage: { ...coverage, sources: packActionIndexRows(rows.data) } })
  if (bytes(content) >= bytes(`L1: ${input.content}`) || expandCoverageModelView(content) !== input.content) return undefined
  return Object.freeze({ content, hiddenLines: Object.freeze([1]), policySha256: COVERAGE_MODEL_VIEW_POLICY_SHA256 })
}
