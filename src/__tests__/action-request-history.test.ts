import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyVerifiedActionReview } from './evidence-view-fixtures.js'
import { writeActionStore } from './action-store-fixture.js'
import { pendingActionReview } from '../review-actions.js'
import { generationActionCycle } from '../action-review-cycle.js'
import { prepareConservativeDraftCandidateEvidence } from '../action-evidence-selection.js'
import { actionEvidenceRequestReceipt, createActionEvidenceRequest } from '../action-evidence-retrieval.js'
import { ActionRegistrySchema, actionStateDigest, completeArticleWithPendingActions, readActionRegistry, sha256, type ActionEvidenceRequestReceipt, type ActionSource } from '../action-registry.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const date = '2026-10-25', cycle = generationActionCycle()
function fixture() {
  const statuses = new Map([[date, 'draft']])
  const registry = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  const pending = pendingActionReview({ registry, articleDate: date, cycle, markdown: `---\ndate: ${date}\nstatus: draft\noutcome: accepted\n---\nAn offline custody regression fixture.\n`, reason: 'Offline unresolved suggestions.', articleStatuses: statuses, draftCandidates: ['review', 'validate', 'triage'].map(command => ({ command: `/${command}`, repo: 'core', description: `Review the separate ${command} concern.`, sourceDate: date, status: 'open' })) })
  const qualified = pending
  const sources: ActionSource[] = [{ id: 'fact', kind: 'repository', locator: 'fixture.md', content: 'These captured concerns are unsupported.' }, { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: 'Keep each independent concern reviewable.' }, ...[9001,9002,9003].map(number => ({ id: `checkpoint-${number}`, kind: 'github' as const, locator: `https://github.com/ojfbot/core/issues/${number}`, content: `CURRENT API STATE core#${number}: state=open; separate owner review remains required.`, trustedContent: [`CURRENT API STATE core#${number}: state=open; separate owner review remains required.`] }))]
  const source = { id: `github:daily-logger#416@${sha256('Pinned source metadata only.')}`, kind: 'github' as const, locator: 'https://github.com/ojfbot/daily-logger/pull/416', content: 'Pinned source metadata only.' }
  function request(sourceKey: string, marker: string, pinned?: ActionSource) { return actionEvidenceRequestReceipt(createActionEvidenceRequest({ kind: 'source-view', caseDigest: sha256(marker), articleDate: date, cycle, actionKeys: ['article-feedback'], sourceKey, ...(pinned ? { source: pinned } : {}), question: 'Which bounded source view supplies the required evidence?', obligations: [sha256(marker + '-obligation')] })) }
  const historical = request('github:daily-logger#357', 'ordinary-history')
  const current = request('github:daily-logger#416', 'accepted-current', source)
  // The prior ordinary receipt is not the accepted article's current request.
  const prior = qualified.registry.articles[0]
  prior.evidenceRequests = [historical]
  prior.draftCandidateEvidence = prepareConservativeDraftCandidateEvidence({ registry: qualified.registry, articleDate: date, cycle, markdown: qualified.markdown, articleStatuses: statuses, draftCandidates: prior.draftCandidates ?? [] })
  prior.stateDigest = actionStateDigest(qualified.registry, prior.actionKeys, prior.closing, prior.draftContext, { articleDate: date, roundId: prior.roundId, includePriorArticleRounds: true, draftCandidates: prior.draftCandidates, draftCandidateEvidence: prior.draftCandidateEvidence })
  const acceptedMarkdown = qualified.markdown.replace('status: draft', 'status: accepted'), acceptedStatuses = new Map([[date, 'accepted']])
  const requirements = prepareConservativeDraftCandidateEvidence({ registry: qualified.registry, articleDate: date, cycle, markdown: acceptedMarkdown, articleStatuses: acceptedStatuses, draftCandidates: qualified.registry.articles[0].draftCandidates ?? [] })
  const accepted = completeArticleWithPendingActions({ registry: qualified.registry, articleDate: date, markdown: acceptedMarkdown, articleStatuses: acceptedStatuses, cycle, failureKind: 'evidence-required', sources: [source], draftCandidateEvidence: requirements, evidenceRequest: current })
  const candidates = accepted.registry.articles[0].draftCandidates ?? []
  const closingOptions = [9001,9002,9003].map(number => ({ kind: 'checkpoint' as const, target: `https://github.com/ojfbot/core/issues/${number}`, title: `Review separate concern ${number}`, benefit: 'Clarify its owner decision.', start: `Read core#${number}.`, entryPoint: `Read core#${number}.`, context: 'Separate offline unresolved concern.', whyNow: 'An owner decision remains open.', outcome: `Owner records disposition for ${number}.`, nextCheck: `Inspect the owner disposition for ${number}.`, replaces: [], factCitations: [{ sourceId: `checkpoint-${number}`, quote: `CURRENT API STATE core#${number}: state=open; separate owner review remains required.` }], goalCitations: [{ sourceId: 'goal', quote: 'Keep each independent concern reviewable.' }] }))
  const proposal = { changes: [], suggestions: [], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject' as const, reason: 'Unsupported concern in this offline fixture.', citations: [{ sourceId: 'fact', quote: 'These captured concerns are unsupported.' }] })), closingOptions }
  const verification = { changes: [], suggestions: [], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass' as const, reason: 'Offline independent verdict fixture.' })), closingOptions: closingOptions.map((_, optionIndex) => ({ optionIndex, verdict: 'pass' as const, reason: 'Offline independent checkpoint verdict fixture.' })) }
  const apply = (resolvedEvidenceRequests?: ActionEvidenceRequestReceipt[]) => applyVerifiedActionReview({ registry: accepted.registry, articleDate: date, cycle, markdown: accepted.markdown, articleStatuses: acceptedStatuses, sources, roundId: sha256('offline verified round'), proposal, verification, draftCandidateEvidence: requirements, resolvedEvidenceRequests })
  return { historical, current, apply }
}

it('preserves ordinary and formerly current open receipts after native verified application and storage reload', () => {
  const f = fixture(), result = f.apply(), snapshot = result.articles[0]
  expect(snapshot.review).toEqual({ state: 'verified' })
  expect(snapshot.review).not.toHaveProperty('articleAcceptance')
  expect(snapshot.evidenceRequests).toEqual([f.historical, f.current])
  expect(snapshot.evidenceRequests?.every(request => request.status === 'open')).toBe(true)
  const root = mkdtempSync(join(tmpdir(), 'action-request-history-')); roots.push(root)
  writeActionStore(root, result)
  expect(readActionRegistry(root).articles[0].evidenceRequests).toEqual([f.historical, f.current])
})

it('overlays only the explicitly resolved receipt while preserving the other request exactly', () => {
  const f = fixture()
  // Native application receives this explicit selection-resolution input; source-selection
  // authorization is covered separately by the evidence response/projection tests.
  const resolved = { ...f.historical, status: 'resolved' as const }
  const snapshot = f.apply([resolved]).articles[0]
  expect(snapshot.review).toEqual({ state: 'verified' })
  expect(snapshot.evidenceRequests).toEqual([resolved, f.current])
  expect(snapshot.evidenceRequests?.find(request => request.id === f.current.id)).toEqual(f.current)
})
