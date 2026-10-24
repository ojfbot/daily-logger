import { BareActionCommandSchema, isReviewedAction } from './action-model.js'
import { EXACT_INVOCATION_ACTION_REVIEW_PROMPT_VERSIONS } from './action-review-cycle.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  articleActionFileContractBytes,
  DraftActionCandidatePayloadSchema,
  DraftActionCandidateSchema,
  createActionRegistrySchemas,
  editorialActionReviewOutcomeSchema,
  type ActionRecord,
  type ActionRegistry,
  type ArticleActionFile,
  type DraftActionCandidate,
  type DraftActionCandidatePayload,
  type DraftCandidateEvidenceRequirements,
} from './action-registry-contract.js'

export * from './action-registry-contract.js'

export function draftActionCandidateId(payload: DraftActionCandidatePayload, ordinal: number): string {
  return createHash('sha256').update(JSON.stringify({ ordinal, payload: DraftActionCandidatePayloadSchema.parse(payload) })).digest('hex')
}

export function captureDraftActionCandidates(values: readonly unknown[]): DraftActionCandidate[] {
  return z.array(DraftActionCandidateSchema).max(5).parse(values.map((value, ordinal) => {
    const payload = DraftActionCandidatePayloadSchema.parse(value)
    return { candidateId: draftActionCandidateId(payload, ordinal), payload, review: { state: 'awaiting-review' as const } }
  }))
}

export const { ArticleActionSchema, ActionRegistrySchema, ArticleActionFileSchema } = createActionRegistrySchemas(draftActionCandidateId)

/** Ordinary invocations keep their immutable capture and native birth output across later rounds. */
export function assertExactInvocationAdmissions(registry: ActionRegistry): void {
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  for (const record of registry.records) {
    if (isReviewedAction(record.original) || BareActionCommandSchema.safeParse(record.original.command).success) continue
    const snapshot = registry.articles.find(article => article.date === record.introducedBy)
    const first = record.history[0]
    if (record.origin !== 'suggested' || !snapshot || !first || first.state !== 'proposed' || record.original.sourceDate !== record.introducedBy) throw new Error(`Ordinary invocation lacks its captured native admission: ${record.key}`)
    const original = record.original
    const candidates = (snapshot.draftCandidates ?? []).filter(candidate => candidate.payload.command === original.command
      && candidate.payload.repo === original.repo && candidate.payload.description === original.description && candidate.payload.sourceDate === original.sourceDate)
    const birthRecord = { ...record, state: first.state, includeInIndex: true, inclusionOverride: null, history: [first] }
    const receipts = [
      ...(snapshot.review.state === 'verified' && snapshot.reviewOutput && snapshot.draftCandidateEvidence ? [{
        roundId: snapshot.roundId, reviewOutput: snapshot.reviewOutput, verification: snapshot.verification, draftCandidateEvidence: snapshot.draftCandidateEvidence,
        transitions: (snapshot.draftCandidates ?? []).map(candidate => ({ candidateId: candidate.candidateId, review: candidate.review })),
      }] : []),
      ...(snapshot.candidateReviewHistory ?? []),
    ]
    const matches = candidates.filter(candidate => receipts.some(receipt => {
      if (!new Set<string>(EXACT_INVOCATION_ACTION_REVIEW_PROMPT_VERSIONS).has(receipt.verification.promptVersion)
        || receipt.roundId !== first.roundId || receipt.reviewOutput.roundId !== first.roundId
        || receipt.reviewOutput.articleDate !== record.introducedBy || first.articleDate !== record.introducedBy
        || receipt.draftCandidateEvidence.articleDate !== record.introducedBy
        || JSON.stringify(receipt.draftCandidateEvidence.reviewCycle) !== JSON.stringify(receipt.reviewOutput.reviewCycle)
        || JSON.stringify(receipt.reviewOutput.reviewCycle) !== JSON.stringify(record.admission)
        || receipt.reviewOutput.proposalSha256 !== receipt.verification.proposalSha256
        || receipt.reviewOutput.consumedInputSha256 !== receipt.draftCandidateEvidence.canonicalIndexSha256
        || !receipt.verification.evidenceView || !receipt.verification.evidenceViewOutputSha256) return false
      const association = receipt.draftCandidateEvidence.candidates.find(item => item.candidateId === candidate.candidateId)
      return association?.payloadSha256 === digest(candidate.payload)
        && receipt.transitions.some(item => item.candidateId === candidate.candidateId && item.review.state === 'promoted' && item.review.actionKey === record.key)
        && receipt.verification.verdicts.some(item => item.item === `draft-candidate:${candidate.candidateId}` && item.verdict === 'pass')
        && receipt.reviewOutput.createdRecords.some(item => item.actionKey === record.key && item.afterRecordSha256 === digest(birthRecord))
    }))
    if (matches.length !== 1) throw new Error(`Ordinary invocation lacks exact source-bound native birth output: ${record.key}`)
  }
}

export function articleActionFileBytes(file: ArticleActionFile): string {
  return articleActionFileContractBytes(ArticleActionFileSchema.parse(file))
}

export function splitActionRegistry(registry: ActionRegistry): { baseline: ActionRegistry; files: ArticleActionFile[] } {
  assertExactInvocationAdmissions(registry)
  const baseline = { ...registry, records: registry.records.filter(record => record.origin === 'imported').map(record => ({ ...record, state: record.original.status, history: [] })), articles: [] }
  return { baseline: ActionRegistrySchema.parse(baseline), files: registry.articles.map(snapshot => ArticleActionFileSchema.parse({ schemaVersion: 1, date: snapshot.date,
    suggestions: registry.records.filter(record => record.origin === 'suggested' && record.introducedBy === snapshot.date).map(({ history: _history, state: _state, ...record }) => record),
    decisions: registry.records.flatMap(record => record.history.filter(decision => decision.articleDate === snapshot.date).map(decision => ({ key: record.key, decision }))), snapshot })) }
}

export function isArticleOnlyAcceptanceOutput(before: ArticleActionFile, after: ArticleActionFile): boolean {
  const original = before.snapshot, completed = after.snapshot
  if (original.status !== 'draft' || original.review.state !== 'pending' || original.reviewOutput || original.candidateReviewHistory?.length || before.suggestions.length || !original.draftCandidates?.length || original.draftCandidates.some(candidate => candidate.review.state !== 'awaiting-review')) return false
  if (before.date !== after.date || completed.status !== 'accepted' || completed.review.state !== 'pending' || !completed.review.articleAcceptance) return false
  const binding = completed.review.articleAcceptance
  const digest = createHash('sha256').update(articleActionFileBytes(before)).digest('hex')
  if (binding.inputRoundId !== original.roundId || binding.inputRegistrySha256 !== digest) return false
  if (JSON.stringify(before.suggestions) !== JSON.stringify(after.suggestions) || JSON.stringify(before.decisions) !== JSON.stringify(after.decisions)) return false
  if (!isArticleOnlyEvidenceRefresh(original.draftCandidateEvidence, completed.draftCandidateEvidence)) return false
  return ['actionKeys', 'draftCandidates', 'candidateReviewHistory', 'draftContext', 'sources', 'evidenceRequests', 'rejected', 'closing'].every(key => {
    const prior = Object.entries(original).find(([name]) => name === key)?.[1]
    const next = Object.entries(completed).find(([name]) => name === key)?.[1]
    return JSON.stringify(prior) === JSON.stringify(next)
  }) && completed.articleDigest === original.articleDigest
}

export function isArticleOnlyEvidenceRefresh(before: DraftCandidateEvidenceRequirements | undefined, after: DraftCandidateEvidenceRequirements | undefined): boolean {
  if (!before || !after || after.provenance.kind !== 'derived-refresh' || after.provenance.lineage?.kind !== 'acceptance-status-refresh'
    || after.provenance.lineage.priorRequirementsSha256 !== createHash('sha256').update(JSON.stringify(before)).digest('hex')
    || JSON.stringify(after.provenance.lineage.priorReviewCycle) !== JSON.stringify(before.reviewCycle)) return false
  const { provenance: _beforeProvenance, reviewCycle: _beforeCycle, articleStatusesSha256: _beforeStatuses, ...original } = before
  const { provenance: _afterProvenance, reviewCycle: _afterCycle, articleStatusesSha256: _afterStatuses, ...refreshed } = after
  return JSON.stringify(original) === JSON.stringify(refreshed)
}

export function articleCompletionOutcome(before: ArticleActionFile, after: ArticleActionFile) {
  if (after.snapshot.status !== 'accepted') return undefined
  if (after.snapshot.review.state === 'verified') return editorialActionReviewOutcomeSchema.parse({ state: 'verified' })
  if (!isArticleOnlyAcceptanceOutput(before, after) || !after.snapshot.review.articleAcceptance) return undefined
  return editorialActionReviewOutcomeSchema.parse({ state: 'pending', failureKind: after.snapshot.review.articleAcceptance.failureKind,
    inputRegistrySha256: after.snapshot.review.articleAcceptance.inputRegistrySha256,
    heldCandidateIds: (after.snapshot.draftCandidates ?? []).map(candidate => candidate.candidateId) })
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
  const registry = ActionRegistrySchema.parse({ ...baseline, records, articles: ordered.map(file => file.snapshot) })
  assertExactInvocationAdmissions(registry)
  return registry
}
