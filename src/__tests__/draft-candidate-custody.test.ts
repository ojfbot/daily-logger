import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generationActionCycle, revisionActionCycle } from '../action-review-cycle.js'
import { ArticleActionFileContractSchema } from '../action-registry-contract.js'
import {
  ArticleActionFileSchema,
  ActionRegistrySchema,
  actionStateDigest,
  articleActionCard,
  captureDraftActionCandidates,
  draftActionCandidateId,
  normalizeWorkKey,
  readActionRegistry,
  registryRevision,
  renderArticleActions,
  sha256,
  splitActionRegistry,
  writeActionRegistry,
  type ActionRegistry,
  type ActionSource,
} from '../action-registry.js'
import { draftCandidateEvidenceBinding } from '../action-evidence-selection.js'
import { pendingActionReview, reviewArticleActions, reviewDraftActions, reviewProducedDraftActions } from '../review-actions.js'
import { writeActionStore } from './action-store-fixture.js'

const date = '2026-10-17'
const statuses = new Map([[date, 'draft']])
const markdown = `---\ntitle: "Candidate custody"\ndate: ${date}\nstatus: "draft"\n---\n\n## What shipped\n\nA bounded article.\n`
const candidates = [
  { command: '/validate', description: 'Qualify the new article evidence path.', repo: 'daily-logger', status: 'open' as const, sourceDate: date },
  { command: '/investigate', description: 'Investigate an unsupported producer claim.', repo: 'daily-logger', status: 'open' as const, sourceDate: date },
  { command: '/roadmap', description: 'Reuse the existing roadmap obligation.', repo: 'daily-logger', status: 'open' as const, sourceDate: date },
  { command: '/pr-review', description: 'Review work that current evidence already closes.', repo: 'daily-logger', status: 'open' as const, sourceDate: date },
]

function registry(): ActionRegistry {
  return ActionRegistrySchema.parse({
    schemaVersion: 1,
    baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] },
    records: [{
      key: 'act-existing',
      original: { id: 'act-existing', command: '/roadmap', description: 'Reuse the existing roadmap obligation.', repo: 'daily-logger', status: 'open', sourceDate: '2026-10-16' },
      origin: 'imported',
      workKey: normalizeWorkKey('daily-logger', 'existing target', 'existing outcome'),
      state: 'open',
      introducedBy: '2026-10-16',
      includeInIndex: true,
      inclusionOverride: null,
      goal: '',
      doneWhen: '',
      gates: ['Retain the existing owner gate.'],
      history: [],
    }],
    articles: [],
  })
}

const evidence = 'CURRENT API STATE daily-logger#999: state=open; head=not-a-PR; merged_at=none. The owner confirms the bounded evidence path and the existing obligation. The reviewed work is already complete.'
const goal = 'The roadmap requires reliable article action custody and review.'
const sources: ActionSource[] = [
  { id: 'evidence', kind: 'github', locator: 'https://github.com/ojfbot/daily-logger/issues/999', content: evidence, trustedContent: [evidence] },
  { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: goal },
]

async function pending() {
  const propose = vi.fn(), verify = vi.fn()
  const result = await reviewDraftActions({
    cycle: generationActionCycle(),
    registry: registry(),
    articleStatuses: statuses,
    articleDate: date,
    markdown,
    feedback: '',
    draftCandidates: candidates,
    sources: [{ id: 'oversized', kind: 'repository', locator: 'large.md', content: 'x'.repeat(129 * 1024) }],
    agents: { propose, verify },
  })
  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
  return result
}

function withCandidateEvidence(current: ActionRegistry, currentMarkdown: string): ActionRegistry {
  const next = structuredClone(current)
  const snapshot = next.articles.find(article => article.date === date)
  if (!snapshot?.draftCandidates?.length || !snapshot.reviewCycle) throw new Error('Missing captured candidate fixture')
  const binding = draftCandidateEvidenceBinding({ registry: next, articleDate: date, cycle: snapshot.reviewCycle, markdown: currentMarkdown })
  snapshot.draftCandidateEvidence = {
    version: 'draft-candidate-evidence-v2', provenance: { kind: 'independent-reviewer', identity: 'custody-fixture', decision: 'Fixture evidence associations.' },
    ...binding,
    candidates: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references: [], actionRelations: [] })),
    unassignedReferences: [],
  }
  snapshot.stateDigest = actionStateDigest(next, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, {
    articleDate: date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates,
    draftCandidateEvidence: snapshot.draftCandidateEvidence,
  })
  return ActionRegistrySchema.parse(next)
}

function preparedCandidateReview(values: typeof candidates) {
  const pending = pendingActionReview({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown,
    reason: 'Prepare explicit candidate evidence.', draftCandidates: values, draftContext: { kind: 'none' } })
  return { ...pending, registry: withCandidateEvidence(pending.registry, pending.markdown) }
}

describe('initial draft candidate custody', () => {
  it('captures the original candidates and publishes pending when producer evidence preparation fails', async () => {
    const propose = vi.fn(), verify = vi.fn(), collectSources = vi.fn()
    const result = await reviewProducedDraftActions({
      cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, feedback: '', draftCandidates: candidates,
      prepareEvidence: () => { throw new Error('Ambiguous candidate target #543; review pending') },
      collectSources,
      agents: { propose, verify },
    })
    expect(result.registry.articles[0]).toMatchObject({ review: { state: 'pending' } })
    expect(result.registry.articles[0]).not.toHaveProperty('draftCandidateEvidence')
    expect(result.registry.articles[0]?.draftCandidates?.map(candidate => candidate.payload)).toEqual(candidates)
    expect(result.markdown).toContain('Action review pending')
    expect(collectSources).not.toHaveBeenCalled()
    expect(propose).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })

  it('lets independent review account for a short genuine list without inventing filler', async () => {
    const captured = captureDraftActionCandidates(candidates.slice(0, 2))
    const prepared = preparedCandidateReview(candidates.slice(0, 2))
    const proposal = {
      changes: [], suggestions: [], closingOptions: [],
      candidateDispositions: captured.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject' as const, reason: 'Current evidence does not support this draft suggestion.', citations: [{ sourceId: 'evidence', quote: 'bounded evidence path' }] })),
    }
    const verification = {
      changes: [], suggestions: [], closingOptions: [],
      candidateDispositions: captured.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass' as const, reason: 'The rejection is source-backed.' })),
    }
    const result = await reviewArticleActions({
      cycle: generationActionCycle(),
      registry: prepared.registry,
      articleStatuses: statuses,
      articleDate: date,
      markdown: prepared.markdown,
      feedback: '',
      draftCandidates: candidates.slice(0, 2),
      sources,
      agents: { propose: async () => proposal, verify: async () => verification },
    })
    expect(result.registry.articles[0]?.review.state).toBe('verified')
    expect(result.registry.articles[0]?.draftCandidates).toHaveLength(2)
    expect(result.markdown).toContain('below the initial target of 3–5')
    expect(result.markdown).toContain('no missing suggestion was invented')
  })

  it('distinguishes an explicitly empty producer list from legacy missing custody', async () => {
    const agents = { propose: async () => ({ changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] }), verify: async () => ({ changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] }) }
    const explicit = await reviewArticleActions({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, feedback: '', draftCandidates: [], sources: [], agents })
    const missing = await reviewArticleActions({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, feedback: '', sources: [], agents })
    expect(explicit.registry.articles[0]?.draftCandidates).toEqual([])
    expect(explicit.markdown).toContain('The draft began with 0 suggestions')
    expect(missing.registry.articles[0]?.draftCandidates).toBeUndefined()
    expect(missing.markdown).not.toContain('The draft began with 0 suggestions')
  })

  it('distinguishes known-empty and legacy-unknown pending custody and shows the pause reason', () => {
    const reason = 'Required action evidence proof exceeds the 128 KiB source limit; review pending'
    const knownEmpty = pendingActionReview({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, reason, draftCandidates: [], draftContext: { kind: 'retained', markdown: 'Same-article review note.' } })
    expect(knownEmpty.markdown).toContain('This draft contains no suggestions')
    expect(knownEmpty.markdown).not.toContain('These suggestions are awaiting review.')
    expect(knownEmpty.markdown).toContain('Why review paused')
    expect(knownEmpty.markdown).toContain('128 KiB source limit')
    expect(knownEmpty.markdown).toContain('No current follow-ups have been ranked yet.')
    expect(knownEmpty.markdown).not.toContain('Current follow-ups are ranked above.')

    const legacyUnknown = pendingActionReview({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, reason })
    expect(legacyUnknown.markdown).toContain('The original draft suggestions were not captured')
    expect(legacyUnknown.markdown).toContain('Their contents are unknown')
    expect(legacyUnknown.markdown).toContain('Why review paused')
  })

  it('rejects more than five captured candidates before either reviewer runs', async () => {
    const propose = vi.fn(), verify = vi.fn()
    await expect(reviewDraftActions({ cycle: generationActionCycle(), registry: registry(), articleStatuses: statuses, articleDate: date, markdown, feedback: '', draftCandidates: [...candidates, candidates[0]!, candidates[1]!], sources, agents: { propose, verify } })).rejects.toThrow()
    expect(propose).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })

  it('persists exact generated candidates before evidence selection and renders them as unverified', async () => {
    const result = await pending()
    const snapshot = result.registry.articles.find(article => article.date === date)
    expect(snapshot?.draftCandidates).toHaveLength(4)
    expect(snapshot?.draftCandidates?.map(candidate => candidate.payload)).toEqual(candidates)
    expect(snapshot?.draftCandidates?.every(candidate => candidate.review.state === 'awaiting-review')).toBe(true)
    expect(result.markdown).toContain('These suggestions are awaiting review.')
    expect(result.markdown).toContain(candidates[0].description)
    expect(articleActionCard(result.registry, date, statuses)?.draftCandidates).toEqual(snapshot?.draftCandidates)
    const file = splitActionRegistry(result.registry).files[0]!
    expect(file.snapshot.draftCandidates).toEqual(snapshot?.draftCandidates)
    const structurallyValidTamper = structuredClone(file)
    structurallyValidTamper.snapshot.draftCandidates![0]!.candidateId = '0'.repeat(64)
    expect(ArticleActionFileContractSchema.safeParse(structurallyValidTamper).success).toBe(true)
    expect(() => ArticleActionFileSchema.parse(structurallyValidTamper)).toThrow(/digest/i)
    const malformedDigest = structuredClone(file)
    malformedDigest.snapshot.draftCandidates![0]!.candidateId = 'not-a-digest'
    expect(ArticleActionFileContractSchema.safeParse(malformedDigest).success).toBe(false)
    const overCap = structuredClone(file)
    overCap.snapshot.draftCandidates = [...overCap.snapshot.draftCandidates!, structuredClone(overCap.snapshot.draftCandidates![0]!), structuredClone(overCap.snapshot.draftCandidates![1]!)]
    expect(ArticleActionFileContractSchema.safeParse(overCap).success).toBe(false)
    const tampered = structuredClone(result.registry)
    tampered.articles[0]!.draftCandidates![0]!.payload.description = 'Substituted after custody.'
    expect(() => ActionRegistrySchema.parse(tampered)).toThrow(/digest/i)
  })

  it('rejects replacement of captured payload and ordinal identity at the writer boundary', async () => {
    const first = await pending()
    const root = mkdtempSync(join(tmpdir(), 'candidate-custody-write-'))
    try {
      writeActionStore(root, first.registry)
      const changed = structuredClone(first.registry)
      const snapshot = changed.articles.find(article => article.date === date)!
      const candidate = snapshot.draftCandidates![0]!
      candidate.payload.description = 'Substituted after the first durable capture.'
      candidate.candidateId = draftActionCandidateId(candidate.payload, 0)
      snapshot.stateDigest = actionStateDigest(changed, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: snapshot.date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates })
      expect(() => writeActionRegistry(root, changed, registryRevision(first.registry))).toThrow(/candidate custody/i)
      expect(readActionRegistry(root).articles[0]?.draftCandidates).toEqual(first.registry.articles[0]?.draftCandidates)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires a verified disposition for every retained candidate on retry and projects the result to API and UI', async () => {
    const first = await pending()
    first.registry = withCandidateEvidence(first.registry, first.markdown)
    const proposal = {
      changes: [],
      suggestions: [
        {
          command: '/validate', description: 'Qualify the new article evidence path.', repo: 'daily-logger', target: 'new evidence target', outcome: 'qualified evidence custody', goal: 'Reliable article action custody',
          goalCitations: [{ sourceId: 'goal', quote: 'reliable article action custody' }], factCitations: [{ sourceId: 'evidence', quote: 'bounded evidence path' }],
          doneWhen: 'The pending and verified projections retain the same candidate identity.', gates: ['Human accepts the reviewed article.'], existingKey: null,
        },
        {
          command: '/roadmap', description: 'Reuse the existing roadmap obligation.', repo: 'daily-logger', target: 'existing target', outcome: 'existing outcome', goal: 'Reliable article action custody',
          goalCitations: [{ sourceId: 'goal', quote: 'reliable article action custody' }], factCitations: [{ sourceId: 'evidence', quote: 'existing obligation' }],
          doneWhen: 'The existing owner records the next checkpoint.', gates: ['Retain the existing owner gate.'], existingKey: 'act-existing',
        },
      ],
      candidateDispositions: [
        { candidateId: first.registry.articles[0]!.draftCandidates![0]!.candidateId, kind: 'promote' as const, suggestionIndex: 0, reason: 'The current sources support bounded new work.' },
        { candidateId: first.registry.articles[0]!.draftCandidates![1]!.candidateId, kind: 'reject' as const, reason: 'The producer claim is unsupported.', citations: [{ sourceId: 'evidence', quote: 'bounded evidence path' }] },
        { candidateId: first.registry.articles[0]!.draftCandidates![2]!.candidateId, kind: 'map-existing' as const, suggestionIndex: 1, actionKey: 'act-existing', reason: 'The candidate is the existing obligation.' },
        { candidateId: first.registry.articles[0]!.draftCandidates![3]!.candidateId, kind: 'verified-closure' as const, actionKey: null, reason: 'Current owner evidence says the reviewed work is complete.', citations: [{ sourceId: 'evidence', quote: 'reviewed work is already complete' }] },
      ],
      closingOptions: [],
    }
    const verification = {
      changes: [],
      suggestions: [
        { candidateIndex: 0, verdict: 'pass' as const, reason: 'The new work is supported.', existingKey: null },
        { candidateIndex: 1, verdict: 'pass' as const, reason: 'The existing identity is exact.', existingKey: 'act-existing' },
      ],
      candidateDispositions: proposal.candidateDispositions.map(disposition => ({ candidateId: disposition.candidateId, verdict: 'pass' as const, reason: 'The disposition is source-backed and preserves authority.' })),
      closingOptions: [],
    }
    const incompleteProposal = { ...proposal, candidateDispositions: proposal.candidateDispositions.slice(0, -1) }
    const incompleteVerification = { ...verification, candidateDispositions: verification.candidateDispositions.slice(0, -1) }
    await expect(reviewArticleActions({
      cycle: generationActionCycle(),
      registry: first.registry,
      articleStatuses: statuses,
      articleDate: date,
      markdown: first.markdown,
      feedback: '',
      sources,
      agents: { propose: async () => incompleteProposal, verify: async () => incompleteVerification },
    })).rejects.toThrow('Every awaiting initial draft candidate requires exactly one disposition')
    const unrelatedPromotion = structuredClone(proposal)
    unrelatedPromotion.suggestions[0]!.command = '/roadmap'
    unrelatedPromotion.suggestions[0]!.description = 'Plan an unrelated migration.'
    await expect(reviewArticleActions({ cycle: generationActionCycle(), registry: first.registry, articleStatuses: statuses, articleDate: date, markdown: first.markdown, feedback: '', sources, agents: { propose: async () => unrelatedPromotion, verify: async () => verification } })).rejects.toThrow(/does not match the captured candidate/i)
    const unrelatedMap = structuredClone(proposal)
    unrelatedMap.suggestions[1]!.description = 'Plan unrelated roadmap cleanup.'
    await expect(reviewArticleActions({ cycle: generationActionCycle(), registry: first.registry, articleStatuses: statuses, articleDate: date, markdown: first.markdown, feedback: '', sources, agents: { propose: async () => unrelatedMap, verify: async () => verification } })).rejects.toThrow(/does not match the captured candidate/i)
    const separateSuggestion = structuredClone(proposal)
    separateSuggestion.suggestions[0]!.command = '/roadmap'
    separateSuggestion.suggestions[0]!.description = 'Plan an unrelated migration.'
    separateSuggestion.candidateDispositions[0] = { candidateId: proposal.candidateDispositions[0]!.candidateId, kind: 'reject', reason: 'The original candidate is not supported as written.', citations: [{ sourceId: 'evidence', quote: 'bounded evidence path' }] }
    const separated = await reviewArticleActions({ cycle: generationActionCycle(), registry: first.registry, articleStatuses: statuses, articleDate: date, markdown: first.markdown, feedback: '', sources, agents: { propose: async () => separateSuggestion, verify: async () => verification } })
    expect(separated.registry.articles[0]?.draftCandidates?.[0]?.review.state).toBe('rejected')
    expect(separated.registry.records.find(record => record.origin === 'suggested')?.original).toMatchObject({ command: '/roadmap', description: 'Plan an unrelated migration.' })
    const result = await reviewArticleActions({
      cycle: generationActionCycle(),
      registry: first.registry,
      articleStatuses: statuses,
      articleDate: date,
      markdown: first.markdown,
      feedback: '',
      sources,
      agents: { propose: async () => proposal, verify: async () => verification },
    })
    const snapshot = result.registry.articles.find(article => article.date === date)
    expect(snapshot?.draftCandidates?.map(candidate => candidate.review.state)).toEqual(['promoted', 'rejected', 'mapped-existing', 'verified-closure'])
    expect(snapshot?.draftCandidates?.[0].review).toMatchObject({ state: 'promoted' })
    expect(snapshot?.draftCandidates?.[2].review).toMatchObject({ state: 'mapped-existing', actionKey: 'act-existing' })
    expect(result.registry.records.filter(record => record.origin === 'suggested')).toHaveLength(1)
    const api = articleActionCard(result.registry, date, statuses)
    expect(api?.draftCandidates).toEqual(snapshot?.draftCandidates)
    expect(JSON.stringify(api)).toContain('verified-closure')
    expect(result.markdown).toContain('How draft suggestions were handled')
    expect(result.markdown).toContain('Mapped to existing action')
    expect(renderArticleActions(result.markdown, result.registry, date, statuses)).toBe(result.markdown)
    const tamperedAssociation = structuredClone(result.registry)
    tamperedAssociation.articles[0]!.draftCandidateEvidence!.provenance.decision = 'Substituted after the verified verdict.'
    expect(() => renderArticleActions(result.markdown, tamperedAssociation, date, statuses)).toThrow(/state is stale/i)
    const cached = await reviewArticleActions({ cycle: generationActionCycle(), registry: result.registry, articleStatuses: statuses, articleDate: date,
      markdown: result.markdown, feedback: '', sources, agents: { propose: async () => { throw new Error('cached retry called proposer') }, verify: async () => { throw new Error('cached retry called verifier') } } })
    expect(cached.cached).toBe(true)
    await expect(reviewArticleActions({ cycle: revisionActionCycle('new-explicit-cycle'), registry: result.registry, articleStatuses: statuses, articleDate: date,
      markdown: result.markdown, feedback: '', sources, agents: { propose: async () => { throw new Error('stale plan called proposer') }, verify: async () => { throw new Error('stale plan called verifier') } } }))
      .rejects.toThrow(/stale or foreign/i)
    const root = mkdtempSync(join(tmpdir(), 'candidate-custody-transition-'))
    try {
      writeActionStore(root, first.registry)
      writeActionRegistry(root, result.registry, registryRevision(first.registry))
      expect(readActionRegistry(root).articles[0]?.draftCandidates?.map(candidate => candidate.review.state)).toEqual(['promoted', 'rejected', 'mapped-existing', 'verified-closure'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
