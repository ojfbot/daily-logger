import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import {
  ActionRegistrySchema,
  actionStateDigest,
  articleActionCard,
  managedArticleDigest,
  normalizeWorkKey,
  registryRevision,
  renderArticleActions,
  sha256,
  writeActionRegistry,
  type ActionRegistry,
  type DraftCandidateEvidenceRequirements,
} from '../action-registry.js'
import { actionEvidenceScope, deriveActionReviewOutput, draftCandidateEvidenceBinding, prepareConservativeDraftCandidateEvidence, selectActionEvidence } from '../action-evidence-selection.js'
import { ActionEvidenceRequestError } from '../action-evidence-retrieval.js'
import { ACTION_REVIEW_PROMPT_VERSION, revisionActionCycle } from '../action-review-cycle.js'
import { pendingActionReview, reviewDraftActions, reviewProducedDraftActions } from '../review-actions.js'
import { stampOutcome } from '../stamp-outcome.js'
import { writeActionStore } from './action-store-fixture.js'

const articleDate = '2030-01-01'
const markdown = `---\ndate: ${articleDate}\nstatus: draft\n---\n## What shipped\nNo reader-facing candidate verdict.\n`
const cycle = revisionActionCycle('candidate-prestate-lineage-census')
const statuses = new Map([[articleDate, 'draft']])
const payload = { command: '/review', description: 'Review core #543 current target.', repo: 'core', status: 'open' as const, sourceDate: articleDate }

function emptyRegistry() {
  return ActionRegistrySchema.parse({
    schemaVersion: 1,
    baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] },
    records: [],
    articles: [],
  })
}

function preparedRegistry(records: ActionRegistry['records'] = []) {
  const pending = pendingActionReview({
    registry: { ...emptyRegistry(), records },
    articleStatuses: statuses,
    articleDate,
    cycle,
    markdown,
    reason: 'Prepare the original candidate evidence prestate.',
    draftCandidates: [payload],
    draftContext: { kind: 'none' },
  })
  const binding = draftCandidateEvidenceBinding({ registry: pending.registry, articleDate, cycle, markdown: pending.markdown })
  const snapshot = pending.registry.articles.find(article => article.date === articleDate)!
  snapshot.draftCandidateEvidence = {
    version: 'draft-candidate-evidence-v2',
    provenance: { kind: 'independent-reviewer', identity: 'lineage-census', decision: 'Bind only deliberate same-work records from the original prestate.' },
    ...binding,
    candidates: snapshot.draftCandidates!.map(candidate => ({
      candidateId: candidate.candidateId,
      payloadSha256: sha256(JSON.stringify(candidate.payload)),
      references: [{ classification: 'required' as const, reference: 'core#543', role: 'target' as const, reason: 'Exact immutable candidate target.' }],
      actionRelations: [],
    })),
    unassignedReferences: [],
  } satisfies DraftCandidateEvidenceRequirements
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, {
    articleDate, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates,
    draftCandidateEvidence: snapshot.draftCandidateEvidence,
  })
  return pending.registry
}

function relateCandidate(registry: ActionRegistry, actionKey: string) {
  const evidence = registry.articles.find(article => article.date === articleDate)!.draftCandidateEvidence!
  evidence.candidates[0]!.actionRelations = [{ actionKey, sourceReference: 'core#543', relation: 'same-work', reason: 'Reviewed same-work association.' }]
  evidence.inputActionKeys = [actionKey]
  Object.assign(evidence, draftCandidateEvidenceBinding({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' }))
  return registry
}

function withNativePromotion() {
  const before = preparedRegistry()
  const registry = structuredClone(before)
  registry.records.push({
    key: 'act-2030-01-01-promoted',
    original: { id: 'act-2030-01-01-promoted', ...payload },
    origin: 'suggested',
    workKey: normalizeWorkKey('core', 'core#543', 'Review the current target.'),
    state: 'proposed',
    introducedBy: articleDate,
    admission: cycle,
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Review core #543.',
    doneWhen: 'The current target has an evidence-backed disposition.',
    gates: [],
    history: [{ roundId: registry.articles[0]!.roundId, articleDate, state: 'proposed', description: 'Review core #543 current target.',
      reason: 'The native candidate review promoted the captured proposal.', citations: [], verifiedBy: 'lineage-fixture-verifier', verificationReason: 'Fixture promotion.' }],
  })
  const snapshot = registry.articles.find(article => article.date === articleDate)!
  snapshot.review = { state: 'verified' }
  snapshot.actionKeys = ['act-2030-01-01-promoted']
  snapshot.verification.proposalSha256 = 'e'.repeat(64)
  const candidate = snapshot.draftCandidates![0]!
  const sourceContent = 'CURRENT API STATE core#543: state=open; owner review remains required.'
  const sourceId = `github:core#543@${sha256(sourceContent)}`
  candidate.review = { state: 'promoted', actionKey: 'act-2030-01-01-promoted', reason: 'The source supports promotion.', citations: [{ sourceId, quote: sourceContent }] }
  snapshot.sources = [{ id: sourceId, kind: 'github', locator: 'https://github.com/ojfbot/core/issues/543', content: sourceContent, trustedContent: [sourceContent], fullContentSha256: sha256(sourceContent) }]
  snapshot.verification.verdicts = [
    { item: `draft-candidate:${candidate.candidateId}`, verdict: 'pass', reason: 'Promotion is supported.' },
    { item: 'control:rejected', verdict: 'reject', reason: 'Rejected control remains auditable.' },
    { item: 'control:held', verdict: 'hold', reason: 'Held control remains auditable.' },
  ]
  snapshot.reviewOutput = deriveActionReviewOutput({ before, after: registry, articleStatuses: statuses, articleDate, reviewCycle: cycle,
    roundId: snapshot.roundId, proposalSha256: snapshot.verification.proposalSha256, consumedInputSha256: snapshot.draftCandidateEvidence!.canonicalIndexSha256 })
  snapshot.stateDigest = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate, roundId: snapshot.roundId,
    draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence, reviewOutput: snapshot.reviewOutput })
  return registry
}

it('keeps an exact retry bound to the original prestate after its own valid promotion', () => {
  const registry = withNativePromotion()

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).not.toThrow()
})

it('holds a cache miss before agents until prior native outputs receive a fresh explicit input association', async () => {
  const registry = withNativePromotion()
  const propose = vi.fn(), verify = vi.fn()

  const result = await reviewDraftActions({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [], agents: { propose, verify } })

  expect(result.registry.articles[0]).toMatchObject({
    review: { state: 'pending', reason: expect.stringMatching(/prior native review outputs.*fresh explicit current-input binding/i) },
    draftCandidates: [{ candidateId: registry.articles[0]!.draftCandidates![0]!.candidateId, payload, review: { state: 'awaiting-review' } }],
  })
  expect(result.registry.articles[0]).not.toHaveProperty('reviewOutput')
  expect(result.registry.records).toContainEqual(expect.objectContaining({ key: 'act-2030-01-01-promoted', origin: 'suggested', admission: cycle }))
  expect(result.registry.articles[0]?.candidateReviewHistory).toEqual([expect.objectContaining({
    articleDigest: registry.articles[0]!.articleDigest,
    reviewCycle: cycle,
    roundId: registry.articles[0]!.roundId,
    stateDigest: registry.articles[0]!.stateDigest,
    verification: registry.articles[0]!.verification,
    draftCandidateEvidence: registry.articles[0]!.draftCandidateEvidence,
    reviewOutput: registry.articles[0]!.reviewOutput,
    transitions: [{ candidateId: registry.articles[0]!.draftCandidates![0]!.candidateId, review: registry.articles[0]!.draftCandidates![0]!.review }],
    sources: [{
      id: registry.articles[0]!.sources[0]!.id,
      kind: registry.articles[0]!.sources[0]!.kind,
      locator: registry.articles[0]!.sources[0]!.locator,
      fullContentSha256: registry.articles[0]!.sources[0]!.fullContentSha256,
    }],
  })])
  const api = articleActionCard(result.registry, articleDate, statuses)
  expect(api?.candidateReviewHistory[0]?.sources).toEqual(result.registry.articles[0]?.candidateReviewHistory?.[0]?.sources)
  expect(api?.sources).toEqual([])
  expect(result.registry.articles[0]?.candidateReviewHistory?.[0]?.verification.verdicts.map(verdict => verdict.verdict)).toEqual(['pass', 'reject', 'hold'])
  const repeatedPending = pendingActionReview({ registry: result.registry, articleStatuses: statuses, articleDate, cycle, markdown, reason: 'The same frontier remains pending.', resetDraftCandidateReviews: true })
  expect(repeatedPending.registry.articles[0]?.candidateReviewHistory).toEqual(result.registry.articles[0]?.candidateReviewHistory)
  const tamperedHistory = structuredClone(result.registry)
  tamperedHistory.articles[0]!.candidateReviewHistory![0]!.transitions[0]!.review.reason = 'Substituted historical verdict.'
  expect(() => renderArticleActions(markdown, tamperedHistory, articleDate, statuses)).toThrow(/state is stale/i)
  expect(() => pendingActionReview({ registry: tamperedHistory, articleStatuses: statuses, articleDate, cycle, markdown, reason: 'Retry must not rehash a tampered archive.' }))
    .toThrow(/action review state is stale/i)

  const root = mkdtempSync(join(tmpdir(), 'candidate-history-writer-'))
  try {
    writeActionStore(root, result.registry)
    const legitimate = pendingActionReview({ registry: result.registry, articleStatuses: statuses, articleDate, cycle, markdown, reason: 'Legitimate fresh-input recovery.' })
    expect(() => writeActionRegistry(root, legitimate.registry, registryRevision(result.registry))).not.toThrow()
    const substituted = structuredClone(legitimate.registry)
    const substitutedSnapshot = substituted.articles[0]!
    substitutedSnapshot.candidateReviewHistory![0]!.transitions[0]!.review.reason = 'Rehashed substituted historical verdict.'
    substitutedSnapshot.stateDigest = actionStateDigest(substituted, substitutedSnapshot.actionKeys, substitutedSnapshot.closing, substitutedSnapshot.draftContext, {
      articleDate, roundId: substitutedSnapshot.roundId, includePriorArticleRounds: true, draftCandidates: substitutedSnapshot.draftCandidates,
      candidateReviewHistory: substitutedSnapshot.candidateReviewHistory, draftCandidateEvidence: substitutedSnapshot.draftCandidateEvidence,
      reviewOutput: substitutedSnapshot.reviewOutput,
    })
    expect(() => writeActionRegistry(root, substituted, registryRevision(legitimate.registry))).toThrow(/historical candidate review.*append-only/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('holds a cache miss when an already-related input action has prior output values instead of the bound input values', async () => {
  const record: ActionRegistry['records'][number] = {
    key: 'existing-core-543',
    original: { id: 'existing-core-543', command: '/investigate', description: 'Investigate core #543.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported', workKey: normalizeWorkKey('core', 'core#543', 'Investigate the owner decision.'), state: 'open', introducedBy: '2029-12-31',
    includeInIndex: true, inclusionOverride: null, goal: 'Preserve the original owner decision.', doneWhen: 'The owner records a disposition.', gates: ['Original owner gate.'], history: [],
  }
  const before = relateCandidate(preparedRegistry([record]), record.key)
  const registry = structuredClone(before)
  registry.records[0]!.gates = ['Updated by the first native review.']
  const snapshot = registry.articles[0]!
  snapshot.review = { state: 'verified' }
  snapshot.actionKeys = [record.key]
  snapshot.draftCandidates![0]!.review = { state: 'mapped-existing', actionKey: record.key, reason: 'The prior review mapped the candidate.', citations: [] }
  snapshot.verification.proposalSha256 = 'd'.repeat(64)
  snapshot.reviewOutput = deriveActionReviewOutput({ before, after: registry, articleStatuses: statuses, articleDate, reviewCycle: cycle,
    roundId: snapshot.roundId, proposalSha256: snapshot.verification.proposalSha256, consumedInputSha256: snapshot.draftCandidateEvidence!.canonicalIndexSha256 })
  snapshot.stateDigest = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate, roundId: snapshot.roundId,
    draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence, reviewOutput: snapshot.reviewOutput })
  const propose = vi.fn(), verify = vi.fn()

  const result = await reviewDraftActions({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [], agents: { propose, verify } })

  expect(result.registry.articles[0]?.review).toMatchObject({ state: 'pending', reason: expect.stringMatching(/current-input binding/i) })
  expect(result.registry.articles[0]?.candidateReviewHistory?.[0]?.transitions[0]?.review).toMatchObject({ state: 'mapped-existing', actionKey: record.key })
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('rejects an evicted archive before review or pending retry can rehash the modern snapshot', async () => {
  const registry = withNativePromotion()
  const propose = vi.fn(), verify = vi.fn()
  const archived = await reviewDraftActions({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [], agents: { propose, verify } })
  const evicted = structuredClone(archived.registry)
  delete evicted.articles[0]!.candidateReviewHistory

  await expect(reviewDraftActions({ registry: evicted, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [], agents: { propose, verify } }))
    .rejects.toThrow(/action review state is stale/i)
  const optionalFieldsEvicted = structuredClone(archived.registry)
  delete optionalFieldsEvicted.articles[0]!.candidateReviewHistory
  delete optionalFieldsEvicted.articles[0]!.draftCandidateEvidence
  delete optionalFieldsEvicted.articles[0]!.reviewOutput
  await expect(reviewDraftActions({ registry: optionalFieldsEvicted, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [], agents: { propose, verify } }))
    .rejects.toThrow(/action review state is stale/i)
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('preserves a prior rejected candidate transition when the current frontier returns to awaiting review', () => {
  const registry = withNativePromotion()
  const snapshot = registry.articles[0]!
  snapshot.draftCandidates![0]!.review = { state: 'rejected', reason: 'The prior evidence rejected this candidate.', citations: [] }
  snapshot.stateDigest = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate, roundId: snapshot.roundId,
    draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence, reviewOutput: snapshot.reviewOutput })

  const pending = pendingActionReview({ registry, articleStatuses: statuses, articleDate, cycle, markdown, reason: 'Fresh input binding required.', resetDraftCandidateReviews: true })

  expect(pending.registry.articles[0]?.draftCandidates?.[0]?.review).toEqual({ state: 'awaiting-review' })
  expect(pending.registry.articles[0]?.candidateReviewHistory?.[0]?.transitions[0]?.review).toEqual({ state: 'rejected', reason: 'The prior evidence rejected this candidate.', citations: [] })
})

it('accepts a fresh explicit frontier that binds the prior candidate output as a current input', () => {
  const registry = withNativePromotion()
  const snapshot = registry.articles[0]!
  const reviewOutput = snapshot.reviewOutput
  delete snapshot.reviewOutput
  snapshot.draftCandidateEvidence!.inputActionKeys = ['act-2030-01-01-promoted']
  snapshot.draftCandidateEvidence!.candidates[0]!.actionRelations = [{
    actionKey: 'act-2030-01-01-promoted', sourceReference: 'core#543', relation: 'same-work', reason: 'Fresh reviewer association after the prior native output.',
  }]
  Object.assign(snapshot.draftCandidateEvidence!, draftCandidateEvidenceBinding({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' }))
  snapshot.reviewOutput = reviewOutput
  snapshot.stateDigest = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate, roundId: snapshot.roundId,
    draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence, reviewOutput: snapshot.reviewOutput })

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).not.toThrow()
})

it('invalidates the historical input view when a native output record is altered', () => {
  const registry = withNativePromotion()
  registry.records.find(record => record.key === 'act-2030-01-01-promoted')!.gates.push('Injected after verification.')

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).toThrow(/native review output.*changed/i)
})

it('invalidates tampered native output provenance before reconstructing the input view', () => {
  const registry = withNativePromotion()
  registry.articles[0]!.reviewOutput!.createdRecords[0]!.afterInputSha256 = '0'.repeat(64)

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).toThrow(/native review output integrity changed/i)
})

it('does not inherit source duties from an unrelated record that only cites the candidate target as background', () => {
  const unrelated: ActionRegistry['records'][number] = {
    key: 'act-unrelated-core-700',
    original: { id: 'act-unrelated-core-700', command: '/review', description: 'Review core #700; core #543 is background only.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported',
    workKey: normalizeWorkKey('core', 'core#700', 'Return the core #700 disposition.'),
    state: 'open',
    introducedBy: '2029-12-31',
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Resolve core #700.',
    doneWhen: 'The core #700 outcome is recorded.',
    gates: ['Preserve the separate gate at core #701.'],
    history: [],
  }
  const registry = preparedRegistry([unrelated])

  const scope = actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })

  expect([...scope.refs].sort()).toEqual(['core#543'])
  expect(scope.referenceRequirements).toEqual([
    expect.objectContaining({ source: expect.stringMatching(/^candidate:/), reference: 'core#543', role: 'target' }),
  ])
})

it('keeps every unqualified duty owned by an explicitly related canonical action on its candidate source request', () => {
  const related: ActionRegistry['records'][number] = {
    key: 'act-related-core-543',
    original: { id: 'act-related-core-543', command: '/review', description: 'Review core #543.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported',
    workKey: normalizeWorkKey('core', '/review', 'Review core #543 current target.'),
    state: 'open',
    introducedBy: '2029-12-31',
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Preserve the independent owner decision.',
    doneWhen: 'The independent owner accepts.',
    gates: ['Human visual acceptance remains required.'],
    history: [],
  }
  const registry = relateCandidate(preparedRegistry([related]), related.key)
  const expected = [
    ['goal', related.goal],
    ['current-disposition', related.original.description],
    ['done-when', related.doneWhen],
    ['gate', related.gates[0]],
  ].map(([kind, text]) => sha256(JSON.stringify({ actionKey: related.key, kind, text })))

  try {
    selectActionEvidence({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '', sources: [] })
    throw new Error('Expected a missing-source request')
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    const request = (error as ActionEvidenceRequestError).request
    expect(request.sourceKey).toBe('github:core#543')
    expect(request.obligations).toEqual(expect.arrayContaining(expected))
  }
})

it('invalidates captured classification after an external canonical gate changes', () => {
  const related: ActionRegistry['records'][number] = {
    key: 'act-related-core-543',
    original: { id: 'act-related-core-543', command: '/review', description: 'Review core #543.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported', workKey: normalizeWorkKey('core', '/review', 'Review core #543 current target.'), state: 'open', introducedBy: '2029-12-31',
    includeInIndex: true, inclusionOverride: null, goal: 'Preserve the independent owner decision.', doneWhen: 'The independent owner accepts.', gates: ['Original owner gate.'], history: [],
  }
  const registry = relateCandidate(preparedRegistry([related]), related.key)
  registry.records[0]!.gates = ['Externally changed owner gate.']

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).toThrow(/canonicalIndex|actionState/i)
})

it('invalidates captured classification when external exact-work identity appears', () => {
  const registry = preparedRegistry()
  registry.records.push({
    key: 'act-external-duplicate', original: { id: 'act-external-duplicate', ...payload, sourceDate: '2029-12-31' }, origin: 'imported',
    workKey: normalizeWorkKey(payload.repo, payload.command, payload.description), state: 'open', introducedBy: '2029-12-31', includeInIndex: true,
    inclusionOverride: null, goal: 'External exact work.', doneWhen: 'The duplicate is reconciled.', gates: [], history: [],
  })

  expect(() => actionEvidenceScope({ registry, articleStatuses: statuses, articleDate, cycle, markdown, feedback: '' })).toThrow(/input identities|canonicalIndex/i)
})

it('refreshes a cycle-only binding before collection and records derived lineage', async () => {
  const registry = preparedRegistry()
  const nextCycle = revisionActionCycle('candidate-prestate-lineage-census-next')
  const collectSources = vi.fn((_candidates, evidence) => {
    expect(evidence).toMatchObject({ reviewCycle: nextCycle, provenance: { kind: 'derived-refresh', lineage: { kind: 'cycle-only-refresh', priorReviewCycle: cycle } } })
    throw new Error('Stop after observing pre-collection refresh.')
  })
  const propose = vi.fn(), verify = vi.fn()

  const result = await reviewProducedDraftActions({ registry, articleStatuses: statuses, articleDate, cycle: nextCycle, markdown, feedback: '', draftCandidates: [payload],
    prepareEvidence: candidates => prepareConservativeDraftCandidateEvidence({ registry, articleStatuses: statuses, articleDate, cycle: nextCycle, markdown, feedback: '', draftCandidates: candidates }),
    collectSources, agents: { propose, verify } })

  expect(result.registry.articles[0]).toMatchObject({ review: { state: 'pending' }, draftCandidateEvidence: { reviewCycle: nextCycle, provenance: { kind: 'derived-refresh' } } })
  expect(collectSources).toHaveBeenCalledOnce()
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('refreshes stored candidate evidence before a later production caller collects sources', async () => {
  const registry = preparedRegistry()
  const nextCycle = revisionActionCycle('candidate-prestate-lineage-census-production-caller')
  const collectSources = vi.fn((_candidates, evidence) => {
    expect(evidence).toMatchObject({ reviewCycle: nextCycle, provenance: { kind: 'derived-refresh', lineage: { kind: 'cycle-only-refresh', priorReviewCycle: cycle } } })
    throw new Error('Stop after observing stored-candidate pre-collection refresh.')
  })
  const propose = vi.fn(), verify = vi.fn()

  const result = await reviewProducedDraftActions({ registry, articleStatuses: statuses, articleDate, cycle: nextCycle, markdown, feedback: '',
    collectSources, agents: { propose, verify } })

  expect(result.registry.articles[0]).toMatchObject({ review: { state: 'pending' }, draftCandidateEvidence: { reviewCycle: nextCycle, provenance: { kind: 'derived-refresh' } } })
  expect(collectSources).toHaveBeenCalledOnce()
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('refreshes the exact UI and workflow Draft-to-Accepted status transition before collection', () => {
  const registry = preparedRegistry()
  const previous = registry.articles[0]!.draftCandidateEvidence!
  const nextCycle = revisionActionCycle('pull-request:413:clean-acceptance')
  const acceptedMarkdown = stampOutcome(markdown.replace(/^status:\s*draft$/m, 'status: "accepted"'), 'accepted')
  const acceptedStatuses = new Map(statuses).set(articleDate, 'accepted')

  const refreshed = prepareConservativeDraftCandidateEvidence({
    registry,
    articleStatuses: acceptedStatuses,
    articleDate,
    cycle: nextCycle,
    markdown: acceptedMarkdown,
    feedback: '',
    draftCandidates: registry.articles[0]!.draftCandidates!,
  })

  expect(refreshed).toMatchObject({
    articleDigest: previous.articleDigest,
    reviewCycle: nextCycle,
    candidates: previous.candidates,
    unassignedReferences: previous.unassignedReferences,
    provenance: {
      kind: 'derived-refresh',
      lineage: {
        kind: 'acceptance-status-refresh',
        priorArticleStatus: 'draft',
        articleStatus: 'accepted',
        priorReviewCycle: cycle,
      },
    },
  })
  expect(refreshed.articleStatusesSha256).not.toBe(previous.articleStatusesSha256)
})

it.each([
  ['prose', (fixture: { registry: ActionRegistry; markdown: string; feedback: string; articleStatuses: Map<string, string> }) => { fixture.markdown += '\nUnrelated editorial prose.\n' }],
  ['feedback', (fixture: { registry: ActionRegistry; markdown: string; feedback: string; articleStatuses: Map<string, string> }) => { fixture.feedback = 'Unrelated owner instruction.' }],
  ['canonical input', (fixture: { registry: ActionRegistry; markdown: string; feedback: string; articleStatuses: Map<string, string> }) => {
    fixture.registry.records.push({
      key: 'unrelated-core-700', original: { id: 'unrelated-core-700', command: '/review', description: 'Review core #700.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
      origin: 'imported', workKey: normalizeWorkKey('core', '/review', 'Review core #700.'), state: 'open', introducedBy: '2029-12-31',
      includeInIndex: true, inclusionOverride: null, goal: 'Review the separate target.', doneWhen: 'The separate review is recorded.', gates: [], history: [],
    })
  }],
  ['other article status', (fixture: { registry: ActionRegistry; markdown: string; feedback: string; articleStatuses: Map<string, string> }) => { fixture.articleStatuses.set('2029-12-31', 'accepted') }],
])('rejects an unrelated %s change during the acceptance-status refresh', (_name, mutate) => {
  const registry = preparedRegistry()
  const fixture = {
    registry,
    markdown: stampOutcome(markdown.replace(/^status:\s*draft$/m, 'status: "accepted"'), 'accepted'),
    feedback: '',
    articleStatuses: new Map(statuses).set(articleDate, 'accepted'),
  }
  mutate(fixture)

  expect(() => prepareConservativeDraftCandidateEvidence({
    ...fixture,
    articleDate,
    cycle: revisionActionCycle('pull-request:413:clean-acceptance'),
    draftCandidates: registry.articles[0]!.draftCandidates!,
  })).toThrow(/changed beyond.*fresh classification/i)
})

it('rejects a captured classification altered outside the saved snapshot integrity digest', () => {
  const registry = preparedRegistry()
  registry.articles[0]!.draftCandidateEvidence!.candidates[0]!.references[0]!.reason = 'Substituted classification rationale.'
  const acceptedMarkdown = stampOutcome(markdown.replace(/^status:\s*draft$/m, 'status: "accepted"'), 'accepted')

  expect(() => prepareConservativeDraftCandidateEvidence({
    registry,
    articleStatuses: new Map(statuses).set(articleDate, 'accepted'),
    articleDate,
    cycle: revisionActionCycle('pull-request:413:clean-acceptance'),
    markdown: acceptedMarkdown,
    feedback: '',
    draftCandidates: registry.articles[0]!.draftCandidates!,
  })).toThrow(/state is stale/i)
})

it('rejects an Accepted status that lacks the workflow-owned accepted outcome stamp', () => {
  const registry = preparedRegistry()
  const acceptedWithoutOutcome = markdown.replace(/^status:\s*draft$/m, 'status: "accepted"')

  expect(() => prepareConservativeDraftCandidateEvidence({
    registry,
    articleStatuses: new Map(statuses).set(articleDate, 'accepted'),
    articleDate,
    cycle: revisionActionCycle('pull-request:413:clean-acceptance'),
    markdown: acceptedWithoutOutcome,
    feedback: '',
    draftCandidates: registry.articles[0]!.draftCandidates!,
  })).toThrow(/changed beyond.*fresh classification/i)
})

it.each([
  ['a conflicting duplicate outcome key', (value: string) => value.replace('outcome: accepted', 'outcome: accepted\noutcome: rejected')],
  ['an unrecognized duplicate status key', (value: string) => value.replace('status: "accepted"', 'status: "accepted"\nstatus: nonsense')],
  ['mismatched status quotes', (value: string) => value.replace('status: "accepted"', 'status: "accepted\'')],
])('rejects acceptance frontmatter with %s', (_name, mutate) => {
  const registry = preparedRegistry()
  const accepted = stampOutcome(markdown.replace(/^status:\s*draft$/m, 'status: "accepted"'), 'accepted')

  expect(() => prepareConservativeDraftCandidateEvidence({
    registry,
    articleStatuses: new Map(statuses).set(articleDate, 'accepted'),
    articleDate,
    cycle: revisionActionCycle('pull-request:413:clean-acceptance'),
    markdown: mutate(accepted),
    feedback: '',
    draftCandidates: registry.articles[0]!.draftCandidates!,
  })).toThrow(/changed beyond.*fresh classification/i)
})

it('keeps changed prose pending before collection instead of refreshing the old classification', async () => {
  const registry = preparedRegistry()
  const collectSources = vi.fn(), propose = vi.fn(), verify = vi.fn()
  const changed = markdown.replace('No reader-facing candidate verdict.', 'The article changed after classification.')

  const result = await reviewProducedDraftActions({ registry, articleStatuses: statuses, articleDate, cycle, markdown: changed, feedback: '', draftCandidates: [payload],
    prepareEvidence: candidates => prepareConservativeDraftCandidateEvidence({ registry, articleStatuses: statuses, articleDate, cycle, markdown: changed, feedback: '', draftCandidates: candidates }),
    collectSources, agents: { propose, verify } })

  expect(result.registry.articles[0]).toMatchObject({ review: { state: 'pending', reason: expect.stringMatching(/fresh classification required/i) } })
  expect(collectSources).not.toHaveBeenCalled()
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})

it('preserves the legacy state-digest shape when candidates exist without an association map', () => {
  const draftContext = { kind: 'none' as const }
  const actual = actionStateDigest(emptyRegistry(), [], undefined, draftContext, {
    articleDate,
    roundId: 'f'.repeat(64),
    draftCandidates: [],
  })
  const legacy = sha256(JSON.stringify({ records: [], closing: null, draftContext, draftCandidates: [] }))

  expect(actual).toBe(legacy)
})

it('renders an unchanged legacy verified snapshot with captured candidates and no association map', () => {
  const legacyDate = '2026-10-17'
  const legacyMarkdown = `---\ndate: ${legacyDate}\nstatus: draft\n---\n## What shipped\nLegacy custody remains unchanged.\n`
  const registry = emptyRegistry()
  const draftContext = { kind: 'none' as const }
  const roundId = 'a'.repeat(64)
  registry.articles.push({
    date: legacyDate,
    status: 'draft',
    review: { state: 'verified' },
    articleDigest: managedArticleDigest(legacyMarkdown),
    roundId,
    reviewCycle: revisionActionCycle('legacy-no-map'),
    actionKeys: [],
    draftCandidates: [],
    draftContext,
    stateDigest: actionStateDigest(registry, [], undefined, draftContext, { articleDate: legacyDate, roundId, draftCandidates: [] }),
    verification: { proposer: 'legacy', verifier: 'legacy', promptVersion: ACTION_REVIEW_PROMPT_VERSION, proposalSha256: 'b'.repeat(64), verdicts: [] },
    sources: [],
    rejected: [],
  })

  expect(() => renderArticleActions(legacyMarkdown, registry, legacyDate, new Map([[legacyDate, 'draft']]))).not.toThrow()
  expect(() => pendingActionReview({ registry, articleStatuses: new Map([[legacyDate, 'draft']]), articleDate: legacyDate,
    cycle: revisionActionCycle('legacy-no-map-retry'), markdown: legacyMarkdown, reason: 'Legacy retry remains compatible.' })).not.toThrow()
})
