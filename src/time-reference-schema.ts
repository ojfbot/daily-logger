import { z } from 'zod'

const repoSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/)
const sourceUrlSchema = z.string().url().refine((value) => value.startsWith('https://github.com/'))

/** Strict calendar timestamps with a UTC/offset designator; no leap-second normalization. */
export function canonicalInstant(value: string): string | undefined {
  const normalized = value.replace(/ UTC$/, 'Z')
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(normalized)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second = '00', fraction = '', offset] = match
  const y = Number(year), m = Number(month), d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return undefined
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return undefined
  const at = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${offset}`)
  return Number.isFinite(at) ? new Date(at).toISOString() : undefined
}

export { scanVisibleTimeText } from './time-reference-text.js'

export const TimeEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github-commit'), repo: repoSchema, ref: z.string().regex(/^[a-f0-9]{40}$/), event: z.enum(['authored', 'committed']), url: sourceUrlSchema }),
  z.object({ kind: z.literal('github-pull-request'), repo: repoSchema, ref: z.string().regex(/^[1-9]\d*$/), event: z.enum(['opened', 'merged', 'closed', 'updated', 'closed-unmerged']), url: sourceUrlSchema }),
  z.object({ kind: z.literal('github-issue'), repo: repoSchema, ref: z.string().regex(/^[1-9]\d*$/), event: z.enum(['created', 'updated']), url: sourceUrlSchema }),
  z.object({ kind: z.literal('explicit-offset'), value: z.string().refine((value) => canonicalInstant(value) !== undefined) }),
]).refine((value) => value.kind === 'explicit-offset' || value.url === `https://github.com/${value.repo}/${value.kind === 'github-commit' ? 'commit' : value.kind === 'github-issue' ? 'issues' : 'pull'}/${value.ref}`)

export const TimeReferenceSchema = z.object({
  text: z.string().min(1),
  occurrence: z.number().int().nonnegative(),
  at: z.string().refine((value) => canonicalInstant(value) === value),
  precision: z.enum(['minute', 'second']),
  evidence: TimeEvidenceSchema,
})
export type TimeReference = z.infer<typeof TimeReferenceSchema>
export type TimeEvidence = TimeReference['evidence']

const unresolvedReasonSchema = z.enum(['missing-evidence', 'missing-date', 'ambiguous-source', 'clock-mismatch', 'mutable-event', 'unsupported-format', 'historical-claim-required', 'ineligible-context'])
const memberResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('supported'), at: z.string().refine((value) => canonicalInstant(value) === value), evidence: TimeEvidenceSchema }).strict(),
  z.object({ kind: z.literal('unresolved'), reason: unresolvedReasonSchema }).strict(),
])
export const TimeExpressionMemberSchema = z.object({
  text: z.string().min(1).max(256),
  precision: z.enum(['minute', 'second']),
  certainty: z.enum(['exact', 'approximate']),
  resolution: memberResolutionSchema,
}).strict()
const expressionIdentity = { text: z.string().min(1).max(2048), occurrence: z.number().int().nonnegative() }
export const TimeExpressionSchema = z.discriminatedUnion('kind', [
  z.object({ ...expressionIdentity, kind: z.literal('point'), member: TimeExpressionMemberSchema }).strict(),
  z.object({ ...expressionIdentity, kind: z.literal('list'), members: z.array(TimeExpressionMemberSchema).min(2) }).strict(),
  z.object({ ...expressionIdentity, kind: z.literal('interval'), start: TimeExpressionMemberSchema, end: TimeExpressionMemberSchema, relation: z.enum(['elapsed', 'event-span', 'unestablished']) }).strict(),
])
export type TimeExpression = z.infer<typeof TimeExpressionSchema>
export type TimeExpressionMember = z.infer<typeof TimeExpressionMemberSchema>

export function timeExpressionMembers(expression: TimeExpression): TimeExpressionMember[] {
  switch (expression.kind) {
    case 'point': return [expression.member]
    case 'list': return expression.members
    case 'interval': return [expression.start, expression.end]
  }
}

/** Decode the existing v1 instant wire format into one display union. Stored claims stay unchanged. */
export const TimeDisplayReferenceSchema = z.union([
  TimeReferenceSchema.strict().transform((reference) => ({ kind: 'instant' as const, reference })),
  TimeExpressionSchema,
])
export type TimeDisplayReference = z.output<typeof TimeDisplayReferenceSchema>
export type TimeReferenceInput = z.input<typeof TimeDisplayReferenceSchema>
