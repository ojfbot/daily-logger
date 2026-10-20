import { z } from 'zod'
import { CanonicalActionSchema, isReviewedAction } from './action-model.js'
import { ActionReviewCycleSchema, CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS, RANKED_ACTION_REVIEW_PROMPT_VERSIONS, actionAdmissionErrors } from './action-review-cycle.js'

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
const ClosingHandoffFields = {
  title: z.string().min(1),
  entryPoint: z.string().min(1),
  context: z.string().min(1),
  whyNow: z.string().min(1),
  outcome: z.string().min(1),
  nextCheck: z.string().min(1),
  factCitations: z.array(CitationSchema).min(1),
  goalCitations: z.array(CitationSchema).min(1),
}
export const ClosingActionSchema = z.object({
  kind: z.literal('action'),
  actionKey: z.string().min(1),
  ...ClosingHandoffFields,
}).strict()
export const ClosingCheckpointSchema = z.object({
  kind: z.literal('checkpoint'),
  target: z.string().url(),
  ...ClosingHandoffFields,
}).strict()
export const ClosingOptionSchema = z.discriminatedUnion('kind', [ClosingActionSchema, ClosingCheckpointSchema])
const RecommendationRankSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
const RankedRecommendationFields = {
  rank: RecommendationRankSchema,
  identity: z.string().min(1),
  benefit: z.string().min(1).max(180),
  start: z.string().min(1).max(180),
  rationale: z.string().min(1),
  replaces: z.array(z.string().min(1)),
}
export const RankedClosingActionSchema = ClosingActionSchema.extend(RankedRecommendationFields).strict()
export const RankedClosingCheckpointSchema = ClosingCheckpointSchema.extend(RankedRecommendationFields).strict()
export const RankedClosingOptionSchema = z.discriminatedUnion('kind', [RankedClosingActionSchema, RankedClosingCheckpointSchema])
export const RecommendationMaintenanceDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('action'), identity: z.string().min(1), actionKey: z.string().min(1), title: z.string().min(1), outcome: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('checkpoint'), identity: z.string().min(1), target: z.string().url(), title: z.string().min(1), outcome: z.string().min(1) }).strict(),
])
export type RecommendationMaintenanceDescriptor = z.infer<typeof RecommendationMaintenanceDescriptorSchema>
export const RankedShortlistSchema = z.object({
  kind: z.literal('shortlist'),
  options: z.tuple([RankedClosingOptionSchema, RankedClosingOptionSchema, RankedClosingOptionSchema]),
}).strict().superRefine((shortlist, context) => {
  if (shortlist.options.some((option, index) => option.rank !== index + 1)) context.addIssue({ code: 'custom', message: 'Suggested action ranks must be exactly 1, 2, 3 in display order' })
  if (new Set(shortlist.options.map(option => option.identity)).size !== shortlist.options.length) context.addIssue({ code: 'custom', message: 'Suggested action identities must be distinct' })
  const replaced = shortlist.options.flatMap(option => option.replaces)
  if (new Set(replaced).size !== replaced.length || replaced.some(identity => shortlist.options.some(option => option.identity === identity))) context.addIssue({ code: 'custom', message: 'A prior suggested action may be replaced once and cannot remain current' })
})
const PartialShortlistSchema = z.array(RankedClosingOptionSchema).max(2).superRefine((options, context) => {
  if (options.some((option, index) => option.rank !== index + 1)) context.addIssue({ code: 'custom', message: 'Partial suggested action ranks must be contiguous from 1' })
  if (new Set(options.map(option => option.identity)).size !== options.length) context.addIssue({ code: 'custom', message: 'Partial suggested action identities must be distinct' })
})
const NeedsEvidenceClosingSchema = z.object({
  kind: z.literal('needs-evidence'),
  question: z.string().min(1),
  missingEvidence: z.string().min(1),
  nextCheck: z.string().min(1),
  recommendations: PartialShortlistSchema.default([]),
  unresolvedIdentities: z.array(z.string().min(1)).optional(),
  unresolvedRecommendations: z.array(RecommendationMaintenanceDescriptorSchema).optional(),
}).strict().superRefine((closing, context) => {
  const unresolved = closing.unresolvedIdentities ?? []
  const descriptors = closing.unresolvedRecommendations ?? []
  if (new Set(unresolved).size !== unresolved.length || unresolved.some(identity => closing.recommendations.some(option => option.identity === identity))) context.addIssue({ code: 'custom', message: 'Unresolved recommendation identities must be distinct from the visible partial shortlist' })
  if (new Set(descriptors.map(descriptor => descriptor.identity)).size !== descriptors.length || descriptors.some(descriptor => !unresolved.includes(descriptor.identity))) context.addIssue({ code: 'custom', message: 'Unresolved recommendation descriptors must identify unresolved shortlist obligations' })
})
export const ClosingPromptSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('options'), options: z.array(ClosingOptionSchema).min(1).max(5) }).strict(),
  RankedShortlistSchema,
  NeedsEvidenceClosingSchema,
])
export type ClosingCheckpoint = z.infer<typeof ClosingCheckpointSchema>
export type ClosingOption = z.infer<typeof ClosingOptionSchema>
export type RankedClosingOption = z.infer<typeof RankedClosingOptionSchema>
export type ClosingPrompt = z.infer<typeof ClosingPromptSchema>
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
  admission: ActionReviewCycleSchema.optional(),
  includeInIndex: z.boolean(),
  inclusionOverride: z.object({ include: z.boolean(), actor: z.string().min(1), instruction: z.string().min(1) }).strict().nullable(),
  goal: z.string(),
  doneWhen: z.string(),
  gates: z.array(z.string()),
  history: z.array(ActionDecisionSchema),
}).strict()
export type ActionRecord = z.infer<typeof ActionRecordSchema>
export const DraftRecommendationContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('retained'), markdown: z.string().min(1).max(16_000) }).strict(),
])
export type DraftRecommendationContext = z.infer<typeof DraftRecommendationContextSchema>
export const ArticleActionSchema = z.object({
  date,
  status: z.enum(['draft', 'accepted', 'rejected']),
  review: z.discriminatedUnion('state', [z.object({ state: z.literal('verified') }).strict(), z.object({ state: z.literal('pending'), reason: z.string().min(1) }).strict()]).default({ state: 'verified' }),
  articleDigest: digest,
  roundId: digest,
  reviewCycle: ActionReviewCycleSchema.optional(),
  actionKeys: z.array(z.string()),
  draftContext: DraftRecommendationContextSchema.optional(),
  closing: ClosingPromptSchema.optional(),
  stateDigest: digest,
  verification: z.object({ proposer: z.string(), verifier: z.string(), promptVersion: z.string(), proposalSha256: digest, verdicts: z.array(z.object({ item: z.string(), verdict: z.enum(['pass', 'reject', 'hold']), reason: z.string() }).strict()) }).strict(),
  sources: z.array(ActionSourceSchema),
  rejected: z.array(z.object({ description: z.string(), reason: z.string(), workKey: z.string().optional(), evidenceDigest: digest.optional(), quotaHold: z.object({ articleDate: date, cycle: ActionReviewCycleSchema }).strict().optional() }).strict()),
  binding: z.object({ mode: z.literal('editorial-rebind'), fromDigest: digest, actor: z.string().min(1), instructionSha256: digest }).strict().optional(),
}).strict().superRefine((article, context) => {
  const contextBoundVersions = new Set<string>(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS)
  const rankedVersions = new Set<string>(RANKED_ACTION_REVIEW_PROMPT_VERSIONS)
  if ((contextBoundVersions.has(article.verification.promptVersion) || article.verification.promptVersion === 'action-review-pending-v2-cycle') && !article.reviewCycle) context.addIssue({ code: 'custom', message: `Action review cycle is missing: ${article.date}` })
  if (contextBoundVersions.has(article.verification.promptVersion) && !article.draftContext) context.addIssue({ code: 'custom', message: `Draft continuation context state is missing: ${article.date}` })
  if (rankedVersions.has(article.verification.promptVersion) && article.review.state === 'verified' && !article.closing) context.addIssue({ code: 'custom', message: `Closing prompt is missing: ${article.date}` })
  if (rankedVersions.has(article.verification.promptVersion) && article.review.state === 'verified' && article.closing?.kind === 'options') context.addIssue({ code: 'custom', message: `Legacy closing options cannot qualify a ranked shortlist: ${article.date}` })
})
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
    if (article.closing) {
      const options = article.closing.kind === 'needs-evidence' ? article.closing.recommendations : article.closing.options
      const optionKeys = options.flatMap(option => option.kind === 'action' ? [option.actionKey] : [])
      if (new Set(optionKeys).size !== optionKeys.length || optionKeys.some(key => !article.actionKeys.includes(key))) context.addIssue({ code: 'custom', message: `Invalid closing action references for ${article.date}` })
      for (const key of optionKeys) {
        const record = registry.records.find(item => item.key === key)
        const state = article.review.state === 'pending'
          ? record?.history.filter(decision => decision.articleDate === article.date).at(-1)?.state
          : record?.history.find(decision => decision.articleDate === article.date && decision.roundId === article.roundId)?.state
        if (!state || !['open', 'proposed', 'deferred'].includes(state)) context.addIssue({ code: 'custom', message: `Resolved action cannot be a closing option: ${key}` })
      }
      if (article.closing.kind === 'options') {
        const targets = article.closing.options.flatMap(option => option.kind === 'checkpoint' ? [option.target] : [])
        if (new Set(targets).size !== targets.length) context.addIssue({ code: 'custom', message: `Duplicate closing checkpoint for ${article.date}` })
      }
    }
  }
  for (const record of registry.records) {
    if (record.origin === 'imported' && record.admission) context.addIssue({ code: 'custom', message: `Imported action cannot acquire an admission cycle: ${record.key}` })
    if (record.original.status === 'done' && record.state !== 'done') context.addIssue({ code: 'custom', message: `Completed history cannot reopen: ${record.key}` })
    if (isReviewedAction(record.original) && record.state !== 'open') context.addIssue({ code: 'custom', message: `Reviewed action requires a separately accepted exact-ID settlement receipt: ${record.key}` })
    if (record.inclusionOverride && record.includeInIndex !== record.inclusionOverride.include) context.addIssue({ code: 'custom', message: `Inclusion override changed: ${record.key}` })
    if (record.history.length && record.history.at(-1)?.state !== record.state) context.addIssue({ code: 'custom', message: `Action state lacks a matching decision: ${record.key}` })
    if (record.origin === 'imported' && !record.history.length && record.state !== record.original.status) context.addIssue({ code: 'custom', message: `Imported state changed without evidence: ${record.key}` })
    if (record.origin === 'suggested' && (!record.original.id || record.original.id !== record.key || !record.goal || !record.doneWhen || !record.history.length || !registry.articles.some(article => article.date === record.introducedBy && article.actionKeys.includes(record.key)))) context.addIssue({ code: 'custom', message: `Suggested action lacks an article review: ${record.key}` })
  }
  for (const message of actionAdmissionErrors(registry.records.filter(record => record.origin === 'suggested'))) context.addIssue({ code: 'custom', message })
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
  if (file.snapshot.date !== file.date || file.decisions.some(item => item.decision.articleDate !== file.date) || file.suggestions.some(item => item.origin !== 'suggested' || item.introducedBy !== file.date)) context.addIssue({ code: 'custom', message: 'Article action file crosses its date boundary' })
  for (const message of actionAdmissionErrors(file.suggestions)) context.addIssue({ code: 'custom', message })
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

