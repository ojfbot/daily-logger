import { z } from 'zod'
import { CanonicalActionSchema, isReviewedAction } from './action-model.js'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)

export const CitationSchema = z.object({ sourceId: z.string().min(1), quote: z.string().min(12) }).strict()
export const ActionSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['repository', 'github', 'goal', 'instruction', 'report']),
  locator: z.string().min(1),
  content: z.string(),
  trustedContent: z.array(z.string()).optional(),
}).strict()
export type ActionSource = z.infer<typeof ActionSourceSchema>
export const ActionStateSchema = z.enum(['proposed', 'open', 'done', 'dismissed', 'superseded', 'deferred'])
export const ActionDecisionSchema = z.object({
  roundId: digest,
  articleDate: date,
  state: ActionStateSchema,
  description: z.string().min(1),
  reason: z.string().min(1),
  citations: z.array(CitationSchema),
  verifiedBy: z.string().min(1),
  verificationReason: z.string().min(1),
}).strict()
export const ActionRecordSchema = z.object({
  key: z.string().min(1),
  original: CanonicalActionSchema,
  origin: z.enum(['imported', 'suggested']),
  workKey: z.string().min(1),
  state: ActionStateSchema,
  introducedBy: date,
  includeInIndex: z.boolean(),
  inclusionOverride: z.object({ include: z.boolean(), actor: z.string().min(1), instruction: z.string().min(1) }).strict().nullable(),
  goal: z.string(),
  doneWhen: z.string(),
  gates: z.array(z.string()),
  history: z.array(ActionDecisionSchema),
}).strict()
export type ActionRecord = z.infer<typeof ActionRecordSchema>
const ArticleActionSchema = z.object({
  date,
  status: z.enum(['draft', 'accepted', 'rejected']),
  review: z.discriminatedUnion('state', [z.object({ state: z.literal('verified') }).strict(), z.object({ state: z.literal('pending'), reason: z.string().min(1) }).strict()]).default({ state: 'verified' }),
  articleDigest: digest,
  roundId: digest,
  actionKeys: z.array(z.string()),
  stateDigest: digest,
  verification: z.object({ proposer: z.string(), verifier: z.string(), promptVersion: z.string(), proposalSha256: digest, verdicts: z.array(z.object({ item: z.string(), verdict: z.enum(['pass', 'reject', 'hold']), reason: z.string() }).strict()) }).strict(),
  sources: z.array(ActionSourceSchema),
  rejected: z.array(z.object({ description: z.string(), reason: z.string() }).strict()),
}).strict()
export const ActionRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  baseline: z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), openSha256: digest, doneSha256: digest, articleActions: z.record(z.string(), z.array(CanonicalActionSchema)), heldSuggestions: z.array(z.object({ articlePath: z.string(), sourceDate: date, line: z.number(), invocation: z.string(), suggestionLineSha256: digest, suggestion: z.string().min(1) }).strict()) }).strict(),
  records: z.array(ActionRecordSchema),
  articles: z.array(ArticleActionSchema),
}).strict().superRefine((registry, context) => {
  const keys = registry.records.map(record => record.key)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Duplicate action identity' })
  const days = registry.articles.map(article => article.date)
  if (new Set(days).size !== days.length) context.addIssue({ code: 'custom', message: 'Duplicate article action snapshot' })
  for (const article of registry.articles) {
    if (article.review.state === 'pending' && article.status !== 'draft') context.addIssue({ code: 'custom', message: `Pending action review cannot publish: ${article.date}` })
    if (new Set(article.actionKeys).size !== article.actionKeys.length || article.actionKeys.some(key => !keys.includes(key))) context.addIssue({ code: 'custom', message: `Invalid action references for ${article.date}` })
  }
  for (const record of registry.records) {
    if (record.original.status === 'done' && record.state !== 'done') context.addIssue({ code: 'custom', message: `Completed history cannot reopen: ${record.key}` })
    if (isReviewedAction(record.original) && record.state !== 'open') context.addIssue({ code: 'custom', message: `Reviewed action requires a separately accepted exact-ID settlement receipt: ${record.key}` })
    if (record.inclusionOverride && record.includeInIndex !== record.inclusionOverride.include) context.addIssue({ code: 'custom', message: `Inclusion override changed: ${record.key}` })
    if (record.history.length && record.history.at(-1)?.state !== record.state) context.addIssue({ code: 'custom', message: `Action state lacks a matching decision: ${record.key}` })
    if (record.origin === 'imported' && !record.history.length && record.state !== record.original.status) context.addIssue({ code: 'custom', message: `Imported state changed without evidence: ${record.key}` })
    if (record.origin === 'suggested' && (!record.original.id || record.original.id !== record.key || !record.goal || !record.doneWhen || !record.history.length || !registry.articles.some(article => article.date === record.introducedBy && article.actionKeys.includes(record.key)))) context.addIssue({ code: 'custom', message: `Suggested action lacks an article review: ${record.key}` })
  }
  for (const day of new Set(registry.records.filter(record => record.origin === 'suggested').map(record => record.introducedBy))) {
    if (registry.records.filter(record => record.origin === 'suggested' && record.introducedBy === day).length > 2) context.addIssue({ code: 'custom', message: `More than two new suggestion identities for ${day}` })
  }
})
export type ActionRegistry = z.infer<typeof ActionRegistrySchema>
function explicitInclusionInstruction(instruction: string) { return instruction === 'Explicit editorial inclusion checkbox' || /^Explicit editorial inclusion instruction: \S[\s\S]*$/.test(instruction) }
export function isArticleInclusionChange(before: ActionRegistry, after: ActionRegistry, articleDate: string, actor: string): boolean {
  const snapshot = before.articles.find(article => article.date === articleDate)
  if (!snapshot || snapshot.status !== 'draft' || before.records.length !== after.records.length) return false
  const restored = structuredClone(after)
  for (let index = 0; index < before.records.length; index++) {
    const original = before.records[index]
    const changed = restored.records[index]
    if (!original || !changed || original.key !== changed.key) return false
    if (JSON.stringify(original) === JSON.stringify(changed)) continue
    if (original.origin !== 'suggested' || original.introducedBy !== articleDate || !snapshot.actionKeys.includes(original.key) ||
        changed.inclusionOverride?.actor.toLowerCase() !== actor.toLowerCase() ||
        !explicitInclusionInstruction(changed.inclusionOverride.instruction) || changed.inclusionOverride.include !== changed.includeInIndex) return false
    changed.includeInIndex = original.includeInIndex
    changed.inclusionOverride = original.inclusionOverride
  }
  return JSON.stringify(before) === JSON.stringify(restored)
}
export type ArticleActionSnapshot = z.infer<typeof ArticleActionSchema>
export const ProposedActionSchema = z.object({ id: z.string(), command: z.string(), description: z.string(), repo: z.string(), sourceDate: date, status: z.literal('proposed'), includeInIndex: z.boolean() }).strict()
export type ProposedAction = z.infer<typeof ProposedActionSchema>

