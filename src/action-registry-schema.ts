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
  fullContentSha256: digest.optional(),
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
export const ArticleActionSchema = z.object({
  date,
  status: z.enum(['draft', 'accepted', 'rejected']),
  review: z.discriminatedUnion('state', [z.object({ state: z.literal('verified') }).strict(), z.object({ state: z.literal('pending'), reason: z.string().min(1) }).strict()]).default({ state: 'verified' }),
  articleDigest: digest,
  roundId: digest,
  actionKeys: z.array(z.string()),
  stateDigest: digest,
  verification: z.object({ proposer: z.string(), verifier: z.string(), promptVersion: z.string(), proposalSha256: digest, verdicts: z.array(z.object({ item: z.string(), verdict: z.enum(['pass', 'reject', 'hold']), reason: z.string() }).strict()) }).strict(),
  sources: z.array(ActionSourceSchema),
  rejected: z.array(z.object({ description: z.string(), reason: z.string(), workKey: z.string().optional(), evidenceDigest: digest.optional() }).strict()),
  binding: z.object({ mode: z.literal('editorial-rebind'), fromDigest: digest, actor: z.string().min(1), instructionSha256: digest }).strict().optional(),
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
export type ArticleActionSnapshot = z.infer<typeof ArticleActionSchema>
export const ProposedActionSchema = z.object({ id: z.string(), command: z.string(), description: z.string(), repo: z.string(), sourceDate: date, status: z.literal('proposed'), includeInIndex: z.boolean() }).strict()
export type ProposedAction = z.infer<typeof ProposedActionSchema>

// One logical registry: immutable imported identities plus one bounded file per
// article. Decisions live with the article that issued them, never on a shared row.
export const ArticleActionFileSchema = z.object({
  schemaVersion: z.literal(1),
  date,
  suggestions: z.array(ActionRecordSchema.omit({ history: true, state: true })),
  decisions: z.array(z.object({ key: z.string(), decision: ActionDecisionSchema }).strict()),
  snapshot: ArticleActionSchema,
}).strict().superRefine((file, context) => {
  if (new TextEncoder().encode(JSON.stringify(file)).length > ACTION_FILE_LIMIT) context.addIssue({ code: 'custom', message: 'Article action state exceeds 64 KiB' })
  if (file.snapshot.date !== file.date || file.decisions.some(item => item.decision.articleDate !== file.date) || file.suggestions.some(item => item.origin !== 'suggested' || item.introducedBy !== file.date) || file.suggestions.length > 2) context.addIssue({ code: 'custom', message: 'Article action file crosses its date boundary' })
})
export type ArticleActionFile = z.infer<typeof ArticleActionFileSchema>
export const actionArticlePath = (date: string) => `actions/articles/${date}.json`
export const ACTION_FILE_LIMIT = 64 * 1024
export function articleActionFileBytes(file: ArticleActionFile): string {
  const bytes = JSON.stringify(ArticleActionFileSchema.parse(file), null, 2) + '\n'
  if (new TextEncoder().encode(bytes).length > ACTION_FILE_LIMIT) throw new Error('Article action state exceeds 64 KiB; compact the evidence before publishing')
  return bytes
}
export function splitActionRegistry(registry: ActionRegistry): { baseline: ActionRegistry; files: ArticleActionFile[] } {
  const baseline = { ...registry, records: registry.records.filter(record => record.origin === 'imported').map(record => ({ ...record, state: record.original.status, history: [] })), articles: [] }
  return { baseline: ActionRegistrySchema.parse(baseline), files: registry.articles.map(snapshot => ArticleActionFileSchema.parse({ schemaVersion: 1, date: snapshot.date,
    suggestions: registry.records.filter(record => record.origin === 'suggested' && record.introducedBy === snapshot.date).map(({ history: _history, state: _state, ...record }) => record),
    decisions: registry.records.flatMap(record => record.history.filter(decision => decision.articleDate === snapshot.date).map(decision => ({ key: record.key, decision }))), snapshot })) }
}
export function hydrateActionRegistry(baseline: ActionRegistry, files: ArticleActionFile[]): ActionRegistry {
  if (baseline.articles.length || baseline.records.some(record => record.origin !== 'imported' || record.history.length)) throw new Error('The imported action baseline must be frozen; run the explicit cutover')
  const ordered = [...files].sort((a, b) => a.date.localeCompare(b.date))
  const records = [...structuredClone(baseline.records), ...ordered.flatMap(file => file.suggestions.map(record => ({ ...structuredClone(record), state: 'proposed' as const, history: [] as ActionRecord['history'] })))]
  for (const file of ordered) for (const { key, decision } of file.decisions) {
    const record = records.find(record => record.key === key)
    if (!record) throw new Error(`Unknown action identity in ${file.date}: ${key}`)
    record.history.push(decision); record.state = decision.state
  }
  const workKeys = records.filter(record => record.origin === 'suggested').map(record => record.workKey)
  if (new Set(workKeys).size !== workKeys.length) throw new Error('Concurrent articles proposed the same work; reconcile the duplicate before publishing')
  return ActionRegistrySchema.parse({ ...baseline, records, articles: ordered.map(file => file.snapshot) })
}
export function isArticleFileInclusionChange(before: ArticleActionFile, after: ArticleActionFile, actor: string): boolean {
  if (before.snapshot.status !== 'draft') return false
  const restored = structuredClone(after)
  for (const changed of restored.suggestions) {
    const original = before.suggestions.find(record => record.key === changed.key)
    if (!original) return false
    if (JSON.stringify(original) === JSON.stringify(changed)) continue
    if (!before.snapshot.actionKeys.includes(changed.key) || changed.inclusionOverride?.actor.toLowerCase() !== actor.toLowerCase() || !explicitInclusionInstruction(changed.inclusionOverride.instruction) || changed.inclusionOverride.include !== changed.includeInIndex) return false
    changed.includeInIndex = original.includeInIndex; changed.inclusionOverride = original.inclusionOverride
  }
  return JSON.stringify(before) === JSON.stringify(restored)
}

