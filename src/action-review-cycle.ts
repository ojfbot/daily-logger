import { z } from 'zod'

export const ACTION_REVIEW_PROMPT_VERSION = 'action-review-v18-native-validated-tool'
export const PENDING_ACTION_REVIEW_PROMPT_VERSION = 'action-review-pending-v5-draft-candidate-custody'
export const CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS = [
  ACTION_REVIEW_PROMPT_VERSION,
  'action-review-v16-typed-evidence-view',
  'action-review-v15-draft-candidate-linkage',
  PENDING_ACTION_REVIEW_PROMPT_VERSION,
  'action-review-v14-draft-candidate-custody',
  'action-review-v13-maintained-recommendation-continuity',
  'action-review-pending-v4-maintained-recommendation-continuity',
  'action-review-v12-single-recommendation-surface',
  'action-review-pending-v3-single-recommendation-surface',
] as const
export const RANKED_ACTION_REVIEW_PROMPT_VERSIONS = [ACTION_REVIEW_PROMPT_VERSION, 'action-review-v16-typed-evidence-view', 'action-review-v15-draft-candidate-linkage', 'action-review-v14-draft-candidate-custody', 'action-review-v13-maintained-recommendation-continuity', 'action-review-v12-single-recommendation-surface'] as const
export const ActionReviewCycleSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('generation') }).strict(),
  z.object({ phase: z.literal('revision'), id: z.string().min(1).max(256) }).strict(),
])
export type ActionReviewCycle = z.infer<typeof ActionReviewCycleSchema>

export function generationActionCycle(): Extract<ActionReviewCycle, { phase: 'generation' }> {
  return { phase: 'generation' }
}
export function revisionActionCycle(requestIdentity: string): Extract<ActionReviewCycle, { phase: 'revision' }> {
  if (!requestIdentity.trim()) throw new Error('An explicit action-review request identity is required')
  return ActionReviewCycleSchema.options[1].parse({ phase: 'revision', id: requestIdentity })
}
export function actionAdmissionLimit(cycle: ActionReviewCycle): number {
  return cycle.phase === 'generation' ? 5 : 2
}
export function acceptanceActionCycle(requestIdentity: string, previous?: { review: { state: string }; reviewCycle?: ActionReviewCycle }): ActionReviewCycle {
  // Retry the recorded initial review, never infer generation from article status.
  if (previous?.review.state === 'pending' && previous.reviewCycle?.phase === 'generation') {
    return ActionReviewCycleSchema.parse(previous.reviewCycle)
  }
  return revisionActionCycle(requestIdentity)
}

export function countCycleAdmissions(records: readonly { admission?: ActionReviewCycle }[], cycle: ActionReviewCycle): number {
  return records.filter(record => {
    if (!record.admission) return cycle.phase === 'generation'
    return cycle.phase === 'generation'
      ? record.admission.phase === 'generation'
      : record.admission.phase === 'revision' && record.admission.id === cycle.id
  }).length
}

export function actionAdmissionErrors(records: readonly { introducedBy: string; admission?: ActionReviewCycle }[]): string[] {
  const errors: string[] = []
  for (const date of new Set(records.map(record => record.introducedBy))) {
    const own = records.filter(record => record.introducedBy === date)
    const legacy = own.filter(record => !record.admission)
    if (legacy.length > 2) errors.push(`More than two unclassified legacy suggestion identities for ${date}`)
    if (countCycleAdmissions(own, generationActionCycle()) > actionAdmissionLimit(generationActionCycle())) errors.push(`Initial action admission limit reached for ${date}`)
    const revisions = own.flatMap(record => record.admission?.phase === 'revision' ? [record.admission.id] : [])
    for (const id of new Set(revisions)) {
      if (countCycleAdmissions(own, { phase: 'revision', id }) > actionAdmissionLimit({ phase: 'revision', id })) errors.push(`Revision action admission limit reached for ${date}:${id}`)
    }
  }
  return errors
}
