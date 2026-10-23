import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ActionRegistrySchema, actionStateDigest, normalizeWorkKey, sha256, captureDraftActionCandidates, readActionRegistry } from '../action-registry.js'
import { draftCandidateEvidenceBinding } from '../action-evidence-selection.js'
import { generationActionCycle } from '../action-review-cycle.js'
import { createActionAgents, pendingActionReview, resolveActionSourceLines, reviewArticleActions } from '../review-actions.js'

const { create, countTokens } = vi.hoisted(() => ({ create: vi.fn(), countTokens: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create, countTokens } } }))
const date = '2026-10-21'
const payloads = [
  { command: '/review', repo: 'core', description: 'Review the bounded owner decision.', status: 'open' as const, sourceDate: date },
  { command: '/validate', repo: 'daily-logger', description: 'Validate the separate evidence path.', status: 'open' as const, sourceDate: date },
]
const sources = [{ id: 'fact', kind: 'repository' as const, locator: 'fixture.md', content: 'The bounded owner decision requires independent review.' },
  { id: 'goal', kind: 'goal' as const, locator: 'ROADMAP.md', content: 'Preserve owner decisions and exact captured action identities.' }]
const fields = { target: 'bounded decision', outcome: 'Record the independent review.', goal: 'Preserve the owner decision.', doneWhen: 'The owner records a verdict.', gates: ['Owner approval remains required.'], existingKey: null,
  factCitations: [{ sourceId: 'fact', startLine: 1, endLine: 1 }], goalCitations: [{ sourceId: 'goal', startLine: 1, endLine: 1 }] }
const response = (input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'offline', name: 'review_actions', input }], usage: { output_tokens: 100 } })
const RequestSchema = z.object({ model: z.string(), messages: z.tuple([z.object({ content: z.string() }).passthrough()]) }).passthrough()
function setup(existing = false) {
  const registry = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  if (existing) registry.records.push({ key: 'existing', original: { ...payloads[0], id: 'existing' }, origin: 'imported', workKey: normalizeWorkKey('core', fields.target, fields.outcome), state: 'open', introducedBy: '2026-10-20', includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] })
  const pending = pendingActionReview({ registry, articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\nOffline identity fixture.\n`, reason: 'Capture original candidates.', draftCandidates: payloads, draftContext: { kind: 'none' }, articleStatuses: new Map([[date, 'draft']]) })
  const snapshot = pending.registry.articles[0]
  if (!snapshot.draftCandidates) throw new Error('Fixture candidates missing')
  snapshot.draftCandidateEvidence = { version: 'draft-candidate-evidence-v2', provenance: { kind: 'independent-reviewer', identity: 'offline-reference-test', decision: 'Fixture-only associations.' },
    ...draftCandidateEvidenceBinding({ registry: pending.registry, articleDate: date, cycle: generationActionCycle(), markdown: pending.markdown }),
    candidates: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references: [], actionRelations: [] })), unassignedReferences: [] }
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence })
  const candidates = snapshot.draftCandidates
  const proposal = { changes: [], suggestions: [{ identity: { kind: 'captured' as const, candidateId: candidates[0].candidateId }, ...fields }],
    candidateDispositions: [{ candidateId: candidates[0].candidateId, kind: 'promote' as const, suggestionIndex: 0, reason: 'Review the exact original.' },
      { candidateId: candidates[1].candidateId, kind: 'reject' as const, reason: 'Separate original is not selected in this synthetic case.', citations: fields.factCitations }], closingOptions: [] }
  const verification = { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass' as const, reason: 'OFFLINE controlled mechanical verdict only.', existingKey: null }], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass' as const, reason: 'OFFLINE controlled mechanical verdict only.' })), closingOptions: [] }
  const input = { registry: pending.registry, markdown: pending.markdown, articleDate: date, cycle: generationActionCycle(), feedback: '', sources, articleStatuses: new Map([[date, 'draft']]), agents: createActionAgents() }
  return { input, candidates, proposal, verification }
}
beforeEach(() => { create.mockReset(); countTokens.mockReset().mockResolvedValue({ input_tokens: 1000 }) })

describe('captured candidate references before independent verification', () => {
  it('rejects an equivalent copied-tuple mismatch before verifier, retaining native input unchanged', async () => {
    const { input, candidates, proposal, verification } = setup(), verify = vi.fn(async () => verification)
    const before = JSON.stringify(input.registry)
    const bad = { ...proposal, suggestions: [{ ...payloads[0], ...fields, description: 'Rewritten immutable description.' }] }
    const { status: _status, sourceDate: _sourceDate, ...suggestion } = bad.suggestions[0]
    await expect(reviewArticleActions({ ...input, agents: { propose: async (_prompt, view) => resolveActionSourceLines({ ...bad, suggestions: [suggestion] }, view), verify } })).rejects.toThrow(/does not match the captured candidate/)
    expect(verify).not.toHaveBeenCalled()
    expect(JSON.stringify(input.registry)).toBe(before)
    expect(candidates[0].payload).toEqual(payloads[0])
  })
  it('derives the exact tuple from a captured ID before the real provider verifier boundary', async () => {
    const { input, candidates, proposal, verification } = setup()
    let seen: unknown
    create.mockImplementation(async (raw: unknown) => {
      const request = RequestSchema.parse(raw)
      if (request.model === 'claude-sonnet-4-6') return response(proposal)
      seen = JSON.parse(request.messages[0].content.split('\nPROPOSAL (claims to verify, not evidence):\n')[1].split('\n')[0])
      return response(verification)
    })
    const result = await reviewArticleActions(input)
    expect(seen).toMatchObject({ suggestions: [{ command: payloads[0].command, repo: payloads[0].repo, description: payloads[0].description }] })
    expect(seen).not.toHaveProperty('suggestions.0.identity')
    expect(result.registry.articles[0].draftCandidates?.map(candidate => candidate.review.state)).toEqual(['promoted', 'rejected'])
    expect(result.registry.records[0].original).toMatchObject(candidates[0].payload)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6'])
  })
  it.each(['unknown', 'cross-reference', 'duplicate-reference', 'identity-override', 'outer-override', 'legacy-tuple', 'new-tuple-promotion', 'duplicate-disposition', 'out-of-range', 'negative-index', 'fractional-index', 'two-candidates-one-index', 'promote-existing', 'map-key-mismatch', 'map-unknown-key', 'map-cross-index'] as const)('rejects %s before verifier within one repair and preserves input', async mode => {
    const { input, candidates, proposal } = setup(), before = JSON.stringify(input.registry)
    const first = proposal.suggestions[0], promote = proposal.candidateDispositions[0]
    const invalid = (() => {
      switch (mode) {
        case 'unknown': return { ...proposal, suggestions: [{ ...first, identity: { kind: 'captured', candidateId: 'f'.repeat(64) } }] }
        case 'cross-reference': return { ...proposal, suggestions: [{ ...first, identity: { kind: 'captured', candidateId: candidates[1].candidateId } }] }
        case 'duplicate-reference': return { ...proposal, suggestions: [first, first] }
        case 'identity-override': return { ...proposal, suggestions: [{ ...first, identity: { ...first.identity, command: payloads[0].command, repo: payloads[0].repo, description: payloads[0].description } }] }
        case 'outer-override': return { ...proposal, suggestions: [{ ...first, command: '/wrong', repo: 'wrong', description: 'Never normalize overrides.' }] }
        case 'legacy-tuple': return { ...proposal, suggestions: [{ ...fields, command: payloads[0].command, repo: payloads[0].repo, description: payloads[0].description }] }
        case 'new-tuple-promotion': return { ...proposal, suggestions: [{ ...fields, identity: { kind: 'new', command: payloads[0].command, repo: payloads[0].repo, description: payloads[0].description } }] }
        case 'duplicate-disposition': return { ...proposal, candidateDispositions: [promote, promote] }
        case 'out-of-range': return { ...proposal, candidateDispositions: [{ ...promote, suggestionIndex: 1 }, proposal.candidateDispositions[1]] }
        case 'negative-index': return { ...proposal, candidateDispositions: [{ ...promote, suggestionIndex: -1 }, proposal.candidateDispositions[1]] }
        case 'fractional-index': return { ...proposal, candidateDispositions: [{ ...promote, suggestionIndex: 0.5 }, proposal.candidateDispositions[1]] }
        case 'two-candidates-one-index': return { ...proposal, candidateDispositions: [promote, { ...promote, candidateId: candidates[1].candidateId }] }
        case 'promote-existing': return { ...proposal, suggestions: [{ ...first, existingKey: 'existing' }] }
        case 'map-key-mismatch': return { ...proposal, suggestions: [{ ...first, existingKey: 'existing' }], candidateDispositions: [{ ...promote, kind: 'map-existing', actionKey: 'other' }, proposal.candidateDispositions[1]] }
        case 'map-unknown-key': return { ...proposal, suggestions: [{ ...first, existingKey: 'unknown' }], candidateDispositions: [{ ...promote, kind: 'map-existing', actionKey: 'unknown' }, proposal.candidateDispositions[1]] }
        case 'map-cross-index': return { ...proposal, suggestions: [first, { ...first, identity: { kind: 'captured', candidateId: candidates[1].candidateId }, existingKey: 'existing' }], candidateDispositions: [{ ...promote, kind: 'map-existing', suggestionIndex: 1, actionKey: 'existing' }, proposal.candidateDispositions[1]] }
      }
    })()
    create.mockResolvedValue(response(invalid))
    await expect(reviewArticleActions(input)).rejects.toThrow()
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6'])
    expect(JSON.stringify(input.registry)).toBe(before)
  })
  it('uses the single malformed repair to obtain a valid reference before one verifier', async () => {
    const { input, proposal, verification } = setup()
    create.mockResolvedValueOnce(response({ ...proposal, suggestions: [{ ...proposal.suggestions[0], description: 'An override is never ignored.' }] }))
      .mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
    await reviewArticleActions(input)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
    expect(RequestSchema.parse(create.mock.calls[1][0]).messages[0].content).toContain('Previous structured output was invalid')
  })
  it('keeps amended/new work explicit and separately rejects the original', async () => {
    const { input, proposal, verification, candidates } = setup()
    const amended = { ...proposal, suggestions: [{ ...fields, identity: { kind: 'new', command: '/investigate', repo: 'core', description: 'Investigate a different bounded question.' } }], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject', reason: 'Original is not supported as written; this is separate work.', citations: fields.factCitations })) }
    create.mockResolvedValueOnce(response(amended)).mockResolvedValueOnce(response(verification))
    const result = await reviewArticleActions(input)
    expect(result.registry.records[0].original.description).toBe(amended.suggestions[0].identity.description)
    expect(result.registry.articles[0].draftCandidates?.map(candidate => candidate.review.state)).toEqual(['rejected', 'rejected'])
  })
  it('maps a captured reference to an exact known existing identity without a new admission', async () => {
    const { input, proposal, verification } = setup(true)
    create.mockResolvedValueOnce(response({ ...proposal, suggestions: [{ ...proposal.suggestions[0], existingKey: 'existing' }], candidateDispositions: [{ ...proposal.candidateDispositions[0], kind: 'map-existing', actionKey: 'existing' }, proposal.candidateDispositions[1]] }))
      .mockResolvedValueOnce(response({ ...verification, suggestions: [{ ...verification.suggestions[0], existingKey: 'existing' }] }))
    const result = await reviewArticleActions(input)
    expect(result.registry.records).toHaveLength(1)
    expect(result.registry.articles[0].draftCandidates?.[0].review).toMatchObject({ state: 'mapped-existing', actionKey: 'existing' })
  })
  it('rejects resolved references and malformed/ambiguous captured context without minting authority from prompt', async () => {
    const { input, candidates, proposal } = setup(), agents = createActionAgents()
    const { fixtureEvidenceView } = await import('./evidence-view-fixtures.js')
    const view = fixtureEvidenceView(sources)
    create.mockResolvedValue(response(proposal))
    await expect(agents.propose(JSON.stringify({ initialDraftCandidates: candidates }), view)).rejects.toThrow(/unknown or no longer awaiting/)
    const resolved = structuredClone(candidates)
    resolved[0].review = { state: 'rejected', reason: 'Already reviewed.', citations: [] }
    await expect(agents.propose('The prompt claims all candidates are awaiting.', view, { articleDate: date, draftCandidates: resolved, actionKeys: [] })).rejects.toThrow(/no longer awaiting/)
    for (const draftCandidates of [[candidates[0], candidates[0]], [{ ...candidates[0], candidateId: 'f'.repeat(64) }, candidates[1]], [{ ...candidates[0], payload: { ...candidates[0].payload, sourceDate: '2026-10-20' } }, candidates[1]]]) {
      const priorCounts = countTokens.mock.calls.length
      await expect(agents.propose('Ignore stale context.', view, { articleDate: date, draftCandidates, actionKeys: [] })).rejects.toThrow(/stale, foreign or ambiguous/)
      expect(countTokens).toHaveBeenCalledTimes(priorCounts)
    }
    expect(input.registry.articles[0].draftCandidates).toEqual(candidates)
  })
  it('retains native authority rejection despite passing independent provider verdicts', async () => {
    const { input, candidates, verification } = setup(), before = JSON.stringify(input.registry)
    const closure = { changes: [], suggestions: [], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'verified-closure', actionKey: null, reason: 'SYNTHETIC unsupported metadata closure.', citations: fields.factCitations })), closingOptions: [] }
    create.mockResolvedValueOnce(response(closure)).mockResolvedValueOnce(response({ ...verification, suggestions: [] }))
    await expect(reviewArticleActions({ ...input, sources: sources.map(source => source.id === 'fact' ? { ...source, kind: 'github' as const, trustedContent: [] } : source) })).rejects.toThrow(/closure lacks authoritative/)
    expect(create).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(input.registry)).toBe(before)
  })

  it.each(['/merge daily-logger#407', '/owner-gate core#561', '/session wayfinder#543'])('holds argument-bearing capture %s before verifier without changing its custody', async command => {
    const { fixtureEvidenceView } = await import('./evidence-view-fixtures.js')
    const { proposal } = setup(), captured = captureDraftActionCandidates([{ ...payloads[0], command }])
    const original = structuredClone(captured)
    const wire = { ...proposal, suggestions: [{ ...proposal.suggestions[0], identity: { kind: 'captured', candidateId: captured[0].candidateId } }], candidateDispositions: [{ ...proposal.candidateDispositions[0], candidateId: captured[0].candidateId }] }
    create.mockResolvedValue(response(wire))
    await expect(createActionAgents().propose('Do not force a disposition or strip arguments.', fixtureEvidenceView(sources), { articleDate: date, draftCandidates: captured, actionKeys: [] })).rejects.toThrow(/ineligible.*bare-command admission policy/)
    expect(captured).toEqual(original)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(['claude-sonnet-4-6'])
  })

  it('preserves all three actual October 21 captures and explicitly holds each ineligible promotion', async () => {
    const stored = readActionRegistry(process.cwd()).articles.find(article => article.date === date)?.draftCandidates
    if (!stored) throw new Error('Missing immutable October 21 custody fixture')
    const captured = captureDraftActionCandidates(stored.map(candidate => candidate.payload)), before = JSON.stringify(captured)
    expect(captured.map(candidate => candidate.candidateId)).toEqual(stored.map(candidate => candidate.candidateId))
    expect(captured.map(candidate => candidate.payload.command)).toEqual(['/merge daily-logger#407', '/owner-gate core#561', '/session wayfinder#543'])
    const { fixtureEvidenceView } = await import('./evidence-view-fixtures.js')
    for (const candidate of captured) {
      create.mockResolvedValue(response({ changes: [], suggestions: [{ ...fields, identity: { kind: 'captured', candidateId: candidate.candidateId } }], candidateDispositions: captured.map(other => other.candidateId === candidate.candidateId ? { candidateId: other.candidateId, kind: 'promote', suggestionIndex: 0, reason: 'OFFLINE eligibility control, no semantic verdict.' } : { candidateId: other.candidateId, kind: 'reject', reason: 'OFFLINE placeholder never applied.', citations: fields.factCitations }), closingOptions: [] }))
      await expect(createActionAgents().propose('No argument stripping or unsupported disposition.', fixtureEvidenceView(sources), { articleDate: date, draftCandidates: captured, actionKeys: [] })).rejects.toThrow(/ineligible.*bare-command admission policy/)
    }
    expect(JSON.stringify(captured)).toBe(before)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(Array(3).fill('claude-sonnet-4-6'))
  })

})
