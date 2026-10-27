import { reviewArticleActions, reviewDraftActions } from './evidence-view-fixtures.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const { github } = vi.hoisted(() => ({ github: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: github }))
import { acceptedActionState, ActionRegistrySchema, ActionSourceSchema, captureDraftActionCandidates, DraftCandidateEvidenceRequirementsSchema, managedArticleDigest, normalizeWorkKey, readActionRegistry, readArticleStatuses, registryRevision, sha256, writeActionRegistry, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { writeActionStore } from './action-store-fixture.js'
import { ACTION_EVIDENCE_SELECTION_VERSION, actionEvidenceScope, actionReviewIndex, canonicalActionSources, COVERAGE_SOURCE, draftCandidateEvidenceBinding, prepareConservativeDraftCandidateEvidence, selectActionEvidence } from '../action-evidence-selection.js'
import { ActionEvidenceRequestError, actionEvidenceCaseDigest } from '../action-evidence-retrieval.js'
import { generationActionCycle, revisionActionCycle } from '../action-review-cycle.js'
import { collectActionSources, type ActionVerification } from '../review-actions.js'
import { stampOutcome } from '../stamp-outcome.js'
import { ActionSourceCollection, PreparedActionEvidenceView, captureGithubActionSource } from '../action-evidence-view.js'

const date = '2030-01-01'
const empty = () => ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
const markdown = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\n${Array.from({ length: 10 }, (_, i) => `https://github.com/ojfbot/daily-logger/pull/${i + 1}`).join('\n')}\n## What's next\nReview daily-logger #385 and daily-logger #386.\n`
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks(); github.mockReset() })

function fixture(options: { markdown?: string; feedback?: string; acceptedPreview?: boolean; registry?: ActionRegistry; articleStatuses?: ReadonlyMap<string, string>; compact?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'action-selection-')); roots.push(root)
  const ownerGate = 'OWNER GATE: human visual acceptance is required before merge.'
  const completion = 'OWNER DELIVERY: the human accepted the visual preview and verified every preview acceptance check.'
  const middle = Array.from({ length: options.compact ? 0 : 201 }, (_, i) => ({ author_association: i === 100 || i === 200 && options.acceptedPreview ? 'OWNER' : 'NONE',
    body: i === 100 ? ownerGate : i === 200 && options.acceptedPreview ? completion : `Comment ${i}: ${'背景🙂 '.repeat(15)}` }))
  github.mockImplementation((_command, args: string[], options: { timeout: number }) => {
    expect(args.slice(0, 3)).toEqual(['api', '--paginate', '--slurp'])
    expect(options.timeout).toBeGreaterThan(0); expect(options.timeout).toBeLessThanOrEqual(10000)
    const endpoint = args.at(-1) ?? ''
    if (endpoint.includes('/contents/')) return JSON.stringify([{ type: 'file', sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from('Goal: reliable evidence-backed queue and article decisions.').toString('base64') }])
    if (/\/issues\/\d+$/.test(endpoint)) return JSON.stringify([{ state: 'open', author_association: 'OWNER', body: 'The exact obligation remains open.' }])
    if (endpoint.includes('/comments')) return JSON.stringify([middle])
    throw new Error(`Unexpected fake GitHub endpoint: ${endpoint}`)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const sources = collectActionSources({ repoRoot: root, registry: options.registry ?? empty(), articleStatuses: options.articleStatuses, markdown: options.markdown ?? markdown, feedback: options.feedback ?? '' })
  return { root, sources, ownerGate, completion }
}
function input(sources: ActionSource[]) { return { registry: empty(), articleDate: date, cycle: revisionActionCycle('offline-source-selection-control'), articleStatuses: new Map([[date, 'draft']]), markdown, feedback: '', sources } }

function candidateEvidenceFixture() {
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nNo reader-facing candidate verdict.\n`
  const cycle = revisionActionCycle('candidate-evidence-contract')
  const draftContext = { kind: 'retained' as const, markdown: 'Candidate one requires daily-logger #407. Candidate two requires core #561 with owner core #307 and ruling core #560. Delivered history daily-logger #385 remains context.' }
  const draftCandidates = captureDraftActionCandidates([
    { command: '/merge daily-logger#407', description: 'Review the exact merge target.', repo: 'daily-logger', status: 'open', sourceDate: date },
    { command: '/owner-gate core#561', description: 'Ask the recorded owner for a disposition.', repo: 'core', status: 'open', sourceDate: date },
  ])
  const articleDigest = managedArticleDigest(article)
  const roundId = '5'.repeat(64)
  const stateDigest = '6'.repeat(64)
  const draftCandidateEvidence = {
    version: 'draft-candidate-evidence-v2' as const,
    provenance: { kind: 'coordinator' as const, identity: 'fixture-coordinator', decision: 'Approve the explicit per-candidate evidence association fixture.' },
    articleDate: date,
    articleDigest,
    reviewCycle: cycle,
    draftContextSha256: sha256(JSON.stringify(draftContext)),
    candidatePayloadsSha256: sha256(JSON.stringify(draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload })))),
    feedbackSha256: sha256(''), articleStatusesSha256: '0'.repeat(64), canonicalIndexSha256: '0'.repeat(64), inputActionKeys: [],
    actionStateSha256: sha256(JSON.stringify([])),
    candidates: [
      { candidateId: draftCandidates[0].candidateId, payloadSha256: sha256(JSON.stringify(draftCandidates[0].payload)), references: [
        { classification: 'required' as const, reference: 'daily-logger#407', role: 'target' as const, reason: 'Exact immutable candidate target.' },
      ], actionRelations: [] },
      { candidateId: draftCandidates[1].candidateId, payloadSha256: sha256(JSON.stringify(draftCandidates[1].payload)), references: [
        { classification: 'required' as const, reference: 'core#561', role: 'target' as const, reason: 'Exact immutable candidate target.' },
        { classification: 'required' as const, reference: 'core#307', role: 'owner' as const, reason: 'Recorded initiative owner.' },
        { classification: 'required' as const, reference: 'core#560', role: 'gate' as const, reason: 'Recorded owner ruling.' },
      ], actionRelations: [] },
    ],
    unassignedReferences: [{ classification: 'context' as const, reference: 'daily-logger#385', reason: 'Delivered prior-day checkpoint history.' }],
  }
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'pending', reason: 'Independent review is pending.' }, articleDigest, roundId, reviewCycle: cycle,
    actionKeys: [], draftCandidates, draftCandidateEvidence, draftContext, stateDigest,
    verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'action-review-pending-v5-draft-candidate-custody', proposalSha256: '7'.repeat(64), verdicts: [] },
    sources: [], rejected: [],
  })
  const parsed = ActionRegistrySchema.parse(registry)
  Object.assign(parsed.articles[0].draftCandidateEvidence!, draftCandidateEvidenceBinding({ registry: parsed, articleDate: date, cycle, markdown: article, feedback: '' }))
  return { article, cycle, draftContext, draftCandidates, draftCandidateEvidence: parsed.articles[0].draftCandidateEvidence!, registry: ActionRegistrySchema.parse(parsed) }
}

function singleCandidateEvidenceFixture(input: { command: string; description: string; repo: string; context: string; references: Array<{ reference: string; role: 'target' | 'lifecycle' | 'owner' | 'gate' | 'counterevidence' }> }) {
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nNo reader-facing candidate verdict.\n`
  const cycle = revisionActionCycle('candidate-target-normalization')
  const draftContext = { kind: 'retained' as const, markdown: input.context }
  const draftCandidates = captureDraftActionCandidates([{ command: input.command, description: input.description, repo: input.repo, status: 'open', sourceDate: date }])
  const articleDigest = managedArticleDigest(article)
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'pending', reason: 'Independent review is pending.' }, articleDigest, roundId: '8'.repeat(64), reviewCycle: cycle,
    actionKeys: [], draftCandidates,
    draftCandidateEvidence: {
      version: 'draft-candidate-evidence-v2', provenance: { kind: 'independent-reviewer', identity: 'fixture-reviewer', decision: 'Classify the exact immutable candidate sources.' },
      articleDate: date, articleDigest, reviewCycle: cycle, draftContextSha256: sha256(JSON.stringify(draftContext)),
      candidatePayloadsSha256: sha256(JSON.stringify(draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload })))),
      feedbackSha256: sha256(''), articleStatusesSha256: '0'.repeat(64), canonicalIndexSha256: '0'.repeat(64), inputActionKeys: [],
      actionStateSha256: sha256(JSON.stringify([])), candidates: [{ candidateId: draftCandidates[0].candidateId, payloadSha256: sha256(JSON.stringify(draftCandidates[0].payload)),
        references: input.references.map(reference => ({ classification: 'required' as const, ...reference, reason: `Required ${reference.role} evidence.` })), actionRelations: [] }], unassignedReferences: [],
    },
    draftContext, stateDigest: '9'.repeat(64), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'action-review-pending-v5-draft-candidate-custody', proposalSha256: 'a'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const parsed = ActionRegistrySchema.parse(registry)
  Object.assign(parsed.articles[0].draftCandidateEvidence!, draftCandidateEvidenceBinding({ registry: parsed, articleDate: date, cycle, markdown: article, feedback: '' }))
  return { article, cycle, registry: ActionRegistrySchema.parse(parsed) }
}

function canonicalRecord(key: string, reference: string, gateReference: string): ActionRegistry['records'][number] {
  return {
    key,
    original: { id: key, command: '/investigate', description: `Investigate ${reference}.`, repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported', workKey: `core|${key}|investigate`, state: 'open', introducedBy: '2029-12-31',
    includeInIndex: true, inclusionOverride: null, goal: `Resolve the owner question at ${reference}.`,
    doneWhen: `The owner records a decision at ${reference}.`, gates: [`Preserve the separate gate at ${gateReference}.`], history: [],
  }
}

it('uses one authoritative article-status premise across state, digest, scope, collection, writing, and cache', async () => {
  // Premise census: an action is accepted-terminal only when both the registry snapshot and
  // the authoritative article status say that its matching decision round was accepted.
  const priorDate = '2029-12-31'
  const priorRound = 'd'.repeat(64)
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nA bounded status-authority census.\n`
  const rows = [
    { registryStatus: 'draft', authoritativeStatus: 'draft', expectedState: 'open' },
    { registryStatus: 'accepted', authoritativeStatus: 'draft', expectedState: 'open' },
    { registryStatus: 'draft', authoritativeStatus: 'accepted', expectedState: 'open' },
    { registryStatus: 'accepted', authoritativeStatus: 'accepted', expectedState: 'dismissed' },
  ] as const
  const digests: string[] = []

  for (const row of rows) {
    github.mockClear()
    const registry = empty()
    registry.records.push({
      key: 'act-owner',
      original: { id: 'act-owner', command: '/review', description: 'Review daily-logger #386.', repo: 'daily-logger', status: 'open', sourceDate: priorDate },
      origin: 'imported', workKey: 'daily-logger|386|review', state: 'dismissed', introducedBy: priorDate,
      includeInIndex: true, inclusionOverride: null, goal: 'Keep the owner decision explicit.', doneWhen: 'The owner records a disposition.', gates: [],
      history: [{ roundId: priorRound, articleDate: priorDate, state: 'dismissed', description: 'Dismiss act-owner.', reason: 'The owner closed the review.', citations: [], verifiedBy: 'fixture', verificationReason: 'Fixture decision.' }],
    })
    registry.articles.push({
      date: priorDate, status: row.registryStatus, review: { state: 'verified' }, articleDigest: '1'.repeat(64), roundId: priorRound,
      actionKeys: ['act-owner'], stateDigest: '2'.repeat(64),
      verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: '3'.repeat(64), verdicts: [] },
      sources: [], rejected: [],
    })
    const articleStatuses = new Map([[priorDate, row.authoritativeStatus], [date, 'draft']])
    const state = acceptedActionState(registry.records[0], articleStatuses, registry)
    expect(state).toBe(row.expectedState)

    const digest = actionEvidenceCaseDigest({ registry, articleStatuses, articleDate: date, cycle: revisionActionCycle('status-authority-census'), markdown: article, feedback: 'Review act-owner.', actionKeys: ['act-owner'] })
    digests.push(digest)
    const scope = actionEvidenceScope({ registry, articleStatuses, articleDate: date, markdown: article, feedback: 'Review act-owner.' })
    const terminal = row.expectedState === 'dismissed'
    expect(scope).toMatchObject(terminal
      ? { reviewActionKeys: [], ambiguousTerminalActionKeys: ['act-owner'] }
      : { reviewActionKeys: ['act-owner'], ambiguousTerminalActionKeys: [] })

    const { sources } = fixture({ registry, articleStatuses, markdown: article, feedback: 'Review act-owner.', compact: true })
    const issueCalls = github.mock.calls.filter(([, args]) => /\/issues\/386$/.test(args.at(-1) ?? ''))
    expect(issueCalls).toHaveLength(terminal ? 0 : 1)
    expect(sources.some(source => source.id.startsWith('github:daily-logger#386@'))).toBe(!terminal)

    const propose = vi.fn(async () => {
      const source = sources.find(candidate => candidate.id.startsWith('github:daily-logger#386@'))
      if (!source) throw new Error('Missing current issue evidence')
      const quote = source.content.split('\n')[0]
      return { changes: [{ actionKey: 'act-owner', state: 'open' as const, description: 'Keep act-owner open for the current owner decision.', reason: 'Current issue evidence retains the owner gate.', citations: [{ sourceId: source.id, quote }] }], suggestions: [] }
    })
    const verify = vi.fn(async () => ({ changes: [{ actionKey: 'act-owner', verdict: 'pass' as const, reason: 'The exact current issue and owner gate were checked.' }], suggestions: [] }))
    const reviewed = await reviewDraftActions({
      registry, articleStatuses, articleDate: date, cycle: revisionActionCycle('status-authority-census'), markdown: article,
      feedback: 'Review act-owner.', sources, agents: { identity: { proposer: 'matrix', verifier: 'matrix' }, propose, verify },
    })
    if (terminal) {
      expect(reviewed.registry.articles.find(snapshot => snapshot.date === date)?.review.state).toBe('pending')
      expect(propose).not.toHaveBeenCalled()
      expect(verify).not.toHaveBeenCalled()
    } else {
      expect(reviewed.registry.articles.find(snapshot => snapshot.date === date)?.review.state).toBe('verified')
      expect(propose).toHaveBeenCalledOnce()
      expect(verify).toHaveBeenCalledOnce()
      const retryPropose = vi.fn(async () => { throw new Error('A cache hit must not call the proposer') })
      const retryVerify = vi.fn(async () => { throw new Error('A cache hit must not call the verifier') })
      const retry = await reviewDraftActions({
        registry: reviewed.registry, articleStatuses, articleDate: date, cycle: revisionActionCycle('status-authority-census'), markdown: reviewed.markdown,
        feedback: 'Review act-owner.', sources, agents: { identity: { proposer: 'matrix', verifier: 'matrix' }, propose: retryPropose, verify: retryVerify },
      })
      expect(retry.cached).toBe(true)
      expect(retryPropose).not.toHaveBeenCalled()
      expect(retryVerify).not.toHaveBeenCalled()
    }
  }

  expect(new Set(digests.slice(0, 3))).toHaveLength(1)
  expect(digests[3]).not.toBe(digests[0])
})

it('does not treat a negative retained terminal-action mention as reassessment intent', () => {
  const priorDate = '2029-12-31'
  const priorRound = 'd'.repeat(64)
  const registry = empty()
  registry.records.push({
    key: 'act-terminal',
    original: { id: 'act-terminal', command: '/validate', description: 'Validate the prior result.', repo: 'daily-logger', status: 'open', sourceDate: priorDate },
    origin: 'imported', workKey: 'daily-logger|terminal|validate', state: 'done', introducedBy: priorDate,
    includeInIndex: true, inclusionOverride: null, goal: 'Validate once.', doneWhen: 'Validation is recorded.', gates: [],
    history: [{ roundId: priorRound, articleDate: priorDate, state: 'done', description: 'Validation completed.', reason: 'The accepted review recorded completion.', citations: [], verifiedBy: 'fixture', verificationReason: 'Fixture decision.' }],
  })
  registry.articles.push({
    date: priorDate, status: 'accepted', review: { state: 'verified' }, articleDigest: '1'.repeat(64), roundId: priorRound,
    actionKeys: ['act-terminal'], stateDigest: '2'.repeat(64),
    verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: '3'.repeat(64), verdicts: [] },
    sources: [], rejected: [],
  }, {
    date, status: 'draft', review: { state: 'pending', reason: 'Independent review is pending.' }, articleDigest: '4'.repeat(64), roundId: '5'.repeat(64),
    reviewCycle: revisionActionCycle('negative-terminal-mention'), actionKeys: [],
    draftContext: { kind: 'retained', markdown: 'Do not resurrect completed `act-terminal` from this historical note.' },
    stateDigest: '6'.repeat(64), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'action-review-pending-v5-draft-candidate-custody', proposalSha256: '7'.repeat(64), verdicts: [] },
    sources: [], rejected: [],
  })

  const scope = actionEvidenceScope({ registry, articleStatuses: new Map([[priorDate, 'accepted'], [date, 'draft']]), articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '' })

  expect(scope.ambiguousTerminalActionKeys).toEqual([])
  expect(scope.reviewActionKeys).toEqual([])
})

it('fails pending when awaiting candidates have no explicit evidence associations', () => {
  const registry = empty()
  const draftCandidates = captureDraftActionCandidates([{ command: '/merge daily-logger#407', description: 'Review the exact merge target.', repo: 'daily-logger', status: 'open', sourceDate: date }])
  registry.articles.push({
    date, status: 'draft', review: { state: 'pending', reason: 'Independent review is pending.' }, articleDigest: '4'.repeat(64), roundId: '5'.repeat(64),
    reviewCycle: revisionActionCycle('missing-candidate-evidence'), actionKeys: [], draftCandidates,
    draftContext: { kind: 'retained', markdown: 'Candidate context references daily-logger #407 and delivered history daily-logger #385.' },
    stateDigest: '6'.repeat(64), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'action-review-pending-v5-draft-candidate-custody', proposalSha256: '7'.repeat(64), verdicts: [] },
    sources: [], rejected: [],
  })

  expect(() => actionEvidenceScope({ registry, articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '' }))
    .toThrow(/structured.*candidate.*evidence/i)
})

it('distinguishes legacy unknown candidate custody from an explicitly empty captured list', () => {
  const make = (draftCandidates: ReturnType<typeof captureDraftActionCandidates> | undefined) => {
    const registry = empty()
    registry.articles.push({
      date, status: 'draft', review: { state: 'pending', reason: 'Independent review is pending.' }, articleDigest: '4'.repeat(64), roundId: '5'.repeat(64),
      reviewCycle: revisionActionCycle('candidate-custody-state'), actionKeys: [], ...(draftCandidates === undefined ? {} : { draftCandidates }),
      draftContext: { kind: 'retained', markdown: `Candidate ${'a'.repeat(64)} remains in historical prose.` },
      stateDigest: '6'.repeat(64), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'legacy-fixture', proposalSha256: '7'.repeat(64), verdicts: [] }, sources: [], rejected: [],
    })
    return registry
  }
  expect(() => actionEvidenceScope({ registry: make(undefined), articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '' })).toThrow(/custody is unknown/i)
  expect(() => actionEvidenceScope({ registry: make([]), articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '' })).not.toThrow()
})

it('uses explicit candidate associations for required evidence while retaining background in the audit census', () => {
  const { article, cycle, registry } = candidateEvidenceFixture()

  const scope = actionEvidenceScope({ registry, articleDate: date, cycle, markdown: article, feedback: '' })

  expect([...scope.refs].sort()).toEqual(['core#307', 'core#560', 'core#561', 'daily-logger#407'])
  expect([...scope.contextRefs]).toEqual(['daily-logger#385'])
  expect(scope.referenceRequirements).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: 'daily-logger#407', classification: 'required', source: `candidate:${registry.articles[0].draftCandidates?.[0].candidateId}` }),
    expect.objectContaining({ reference: 'daily-logger#385', classification: 'context', source: 'unassigned' }),
  ]))
})

it('prepares a source-bound conservative initial-generation map without claiming review authority or suppressing retained refs', () => {
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nNo verdict.\n## What's next\nRetain core #560 and daily-logger #385 until independent classification.\n`
  const draftCandidates = captureDraftActionCandidates([
    { command: '/merge daily-logger#407', description: 'Review the exact target.', repo: 'daily-logger', status: 'open', sourceDate: date },
  ])
  const cycle = generationActionCycle()
  const registry = empty()
  const requirements = prepareConservativeDraftCandidateEvidence({ registry, articleDate: date, cycle, markdown: article, draftCandidates })
  const scope = actionEvidenceScope({ registry, articleDate: date, cycle, markdown: article, feedback: '', draftCandidates, draftCandidateEvidence: requirements })

  expect(requirements.provenance.kind).toBe('deterministic-default')
  expect(requirements.candidates[0].references).toMatchObject([{ classification: 'required', reference: 'daily-logger#407', role: 'target' }])
  expect(requirements.unassignedReferences).toEqual(expect.arrayContaining([
    expect.objectContaining({ classification: 'required', reference: 'core#560', role: 'retained-context' }),
    expect.objectContaining({ classification: 'required', reference: 'daily-logger#385', role: 'retained-context' }),
  ]))
  expect([...scope.refs].sort()).toEqual(['core#560', 'daily-logger#385', 'daily-logger#407'])
  expect([...scope.contextRefs]).toEqual([])

  const root = mkdtempSync(join(tmpdir(), 'initial-candidate-evidence-')); roots.push(root)
  github.mockImplementation((_command, args: string[]) => args.at(-1)?.includes('/comments')
    ? JSON.stringify([[]])
    : args.at(-1)?.includes('/issues/') ? JSON.stringify([{ state: 'open', body: 'Current primary evidence.' }]) : '[]')
  const sources = collectActionSources({ registry, repoRoot: root, articleStatuses: new Map([[date, 'draft']]),
    cycle, markdown: article, feedback: '', draftCandidates, draftCandidateEvidence: requirements })
  expect(sources.filter(source => source.kind === 'github').map(source => source.id.replace(/@[a-f0-9]{64}$/, '')).sort())
    .toEqual(['github:core#560', 'github:daily-logger#385', 'github:daily-logger#407'])
  expect(sources.some(source => source.id.startsWith('candidate-evidence-scope@'))).toBe(false)
})

it('scopes bounded-view obligations and questions to the candidate requirements for that source', () => {
  const prepared = candidateEvidenceFixture()
  try {
    selectActionEvidence({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '', sources: [] })
    throw new Error('Expected a missing-source request')
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    const request = (error as ActionEvidenceRequestError).request
    expect(request.sourceKey).toBe('github:core#307')
    expect(request.question).toContain('candidate:')
    expect(request.question).toContain('owner')
    expect(request.question).not.toContain('daily-logger#407')
    expect(request.obligations).toHaveLength(1)
  }
})

it('rejects candidate evidence maps that demote direct targets, omit candidates, drift, duplicate one association, or add foreign refs', () => {
  const fixture = candidateEvidenceFixture()
  const assertInvalid = (mutate: (registry: ActionRegistry) => void, expected: RegExp) => {
    const registry = structuredClone(fixture.registry)
    mutate(registry)
    expect(() => actionEvidenceScope({ registry, articleDate: date, cycle: fixture.cycle, markdown: fixture.article, feedback: '' })).toThrow(expected)
  }

  assertInvalid(registry => { registry.articles[0].draftCandidateEvidence!.candidates[0].references[0] = { classification: 'context', reference: 'daily-logger#407', reason: 'Attempted demotion.' } }, /direct candidate target/i)
  assertInvalid(registry => { registry.articles[0].draftCandidateEvidence!.candidates.pop() }, /every captured candidate/i)
  assertInvalid(registry => { registry.articles[0].draftCandidateEvidence!.draftContextSha256 = '0'.repeat(64) }, /stale or foreign/i)
  assertInvalid(registry => { registry.articles[0].draftCandidateEvidence!.candidates[1].references.push({ classification: 'context', reference: 'core#561', reason: 'Contradictory duplicate in one candidate association.' }) }, /duplicate/i)
  assertInvalid(registry => { registry.articles[0].draftCandidateEvidence!.unassignedReferences.push({ classification: 'context', reference: 'core#999', reason: 'Foreign reference.' }) }, /unknown or foreign/i)
})

it('preserves per-candidate classifications while taking the monotone required union for shared evidence', () => {
  const fixture = candidateEvidenceFixture()
  fixture.registry.articles[0].draftCandidateEvidence!.unassignedReferences.push({ classification: 'context', reference: 'core#561', reason: 'Background to the other candidate.' })

  const scope = actionEvidenceScope({ registry: fixture.registry, articleDate: date, cycle: fixture.cycle, markdown: fixture.article, feedback: '' })

  expect(scope.refs).toContain('core#561')
  expect(scope.contextRefs).not.toContain('core#561')
  expect(scope.referenceRequirements.filter(requirement => requirement.reference === 'core#561')).toEqual(expect.arrayContaining([
    expect.objectContaining({ classification: 'required' }),
    expect.objectContaining({ classification: 'context' }),
  ]))
})

it('collects every required candidate dependency before unrelated retained history', () => {
  const { article, cycle, registry } = candidateEvidenceFixture()

  fixture({ registry, markdown: article, compact: true })

  const discussionCalls = github.mock.calls.map(([, args]) => args.at(-1) ?? '').filter(endpoint => /\/issues\/\d+$/.test(endpoint))
  expect(discussionCalls).toEqual(expect.arrayContaining([
    'repos/ojfbot/daily-logger/issues/407',
    'repos/ojfbot/core/issues/307',
    'repos/ojfbot/core/issues/560',
    'repos/ojfbot/core/issues/561',
  ]))
  expect(discussionCalls).not.toContain('repos/ojfbot/daily-logger/issues/385')
  expect(actionEvidenceScope({ registry, articleDate: date, cycle, markdown: article, feedback: '' }).referenceRequirements)
    .toEqual(expect.arrayContaining([expect.objectContaining({ reference: 'daily-logger#385', classification: 'context' })]))
})

it('honors qualified cross-repo and URL targets, and resolves wayfinder shorthand only through one retained qualified identity', () => {
  const qualified = singleCandidateEvidenceFixture({
    command: '/review core#700', repo: 'daily-logger',
    description: 'Compare https://github.com/ojfbot/classic-space-venue/issues/4 with daily-logger#701.',
    context: 'Current sources are core #700, classic-space-venue #4, and daily-logger #701.',
    references: [
      { reference: 'core#700', role: 'target' },
      { reference: 'classic-space-venue#4', role: 'counterevidence' },
      { reference: 'daily-logger#701', role: 'lifecycle' },
    ],
  })
  expect([...actionEvidenceScope({ registry: qualified.registry, articleDate: date, cycle: qualified.cycle, markdown: qualified.article, feedback: '' }).refs].sort())
    .toEqual(['classic-space-venue#4', 'core#700', 'daily-logger#701'])

  const wayfinder = singleCandidateEvidenceFixture({ command: '/session wayfinder#543', repo: 'core', description: 'Review the retained object-model session.',
    context: 'The qualified target is core #543.', references: [{ reference: 'core#543', role: 'target' }] })
  expect(actionEvidenceScope({ registry: wayfinder.registry, articleDate: date, cycle: wayfinder.cycle, markdown: wayfinder.article, feedback: '' }).refs)
    .toContain('core#543')

  const ambiguous = structuredClone(wayfinder.registry)
  ambiguous.articles[0].draftContext = { kind: 'retained', markdown: 'Possible targets are core #543 and daily-logger #543.' }
  ambiguous.articles[0].draftCandidateEvidence!.draftContextSha256 = sha256(JSON.stringify(ambiguous.articles[0].draftContext))
  ambiguous.articles[0].draftCandidateEvidence!.unassignedReferences.push({ classification: 'context', reference: 'daily-logger#543', reason: 'Second qualified identity makes shorthand ambiguous.' })
  expect(() => actionEvidenceScope({ registry: ambiguous, articleDate: date, cycle: wayfinder.cycle, markdown: wayfinder.article, feedback: '' })).toThrow(/ambiguous candidate target/i)

  const ordinaryTicket = singleCandidateEvidenceFixture({ command: '/review', repo: 'core', description: 'Review ticket #543 without treating the word ticket as a repository namespace.',
    context: 'The qualified target is core #543.', references: [{ reference: 'core#543', role: 'target' }] })
  expect(actionEvidenceScope({ registry: ordinaryTicket.registry, articleDate: date, cycle: ordinaryTicket.cycle, markdown: ordinaryTicket.article, feedback: '' }).refs)
    .toContain('core#543')
})

it('rejects unreviewed aliases, foreign GitHub targets, and unknown qualified description references instead of dropping them', () => {
  const cases = [
    singleCandidateEvidenceFixture({ command: '/session unknown-repo#543', repo: 'core', description: 'Review the retained target.', context: 'The qualified retained target is core #543.', references: [{ reference: 'core#543', role: 'target' }] }),
    singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Compare https://github.com/foreign-org/core/issues/543.', context: 'The local target is core #543.', references: [{ reference: 'core#543', role: 'target' }] }),
    singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Compare https://github.example/ojfbot/core/issues/999.', context: 'The local target is core #543.', references: [{ reference: 'core#543', role: 'target' }] }),
    singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Compare mystery-repo#700 before review.', context: 'The local target is core #543.', references: [{ reference: 'core#543', role: 'target' }] }),
  ]
  for (const item of cases) {
    expect(() => actionEvidenceScope({ registry: item.registry, articleDate: date, cycle: item.cycle, markdown: item.article, feedback: '' }))
      .toThrow(/unsupported|foreign|qualified candidate reference/i)
  }
})

it('promotes every inherited canonical dependency behind a required candidate target without making it a review instruction', () => {
  const prepared = singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Review the exact target.',
    context: 'The target is core #543 and its inherited gate is core #999.', references: [{ reference: 'core#543', role: 'target' }] })
  prepared.registry.records.push(canonicalRecord('existing-owner', 'core #543', 'core #999'))
  const snapshot = prepared.registry.articles[0]
  snapshot.draftCandidateEvidence!.candidates[0]!.actionRelations.push({ actionKey: 'existing-owner', sourceReference: 'core#543', relation: 'same-work', reason: 'The reviewed association identifies the canonical owner record.' })
  snapshot.draftCandidateEvidence!.inputActionKeys = ['existing-owner']
  snapshot.draftCandidateEvidence!.unassignedReferences.push({ classification: 'context', reference: 'core#999', reason: 'Candidate metadata attempted to leave the canonical gate contextual.' })
  Object.assign(snapshot.draftCandidateEvidence!, draftCandidateEvidenceBinding({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' }))

  const scope = actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' })

  expect(scope.refs).toContain('core#999')
  expect(scope.contextRefs).not.toContain('core#999')
  expect(scope.reviewActionKeys).toEqual([])
  expect(scope.referenceRequirements).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: 'core#999', classification: 'required', source: 'canonical:existing-owner', role: 'gate' }),
  ]))
})

it('inherits duties from a frozen imported identity that exactly matches the immutable candidate payload', () => {
  const prepared = singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Review the exact target.',
    context: 'The target is core #543.', references: [{ reference: 'core#543', role: 'target' }] })
  const record: ActionRegistry['records'][number] = {
    key: 'legacy-imported-owner',
    original: { id: 'legacy-imported-owner', command: '/review core#543', description: 'Review the exact target.', repo: 'core', status: 'open', sourceDate: '2029-12-31' },
    origin: 'imported', workKey: normalizeWorkKey('core', '/review core#543', 'Review the exact target.'), state: 'open', introducedBy: '2029-12-31',
    includeInIndex: true, inclusionOverride: null, goal: 'Preserve the owner decision at core #543.',
    doneWhen: 'The owner records a disposition at core #543.', gates: ['Do not proceed before core #999 is resolved.'], history: [],
  }
  prepared.registry.records.push(record)
  expect(() => draftCandidateEvidenceBinding({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' }))
    .toThrow(/input identities/i)
  prepared.registry.articles[0].draftCandidateEvidence!.inputActionKeys = [record.key]
  Object.assign(prepared.registry.articles[0].draftCandidateEvidence!, draftCandidateEvidenceBinding({
    registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '',
  }))

  const scope = actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' })

  expect(prepared.registry.articles[0].draftCandidateEvidence?.inputActionKeys).toEqual([record.key])
  expect(scope.refs).toContain('core#999')
  expect(scope.referenceRequirements).toContainEqual(expect.objectContaining({ reference: 'core#999', source: `canonical:${record.key}`, role: 'gate' }))
})

it('does not attach an unrelated carried canonical action duties to a candidate source request', () => {
  const prepared = singleCandidateEvidenceFixture({ command: '/review core#543', repo: 'core', description: 'Review the exact target.',
    context: 'The candidate target is core #543.', references: [{ reference: 'core#543', role: 'target' }] })
  const unrelated = canonicalRecord('unrelated-700', 'core #700', 'core #701')
  prepared.registry.records.push(unrelated)
  prepared.registry.articles[0].actionKeys = [unrelated.key]
  Object.assign(prepared.registry.articles[0].draftCandidateEvidence!, draftCandidateEvidenceBinding({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' }))

  try {
    selectActionEvidence({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '', sources: [] })
    throw new Error('Expected a missing-source request')
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    const request = (error as ActionEvidenceRequestError).request
    expect(request.sourceKey).toBe('github:core#543')
    const unrelatedHashes = [
      ['goal', unrelated.goal],
      ['current-disposition', unrelated.original.description],
      ['done-when', unrelated.doneWhen],
      ['gate', unrelated.gates[0]],
    ].map(([kind, text]) => sha256(JSON.stringify({ actionKey: unrelated.key, kind, text })))
    expect(request.obligations).not.toEqual(expect.arrayContaining(unrelatedHashes))
  }
})

it('requires fresh candidate classification when feedback changes the bound evidence obligations', () => {
  const prepared = candidateEvidenceFixture()
  const base = actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' })
  const feedback = 'Inspect daily-logger #385 as current counterevidence.'

  expect(base.contextRefs).toContain('daily-logger#385')
  expect(() => actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback })).toThrow(/feedback.*review pending/i)
  const before = actionEvidenceCaseDigest({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '', actionKeys: ['article-feedback'] })
  const after = actionEvidenceCaseDigest({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback, actionKeys: ['article-feedback'] })
  expect(after).not.toBe(before)
})

it('invalidates prepared candidate evidence when a retained canonical gate becomes accepted', () => {
  const prepared = candidateEvidenceFixture()
  const priorDate = '2029-12-31'
  const priorRound = 'b'.repeat(64)
  prepared.registry.records.push({
    key: 'gate-core-307', original: { id: 'gate-core-307', command: '/owner-gate core#307', description: 'Resolve core #307.', repo: 'core', status: 'open', sourceDate: priorDate },
    origin: 'imported', workKey: 'core|307|owner', state: 'done', introducedBy: priorDate, includeInIndex: true, inclusionOverride: null,
    goal: 'Resolve core #307 ownership.', doneWhen: 'The owner accepts the gate.', gates: ['Owner acceptance remains required.'],
    history: [{ roundId: priorRound, articleDate: priorDate, state: 'done', description: 'Owner accepted the gate.', reason: 'Accepted owner record.', citations: [], verifiedBy: 'fixture', verificationReason: 'Fixture decision.' }],
  })
  prepared.registry.articles.push({
    date: priorDate, status: 'draft', review: { state: 'verified' }, articleDigest: 'c'.repeat(64), roundId: priorRound, actionKeys: ['gate-core-307'], stateDigest: 'd'.repeat(64),
    verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: 'e'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const initialBinding = draftCandidateEvidenceBinding({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article })
  const candidateSnapshot = prepared.registry.articles.find(article => article.date === date)!
  Object.assign(candidateSnapshot.draftCandidateEvidence!, initialBinding)
  candidateSnapshot.review = { state: 'verified' }
  expect(() => actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' })).not.toThrow()

  prepared.registry.articles.find(article => article.date === priorDate)!.status = 'accepted'

  expect(() => actionEvidenceScope({ registry: prepared.registry, articleDate: date, cycle: prepared.cycle, markdown: prepared.article, feedback: '' })).toThrow(/stale or foreign/i)
})

it('revalidates a carried closing checkpoint even after authored next-step prose changes', () => {
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'verified' }, articleDigest: 'd'.repeat(64), roundId: 'e'.repeat(64), actionKeys: [],
    closing: { kind: 'options', options: [{ kind: 'checkpoint', title: 'Review the current pilot', target: 'https://github.com/ojfbot/daily-logger/pull/385', entryPoint: 'Open the current PR.', context: 'The prior review retained a human gate.', whyNow: 'The gate is unresolved.', outcome: 'Close the pilot evidence gap.', nextCheck: 'Record the visual verdict.', factCitations: [{ sourceId: 'github:daily-logger#385@' + 'a'.repeat(64), quote: 'CURRENT API STATE daily-logger#385: state=open.' }], goalCitations: [{ sourceId: 'github:daily-logger#385@' + 'a'.repeat(64), quote: 'Human visual acceptance remains required.' }] }] },
    stateDigest: sha256('empty'), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'legacy-closing-fixture', proposalSha256: 'f'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const revised = `---\ndate: ${date}\nstatus: draft\n---\n## What's next\nThe authored prose no longer repeats a PR number.\n`

  expect(actionEvidenceScope({ registry, articleDate: date, markdown: revised, feedback: '' }).refs).toEqual(new Set(['daily-logger#385']))
})

it('recollects and selects all three maintained targets after one becomes unresolved and review goes pending', async () => {
  const targets = [900, 901, 902].map(number => `https://github.com/ojfbot/daily-logger/issues/${number}`)
  const goal = 'Maintain the source-supported existing checkpoint shortlist.'
  const evidence: ActionSource[] = [
    ...targets.map((target, index) => {
      const number = 900 + index
      const content = `CURRENT API STATE daily-logger#${number}: state=open; head=not-a-PR; merged_at=none.`
      return { id: `github:daily-logger#${number}`, kind: 'github' as const, locator: target, content, trustedContent: [content] }
    }),
    { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: goal },
  ]
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## Roadmap pulse\nThree existing obligations need current review.\n`
  const statuses = new Map([[date, 'draft']])
  const cycle = revisionActionCycle('three-maintained-targets')
  const options = targets.map((target, index) => ({
    kind: 'checkpoint' as const,
    target,
    title: `Review existing checkpoint ${900 + index}`,
    benefit: 'Keep an existing obligation grounded in current evidence.',
    start: 'Review the current issue.',
    entryPoint: `Begin at checkpoint ${900 + index}.`,
    context: 'This is an existing open checkpoint.',
    whyNow: 'Current owner evidence retains the checkpoint.',
    outcome: `Return the supported disposition for checkpoint ${900 + index}.`,
    nextCheck: 'Return the current owner decision.',
    factCitations: [{ sourceId: `github:daily-logger#${900 + index}`, quote: `CURRENT API STATE daily-logger#${900 + index}: state=open; head=not-a-PR; merged_at=none.` }],
    goalCitations: [{ sourceId: 'goal', quote: goal }],
  }))
  const pass = [0, 1, 2].map(optionIndex => ({ optionIndex, verdict: 'pass' as const, reason: 'Current exact facts and goal support this checkpoint.' }))
  const base = { cycle, articleDate: date, articleStatuses: statuses, markdown: article, sources: evidence }
  const ready = await reviewArticleActions({
    ...base,
    registry: empty(),
    feedback: targets.join('\n'),
    agents: { propose: async () => ({ changes: [], suggestions: [], closingOptions: options }), verify: async () => ({ changes: [], suggestions: [], closingOptions: pass }) },
  })
  const partialVerdicts: NonNullable<ActionVerification['closingOptions']> = [...pass]
  partialVerdicts[0] = { optionIndex: 0, verdict: 'hold', reason: 'This checkpoint needs another independent review.' }
  const partial = await reviewArticleActions({
    ...base,
    registry: ready.registry,
    markdown: ready.markdown,
    feedback: 'Recheck the maintained shortlist.',
    agents: { propose: async () => ({ changes: [], suggestions: [], closingOptions: options }), verify: async () => ({ changes: [], suggestions: [], closingOptions: partialVerdicts }) },
  })
  const partialClosing = partial.registry.articles[0].closing
  if (partialClosing?.kind !== 'needs-evidence') throw new Error('Missing partial maintained shortlist fixture')
  expect(partialClosing.unresolvedRecommendations).toMatchObject([{ target: targets[0] }])
  const pending = await reviewDraftActions({
    ...base,
    registry: partial.registry,
    markdown: partial.markdown,
    feedback: 'Retry after an injected provider failure.',
    agents: { propose: async () => { throw new Error('injected provider timeout') }, verify: async () => ({}) },
  })

  const scoped = actionEvidenceScope({ registry: pending.registry, articleDate: date, markdown: pending.markdown, feedback: '' })
  expect([...scoped.refs].sort()).toEqual(['daily-logger#900', 'daily-logger#901', 'daily-logger#902'])
  const selected = selectActionEvidence({ registry: pending.registry, articleDate: date, markdown: pending.markdown, feedback: '', sources: evidence })
  expect(selected.receipt.requiredReferences).toEqual(['daily-logger#900', 'daily-logger#901', 'daily-logger#902'])
  expect(selected.sources.filter(source => source.kind === 'github').map(source => source.locator).sort()).toEqual([...targets].sort())

  const { sources: recollected } = fixture({ registry: pending.registry, markdown: pending.markdown, compact: true })
  expect(targets.every(target => recollected.some(source => source.locator === target))).toBe(true)
})

it('recollects references from retained draft context after visible prose is normalized', () => {
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'verified' }, articleDigest: 'd'.repeat(64), roundId: 'e'.repeat(64), actionKeys: [],
    draftContext: { kind: 'retained', markdown: 'Review daily-logger #385 before changing the owner gate.' },
    closing: { kind: 'needs-evidence', question: 'Which option is supported?', missingEvidence: 'No option passed.', nextCheck: 'Recheck primary evidence.', recommendations: [] },
    stateDigest: sha256('empty'), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'legacy-closing-fixture', proposalSha256: 'f'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const normalized = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nNo reader-facing action list.\n`

  fixture({ registry, markdown: normalized, compact: true })

  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/385'))).toBe(true)
})

it.each(['feedback', 'next-actions'])('follows an older action explicitly named in %s through collector, whole-source selection and both closure prompts', async location => {
  const key = 'old-owned-action'
  const feedback = location === 'feedback' ? `Reconcile ${key} against its recorded completion condition; retain every owner gate.` : ''
  const shipments = Array.from({ length: 20 }, (_, i) => `https://github.com/ojfbot/daily-logger/pull/${i + 1}`).join('\n')
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\n${shipments}\n## What's next\n${location === 'next-actions' ? `Reconcile ${key}.` : ''}\n`
  const registry = empty()
  const original = { id: key, command: '/review', description: 'Review the visual preview for daily-logger #385.', repo: 'daily-logger', status: 'open' as const, sourceDate: '2029-12-31' }
  registry.records.push({ key, original, origin: 'imported', workKey: 'preview-obligation', state: 'open', introducedBy: original.sourceDate,
    includeInIndex: true, inclusionOverride: null, goal: 'A human accepts the preview.', doneWhen: 'The human accepted the visual preview and verified every preview acceptance check.', gates: ['Human visual acceptance is required.'], history: [] })
  registry.records.push({ ...structuredClone(registry.records[0]), key: 'context-neighbor', original: { ...original, id: 'context-neighbor' },
    workKey: 'other-obligation', goal: 'Separate contextual work.', gates: ['Also inspect daily-logger #999.'] })
  const { sources, ownerGate, completion } = fixture({ registry, markdown: article, feedback, acceptedPreview: true })
  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/385'))).toBe(true)
  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/999'))).toBe(false)
  expect(sources.filter(source => source.kind === 'github')).toHaveLength(12)
  const reviewInput = { ...input(sources), registry, markdown: article, feedback }
  const selected = selectActionEvidence(reviewInput)
  expect(selected.receipt.requiredReferences).toEqual(['daily-logger#385'])
  expect(selected.expandedActionKeys).toContain('context-neighbor')
  const prompts: string[] = []
  const result = await reviewArticleActions({ ...reviewInput, agents: {
    propose: async (prompt, modelSources) => {
      prompts.push(prompt)
      const source = modelSources.rawSources(true).find(source => source.locator === 'https://github.com/ojfbot/daily-logger/issues/385')
      if (!source) throw new Error('Named older action lost its collected dependency')
      expect(source.content).toContain(ownerGate)
      expect(source.content).toContain(completion)
      expect(source.trustedContent).toContain(completion)
      return { changes: [{ actionKey: key, state: 'done', description: 'The human accepted the visual preview.', reason: 'The owner confirmed the exact preview completion condition.', citations: [{ sourceId: source.id, quote: completion }] }], suggestions: [] }
    }, verify: async prompt => { prompts.push(prompt); return { changes: [{ actionKey: key, verdict: 'pass', reason: 'The complete owner discussion retains its gate and later exact delivery confirmation.' }], suggestions: [] } },
  } })
  expect(prompts).toHaveLength(2)
  expect(prompts.every(prompt => prompt.includes(ownerGate) && prompt.includes(completion))).toBe(true)
  expect(result.registry.records.find(record => record.key === key)?.state).toBe('done')
  expect(result.registry.records.find(record => record.key === 'context-neighbor')).toEqual(registry.records[1])
  expect(result.registry.articles[0].rejected).toEqual([])
  const calls = vi.fn()
  const missing = await reviewDraftActions({ ...reviewInput, sources: sources.filter(source => source.kind !== 'github'), agents: {
    propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} },
  } })
  expect(calls).not.toHaveBeenCalled()
  expect(missing.registry.articles[0].review.state).toBe('pending')
  expect(missing.registry.records).toEqual(registry.records)
})

it('keeps thirteen mandatory references pending under the unchanged twelve-discussion collector limit', async () => {
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What's next\nInspect the explicitly named evidence.\n`
  const feedback = Array.from({ length: 13 }, (_, index) => `Inspect daily-logger #${100 + index}.`).join('\n')
  const { sources } = fixture({ markdown: article, feedback, compact: true })
  expect(sources.filter(source => source.kind === 'github')).toHaveLength(0)
  expect(sources.find(source => source.id.startsWith('required-evidence-budget@'))?.content).toContain('no required reference was silently sliced')
  const calls = vi.fn()
  const result = await reviewDraftActions({ ...input(sources), markdown: article, feedback, agents: {
    propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} },
  } })
  expect(calls).not.toHaveBeenCalled()
  expect(result.registry.records).toEqual([])
  expect(result.registry.articles[0].review).toMatchObject({ state: 'pending', reason: expect.stringContaining('exceeds the unchanged 12-discussion cap') })
})

it('runs full collector→selection→both prompt paths with twelve oversized discussions, preserving an older owner gate', async () => {
  const { root, sources, ownerGate } = fixture()
  expect(sources.reduce((total, source) => total + Buffer.byteLength(source.content), 0)).toBeGreaterThan(384 * 1024)
  const prompts: string[] = []
  const result = await reviewArticleActions({ ...input(sources), agents: {
    propose: async (prompt, selected) => {
      prompts.push(prompt)
      expect(selected.rawSources(true).filter(source => source.kind === 'github')).toHaveLength(2)
      for (const source of selected.rawSources(true).filter(source => source.kind === 'github')) {
        expect(source.content).toContain(ownerGate)
        expect(source.trustedContent).toContain(ownerGate)
        expect(source.content).toContain('Comment 0:'); expect(source.content).toContain('Comment 200:')
      }
      return { changes: [], suggestions: [] }
    }, verify: async prompt => { prompts.push(prompt); return { changes: [], suggestions: [] } },
  } })
  expect(prompts).toHaveLength(2)
  expect(prompts.every(prompt => Buffer.byteLength(prompt) < 640 * 1024)).toBe(true)
  const retained = result.registry.articles[0].sources.find(source => source.id.startsWith(COVERAGE_SOURCE))
  expect(retained).toBeDefined()
  const selection = selectActionEvidence(input(sources))
  expect(retained?.content).toBe(JSON.stringify(selection.receipt))
  writeActionStore(root, empty())
  writeActionRegistry(root, result.registry, registryRevision(empty()))
  const datedBytes = readFileSync(join(root, `actions/articles/${date}.json`), 'utf8')
  expect(Buffer.byteLength(datedBytes)).toBeLessThanOrEqual(64 * 1024)
  expect(readActionRegistry(root).articles[0].sources.find(source => source.id === retained?.id)).toEqual(retained)
  expect(selection.receipt.sources.filter(source => source.kind === 'github' && !source.included)).toHaveLength(10)
  for (const item of selection.receipt.sources) expect(item.fullContentSha256).toBe(sha256(sources.find(source => source.id === item.id)?.content ?? ''))
  const retry = await reviewArticleActions({ ...input([...sources, sources[0]].reverse()), registry: result.registry, markdown: result.markdown, agents: {
    propose: async () => { throw new Error('Cached retry called proposer') }, verify: async () => { throw new Error('Cached retry called verifier') },
  } })
  expect(retry.cached).toBe(true)
  expect(retry.registry).toEqual(result.registry)
})

it('backs off optional whole-source context when the complete coverage receipt exceeds the fixed reserve', () => {
  const sources: ActionSource[] = [
    { id: 'article', kind: 'report', locator: 'current article', content: 'A'.repeat(1024) },
    { id: 'operator', kind: 'instruction', locator: 'editorial feedback', content: '' },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `repo:optional-${String(index).padStart(2, '0')}`,
      kind: 'goal' as const,
      locator: `optional-${index}-${'l'.repeat(1024)}`,
      content: String(index).padStart(2, '0') + 'x'.repeat(11_998),
    })),
  ]

  const selection = selectActionEvidence({
    registry: empty(), articleDate: date, cycle: revisionActionCycle('dynamic-coverage-receipt'),
    articleStatuses: new Map([[date, 'draft']]), markdown: `---\ndate: ${date}\nstatus: draft\n---\nNo references.\n`, feedback: '', sources,
  })
  const totalBytes = selection.sources.reduce((total, source) => total + Buffer.byteLength(source.content), 0)
  const omitted = selection.receipt.sources.filter(source => !source.required && !source.included)

  expect(totalBytes).toBeLessThanOrEqual(384 * 1024)
  expect(selection.receipt.sources.filter(source => source.required).every(source => source.included)).toBe(true)
  expect(omitted.length).toBeGreaterThan(0)
  expect(omitted.every(source => source.reason.includes('complete coverage receipt'))).toBe(true)
  expect(omitted.map(source => source.id)).toEqual(sources.slice(-omitted.length).map(source => source.id))
  expect(selection.receipt.sources).toHaveLength(sources.length)
})

it('requests a bounded view when required sources plus their complete coverage receipt cannot fit', () => {
  const sources: ActionSource[] = [
    { id: 'article', kind: 'report', locator: 'current article', content: 'A'.repeat(1024) },
    { id: 'operator', kind: 'instruction', locator: 'editorial feedback', content: '' },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `review:required-${String(index).padStart(2, '0')}`,
      kind: 'repository' as const,
      locator: `required-${index}-${'l'.repeat(1024)}`,
      content: String(index).padStart(2, '0') + 'x'.repeat(11_998),
    })),
  ]

  try {
    selectActionEvidence({
      registry: empty(), articleDate: date, cycle: revisionActionCycle('required-dynamic-coverage-receipt'),
      articleStatuses: new Map([[date, 'draft']]), markdown: `---\ndate: ${date}\nstatus: draft\n---\nNo references.\n`, feedback: '', sources,
    })
    throw new Error('Expected a bounded source-view request')
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    expect((error as ActionEvidenceRequestError).request.kind).toBe('source-view')
    expect((error as Error).message).toMatch(/complete coverage receipt.*bounded source view requested/i)
  }
})

it.skipIf(!process.env.ACTION_EVIDENCE_LIVE_SNAPSHOT)('replays the private Oct21 failed corpus without dropping required evidence', () => {
  const capsulePath = process.env.ACTION_EVIDENCE_LIVE_SNAPSHOT
  if (!capsulePath) throw new Error('Missing explicit private live-source snapshot')
  const capsule = JSON.parse(readFileSync(capsulePath, 'utf8')) as {
    policySha: string
    inputHead: string
    collected: unknown
    draftCandidateEvidence: unknown
    observed: { receipt: { sources: Array<{ id: string; required: boolean; included: boolean }> }; receiptBytes: number }
    providerCalls: number
  }
  expect(capsule).toMatchObject({
    policySha: 'a2368c203ddebc52a74aaca9ce9472ffa6dd6d24',
    inputHead: 'a30fb2fc925e1a633870ea0149d76f7b3d485292',
    observed: { receiptBytes: 17_312 },
    providerCalls: 0,
  })
  const registry = readActionRegistry(process.cwd())
  const snapshot = registry.articles.find(article => article.date === '2026-10-21')
  if (!snapshot?.draftCandidates) throw new Error('Missing Oct21 draft candidates')
  const draft = readFileSync(join(process.cwd(), '_articles/2026-10-21.md'), 'utf8')
  const markdown = stampOutcome(draft.replace(/^status:\s*"?draft"?\s*$/m, 'status: "accepted"'), 'accepted')
  const selection = selectActionEvidence({
    registry,
    articleStatuses: readArticleStatuses(process.cwd()).set('2026-10-21', 'accepted'),
    articleDate: '2026-10-21',
    cycle: revisionActionCycle('pull-request:416:clean-acceptance'),
    markdown,
    feedback: '',
    sources: ActionSourceSchema.array().parse(capsule.collected),
    draftCandidates: snapshot.draftCandidates,
    draftCandidateEvidence: DraftCandidateEvidenceRequirementsSchema.parse(capsule.draftCandidateEvidence),
  })
  const previousIncluded = new Set(capsule.observed.receipt.sources.filter(source => source.included).map(source => source.id))
  const newlyOmitted = selection.receipt.sources.filter(source => previousIncluded.has(source.id) && !source.included)
  const totalBytes = selection.sources.reduce((total, source) => total + Buffer.byteLength(source.content), 0)

  expect(totalBytes).toBeLessThanOrEqual(384 * 1024)
  expect(selection.receipt.sources).toHaveLength(capsule.observed.receipt.sources.length)
  expect(selection.receipt.sources.filter(source => source.required).every(source => source.included)).toBe(true)
  expect(newlyOmitted).toEqual([expect.objectContaining({ required: false, id: expect.stringMatching(/^repo:ROADMAP\.md@/) })])
})

it('canonicalizes exact duplicates and property-order equivalents without losing citation IDs', () => {
  const source: ActionSource = { id: 'github:core#1', kind: 'github', locator: 'https://github.com/ojfbot/core/issues/1', content: 'Current factual evidence.', trustedContent: ['Current factual evidence.'] }
  const equivalent: ActionSource = { content: source.content, trustedContent: source.trustedContent, locator: source.locator, kind: source.kind, id: source.id }
  expect(canonicalActionSources([source, equivalent, source])).toEqual([source])
  expect(canonicalActionSources([equivalent, source])).toEqual([source])
  expect(() => canonicalActionSources([source, { ...source, trustedContent: ['Different authority.'] }])).toThrow(/Conflicting action evidence identity/)
  expect(() => canonicalActionSources([source, { ...source, id: `${source.id}@${'a'.repeat(64)}` }])).toThrow(/Conflicting action evidence identity/)
})

it('keeps semantic rejection and distinct cycle quota holds separate in global rejection memory', () => {
  const registry = readActionRegistry(process.cwd())
  const article = registry.articles[0]
  if (!article) throw new Error('Missing registry fixture article')
  const common = { description: 'Bounded work.', reason: 'Retained for independent review.', workKey: 'daily-logger|target|outcome', evidenceDigest: sha256('unchanged factual evidence') }
  const hold = (id: string) => ({ ...common, quotaHold: { articleDate: article.date, cycle: revisionActionCycle(id) } })
  article.rejected.push(common, hold('request-1'), hold('request-2'), hold('request-1'))
  const index = actionReviewIndex({ registry, articleDate: date, articleStatuses: new Map(), expandedActionKeys: [] })
  const matches = index.rejectionMemory.filter(item => item.workKey === common.workKey)
  expect(matches).toHaveLength(3)
  expect(matches).toEqual(expect.arrayContaining([
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest },
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest, quotaHold: hold('request-1').quotaHold },
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest, quotaHold: hold('request-2').quotaHold },
  ]))
})

it.each(['missing', 'excerpt', 'oversized-unicode'])('keeps %s required evidence pending before either model call', async mode => {
  const { sources } = fixture()
  const required = sources.find(source => source.id.startsWith('github:daily-logger#385@'))
  if (!required) throw new Error('Missing fixture source')
  const changed = sources.filter(source => source !== required)
  if (mode !== 'missing') {
    const content = mode === 'excerpt' ? 'An incomplete excerpt.' : '🙂'.repeat(33 * 1024)
    changed.push({ ...required, id: mode === 'excerpt' ? required.id : `github:daily-logger#385@${sha256(content)}`, content,
      fullContentSha256: mode === 'excerpt' ? sha256(required.content) : sha256(content) })
  }
  const calls = vi.fn()
  const result = await reviewDraftActions({ ...input(changed), agents: { propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} } } })
  expect(calls).not.toHaveBeenCalled()
  expect(result.registry.records).toEqual([])
  expect(result.registry.articles[0].review.state).toBe('pending')
  expect(result.markdown).toContain('Action review pending')
})

it('omits an oversized irrelevant source without silently truncating or treating it as negative evidence', () => {
  const { sources } = fixture()
  const source: ActionSource = { id: 'github:core#999', kind: 'github', locator: 'https://github.com/ojfbot/core/issues/999', content: '🙂'.repeat(80 * 1024) }
  const selected = selectActionEvidence(input([...sources, source]))
  expect(selected.sources.some(item => item.id === source.id)).toBe(false)
  expect(selected.receipt.sources.find(item => item.id === source.id)).toMatchObject({ included: false, fullContentSha256: sha256(source.content), reason: 'outside current action/feedback scope' })
  expect(selected.receipt.authority).toContain('cannot justify completion')
})

it('rejects conflicting full source identities at the review boundary rather than selecting a version by input order', async () => {
  const { sources } = fixture()
  const conflicting = [...sources, { ...sources[0], content: 'Contradictory collection.' }]
  expect(() => selectActionEvidence(input(conflicting))).toThrow(/Conflicting action evidence identity/)
  const calls = vi.fn()
  await expect(reviewArticleActions({ ...input(conflicting), agents: { propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} } } })).rejects.toThrow(/Conflicting action evidence identity/)
  expect(calls).not.toHaveBeenCalled()
})

it('keeps all 216 identities, 138 held records and protected/inclusion gates in compact global context', () => {
  const registry = readActionRegistry(process.cwd())
  const index = actionReviewIndex({ registry, articleDate: date, articleStatuses: new Map(), expandedActionKeys: [] })
  expect(index.actions).toHaveLength(216); expect(index.held).toHaveLength(138)
  expect(index.actions.map(record => record.workKey)).toEqual(registry.records.map(record => record.workKey))
  expect(index.actions.filter(record => record.protected)).toHaveLength(3)
  for (const record of registry.records) {
    const item = index.actions.find(item => item.key === record.key)
    expect(item?.includeInIndex).toBe(record.includeInIndex)
    expect(item?.inclusionOverride).toEqual(record.inclusionOverride)
    if (record.gates.length) expect(item).toHaveProperty('gates', record.gates)
  }
})

it('refuses a terminal disposition supported only by the coverage index, even if both agents pass it', async () => {
  const { sources } = fixture()
  const registry = empty()
  registry.records.push({ key: 'carried', original: { id: 'carried', command: '/review', description: 'Inspect daily-logger #385.', repo: 'daily-logger', status: 'open', sourceDate: date }, origin: 'imported', workKey: 'existing', state: 'open', introducedBy: date, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: 'Owner accepts the preview.', gates: ['Human acceptance required.'], history: [] })
  const result = await reviewDraftActions({ ...input(sources), registry, agents: {
    propose: async (_prompt, selected) => {
      const coverage = selected.rawSources(true).find(source => source.locator === ACTION_EVIDENCE_SELECTION_VERSION)
      if (!coverage) throw new Error('Missing coverage')
      return { changes: [{ actionKey: 'carried', state: 'done', description: 'Completed.', reason: 'The index exists.', citations: [{ sourceId: coverage.id, quote: 'Missing or omitted content is unknown' }] }], suggestions: [] }
    }, verify: async () => ({ changes: [{ actionKey: 'carried', verdict: 'pass', reason: 'Index says unknown.' }], suggestions: [] }),
  } })
  expect(result.registry.articles[0].review.state).toBe('pending')
  expect(result.registry.records[0]).toEqual(registry.records[0])
})


it('charges a collector-proved complete view while raw copies stay held and authored owner gates stay citable', () => {
  const ownerGate = 'OWNER GATE: do not close until the named owner accepts the delivery.'
  const capture = captureGithubActionSource({ id: 'github:daily-logger#416', locator: 'https://github.com/ojfbot/daily-logger/pull/416',
    observation: 'CURRENT API STATE daily-logger#416: state=closed; merged_at=2026-10-24T12:00:00Z.', trustedContent: [ownerGate],
    responses: [JSON.stringify(Array.from({ length: 60 }, (_, index) => ({ id: index + 1,
      html_url: `https://github.com/ojfbot/daily-logger/pull/416#issuecomment-${index + 1}`, author_association: 'OWNER',
      user: { id: 1, login: 'ojfbot', avatar_url: 'https://example.invalid/avatar' },
      unknown_contract: { permission: 'owner confirmation remains required', payload: 'u'.repeat(3000) },
      body: index === 0 ? ownerGate : `Authored statement ${index}: unknown constraints remain visible.`,
    })))],
  })
  const source = capture.source
  source.id += `@${sha256(source.content)}`
  const collection = new ActionSourceCollection([source], [capture])
  const select = (collectedSources?: ActionSourceCollection) => selectActionEvidence({ registry: empty(), articleDate: date,
    cycle: generationActionCycle(), markdown: 'A source-view fixture.', feedback: 'Review daily-logger #416.', sources: [source], collectedSources })
  expect(Buffer.byteLength(source.content)).toBeGreaterThan(128 * 1024)
  expect(() => select()).toThrow(ActionEvidenceRequestError)
  expect(() => select(new ActionSourceCollection([source]))).toThrow(ActionEvidenceRequestError)
  const selection = select(collection)
  const entry = selection.receipt.sources.find(item => item.id === source.id)!
  const prepared = PreparedActionEvidenceView.prepare(selection.sources, sha256('case'), sha256('state'), collection, selection.receipt.requiredReferences)
  const promptSource = prepared.promptSources().find(item => item.locator === source.locator)!
  expect(entry).toMatchObject({ required: true, included: true, bytes: Buffer.byteLength(source.content), modelBytes: Buffer.byteLength(promptSource.content), modelContentSha256: sha256(promptSource.content) })
  expect(entry.modelBytes).toBeLessThan(128 * 1024)
  expect(selection.sources.find(item => item.id === source.id)).toEqual(source)
  expect(prepared.rawSources().find(item => item.id === source.id)).toEqual(source)
  expect(promptSource.content).toContain(ownerGate)
  const gateLine = source.content.split('\n').indexOf(ownerGate) + 1
  expect(prepared.resolve(source.id, gateLine, gateLine).quote).toBe(ownerGate)
  const copy = structuredClone(source); copy.trustedContent = ['different owner claim']
  expect(() => PreparedActionEvidenceView.prepare([copy], sha256('case'), sha256('state'), collection, ['daily-logger#416'])).toThrow(/provenance/i)
})
