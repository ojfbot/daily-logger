import { expect, it, vi } from 'vitest'
import { ActionRegistrySchema, actionStateDigest, readActionRegistry, sha256 } from '../action-registry.js'
import { ActionSourceCollection, PreparedActionEvidenceView, captureGithubActionSource } from '../action-evidence-view.js'
import { draftCandidateEvidenceBinding } from '../action-evidence-selection.js'
import { revisionActionCycle } from '../action-review-cycle.js'
import { parseActionModelView } from '../action-model-view.js'
import { ActionProposalSchema, actionVerificationInput, actionVerificationProposal, pendingActionReview, resolveActionSourceLines, reviewArticleActions, type ActionVerification } from '../review-actions.js'

const date = '2026-10-21'
const cycle = revisionActionCycle('offline-candidate-qualification')
const markdown = `---\ndate: ${date}\nstatus: draft\n---\nOffline tracking qualification, not an actual model verdict.\n`
const statuses = new Map([[date, 'draft']])
const originalCandidates = readActionRegistry(process.cwd()).articles.find(article => article.date === date)?.draftCandidates
if (!originalCandidates) throw new Error('Missing immutable October21 candidate custody')
const ownerId = 'a83670de3a4c36d23cd2016404b6825f86de689eb0a95ee47b7b98d8bd031ae3'
const sessionId = 'ccc62b6ac1492f339cf45d848d54bee639e5a633f7e5b3de7649a003cd3e1a2e'
// Synthetic evidence isolates tracking mechanics. Exact archived source bodies
// stay in private offline proof; these verdicts are not historical dispositions.
const ownerFact = 'The owner must choose accept, reshape or park. This synthetic decision request grants no implementation or dispatch authority.'
const captures = ['daily-logger#407', 'core#561', 'core#543'].map(reference => {
  const [repo, number] = reference.split('#')
  const body = reference === 'core#561' ? ownerFact : `Offline unrelated-target row for ${reference}; no actual disposition is established by this fixture.`
  return captureGithubActionSource({ id: `github:${reference}`, locator: `https://github.com/ojfbot/${repo}/issues/${number}`, observation: 'CURRENT API STATE',
    responses: [JSON.stringify({ number: Number(number), state: 'open', body, author_association: 'OWNER' })], trustedContent: [body] })
})
const goal = { id: 'goal', kind: 'goal' as const, locator: 'offline-tracking-goal.md', content: 'Prepare a source-backed owner disposition without authorizing execution or inventing owner acceptance.' }
const sources = new ActionSourceCollection(captures.map(capture => capture.source), captures).appendRaw([goal])

export function candidateQualificationFixture() {
  const empty = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  const pending = pendingActionReview({ registry: empty, articleDate: date, cycle, markdown, reason: 'Offline capture custody.', draftCandidates: originalCandidates?.map(candidate => candidate.payload), draftContext: { kind: 'retained', markdown: 'The captured wayfinder#543 alias refers only to https://github.com/ojfbot/core/issues/543. This fixture association authorizes no dispatch.' }, articleStatuses: statuses })
  const snapshot = pending.registry.articles[0]
  if (!snapshot.draftCandidates) throw new Error('Missing fixture captures')
  const candidates = snapshot.draftCandidates
  snapshot.draftCandidateEvidence = { version: 'draft-candidate-evidence-v2', provenance: { kind: 'independent-reviewer', identity: 'offline-qualification-control', decision: 'Controlled target bindings, not historical semantic approval.' },
    ...draftCandidateEvidenceBinding({ registry: pending.registry, articleDate: date, cycle, markdown: pending.markdown }),
    candidates: candidates.map((candidate, index) => ({ candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references: [{ classification: 'required' as const, reference: ['daily-logger#407', 'core#561', 'core#543'][index], role: 'target' as const, reason: 'Exact original target for isolated mechanics.' }], actionRelations: [] })), unassignedReferences: [] }
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: candidates, draftCandidateEvidence: snapshot.draftCandidateEvidence })
  const owner = candidates.find(candidate => candidate.candidateId === ownerId)
  if (!owner) throw new Error('Exact owner candidate missing')
  const view = PreparedActionEvidenceView.prepare(sources, sha256('offline-case'), sha256('offline-state'), sources, ['core#561'])
  const factSource = sources.find(source => source.id.startsWith('github:core#561'))
  if (!factSource) throw new Error('Owner source missing')
  const factLine = factSource.content.split('\n').findIndex(line => line.includes(ownerFact)) + 1
  const fact = { sourceId: factSource.id, startLine: factLine, endLine: factLine }
  const proposal = ActionProposalSchema.parse(resolveActionSourceLines({ changes: [], suggestions: [{ command: owner.payload.command, repo: owner.payload.repo, description: owner.payload.description,
    target: 'core#561', outcome: 'Record the owner disposition without starting implementation.', goal: 'Prepare a source-backed owner decision.',
    doneWhen: 'The owner records accept, reshape or park with a source-linked next checkpoint.', gates: ['No implementation, dispatch or owner decision is authorized by tracking.'], existingKey: null,
    factCitations: [fact], goalCitations: [{ sourceId: 'goal', startLine: 1, endLine: 1 }] }],
    candidateDispositions: candidates.map(candidate => candidate.candidateId === ownerId
      ? { candidateId: candidate.candidateId, kind: 'promote', suggestionIndex: 0, reason: 'Track an unresolved owner decision; do not execute it.' }
      : { candidateId: candidate.candidateId, kind: 'reject', reason: 'Controlled unrelated disposition used only to isolate the owner-follow-up mechanics.', citations: [fact] }), closingOptions: [] }, view))
  const verification: ActionVerification = { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'CONTROLLED tracking qualification, no actual semantic verdict.', existingKey: null }],
    candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass', reason: 'CONTROLLED fixture-only verdict, not historical approval.' })), closingOptions: [] }
  return { pending, candidates, view, proposal, verification, sources, context: { articleDate: date, draftCandidates: candidates, actionKeys: [] } }
}

it('pairs the exact original with its own proposed rationale, exposing rather than correcting an owner/session mix-up', () => {
  const { proposal, view, context } = candidateQualificationFixture()
  const ownerDisposition = proposal.candidateDispositions.find(disposition => disposition.candidateId === ownerId)
  if (!ownerDisposition) throw new Error('Missing owner disposition')
  ownerDisposition.reason = 'Reject because this candidate proposes unsupported parallel dispatch.'
  proposal.candidateDispositions.reverse()
  const input = actionVerificationInput({ proposal, view, context })
  const owner = input.initialDraftCandidates.find(candidate => candidate.candidateId === ownerId)
  const session = input.initialDraftCandidates.find(candidate => candidate.candidateId === sessionId)
  expect(owner?.payload.command).toBe('/owner-gate core#561')
  expect(owner?.payload.description).not.toContain('parallel')
  expect(owner?.proposedDisposition?.reason).toContain('parallel dispatch')
  expect(session?.payload.command).toBe('/session wayfinder#543')
  expect(session?.payload.description).toContain('parallel')
  expect(input.initialDraftCandidates.map(candidate => candidate.candidateId)).toEqual(originalCandidates?.map(candidate => candidate.candidateId))
})

it('relocates every disposition losslessly without duplicating payloads, proposals or quotes', () => {
  const { proposal, view, context } = candidateQualificationFixture(), before = structuredClone(proposal)
  proposal.candidateDispositions.reverse()
  const input = actionVerificationInput({ proposal, view, context })
  const dispositions = input.initialDraftCandidates.flatMap(candidate => candidate.proposedDisposition ? [{ candidateId: candidate.candidateId, ...candidate.proposedDisposition }] : [])
    .sort((a, b) => a.proposalIndex - b.proposalIndex).map(({ proposalIndex: _index, ...disposition }) => disposition)
  expect({ ...input.proposal, candidateDispositions: dispositions }).toEqual(actionVerificationProposal(proposal, view))
  expect(ActionProposalSchema.parse(resolveActionSourceLines({ ...input.proposal, candidateDispositions: dispositions }, view))).toEqual(proposal)
  expect(input.proposal).not.toHaveProperty('candidateDispositions')
  expect(JSON.stringify(input)).not.toContain('"quote":')
  expect(proposal.suggestions).toEqual(before.suggestions)
})

it.each(['missing', 'unknown', 'duplicate', 'cross-linked'] as const)('refuses %s association instead of concealing or normalizing it', mode => {
  const { proposal, view, context } = candidateQualificationFixture()
  if (mode === 'missing') proposal.candidateDispositions.pop()
  if (mode === 'unknown') proposal.candidateDispositions[0].candidateId = 'f'.repeat(64)
  if (mode === 'duplicate') proposal.candidateDispositions[0].candidateId = ownerId
  if (mode === 'cross-linked') proposal.suggestions[0].command = '/session wayfinder#543'
  expect(() => actionVerificationInput({ proposal, view, context })).toThrow()
})

it('retains already reviewed originals explicitly without manufacturing a new disposition', () => {
  const { proposal, view, context } = candidateQualificationFixture()
  context.draftCandidates[0].review = { state: 'rejected', reason: 'Controlled prior test disposition.', citations: [] }
  proposal.candidateDispositions = proposal.candidateDispositions.filter(disposition => disposition.candidateId !== context.draftCandidates[0].candidateId)
  const input = actionVerificationInput({ proposal, view, context })
  expect(input.initialDraftCandidates[0]).toMatchObject({ candidateId: context.draftCandidates[0].candidateId, proposedDisposition: null })
})

async function runFixture(hold?: string) {
  const fixtureInput = candidateQualificationFixture(), { pending, proposal, verification } = fixtureInput
  if (hold) verification.candidateDispositions = verification.candidateDispositions?.map(verdict => verdict.candidateId === ownerId ? { ...verdict, verdict: 'hold', reason: hold } : verdict)
  const propose = vi.fn(async () => proposal), verify = vi.fn(async (prompt: string) => {
    const marker = '\nPROPOSAL (claims to verify, not evidence):\n'
    const context = parseActionModelView(prompt.slice(0, prompt.indexOf(marker)))
    expect(context.initialDraftCandidatePolicy).toContain('nonexecuting follow-up')
    expect(context.initialDraftCandidatePolicy).toContain('concrete completion and all owner gates')
    expect(context.candidateDispositionEncoding).toBe('candidate-id-derived-indices-v2')
    expect(context.initialDraftCandidates).toContainEqual(expect.objectContaining({ candidateId: ownerId, payload: expect.objectContaining({ command: '/owner-gate core#561' }), proposedDisposition: expect.objectContaining({ kind: 'promote', suggestionIndex: 0 }) }))
    return verification
  })
  const input = { registry: pending.registry, markdown: pending.markdown, articleDate: date, cycle, feedback: '', sources, articleStatuses: statuses, agents: { propose, verify } }
  const before = JSON.stringify(input.registry)
  return { ...fixtureInput, input, before, propose, verify, result: reviewArticleActions(input) }
}

it('admits controlled nonexecuting tracking with concrete completion and owner gates, without rewriting an original', async () => {
  const { input, result, before, propose, verify } = await runFixture()
  const output = await result
  const record = output.registry.records[0]
  expect(record.original).toMatchObject(originalCandidates?.find(candidate => candidate.candidateId === ownerId)?.payload ?? {})
  expect(record.doneWhen).toContain('owner records accept, reshape or park')
  expect(record.gates).toEqual(['No implementation, dispatch or owner decision is authorized by tracking.'])
  expect(record.state).toBe('proposed')
  expect(record.original).not.toHaveProperty('invocation')
  expect(record.original).not.toHaveProperty('review')
  expect(JSON.stringify(input.registry)).toBe(before)
  expect(propose).toHaveBeenCalledTimes(1); expect(verify).toHaveBeenCalledTimes(1)
})

it('preserves an independent hold without negotiating or forcing a pass', async () => {
  const reason = 'The owner/session rationale needs independent review.'
  const { result, input, before, propose, verify } = await runFixture(reason)
  await expect(result).rejects.toThrow(`Initial draft candidate requires further review: ${ownerId}: ${reason}`)
  expect(JSON.stringify(input.registry)).toBe(before)
  expect(propose).toHaveBeenCalledTimes(1); expect(verify).toHaveBeenCalledTimes(1)
})

it('reuses an unchanged current-policy native round only after the new qualification ran', async () => {
  const { result, input, propose, verify } = await runFixture()
  const output = await result
  const repeated = await reviewArticleActions({ ...input, registry: output.registry, markdown: output.markdown })
  expect(repeated.cached).toBe(true)
  expect(propose).toHaveBeenCalledTimes(1); expect(verify).toHaveBeenCalledTimes(1)
})

it('exposes a session-based rejection of the owner original to an independent source-checking hold', async () => {
  const { pending, proposal, verification } = candidateQualificationFixture(), before = JSON.stringify(pending.registry)
  proposal.suggestions = []
  const citation = proposal.candidateDispositions.find(disposition => disposition.kind === 'reject')
  if (!citation || citation.kind !== 'reject') throw new Error('Missing controlled citation')
  proposal.candidateDispositions = ActionProposalSchema.shape.candidateDispositions.parse(proposal.candidateDispositions.map(disposition => disposition.candidateId === ownerId
    ? { candidateId: ownerId, kind: 'reject', reason: 'Reject the unsupported parallel-dispatch premise.', citations: citation.citations }
    : disposition).reverse())
  verification.suggestions = []
  const verify = vi.fn(async (prompt: string) => {
    const context = parseActionModelView(prompt.slice(0, prompt.indexOf('\nPROPOSAL (claims to verify, not evidence):\n')))
    const rows = context.initialDraftCandidates
    expect(rows).toContainEqual(expect.objectContaining({ candidateId: ownerId, payload: expect.objectContaining({ command: '/owner-gate core#561', description: expect.not.stringContaining('parallel') }), proposedDisposition: expect.objectContaining({ kind: 'reject', reason: 'Reject the unsupported parallel-dispatch premise.' }) }))
    expect(rows).toContainEqual(expect.objectContaining({ candidateId: sessionId, payload: expect.objectContaining({ description: expect.stringContaining('parallel') }) }))
    expect(context.sources.find(source => source.locator === 'https://github.com/ojfbot/core/issues/561')?.content).toContain(ownerFact)
    return { ...verification, candidateDispositions: verification.candidateDispositions?.map(verdict => verdict.candidateId === ownerId ? { ...verdict, verdict: 'hold', reason: 'The cited owner proposal remains a decision request; a parallel-session rationale does not refute this original.' } : verdict) }
  })
  await expect(reviewArticleActions({ registry: pending.registry, markdown: pending.markdown, articleDate: date, cycle, feedback: '', sources, articleStatuses: statuses, agents: { propose: async () => proposal, verify } })).rejects.toThrow('parallel-session rationale does not refute this original')
  expect(verify).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(pending.registry)).toBe(before)
})

it('retains concrete-completion validation and the one malformed repair before independent review', async () => {
  const { pending, proposal, verification } = candidateQualificationFixture(), before = JSON.stringify(pending.registry)
  proposal.suggestions[0].doneWhen = ''
  const propose = vi.fn(async () => proposal), verify = vi.fn(async () => verification)
  await expect(reviewArticleActions({ registry: pending.registry, markdown: pending.markdown, articleDate: date, cycle, feedback: '', sources, articleStatuses: statuses, agents: { propose, verify } })).rejects.toThrow()
  expect(propose).toHaveBeenCalledTimes(2); expect(verify).not.toHaveBeenCalled()
  expect(JSON.stringify(pending.registry)).toBe(before)
})
