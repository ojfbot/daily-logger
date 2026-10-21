import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { afterEach, expect, it, vi } from 'vitest'
import { generationActionCycle } from '../action-review-cycle.js'
import { ActionEvidenceRequestSchema, ActionRegistrySchema, ActionSourceSchema, sha256, type ActionSource } from '../action-registry.js'
import { ActionEvidenceRequestError, actionEvidenceCaseDigest, buildActionEvidenceProjection, closeActionEvidenceRequest, createActionEvidenceRequest, persistActionEvidenceReply, persistActionEvidenceRequest, persistActionEvidenceResolutions, persistActionEvidenceResponse, persistValidatedActionEvidenceReply, trustedActionSourceLineNumbers } from '../action-evidence-retrieval.js'
import { actionEvidenceScope, draftCandidateEvidenceBinding, selectActionEvidence } from '../action-evidence-selection.js'
import { applyVerifiedActionReview, pendingActionReview, resolveActionSourceLines, reviewDraftActions } from '../review-actions.js'

const date = '2026-10-17'
const roots: string[] = []

afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})

const registry = () => ActionRegistrySchema.parse({
  schemaVersion: 1,
  baseline: {
    commit: 'a'.repeat(40),
    openSha256: 'b'.repeat(64),
    doneSha256: 'c'.repeat(64),
    articleActions: {},
    heldSuggestions: [],
  },
  records: [],
  articles: [],
})

function preparedCandidateRegistry(values: readonly unknown[], markdown: string) {
  const captured = pendingActionReview({ registry: registry(), articleDate: date, cycle: generationActionCycle(), markdown, reason: 'Prepare explicit candidate evidence.',
    articleStatuses: new Map([[date, 'draft']]), draftCandidates: values, draftContext: { kind: 'none' } })
  const next = structuredClone(captured.registry)
  const snapshot = next.articles[0]
  if (!snapshot?.draftCandidates?.length || !snapshot.reviewCycle) throw new Error('Missing captured candidate fixture')
  const binding = draftCandidateEvidenceBinding({ registry: next, articleDate: date, cycle: snapshot.reviewCycle, markdown: captured.markdown })
  snapshot.draftCandidateEvidence = {
    version: 'draft-candidate-evidence-v1', provenance: { kind: 'independent-reviewer', identity: 'progressive-fixture', decision: 'Fixture evidence associations.' },
    ...binding,
    candidates: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references: [] })),
    unassignedReferences: [],
  }
  return { registry: ActionRegistrySchema.parse(next), markdown: captured.markdown }
}

it('retains draft candidates and issues a durable bounded-view request before either reviewer runs', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'progressive-retrieval-current-'))
  roots.push(repoRoot)
  const propose = vi.fn()
  const verify = vi.fn()
  const oversized: ActionSource = {
    id: 'review:oversized-discussion',
    kind: 'repository',
    locator: 'reviews/oversized-discussion.md',
    content: `OWNER obligation remains open.\n${'context line\n'.repeat(12_000)}COUNTEREVIDENCE: no delivery receipt exists.`,
  }
  const draftCandidates = [{
    command: '/investigate',
    description: 'Resolve the oversized evidence gap without weakening owner gates.',
    repo: 'daily-logger',
    status: 'open' as const,
    sourceDate: date,
  }]
  const prepared = preparedCandidateRegistry(draftCandidates, `---\ndate: ${date}\nstatus: draft\n---\n\n## What shipped\n\nA bounded incident fixture.\n`)

  const result = await reviewDraftActions({
    registry: prepared.registry,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: prepared.markdown,
    feedback: 'Review the complete retained discussion.',
    sources: [oversized],
    draftCandidates,
    repoRoot,
    agents: { propose, verify },
    articleStatuses: new Map([[date, 'draft']]),
  })

  expect(propose).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
  expect(result.registry.articles[0]?.draftCandidates?.map(candidate => candidate.payload)).toEqual(draftCandidates)
  const snapshot = z.object({
    evidenceRequests: z.array(z.object({ id: z.string(), kind: z.literal('source-view'), status: z.literal('open') })).length(1),
  }).parse(result.registry.articles[0])
  expect(existsSync(join(repoRoot, '.action-evidence', snapshot.evidenceRequests[0].id, 'request.json'))).toBe(true)
  expect(existsSync(join(repoRoot, '.action-evidence', snapshot.evidenceRequests[0].id, 'source.json'))).toBe(true)
  expect(result.markdown).toContain('Evidence request pending')

  const stored = ActionEvidenceRequestSchema.parse(JSON.parse(readFileSync(join(repoRoot, '.action-evidence', snapshot.evidenceRequests[0].id, 'request.json'), 'utf8')))
  closeActionEvidenceRequest({ repoRoot, request: stored, status: 'expired' })
  const closedPropose = vi.fn()
  const closedVerify = vi.fn()
  const closed = await reviewDraftActions({
    registry: result.registry, articleDate: date, cycle: generationActionCycle(), markdown: result.markdown,
    feedback: 'Review the complete retained discussion.', sources: [oversized], draftCandidates, repoRoot,
    agents: { propose: closedPropose, verify: closedVerify }, articleStatuses: new Map([[date, 'draft']]),
  })
  expect(closed.registry.articles[0]?.evidenceRequests).toMatchObject([{ id: stored.id, status: 'expired' }])
  expect(closedPropose).not.toHaveBeenCalled()
  expect(closedVerify).not.toHaveBeenCalled()
})

it('restores a complete bounded reply and resumes the same captured candidate review', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'progressive-retrieval-resume-'))
  roots.push(repoRoot)
  const oversized: ActionSource = {
    id: 'review:oversized-discussion',
    kind: 'repository',
    locator: 'reviews/oversized-discussion.md',
    content: `OWNER obligation remains open.\n${'context line\n'.repeat(12_000)}COUNTEREVIDENCE: no delivery receipt exists.`,
  }
  const draftCandidates = [{
    command: '/investigate',
    description: 'Resolve the oversized evidence gap without weakening owner gates.',
    repo: 'daily-logger',
    status: 'open' as const,
    sourceDate: date,
  }]
  const initialMarkdown = `---\ndate: ${date}\nstatus: draft\n---\n\n## What shipped\n\nA bounded incident fixture.\n`
  const prepared = preparedCandidateRegistry(draftCandidates, initialMarkdown)
  const base = {
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: prepared.markdown,
    feedback: 'Review the complete retained discussion.',
    sources: [oversized],
    draftCandidates,
    repoRoot,
    articleStatuses: new Map([[date, 'draft']]),
  }
  const first = await reviewDraftActions({
    ...base,
    registry: prepared.registry,
    agents: { propose: vi.fn(), verify: vi.fn() },
  })
  const requestId = z.object({ evidenceRequests: z.array(z.object({ id: z.string() })).length(1) })
    .parse(first.registry.articles[0]).evidenceRequests[0].id
  const directory = join(repoRoot, '.action-evidence', requestId)
  const request = ActionEvidenceRequestSchema.parse(JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')))
  const source = ActionSourceSchema.parse(JSON.parse(readFileSync(join(directory, 'source.json'), 'utf8')))
  const lines = source.content.split('\n')
  const projection = buildActionEvidenceProjection({
    request,
    source,
    ranges: [
      { startLine: 1, endLine: 1, role: 'support' },
      { startLine: lines.length, endLine: lines.length, role: 'counterevidence' },
    ],
    coverage: request.obligations.map(obligationId => ({ obligationId, status: 'counterevidence' as const, rangeIndexes: [1] })),
  })
  persistValidatedActionEvidenceReply({ repoRoot, projection })

  const drifted = { ...oversized, id: `${oversized.id}@${sha256(`${oversized.content}\nOWNER: approval revoked.`)}`, content: `${oversized.content}\nOWNER: approval revoked.` }
  const stalePropose = vi.fn()
  const staleVerify = vi.fn()
  const stale = await reviewDraftActions({ ...base, registry: first.registry, markdown: first.markdown, sources: [drifted], agents: { propose: stalePropose, verify: staleVerify } })
  expect(stale.registry.articles[0]?.review.state).toBe('pending')
  expect(stalePropose).not.toHaveBeenCalled()
  expect(staleVerify).not.toHaveBeenCalled()

  const correctedProjection = buildActionEvidenceProjection({
    request,
    source,
    ranges: [
      { startLine: 1, endLine: 2, role: 'support' },
      { startLine: lines.length, endLine: lines.length, role: 'counterevidence' },
    ],
    coverage: request.obligations.map(obligationId => ({ obligationId, status: 'counterevidence' as const, rangeIndexes: [1] })),
  })
  persistValidatedActionEvidenceReply({ repoRoot, projection: correctedProjection })

  const propose = vi.fn(async (_prompt: string, sources: ActionSource[]) => {
    const selected = sources.find(candidate => candidate.content.includes('COUNTEREVIDENCE'))
    if (!selected) throw new Error('Bounded reply was not restored into the review')
    const quote = selected.content.split('\n').find(line => line.includes('COUNTEREVIDENCE'))
    if (!quote) throw new Error('Counterevidence range disappeared')
    return {
      changes: [],
      suggestions: [],
      candidateDispositions: [{
        candidateId: first.registry.articles[0].draftCandidates?.[0]?.candidateId,
        kind: 'reject',
        reason: 'The retained source contains no delivery receipt.',
        citations: [{ sourceId: selected.id, quote }],
      }],
      closingOptions: [],
    }
  })
  const verify = vi.fn(async () => ({
    changes: [],
    suggestions: [],
    candidateDispositions: [{
      candidateId: first.registry.articles[0].draftCandidates?.[0]?.candidateId,
      verdict: 'pass',
      reason: 'The rejection preserves the owner gate and cites retained counterevidence.',
    }],
    closingOptions: [],
  }))
  const resumed = await reviewDraftActions({ ...base, registry: first.registry, markdown: first.markdown, selectedEvidenceProjectionIds: [correctedProjection.id], agents: { propose, verify } })

  expect(propose).toHaveBeenCalledOnce()
  expect(verify).toHaveBeenCalledOnce()
  expect(resumed.registry.articles[0]?.review.state).toBe('verified')
  expect(resumed.registry.articles[0]?.draftCandidates?.[0]?.review.state).toBe('rejected')
  expect(resumed.registry.articles[0]?.draftCandidates?.[0]?.payload).toEqual(draftCandidates[0])
  const resultWithResolutionIntent = z.object({ evidenceResolutions: z.array(ActionSourceSchema).length(1) }).parse(resumed)
  expect(resultWithResolutionIntent.evidenceResolutions[0]?.id).toBe(correctedProjection.id)
  expect(readdirSync(directory).some(name => name.startsWith('resolution-'))).toBe(false)
  const cached = await reviewDraftActions({
    ...base,
    registry: resumed.registry,
    markdown: resumed.markdown,
    selectedEvidenceProjectionIds: [correctedProjection.id],
    agents: {
      propose: async () => { throw new Error('Cached retry called proposer') },
      verify: async () => { throw new Error('Cached retry called verifier') },
    },
  })
  expect(cached.cached).toBe(true)
  expect(z.object({ evidenceResolutions: z.array(ActionSourceSchema).length(1) }).parse(cached).evidenceResolutions[0]?.id)
    .toBe(correctedProjection.id)
  expect(readdirSync(directory).some(name => name.startsWith('resolution-'))).toBe(false)
  persistActionEvidenceResolutions(repoRoot, cached.evidenceResolutions)
  expect(readdirSync(directory).filter(name => name.startsWith('resolution-'))).toHaveLength(1)
})

it('does not let one action owner response authorize another action in the same case', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'progressive-owner-scope-'))
  roots.push(repoRoot)
  const current = registry()
  const record = (key: string, number: number) => ({
    key,
    original: { id: key, command: '/review', description: `Review daily-logger #${number}.`, repo: 'daily-logger', status: 'open' as const, sourceDate: date },
    origin: 'imported' as const,
    workKey: `daily-logger|${number}|review`,
    state: 'open' as const,
    introducedBy: date,
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Review the actual evidence.',
    doneWhen: 'Owner acceptance is explicit.',
    gates: [],
    history: [],
  })
  current.records.push(record('act-381', 381), record('act-385', 385))
  const caseDigest = actionEvidenceCaseDigest({ articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '', actionKeys: ['act-381', 'act-385'] })
  const request = createActionEvidenceRequest({
    kind: 'authority',
    caseDigest,
    articleDate: date,
    cycle: generationActionCycle(),
    actionKeys: ['act-381', 'act-385'],
    sourceKey: 'action:act-381',
    question: 'Resolve act-381 authority.',
    obligations: ['1'.repeat(64)],
    recipient: 'coordinator-owner',
  })
  const answer = 'Dismiss this action because its premise is obsolete.'
  const { source } = persistActionEvidenceResponse({ repoRoot, request, responder: 'owner', answer })
  expect(() => persistActionEvidenceResponse({ repoRoot, request, responder: 'owner', answer: 'Keep this action open instead.' }))
    .toThrow(/distinct owner response|supersession/i)

  const operator: ActionSource = { id: 'operator', kind: 'instruction', locator: 'feedback', content: 'Keep act-381 open pending explicit approval.' }
  const resolvedRequest = {
    version: request.version, id: request.id, kind: request.kind, caseDigest: request.caseDigest, articleDate: request.articleDate,
    cycle: request.cycle, actionKeys: request.actionKeys, sourceKey: request.sourceKey, obligations: request.obligations,
    recipient: request.recipient, status: 'resolved' as const,
  }
  const scoped = applyVerifiedActionReview({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: `---\ndate: ${date}\nstatus: draft\n---\n`,
    sources: [source, operator],
    roundId: '3'.repeat(64),
    articleStatuses: new Map([[date, 'draft']]),
    requiredActionKeys: ['act-381'],
    resolvedEvidenceRequests: [resolvedRequest],
    proposal: {
      changes: [{ actionKey: 'act-381', state: 'open', description: 'Keep act-381 open.', reason: 'The owner gate remains explicit.', citations: [{ sourceId: operator.id, quote: operator.content }] }],
      suggestions: [],
    },
    verification: { changes: [{ actionKey: 'act-381', verdict: 'pass', reason: 'Scoped response.' }], suggestions: [] },
  })
  expect(scoped.articles[0]?.sources.find(candidate => candidate.id === source.id)?.response).toEqual(source.response)

  expect(() => applyVerifiedActionReview({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: `---\ndate: ${date}\nstatus: draft\n---\n`,
    sources: [source],
    roundId: '4'.repeat(64),
    articleStatuses: new Map([[date, 'draft']]),
    proposal: {
      changes: [
        { actionKey: 'act-381', state: 'open', description: 'Keep act-381 open.', reason: 'The response applies to act-381.', citations: [{ sourceId: source.id, quote: answer }] },
        { actionKey: 'act-385', state: 'dismissed', description: 'Dismiss act-385.', reason: 'Improperly borrow the response.', citations: [{ sourceId: source.id, quote: answer }] },
      ],
      suggestions: [],
    },
    verification: {
      changes: [
        { actionKey: 'act-381', verdict: 'pass', reason: 'Scoped response.' },
        { actionKey: 'act-385', verdict: 'pass', reason: 'Injected false-positive verifier.' },
      ],
      suggestions: [],
    },
  })).toThrow(/owner response.*act-381/i)
})

it('rejects a new #386 suggestion whose evidence is about unrelated #391', () => {
  const wrongContent = 'CURRENT API STATE daily-logger#391: state=merged.'
  const wrong: ActionSource = {
    id: `github:daily-logger#391@${sha256(wrongContent)}`,
    kind: 'github',
    locator: 'https://github.com/ojfbot/daily-logger/pull/391',
    content: wrongContent,
    trustedContent: [wrongContent],
  }
  const candidate = {
    command: '/investigate',
    description: 'Investigate daily-logger #386.',
    repo: 'daily-logger',
    target: 'daily-logger #386',
    outcome: 'Bounded evidence for #386 is qualified.',
    goal: 'Resolve daily-logger #386 without losing counterevidence.',
    goalCitations: [{ sourceId: wrong.id, quote: wrongContent }],
    factCitations: [{ sourceId: wrong.id, quote: wrongContent }],
    doneWhen: 'The #386 evidence request is resolved.',
    gates: ['Preserve #386 owner authority.'],
    existingKey: null,
  }
  const result = applyVerifiedActionReview({
    registry: registry(),
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: `---\ndate: ${date}\nstatus: draft\n---\n`,
    sources: [wrong],
    roundId: '9'.repeat(64),
    articleStatuses: new Map([[date, 'draft']]),
    proposal: { changes: [], suggestions: [candidate] },
    verification: { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Injected verifier pass.', existingKey: null }] },
  })
  expect(result.records).toEqual([])
  expect(result.articles[0]?.rejected[0]?.reason).toMatch(/unrelated GitHub subject.*daily-logger#391.*daily-logger#386/)
})

it('requires explicit preserve or reassess intent when feedback names an accepted terminal action', () => {
  const current = registry()
  current.records.push({
    key: 'act-terminal',
    original: { id: 'act-terminal', command: '/review', description: 'Review daily-logger #357.', repo: 'daily-logger', status: 'open', sourceDate: '2026-10-16' },
    origin: 'imported',
    workKey: 'daily-logger|357|review',
    state: 'dismissed',
    introducedBy: '2026-10-16',
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Review the actual evidence.',
    doneWhen: 'Owner acceptance is explicit.',
    gates: [],
    history: [{
      roundId: 'd'.repeat(64),
      articleDate: '2026-10-16',
      state: 'dismissed',
      description: 'Dismissed.',
      reason: 'Obsolete.',
      citations: [{ sourceId: `operator@${'e'.repeat(64)}`, quote: 'Dismiss this historical action.' }],
      verifiedBy: 'reviewer',
      verificationReason: 'Explicit owner instruction.',
    }],
  })
  current.articles.push({
    date: '2026-10-16',
    status: 'accepted',
    review: { state: 'verified' },
    articleDigest: '1'.repeat(64),
    roundId: 'd'.repeat(64),
    actionKeys: ['act-terminal'],
    stateDigest: '2'.repeat(64),
    verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: '3'.repeat(64), verdicts: [] },
    sources: [],
    rejected: [],
  })
  const article = `---\ndate: ${date}\nstatus: draft\n---\n`
  const sources: ActionSource[] = [
    { id: 'article', kind: 'report', locator: 'article', content: article },
    { id: 'operator', kind: 'instruction', locator: 'feedback', content: 'Review act-terminal.' },
  ]

  expect(() => selectActionEvidence({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: article,
    feedback: 'Review act-terminal.',
    sources,
  })).toThrow(ActionEvidenceRequestError)
  try {
    selectActionEvidence({ registry: current, articleDate: date, cycle: generationActionCycle(), markdown: article, feedback: 'Review act-terminal.', sources })
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    if (error instanceof ActionEvidenceRequestError) expect(error.request).toMatchObject({ kind: 'clarification', recipient: 'coordinator-owner', actionKeys: ['act-terminal'] })
  }
  const preserved = selectActionEvidence({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: article,
    feedback: 'Review act-terminal.',
    sources,
    preserveActionKeys: ['act-terminal'],
  })
  expect(preserved.receipt).toMatchObject({ reviewActionKeys: [], preservedTerminalActionKeys: ['act-terminal'] })
  expect(() => applyVerifiedActionReview({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: article,
    sources: [{ id: 'operator', kind: 'instruction', locator: 'feedback', content: 'Preserve act-terminal without a new decision.' }],
    roundId: '8'.repeat(64),
    articleStatuses: new Map([[date, 'draft'], ['2026-10-16', 'accepted']]),
    preserveActionKeys: ['act-terminal'],
    requiredActionKeys: [],
    proposal: { changes: [{ actionKey: 'act-terminal', state: 'dismissed', description: 'Rewrite the terminal description.', reason: 'Redundant reaffirmation.', citations: [{ sourceId: 'operator', quote: 'Preserve act-terminal without a new decision.' }] }], suggestions: [] },
    verification: { changes: [{ actionKey: 'act-terminal', verdict: 'pass', reason: 'Injected false-positive verifier.' }], suggestions: [] },
  })).toThrow(/Preserved action cannot receive a new disposition/i)
  try {
    selectActionEvidence({
      registry: current,
      articleDate: date,
      cycle: generationActionCycle(),
      markdown: article,
      feedback: 'Review act-terminal.',
      sources,
      reassessActionKeys: ['act-terminal'],
    })
    throw new Error('Expected a missing-source evidence request')
  } catch (error) {
    expect(error).toBeInstanceOf(ActionEvidenceRequestError)
    if (error instanceof ActionEvidenceRequestError) expect(error.request).toMatchObject({ kind: 'missing-source', recipient: 'source-producer', actionKeys: ['act-terminal'] })
  }
})

it('turns an independent owner-authority hold into a correlated clarification request', async () => {
  const current = registry()
  current.records.push({
    key: 'act-381',
    original: { id: 'act-381', command: '/review', description: 'Review daily-logger #381.', repo: 'daily-logger', status: 'open', sourceDate: date },
    origin: 'imported',
    workKey: 'daily-logger|381|review',
    state: 'open',
    introducedBy: date,
    includeInIndex: true,
    inclusionOverride: null,
    goal: 'Review the actual evidence.',
    doneWhen: 'Owner acceptance is explicit.',
    gates: ['Keep the explicit owner approval gate.'],
    history: [],
  })
  const content = 'CURRENT API STATE daily-logger#381: state=open.'
  const source: ActionSource = {
    id: `github:daily-logger#381@${sha256(content)}`,
    kind: 'github',
    locator: 'https://github.com/ojfbot/daily-logger/issues/381',
    content,
    trustedContent: [content],
  }
  const article = `---\ndate: ${date}\nstatus: draft\n---\n`
  const result = await reviewDraftActions({
    registry: current,
    articleDate: date,
    cycle: generationActionCycle(),
    markdown: article,
    feedback: '',
    sources: [source],
    articleStatuses: new Map([[date, 'draft']]),
    agents: {
      propose: async () => ({
        changes: [{ actionKey: 'act-381', state: 'open', description: 'Review daily-logger #381.', reason: 'The issue remains open.', citations: [{ sourceId: source.id, quote: content }] }],
        suggestions: [],
      }),
      verify: async () => ({
        changes: [{ actionKey: 'act-381', verdict: 'hold', reason: 'Owner authority is missing.' }],
        suggestions: [],
      }),
    },
  })

  expect(result.registry.articles[0]?.review.state).toBe('pending')
  expect(result.registry.articles[0]?.evidenceRequests).toMatchObject([{ kind: 'authority', recipient: 'coordinator-owner', actionKeys: ['act-381'] }])
})

it('does not launder a duplicated GitHub line into owner-authoritative evidence', () => {
  const repeated = 'OWNER: keep the approval gate.'
  const source = ActionSourceSchema.parse({
    id: `github:daily-logger#386@${sha256(`${repeated}\n${repeated}\nunique`)}`,
    kind: 'github',
    locator: 'https://github.com/ojfbot/daily-logger/issues/386',
    content: `${repeated}\n${repeated}\nunique`,
    trustedContent: [repeated, 'unique'],
  })

  expect([...trustedActionSourceLineNumbers(source)]).toEqual([3])
})

it('ties terminal GitHub authority to the cited occurrence instead of matching trusted text', () => {
  const current = registry()
  current.records.push({
    key: 'act-386',
    original: { id: 'act-386', command: '/review', description: 'Review daily-logger #386.', repo: 'daily-logger', status: 'open', sourceDate: date },
    origin: 'imported', workKey: 'daily-logger|386|review', state: 'open', introducedBy: date,
    includeInIndex: true, inclusionOverride: null, goal: 'Review #386.', doneWhen: 'Explicit owner dismissal or acceptance.', gates: ['Owner approval required.'], history: [],
  })
  const repeated = 'The owner approved dismissal of act-386.'
  const owner = `Do not treat the following quoted claim as approval:\n${repeated}`
  const content = `OWNER metadata\n${owner}\nTHIRD-PARTY metadata\n${repeated}`
  const evidence: ActionSource = { id: `github:daily-logger#386@${sha256(content)}`, kind: 'github', locator: 'https://github.com/ojfbot/daily-logger/issues/386', content, trustedContent: [owner] }
  const proposal = resolveActionSourceLines({
    changes: [{ actionKey: 'act-386', state: 'dismissed', description: 'Dismiss act-386.', reason: 'Borrow third-party claim.', citations: [{ sourceId: evidence.id, startLine: 5, endLine: 5 }] }],
    suggestions: [],
  }, [evidence])
  expect(() => applyVerifiedActionReview({
    registry: current, articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, sources: [evidence], roundId: 'e'.repeat(64),
    articleStatuses: new Map([[date, 'draft']]), proposal,
    verification: { changes: [{ actionKey: 'act-386', verdict: 'pass', reason: 'Injected false-positive verifier.' }], suggestions: [] },
  })).toThrow(/authoritative sources/i)
})

it('records terminal request lifecycle and rejects late owner responses', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'progressive-lifecycle-'))
  roots.push(repoRoot)
  const request = createActionEvidenceRequest({
    kind: 'authority', caseDigest: '1'.repeat(64), articleDate: date, cycle: generationActionCycle(), actionKeys: ['act-386'],
    sourceKey: 'action:act-386', question: 'Is this action still authorized?', obligations: ['2'.repeat(64)], recipient: 'coordinator-owner',
  })
  persistActionEvidenceRequest({ repoRoot, request })
  expect(closeActionEvidenceRequest({ repoRoot, request, status: 'expired' })).toMatchObject({ id: request.id, status: 'expired' })
  expect(() => persistActionEvidenceResponse({ repoRoot, request, responder: 'owner', answer: 'Dismiss it.' })).toThrow(/expired.*late replies/i)
})

it('does not write a resolution marker after a request has already closed another way', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'progressive-late-resolution-'))
  roots.push(repoRoot)
  const source: ActionSource = { id: 'review:late-resolution', kind: 'repository', locator: 'review.md', content: 'Owner gate remains open.\nNo delivery receipt exists.' }
  const request = createActionEvidenceRequest({
    kind: 'source-view', caseDigest: '3'.repeat(64), articleDate: date, cycle: generationActionCycle(), actionKeys: ['act-386'],
    sourceKey: source.id, source, question: 'Read the retained owner gate.', obligations: ['4'.repeat(64)], recipient: 'source-producer',
  })
  persistActionEvidenceRequest({ repoRoot, request, source })
  const projection = buildActionEvidenceProjection({
    request, source, ranges: [{ startLine: 1, endLine: 1, role: 'support' }, { startLine: 2, endLine: 2, role: 'counterevidence' }],
    coverage: [{ obligationId: request.obligations[0], status: 'counterevidence', rangeIndexes: [1] }],
  })
  persistValidatedActionEvidenceReply({ repoRoot, projection })
  closeActionEvidenceRequest({ repoRoot, request, status: 'cancelled' })

  expect(() => persistActionEvidenceReply({ repoRoot, projection, resolved: true })).toThrow(/cancelled.*late replies/i)
  const directory = join(repoRoot, '.action-evidence', request.id)
  expect(readdirSync(directory).some(name => name.startsWith('resolution-'))).toBe(false)
})

it('changes the evidence case when prior action authority becomes accepted', () => {
  const current = registry()
  const priorDate = '2026-10-16'
  const priorRound = 'd'.repeat(64)
  current.records.push({
    key: 'act-386',
    original: { id: 'act-386', command: '/review', description: 'Review daily-logger #386.', repo: 'daily-logger', status: 'open', sourceDate: priorDate },
    origin: 'imported', workKey: 'daily-logger|386|review', state: 'dismissed', introducedBy: priorDate,
    includeInIndex: true, inclusionOverride: null, goal: 'Review #386.', doneWhen: 'Owner decision.', gates: [],
    history: [{ roundId: priorRound, articleDate: priorDate, state: 'dismissed', description: 'Dismiss act-386.', reason: 'The premise is obsolete.', citations: [], verifiedBy: 'reviewer', verificationReason: 'Verified.' }],
  })
  current.articles.push({
    date: priorDate, status: 'accepted', review: { state: 'verified' }, articleDigest: '1'.repeat(64), roundId: priorRound,
    actionKeys: ['act-386'], stateDigest: '2'.repeat(64),
    verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: '3'.repeat(64), verdicts: [] },
    sources: [], rejected: [],
  })
  const articleStatuses = new Map([[priorDate, 'draft']])
  expect(actionEvidenceScope({ registry: current, articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: 'Review act-386.', articleStatuses }))
    .toMatchObject({ reviewActionKeys: ['act-386'], ambiguousTerminalActionKeys: [] })
  const digest = () => actionEvidenceCaseDigest({
    articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: '', actionKeys: ['act-386'], registry: current, articleStatuses,
  })
  const before = digest()
  articleStatuses.set(priorDate, 'accepted')
  expect(actionEvidenceScope({ registry: current, articleDate: date, markdown: `---\ndate: ${date}\nstatus: draft\n---\n`, feedback: 'Review act-386.', articleStatuses }))
    .toMatchObject({ reviewActionKeys: [], ambiguousTerminalActionKeys: ['act-386'] })
  expect(digest()).not.toBe(before)
})

it('holds an explicitly selected incomplete correction instead of falling back to an older complete reply', () => {
  const current = registry()
  current.records.push({
    key: 'act-386',
    original: { id: 'act-386', command: '/review', description: 'Review daily-logger #386.', repo: 'daily-logger', status: 'open', sourceDate: '2026-10-16' },
    origin: 'imported', workKey: 'daily-logger|386|review', state: 'open', introducedBy: '2026-10-16',
    includeInIndex: true, inclusionOverride: null, goal: 'Review #386.', doneWhen: 'Owner decision.', gates: ['Keep the owner gate.'], history: [],
  })
  const source: ActionSource = {
    id: 'review:explicit-incomplete', kind: 'repository', locator: 'review.md',
    content: `Owner gate remains open.\n${'context\n'.repeat(20_000)}No delivery receipt exists.`,
  }
  const input = {
    registry: current, articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\n`,
    feedback: 'Review act-386 using the retained evidence.', sources: [source],
  }
  let request: ReturnType<typeof createActionEvidenceRequest> | undefined
  try { selectActionEvidence(input) }
  catch (error) {
    if (error instanceof ActionEvidenceRequestError) request = error.request
    else throw error
  }
  if (!request) throw new Error('Expected a bounded evidence request')
  const lastLine = source.content.split('\n').length
  const ranges = [{ startLine: 1, endLine: 1, role: 'support' as const }, { startLine: lastLine, endLine: lastLine, role: 'counterevidence' as const }]
  const complete = buildActionEvidenceProjection({
    request, source, ranges,
    coverage: request.obligations.map(obligationId => ({ obligationId, status: 'counterevidence' as const, rangeIndexes: [1] })),
  })
  const incomplete = buildActionEvidenceProjection({
    request, source, ranges,
    coverage: request.obligations.map((obligationId, index) => index === 0
      ? { obligationId, status: 'counterevidence' as const, rangeIndexes: [1] }
      : { obligationId, status: 'unknown' as const, rangeIndexes: [] }),
  })
  expect(incomplete.id).not.toBe(complete.id)
  expect(() => selectActionEvidence({ ...input, sources: [source, complete, incomplete], selectedEvidenceProjectionIds: [incomplete.id] }))
    .toThrow(/explicitly selected.*leaves .* obligation\(s\) unknown/i)
})
