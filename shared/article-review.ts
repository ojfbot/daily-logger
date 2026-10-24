import { z } from 'zod'
import { editorialActionReviewOutcomeSchema } from '../src/action-registry-contract.js'
export { editorialActionReviewOutcomeSchema } from '../src/action-registry-contract.js'

export const sha = z.string().regex(/^[a-f0-9]{40}$/)
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const githubUrl = z.url().refine((value) => new URL(value).protocol === 'https:')
const identity = z.object({ name: z.string().min(1), sessionId: z.string().nullable() }).strict()
const disposition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }).strict(),
  z.object({ kind: z.literal('accepted'), actor: z.string().min(1), evidenceUrl: githubUrl }).strict(),
  z.object({ kind: z.literal('rejected'), actor: z.string().min(1), evidenceUrl: githubUrl }).strict(),
])
export const findingSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9-]{0,30}$/),
  classification: z.enum(['confirmed_error', 'unverified_claim']),
  title: z.string().min(1), location: z.string().min(1), explanation: z.string().min(1),
  evidenceUrls: z.array(githubUrl).min(1), correction: z.string().min(1), disposition,
}).strict()
const reviewBase = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  article: z.object({ date, sourceCommitSha: sha, blobSha: sha }).strict(),
  reviewer: identity, reviewedAt: z.iso.datetime(), scope: z.string().min(1),
  fullRecordBlobSha: sha,
  fullRecordPath: z.string().regex(/^reviews\/articles\/[^/]+\.md$/),
})
export const reviewSchema = z.discriminatedUnion('result', [
  reviewBase.extend({ result: z.literal('completed'), findings: z.array(findingSchema) }).strict(),
  reviewBase.extend({ result: z.literal('failed'), reason: z.string().min(1) }).strict(),
])
const recordPath = z.string().regex(/^reviews\/registered\/[a-zA-Z0-9-]+\.json$/)
export const registrySchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(z.object({ date, path: recordPath }).strict()),
  requestTargets: z.array(z.object({ date, issueNumber: z.literal(357), contextUrl: githubUrl }).strict()),
  proposals: z.array(z.object({ date, path: recordPath, pullRequest: z.number().int().positive(), headSha: sha }).strict()),
}).strict()
export const requestSchema = z.object({
  schemaVersion: z.literal(1), intent: z.literal('request_changes'),
  requestId: z.uuid(), date, visibleBlobSha: sha,
  selections: z.array(z.object({ reviewId: z.string(), recordBlobSha: sha, findingId: z.string() }).strict()).min(1),
  feedback: z.string().min(1).max(30000),
}).strict()
export const requestRecordSchema = requestSchema.extend({ actor: z.string().min(1) }).strict()
export const receiptSchema = z.object({ requestId: z.uuid(), url: githubUrl, actor: z.string(), reviewIds: z.array(z.string()), findingIds: z.array(z.string()) }).strict()
export const writeReceiptSchema = z.object({ requestId: z.uuid(), url: githubUrl, reused: z.boolean() }).strict()
export const commentSchema = z.object({
  schemaVersion: z.literal(1), intent: z.literal('comment'), requestId: z.uuid(), date, visibleBlobSha: sha,
  threadId: z.uuid(), section: z.string().min(1).max(500).nullable(), content: z.string().min(1).max(30000),
  speaker: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('human') }).strict(),
    z.object({ kind: z.literal('assistant'), reportedModel: z.string().min(1).max(200).nullable(), reportedSessionId: z.string().min(1).max(200).nullable() }).strict(),
  ]),
}).strict()
export const commentRecordSchema = commentSchema.extend({ actor: z.string().min(1) }).strict()
export const pullRequestSchema = z.object({
  kind: z.enum(['review_pr', 'acceptance_pr']), number: z.number().int().positive(), url: githubUrl,
  state: z.enum(['open', 'closed']), merged: z.boolean(), headSha: sha, author: z.string().min(1),
}).strict()
export const editorialFeedbackSchema = z.object({ version: z.literal(2), notes: z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('root'), content: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('section'), section: z.string().min(1), content: z.string().min(1) }).strict(),
])).min(1) }).strict()
const correspondenceBase = z.object({
  id: z.string().min(1), sourceKind: z.enum(['review_pr', 'acceptance_pr', 'pilot_issue']), sourceNumber: z.number().int().positive(),
  url: githubUrl, author: z.string().min(1), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), body: z.string(),
  duplicateUrls: z.array(githubUrl).default([]),
})
export const correspondenceSchema = z.discriminatedUnion('kind', [
  correspondenceBase.extend({ kind: z.literal('pr_body'), editorialFeedback: editorialFeedbackSchema.nullable() }).strict(),
  correspondenceBase.extend({ kind: z.literal('comment') }).strict(),
  correspondenceBase.extend({ kind: z.literal('review'), state: z.string().min(1) }).strict(),
  correspondenceBase.extend({ kind: z.literal('inline_comment'), path: z.string(), line: z.number().int().nullable(), replyTo: z.number().int().positive().nullable() }).strict(),
  correspondenceBase.extend({ kind: z.literal('revision_request'), request: requestRecordSchema }).strict(),
  correspondenceBase.extend({ kind: z.literal('thread_message'), message: commentRecordSchema }).strict(),
])
export const entrySchema = z.object({
  lifecycle: z.enum(['published', 'proposed']), recordRef: sha, recordBlobSha: sha,
  recordUrl: githubUrl, fullRecordUrl: githubUrl, review: reviewSchema,
  freshness: z.enum(['current', 'stale', 'visible_revision_unknown']),
  pullRequest: pullRequestSchema.nullable().default(null),
}).strict()
export const projectionSchema = z.object({
  schemaVersion: z.literal(1), date, observedAt: z.iso.datetime(), sourceCommitSha: sha,
  currentBlobSha: sha, visibleBlobSha: sha.nullable(),
  discovery: z.enum(['registered_records_only', 'registered_and_eligible_pull_requests']),
  requestTarget: z.object({ issueNumber: z.number().int().positive(), kind: z.enum(['review_pr', 'acceptance_pr', 'pilot_issue']).default('pilot_issue'), contextUrl: githubUrl }).strict().nullable(),
  entries: z.array(entrySchema), unavailable: z.array(z.string()), requests: z.array(receiptSchema),
  pullRequests: z.array(pullRequestSchema).default([]), correspondence: z.array(correspondenceSchema).default([]),
}).strict()
export type ReviewProjection = z.infer<typeof projectionSchema>
export type ReviewRequest = z.infer<typeof requestSchema>
export type ReviewEntry = z.infer<typeof entrySchema>
export type ArticleComment = z.infer<typeof commentSchema>
export type WriteReceipt = z.infer<typeof writeReceiptSchema>
export type Correspondence = z.infer<typeof correspondenceSchema>
export type ReviewPullRequest = z.infer<typeof pullRequestSchema>

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const editorialTarget = z.object({ schemaVersion: z.literal(1), requestId: z.uuid(), date,
  pullRequest: z.number().int().positive(), headSha: sha })
export const appendEditorialSchema = editorialTarget.extend({ intent: z.literal('append_editorial_feedback'),
  visibleBlobSha: sha, supersedes: digest, feedback: editorialFeedbackSchema }).strict()
export const runEditorialSchema = editorialTarget.extend({ intent: z.literal('request_editorial_revision'),
  articleBlobSha: sha, feedbackId: z.uuid(), feedbackDigest: digest }).strict()
export const cleanAcceptanceSchema = editorialTarget.extend({ intent: z.literal('request_clean_acceptance'),
  articleBlobSha: sha, registryBlobSha: sha, policySha: sha }).strict()
export const executableEditorialIntentSchema = z.enum(['request_editorial_revision', 'request_clean_acceptance'])
export const resolveEditorialRequestSchema = editorialTarget.extend({ intent: z.literal('resolve_editorial_request'),
  priorRequestDigest: digest, articleBlobSha: sha, registryBlobSha: sha, policySha: sha,
  prefix: z.object({ throughCommentId: z.number().int().positive(), sha256: digest }).strict(),
  acknowledgment: z.enum(['close_uncertain_attempt_without_review_or_billing_claim', 'close_missing_receipt_attempt_without_review_or_billing_claim']),
  reason: z.string().trim().min(1).max(4000),
}).strict()
export const resolutionEvidenceSchema = z.object({
  requestCommentId: z.number().int().positive(), requestDigest: digest,
  claim: z.object({ commentId: z.number().int().positive(), semanticDigest: digest }).strict(),
  receipt: z.union([
    z.object({ commentId: z.number().int().positive(), semanticDigest: digest }).strict(),
    z.object({ kind: z.literal('missing-terminal-receipt') }).strict(),
  ]),
  attempt: z.object({ runId: z.number().int().positive(), number: z.literal(1), policySha: sha,
    event: z.literal('issue_comment'), branch: z.literal('main'), path: z.literal('.github/workflows/editorial-revise.yml'),
    displayTitle: z.string().min(1), status: z.literal('completed'), conclusion: z.literal('failure') }).strict(),
}).strict()
export const editorialInputSchema = z.discriminatedUnion('intent', [appendEditorialSchema, runEditorialSchema, cleanAcceptanceSchema, resolveEditorialRequestSchema])
export const editorialWriteFailureSchema = z.object({
  error: z.string(), outcome: z.enum(['rejected_before_append', 'uncertain']), requestId: z.uuid(),
  intent: z.union([appendEditorialSchema.shape.intent, runEditorialSchema.shape.intent, cleanAcceptanceSchema.shape.intent, resolveEditorialRequestSchema.shape.intent]),
}).strict()
export type EditorialWriteFailureResponse = z.infer<typeof editorialWriteFailureSchema>
export const editorialRecordSchema = z.discriminatedUnion('intent', [
  appendEditorialSchema.extend({ actor: z.literal('ojfbot'), originalBody: z.string() }).strict(),
  runEditorialSchema.extend({ actor: z.literal('ojfbot') }).strict(),
  cleanAcceptanceSchema.extend({ actor: z.literal('ojfbot') }).strict(),
  resolveEditorialRequestSchema.extend({ actor: z.literal('ojfbot'), evidence: resolutionEvidenceSchema }).strict().superRefine((record, ctx) => {
    const expected = 'kind' in record.evidence.receipt
      ? 'close_missing_receipt_attempt_without_review_or_billing_claim'
      : 'close_uncertain_attempt_without_review_or_billing_claim'
    if (record.acknowledgment !== expected) ctx.addIssue({ code: 'custom', path: ['acknowledgment'], message: 'Owner acknowledgment must match the observed terminal-receipt evidence.' })
  }),
])
export const editorialHistorySchema = z.object({ record: editorialRecordSchema, digest,
  commentId: z.number().int().positive(), url: githubUrl, createdAt: z.iso.datetime(), duplicateUrls: z.array(githubUrl) }).strict()
const requestReferenceSchema = z.object({ digest, commentId: z.number().int().positive() }).strict()
export const editorialRequestStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('outstanding'), request: requestReferenceSchema }).strict(),
  z.object({ kind: z.literal('artifact_verified'), request: requestReferenceSchema, receiptCommentId: z.number().int().positive(), actionReview: editorialActionReviewOutcomeSchema.optional() }).strict(),
  z.object({ kind: z.literal('owner_resolved'), request: requestReferenceSchema, resolutionCommentId: z.number().int().positive() }).strict(),
])
const resolutionInputProjectionSchema = resolveEditorialRequestSchema.omit({ intent: true, requestId: true, acknowledgment: true, reason: true })
export const editorialRecoverySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('blocked'), reason: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('available'), input: resolutionInputProjectionSchema, evidence: resolutionEvidenceSchema }).strict(),
])
export const editorialExecutionReadinessSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }).strict(),
  z.object({ kind: z.literal('blocked'), reason: z.string().min(1) }).strict(),
])
export const editorialProjectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none'), stagedHeadSha: sha.optional() }).strict(),
  z.object({ status: z.literal('existing'), eligible: z.boolean(), reason: z.string(), originalBody: z.string(), originalDigest: digest,
    pullRequest: pullRequestSchema, article: z.object({ blobSha: sha, text: z.string() }).strict(),
    registryBlobSha: sha, policySha: sha,
    versions: z.array(editorialHistorySchema), requests: z.array(editorialHistorySchema), resolutions: z.array(editorialHistorySchema),
    requestState: editorialRequestStateSchema, recovery: editorialRecoverySchema,
    executionReadiness: editorialExecutionReadinessSchema, outstanding: z.boolean() }).strict(),
])
export const editorialWriteReceiptSchema = writeReceiptSchema.extend({ execution: z.enum(['not_started', 'requested']) }).strict()
export const postSchema = z.discriminatedUnion('intent', [requestSchema, commentSchema, appendEditorialSchema, runEditorialSchema, cleanAcceptanceSchema, resolveEditorialRequestSchema])
export type EditorialInput = z.infer<typeof editorialInputSchema>
export type EditorialRecord = z.infer<typeof editorialRecordSchema>
export type ExecutableEditorialRecord = Extract<EditorialRecord, { intent: z.infer<typeof executableEditorialIntentSchema> }>
export function isExecutableEditorialRecord(record: EditorialRecord): record is ExecutableEditorialRecord {
  return executableEditorialIntentSchema.safeParse(record.intent).success
}
export type EditorialProjection = z.infer<typeof editorialProjectionSchema>
export type EditorialHistory = z.infer<typeof editorialHistorySchema>
