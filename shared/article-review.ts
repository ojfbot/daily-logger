import { z } from 'zod'

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
export const entrySchema = z.object({
  lifecycle: z.enum(['published', 'proposed']), recordRef: sha, recordBlobSha: sha,
  recordUrl: githubUrl, fullRecordUrl: githubUrl, review: reviewSchema,
  freshness: z.enum(['current', 'stale', 'visible_revision_unknown']),
}).strict()
export const projectionSchema = z.object({
  schemaVersion: z.literal(1), date, observedAt: z.iso.datetime(), sourceCommitSha: sha,
  currentBlobSha: sha, visibleBlobSha: sha.nullable(),
  discovery: z.literal('registered_records_only'),
  requestTarget: z.object({ issueNumber: z.literal(357), contextUrl: githubUrl }).strict().nullable(),
  entries: z.array(entrySchema), unavailable: z.array(z.string()), requests: z.array(receiptSchema),
}).strict()
export type ReviewProjection = z.infer<typeof projectionSchema>
export type ReviewRequest = z.infer<typeof requestSchema>
export type ReviewEntry = z.infer<typeof entrySchema>
