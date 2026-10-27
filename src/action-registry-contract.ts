import { z } from 'zod'
import { CanonicalActionSchema, isReviewedAction } from './action-model.js'
import { ActionReviewCycleSchema, CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS, RANKED_ACTION_REVIEW_PROMPT_VERSIONS, actionAdmissionErrors } from './action-review-cycle.js'
import { ActionItemSchema } from './action-item-schema.js'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)

export const ActionEvidenceRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  role: z.enum(['support', 'counterevidence', 'context']),
}).strict().refine(range => range.endLine >= range.startLine, 'Evidence range ends before it starts')

export const ActionEvidenceCoverageSchema = z.object({
  obligationId: digest,
  status: z.enum(['support', 'counterevidence', 'unknown']),
  rangeIndexes: z.array(z.number().int().nonnegative()).max(32),
}).strict()

const ActionEvidenceRequestFields = {
  version: z.literal('action-evidence-request-v1'),
  id: digest,
  kind: z.enum(['source-view', 'missing-source', 'clarification', 'authority', 'contradiction']),
  caseDigest: digest,
  articleDate: date,
  cycle: ActionReviewCycleSchema,
  actionKeys: z.array(z.string().min(1).max(256)).min(1).max(64),
  sourceKey: z.string().min(1).max(512),
  sourceId: z.string().min(1).max(1024).optional(),
  sourceLocator: z.string().min(1).max(2048).optional(),
  sourceFullContentSha256: digest.optional(),
  question: z.string().min(1).max(512),
  obligations: z.array(digest).min(1),
  recipient: z.enum(['source-producer', 'coordinator-owner']),
  limits: z.object({
    perSourceBytes: z.number().int().positive(),
    aggregateBytes: z.number().int().positive(),
    providerEnvelopeBytes: z.number().int().positive(),
  }).strict(),
}

export const ActionEvidenceRequestSchema = z.object({
  ...ActionEvidenceRequestFields,
  status: z.literal('open'),
}).strict()
export type ActionEvidenceRequest = z.infer<typeof ActionEvidenceRequestSchema>

const ActionEvidenceRequestReceiptFields = z.object(ActionEvidenceRequestFields).pick({
  version: true, id: true, kind: true, caseDigest: true, articleDate: true, cycle: true,
  actionKeys: true, sourceKey: true, sourceId: true, sourceFullContentSha256: true,
  obligations: true, recipient: true,
}).extend({ question: z.string().min(1).max(512).optional(), sourceLocator: z.string().min(1).max(2048).optional() }).shape
export const ActionEvidenceRequestReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('open') }).strict(),
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('resolved') }).strict(),
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('cancelled') }).strict(),
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('expired') }).strict(),
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('superseded') }).strict(),
  z.object({ ...ActionEvidenceRequestReceiptFields, status: z.literal('declined') }).strict(),
]).superRefine((receipt, context) => {
  if ((receipt.question !== undefined || receipt.sourceLocator !== undefined) && receipt.sourceKey !== 'model-context') context.addIssue({ code: 'custom', message: 'Bounded context diagnostics belong to model-context requests' })
  if ((receipt.question !== undefined || receipt.sourceLocator !== undefined) && receipt.kind === 'source-view' && (!receipt.question || !receipt.sourceLocator || !receipt.sourceId || !receipt.sourceFullContentSha256)) context.addIssue({ code: 'custom', message: 'A bounded context source-view need requires canonical source pins' })
})
export type ActionEvidenceRequestReceipt = z.infer<typeof ActionEvidenceRequestReceiptSchema>

export const ActionEvidenceProjectionSchema = z.object({
  version: z.literal('action-evidence-projection-v1'),
  requestId: digest,
  caseDigest: digest,
  fullSourceId: z.string().min(1),
  fullContentSha256: digest,
  ranges: z.array(ActionEvidenceRangeSchema).min(1),
  coverage: z.array(ActionEvidenceCoverageSchema).min(1),
}).strict()

export const ActionEvidenceResponseSchema = z.object({
  version: z.literal('action-evidence-response-v1'),
  id: digest,
  requestId: digest,
  caseDigest: digest,
  responder: z.string().min(1).max(256),
  answer: z.string().min(1).max(16000),
}).strict()
export type ActionEvidenceResponse = z.infer<typeof ActionEvidenceResponseSchema>

export const CitationSchema = z.object({
  sourceId: z.string().min(1),
  quote: z.string().min(12),
  sourceLineStart: z.number().int().positive().optional(),
  sourceLineEnd: z.number().int().positive().optional(),
}).strict().refine(citation => (citation.sourceLineStart === undefined) === (citation.sourceLineEnd === undefined), 'Citation source range must include both endpoints')
export const DraftActionCandidatePayloadSchema = ActionItemSchema.extend({ status: z.literal('open') }).strict()
export type DraftActionCandidatePayload = z.infer<typeof DraftActionCandidatePayloadSchema>
const ReviewedDraftActionCandidateFields = { reason: z.string().min(1), citations: z.array(CitationSchema) }
export const DraftActionCandidateReviewSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('awaiting-review') }).strict(),
  z.object({ state: z.literal('promoted'), actionKey: z.string().min(1), ...ReviewedDraftActionCandidateFields }).strict(),
  z.object({ state: z.literal('mapped-existing'), actionKey: z.string().min(1), ...ReviewedDraftActionCandidateFields }).strict(),
  z.object({ state: z.literal('rejected'), ...ReviewedDraftActionCandidateFields }).strict(),
  z.object({ state: z.literal('verified-closure'), actionKey: z.string().min(1).nullable(), ...ReviewedDraftActionCandidateFields }).strict(),
])
export const DraftActionCandidateSchema = z.object({
  candidateId: digest,
  payload: DraftActionCandidatePayloadSchema,
  review: DraftActionCandidateReviewSchema,
}).strict()
export type DraftActionCandidate = z.infer<typeof DraftActionCandidateSchema>
const githubActionReference = z.string().regex(/^[a-z0-9-]+#\d+$/)
const DraftCandidateRequiredEvidenceReferenceSchema = z.object({
  classification: z.literal('required'),
  reference: githubActionReference,
  role: z.enum(['target', 'lifecycle', 'owner', 'gate', 'counterevidence', 'retained-context']),
  reason: z.string().min(1).max(512),
}).strict()
const DraftCandidateContextEvidenceReferenceSchema = z.object({
  classification: z.literal('context'),
  reference: githubActionReference,
  reason: z.string().min(1).max(512),
}).strict()
export const DraftCandidateEvidenceReferenceSchema = z.discriminatedUnion('classification', [
  DraftCandidateRequiredEvidenceReferenceSchema,
  DraftCandidateContextEvidenceReferenceSchema,
])
export const DraftCandidateEvidenceRequirementsSchema = z.object({
  version: z.literal('draft-candidate-evidence-v2'),
  provenance: z.object({
    kind: z.enum(['coordinator', 'independent-reviewer', 'deterministic-default', 'derived-refresh']),
    identity: z.string().min(1).max(256),
    decision: z.string().min(1).max(512),
    lineage: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('cycle-only-refresh'),
        priorReviewCycle: ActionReviewCycleSchema,
        priorRequirementsSha256: digest,
      }).strict(),
      z.object({
        kind: z.literal('acceptance-status-refresh'),
        priorArticleStatus: z.literal('draft'),
        articleStatus: z.literal('accepted'),
        priorReviewCycle: ActionReviewCycleSchema,
        priorRequirementsSha256: digest,
      }).strict(),
    ]).optional(),
  }).strict(),
  articleDate: date,
  articleDigest: digest,
  reviewCycle: ActionReviewCycleSchema,
  draftContextSha256: digest,
  candidatePayloadsSha256: digest,
  feedbackSha256: digest,
  articleStatusesSha256: digest,
  canonicalIndexSha256: digest,
  inputActionKeys: z.array(z.string().min(1).max(256)).max(64),
  actionStateSha256: digest,
  candidates: z.array(z.object({
    candidateId: digest,
    payloadSha256: digest,
    references: z.array(DraftCandidateEvidenceReferenceSchema).max(32),
    actionRelations: z.array(z.object({
      actionKey: z.string().min(1).max(256),
      sourceReference: githubActionReference,
      relation: z.enum(['same-work', 'dependency']),
      reason: z.string().min(1).max(512),
    }).strict()).max(32),
  }).strict()).min(1).max(5),
  unassignedReferences: z.array(DraftCandidateEvidenceReferenceSchema).max(64),
}).strict().superRefine((requirements, context) => {
  if (requirements.provenance.kind === 'derived-refresh' !== !!requirements.provenance.lineage) context.addIssue({ code: 'custom', message: 'Derived candidate evidence refresh requires exact cycle lineage' })
  if (new Set(requirements.inputActionKeys).size !== requirements.inputActionKeys.length) context.addIssue({ code: 'custom', message: 'Duplicate draft candidate input action identity' })
  if (new Set(requirements.candidates.map(candidate => candidate.candidateId)).size !== requirements.candidates.length) context.addIssue({ code: 'custom', message: 'Duplicate draft candidate evidence identity' })
  for (const candidate of requirements.candidates) {
    if (new Set(candidate.references.map(reference => reference.reference)).size !== candidate.references.length) context.addIssue({ code: 'custom', message: `Duplicate draft candidate evidence reference: ${candidate.candidateId}` })
    const relations = candidate.actionRelations.map(relation => `${relation.actionKey}:${relation.sourceReference}`)
    if (new Set(relations).size !== relations.length) context.addIssue({ code: 'custom', message: `Duplicate draft candidate action relation: ${candidate.candidateId}` })
    for (const relation of candidate.actionRelations) if (!requirements.inputActionKeys.includes(relation.actionKey)) context.addIssue({ code: 'custom', message: `Candidate action relation is outside the captured input: ${relation.actionKey}` })
  }
  if (new Set(requirements.unassignedReferences.map(reference => reference.reference)).size !== requirements.unassignedReferences.length) context.addIssue({ code: 'custom', message: 'Duplicate unassigned evidence reference' })
})
export type DraftCandidateEvidenceRequirements = z.infer<typeof DraftCandidateEvidenceRequirementsSchema>
export const ActionReviewOutputSchema = z.object({
  version: z.literal('action-review-output-v1'),
  articleDate: date,
  reviewCycle: ActionReviewCycleSchema,
  roundId: digest,
  proposalSha256: digest,
  consumedInputSha256: digest,
  createdRecords: z.array(z.object({ actionKey: z.string().min(1).max(256), afterRecordSha256: digest, afterInputSha256: digest }).strict()).max(64),
  updatedRecords: z.array(z.object({ actionKey: z.string().min(1).max(256), beforeRecordSha256: digest, afterRecordSha256: digest, beforeInputSha256: digest, afterInputSha256: digest }).strict()).max(64),
  rejectionMemory: z.object({ beforeSha256: digest, afterSha256: digest }).strict(),
}).strict().superRefine((output, context) => {
  const keys = [...output.createdRecords.map(record => record.actionKey), ...output.updatedRecords.map(record => record.actionKey)]
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Duplicate action review output identity' })
})
export type ActionReviewOutput = z.infer<typeof ActionReviewOutputSchema>
const ActionEvidenceViewSourceReceiptSchema = z.object({ sourceId: z.string().min(1), rawSha256: digest, viewSha256: digest, hiddenLines: z.array(z.number().int().positive()), omittedPathsSha256: digest }).strict()
export type ActionEvidenceViewSourceReceipt = z.infer<typeof ActionEvidenceViewSourceReceiptSchema>
const sourceIdRawSha256 = (sourceId: string): string | undefined => {
  const suffix = /@([a-f0-9]{64})$/.exec(sourceId)?.[1]
  return suffix !== undefined && sourceId.endsWith(`@${suffix}`) ? suffix : undefined
}
const ActionEvidenceViewSourceTupleSchema = z.tuple([z.string().min(1), digest.nullable(), digest, z.array(z.number().int().positive()), digest]).superRefine(([sourceId, rawSha256], context) => {
  const suffix = sourceIdRawSha256(sourceId)
  if (rawSha256 === null && suffix === undefined) context.addIssue({ code: 'custom', path: [1], message: 'A null raw digest requires an exact lowercase source-ID digest suffix' })
  if (rawSha256 !== null && rawSha256 === suffix) context.addIssue({ code: 'custom', path: [1], message: 'A source-ID raw digest must use its canonical null sentinel' })
})
export function encodeActionEvidenceViewSourceReceipt(value: ActionEvidenceViewSourceReceipt): z.infer<typeof ActionEvidenceViewSourceTupleSchema> {
  const source = ActionEvidenceViewSourceReceiptSchema.parse(value)
  return ActionEvidenceViewSourceTupleSchema.parse([source.sourceId, source.rawSha256 === sourceIdRawSha256(source.sourceId) ? null : source.rawSha256, source.viewSha256, source.hiddenLines, source.omittedPathsSha256])
}
export const ActionEvidenceViewReceiptSchema = z.object({
  version: z.literal('action-evidence-view-v1'),
  sourceEncoding: z.literal('source-tuples-v1'),
  policySha256: digest,
  rawCaseDigest: digest,
  inputStateSha256: digest,
  sources: z.array(ActionEvidenceViewSourceTupleSchema),
}).strict()
export type ActionEvidenceViewReceipt = z.infer<typeof ActionEvidenceViewReceiptSchema>
export function decodeActionEvidenceViewSources(receipt: ActionEvidenceViewReceipt): ActionEvidenceViewSourceReceipt[] {
  return ActionEvidenceViewReceiptSchema.parse(receipt).sources.map(([sourceId, rawSha256, viewSha256, hiddenLines, omittedPathsSha256]) => ActionEvidenceViewSourceReceiptSchema.parse({ sourceId, rawSha256: rawSha256 ?? sourceIdRawSha256(sourceId), viewSha256, hiddenLines, omittedPathsSha256 }))
}
const ActionVerificationReceiptSchema = z.object({
  proposer: z.string(),
  verifier: z.string(),
  promptVersion: z.string(),
  proposalSha256: digest,
  evidenceView: ActionEvidenceViewReceiptSchema.optional(),
  evidenceViewOutputSha256: digest.optional(),
  verdicts: z.array(z.object({ item: z.string(), verdict: z.enum(['pass', 'reject', 'hold']), reason: z.string() }).strict()),
}).strict().superRefine((receipt, context) => {
  if (receipt.promptVersion === 'action-review-v16-typed-evidence-view' && (!receipt.evidenceView || !receipt.evidenceViewOutputSha256)) context.addIssue({ code: 'custom', message: 'Current action review requires its consumed evidence view and output binding' })
  if ((receipt.evidenceView === undefined) !== (receipt.evidenceViewOutputSha256 === undefined)) context.addIssue({ code: 'custom', message: 'Evidence view and native output binding must be retained together' })
})
const CandidateReviewHistorySchema = z.object({
  articleDigest: digest,
  reviewCycle: ActionReviewCycleSchema,
  roundId: digest,
  stateDigest: digest,
  verification: ActionVerificationReceiptSchema,
  draftCandidateEvidence: DraftCandidateEvidenceRequirementsSchema,
  reviewOutput: ActionReviewOutputSchema,
  transitions: z.array(z.object({
    candidateId: digest,
    review: DraftActionCandidateReviewSchema.refine(review => review.state !== 'awaiting-review', 'Historical candidate transition must be reviewed'),
  }).strict()).min(1).max(5),
  sources: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(['repository', 'github', 'goal', 'instruction', 'report']),
    locator: z.string().min(1),
    fullContentSha256: digest,
  }).strict()),
  evidenceRequests: z.array(ActionEvidenceRequestReceiptSchema),
}).strict().superRefine((receipt, context) => {
  if (receipt.reviewOutput.roundId !== receipt.roundId
    || JSON.stringify(receipt.reviewOutput.reviewCycle) !== JSON.stringify(receipt.reviewCycle)
    || receipt.reviewOutput.proposalSha256 !== receipt.verification.proposalSha256
    || receipt.reviewOutput.consumedInputSha256 !== receipt.draftCandidateEvidence.canonicalIndexSha256
    || receipt.draftCandidateEvidence.articleDigest !== receipt.articleDigest) {
    context.addIssue({ code: 'custom', message: 'Historical candidate review receipt binding is inconsistent' })
  }
  if (new Set(receipt.transitions.map(transition => transition.candidateId)).size !== receipt.transitions.length) context.addIssue({ code: 'custom', message: 'Duplicate historical candidate transition' })
  if (new Set(receipt.sources.map(source => source.id)).size !== receipt.sources.length) context.addIssue({ code: 'custom', message: 'Duplicate historical candidate source identity' })
})
export const ActionSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['repository', 'github', 'goal', 'instruction', 'report']),
  locator: z.string().min(1),
  content: z.string(),
  trustedContent: z.array(z.string()).optional(),
  fullContentSha256: digest.optional(),
  projection: ActionEvidenceProjectionSchema.optional(),
  response: z.object({
    requestId: digest,
    caseDigest: digest,
    responseId: digest,
    actionKeys: z.array(z.string().min(1).max(256)).max(64),
  }).strict().optional(),
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
export type DraftCandidateIdentity = (payload: DraftActionCandidatePayload, ordinal: number) => string

export const ArticleOnlyAcceptanceSchema = z.object({
  kind: z.literal('article-only'), inputRoundId: digest, inputRegistrySha256: digest,
  failureKind: z.enum(['invalid-output', 'evidence-required']),
  evidenceRequest: ActionEvidenceRequestReceiptSchema.optional(),
  sources: z.array(z.object({ id: z.string().min(1).max(512), locator: z.string().max(2048), sha256: digest }).strict()).max(64),
  rawContentRetained: z.literal(false),
}).strict().superRefine((acceptance, context) => {
  const request = acceptance.evidenceRequest
  if (!request) return
  if (acceptance.failureKind !== 'evidence-required' || request.status !== 'open') context.addIssue({ code: 'custom', message: 'Current evidence request requires an open evidence-required hold' })
  if (request.kind === 'source-view' && (!request.sourceId || !request.sourceFullContentSha256)) context.addIssue({ code: 'custom', message: 'Current source-view request requires source pins' })
  if (request.sourceId || request.sourceFullContentSha256) {
    const source = acceptance.sources.find(source => source.id === request.sourceId)
    if (!source || source.sha256 !== request.sourceFullContentSha256 || request.sourceKey !== 'model-context' && request.sourceKey !== source.id.replace(/@[a-f0-9]{64}$/, '')) context.addIssue({ code: 'custom', message: 'Current evidence request must match its collected source identity and digest' })
  }
})
export type ArticleOnlyAcceptance = z.infer<typeof ArticleOnlyAcceptanceSchema>
export const editorialActionReviewOutcomeSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('verified') }).strict(),
  z.object({ state: z.literal('pending'), failureKind: z.enum(['invalid-output', 'evidence-required']), inputRegistrySha256: digest, heldCandidateIds: z.array(digest).max(5) }).strict(),
])

function createArticleActionSchema(candidateIdentity?: DraftCandidateIdentity) {
  return z.object({
    date,
    status: z.enum(['draft', 'accepted', 'rejected']),
    review: z.discriminatedUnion('state', [z.object({ state: z.literal('verified') }).strict(), z.object({ state: z.literal('pending'), reason: z.string().min(1), articleAcceptance: ArticleOnlyAcceptanceSchema.optional() }).strict()]).default({ state: 'verified' }),
    articleDigest: digest,
    roundId: digest,
    reviewCycle: ActionReviewCycleSchema.optional(),
    actionKeys: z.array(z.string()),
    reviewOutput: ActionReviewOutputSchema.optional(),
    draftCandidates: z.array(DraftActionCandidateSchema).max(5).optional(),
    candidateReviewHistory: z.array(CandidateReviewHistorySchema).optional(),
    draftCandidateEvidence: DraftCandidateEvidenceRequirementsSchema.optional(),
    draftContext: DraftRecommendationContextSchema.optional(),
    closing: ClosingPromptSchema.optional(),
    stateDigest: digest,
    verification: ActionVerificationReceiptSchema,
    sources: z.array(ActionSourceSchema),
    evidenceRequests: z.array(ActionEvidenceRequestReceiptSchema).optional(),
    rejected: z.array(z.object({ description: z.string(), reason: z.string(), workKey: z.string().optional(), evidenceDigest: digest.optional(), quotaHold: z.object({ articleDate: date, cycle: ActionReviewCycleSchema }).strict().optional() }).strict()),
    binding: z.object({ mode: z.literal('editorial-rebind'), fromDigest: digest, actor: z.string().min(1), instructionSha256: digest }).strict().optional(),
  }).strict().superRefine((article, context) => {
    const contextBoundVersions = new Set<string>(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS)
    const rankedVersions = new Set<string>(RANKED_ACTION_REVIEW_PROMPT_VERSIONS)
    if ((contextBoundVersions.has(article.verification.promptVersion) || article.verification.promptVersion === 'action-review-pending-v2-cycle') && !article.reviewCycle) context.addIssue({ code: 'custom', message: `Action review cycle is missing: ${article.date}` })
    if (contextBoundVersions.has(article.verification.promptVersion) && !article.draftContext) context.addIssue({ code: 'custom', message: `Draft continuation context state is missing: ${article.date}` })
    if (rankedVersions.has(article.verification.promptVersion) && article.review.state === 'verified' && !article.closing) context.addIssue({ code: 'custom', message: `Closing prompt is missing: ${article.date}` })
    if (rankedVersions.has(article.verification.promptVersion) && article.review.state === 'verified' && article.closing?.kind === 'options') context.addIssue({ code: 'custom', message: `Legacy closing options cannot qualify a ranked shortlist: ${article.date}` })
    const candidates = article.draftCandidates ?? []
    const request = article.review.state === 'pending' ? article.review.articleAcceptance?.evidenceRequest : undefined
    if (request && (request.articleDate !== article.date || JSON.stringify(request.cycle) !== JSON.stringify(article.reviewCycle))) context.addIssue({ code: 'custom', message: 'Current evidence request belongs to another article or review cycle' })
    if (new Set(candidates.map(candidate => candidate.candidateId)).size !== candidates.length) context.addIssue({ code: 'custom', message: `Duplicate draft candidate identity: ${article.date}` })
    for (const [ordinal, candidate] of candidates.entries()) {
      if (candidateIdentity && candidateIdentity(candidate.payload, ordinal) !== candidate.candidateId) context.addIssue({ code: 'custom', message: `Draft candidate payload digest changed: ${candidate.candidateId}` })
      if (article.review.state === 'verified' && candidate.review.state === 'awaiting-review') context.addIssue({ code: 'custom', message: `Verified review must account for draft candidate: ${candidate.candidateId}` })
    }
    const historyKeys = (article.candidateReviewHistory ?? []).map(receipt => `${receipt.roundId}:${receipt.verification.proposalSha256}:${receipt.stateDigest}`)
    if (new Set(historyKeys).size !== historyKeys.length) context.addIssue({ code: 'custom', message: `Duplicate candidate review history receipt: ${article.date}` })
    for (const receipt of article.candidateReviewHistory ?? []) {
      if (receipt.reviewOutput.articleDate !== article.date || receipt.transitions.some(transition => !candidates.some(candidate => candidate.candidateId === transition.candidateId))) {
        context.addIssue({ code: 'custom', message: `Historical candidate review receipt is outside article custody: ${article.date}` })
      }
    }
  })
}

function createActionRegistrySchema(ArticleActionSchema: ReturnType<typeof createArticleActionSchema>) {
  return z.object({
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
    if (article.review.state === 'pending' && (article.status === 'rejected' || (article.status === 'accepted') !== !!article.review.articleAcceptance)) context.addIssue({ code: 'custom', message: `Pending action review cannot publish without explicit article-only acceptance: ${article.date}` })
    if (article.review.state === 'pending' && article.review.articleAcceptance && (article.reviewOutput || !article.draftCandidates?.length || article.draftCandidates.some(candidate => candidate.review.state !== 'awaiting-review') || article.verification.proposer !== 'not-verified' || article.verification.verifier !== 'not-verified')) context.addIssue({ code: 'custom', message: `Article-only acceptance requires original held candidates and cannot assert verified action output: ${article.date}` })
    if (new Set(article.actionKeys).size !== article.actionKeys.length || article.actionKeys.some(key => !keys.includes(key))) context.addIssue({ code: 'custom', message: `Invalid action references for ${article.date}` })
    if (article.reviewOutput && (article.review.state !== 'verified' || article.reviewOutput.articleDate !== article.date || article.reviewOutput.roundId !== article.roundId
      || JSON.stringify(article.reviewOutput.reviewCycle) !== JSON.stringify(article.reviewCycle) || article.reviewOutput.proposalSha256 !== article.verification.proposalSha256)) {
      context.addIssue({ code: 'custom', message: `Invalid native review output provenance for ${article.date}` })
    }
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
}

function explicitInclusionInstruction(instruction: string) { return instruction === 'Explicit editorial inclusion checkbox' || /^Explicit editorial inclusion instruction: \S[\s\S]*$/.test(instruction) }
export const ProposedActionSchema = z.discriminatedUnion('status', [
  z.object({ id: z.string(), command: z.string(), description: z.string(), repo: z.string(), sourceDate: date, status: z.literal('proposed'), includeInIndex: z.boolean() }).strict(),
  z.object({ id: digest, command: z.string(), description: z.string(), repo: z.string(), sourceDate: date, status: z.literal('needs-review'), includeInIndex: z.literal(false), dispatchable: z.literal(false), reason: z.string().min(1).max(1000) }).strict(),
])
export type ProposedAction = z.infer<typeof ProposedActionSchema>

// One logical registry: immutable imported identities plus one bounded file per
// article. Decisions live with the article that issued them, never on a shared row.
function createArticleActionFileSchema(ArticleActionSchema: ReturnType<typeof createArticleActionSchema>) {
  return z.object({
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
}

export function createActionRegistrySchemas(candidateIdentity?: DraftCandidateIdentity) {
  const ArticleActionSchema = createArticleActionSchema(candidateIdentity)
  return {
    ArticleActionSchema,
    ActionRegistrySchema: createActionRegistrySchema(ArticleActionSchema),
    ArticleActionFileSchema: createArticleActionFileSchema(ArticleActionSchema),
  }
}

// Browser consumers use this structural contract: it enforces shape, caps and
// digest syntax, but does not claim to recompute candidate digests. The Node
// integrity wrapper injects that synchronous check before server-side use.
export const {
  ArticleActionSchema: ArticleActionContractSchema,
  ActionRegistrySchema: ActionRegistryContractSchema,
  ArticleActionFileSchema: ArticleActionFileContractSchema,
} = createActionRegistrySchemas()
export type ActionRegistry = z.infer<typeof ActionRegistryContractSchema>
export type ArticleActionSnapshot = z.infer<typeof ArticleActionContractSchema>
export type ArticleActionFile = z.infer<typeof ArticleActionFileContractSchema>
export const actionArticlePath = (date: string) => `actions/articles/${date}.json`
export const ACTION_FILE_LIMIT = 64 * 1024
export function articleActionFileContractBytes(file: ArticleActionFile): string {
  const parsed = ArticleActionFileContractSchema.parse(file)
  const pretty = JSON.stringify(parsed, null, 2) + '\n'
  if (new TextEncoder().encode(pretty).length <= ACTION_FILE_LIMIT) return pretty
  const compact = JSON.stringify(parsed) + '\n'
  if (new TextEncoder().encode(compact).length > ACTION_FILE_LIMIT) throw new Error('Article action state exceeds 64 KiB; compact the evidence before publishing')
  return compact
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
