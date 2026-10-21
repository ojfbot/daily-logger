import { expect, it, vi } from 'vitest'
import {
  ActionRegistrySchema,
  actionStateDigest,
  managedArticleDigest,
  normalizeWorkKey,
  renderArticleActions,
  sha256,
  type ActionRegistry,
  type DraftCandidateEvidenceRequirements,
} from '../action-registry.js'
import { actionEvidenceScope, deriveActionReviewOutput, draftCandidateEvidenceBinding, prepareConservativeDraftCandidateEvidence, selectActionEvidence } from '../action-evidence-selection.js'
import { ActionEvidenceRequestError } from '../action-evidence-retrieval.js'
import { ACTION_REVIEW_PROMPT_VERSION, revisionActionCycle } from '../action-review-cycle.js'
import { pendingActionReview, reviewProducedDraftActions } from '../review-actions.js'

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
    history: [],
  })
  const snapshot = registry.articles.find(article => article.date === articleDate)!
  snapshot.review = { state: 'verified' }
  snapshot.actionKeys = ['act-2030-01-01-promoted']
  snapshot.verification.proposalSha256 = 'e'.repeat(64)
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
})
