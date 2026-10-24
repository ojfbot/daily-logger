import { createHash } from 'node:crypto'
import { z } from 'zod'
import { sha, editorialActionReviewOutcomeSchema } from './article-review.js'
import type { GitHub } from '../api/_lib/article-review-sources.js'

// The immutable artifact name binds these canonical bytes to a trusted run.
// A bot comment alone can be emitted by any workflow with issue-write access.
export const editorialProofSchema = z.object({
  repository: z.literal('ojfbot/daily-logger'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pullRequest: z.number().int().positive(), runId: z.number().int().positive(), runAttempt: z.literal(1),
  policySha: sha, inputHead: sha, outputCommit: sha, outputRegistryBlob: sha,
  outcome: z.enum(['changed', 'no_change']), requestDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), requestCommentId: z.number().int().positive().optional(),
  actionReviewMode: z.enum(['clean-acceptance', 'revision']).optional(),
  requestIntent: z.enum(['request_editorial_revision', 'request_clean_acceptance']).optional(),
  articleCompletion: z.literal('accepted').optional(), actionReview: editorialActionReviewOutcomeSchema.optional(),
})
export function editorialProofName(value: unknown): string {
  return `editorial-action-receipt-v1-${createHash('sha256').update(JSON.stringify(editorialProofSchema.parse(value))).digest('hex')}`
}
export async function verifyEditorialProof(github: GitHub, value: unknown): Promise<boolean> {
  const parsed = editorialProofSchema.extend({ artifactId: z.number().int().positive() }).safeParse(value)
  if (!parsed.success) return false
  if (parsed.data.actionReview) {
    if (parsed.data.articleCompletion !== 'accepted' || parsed.data.actionReviewMode !== 'clean-acceptance') return false
    const requestPins = [parsed.data.requestDigest, parsed.data.requestCommentId, parsed.data.requestIntent]
    if (requestPins.some(value => value !== undefined) && (requestPins.some(value => value === undefined) || parsed.data.requestIntent !== 'request_clean_acceptance')) return false
  }
  const response = await github(`/repos/ojfbot/daily-logger/actions/artifacts/${parsed.data.artifactId}`)
  if (response.status === 404 || response.status === 410) return false
  if (!response.ok) throw new Error('Editorial output artifact is unavailable; no admission or safe retry is established')
  const decoded: unknown = await response.json().catch(() => null)
  const result = z.object({ id: z.number(), name: z.string(), expired: z.boolean(), workflow_run: z.object({ id: z.number(), head_sha: sha }) }).safeParse(decoded)
  if (!result.success) return false
  const artifact = result.data
  return artifact.id === parsed.data.artifactId && !artifact.expired && artifact.name === editorialProofName(parsed.data) && artifact.workflow_run.id === parsed.data.runId && artifact.workflow_run.head_sha === (parsed.data.requestCommentId ? parsed.data.policySha : parsed.data.inputHead)
}
