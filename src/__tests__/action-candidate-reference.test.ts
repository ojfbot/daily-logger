import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ActionCommandSchema, CanonicalActionArraySchema, assertCanonicalActionHistoryConserved } from '../action-model.js'
import { writeActionStore } from './action-store-fixture.js'
import { applyVerifiedActionReview } from './evidence-view-fixtures.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ActionRegistrySchema, actionStateDigest, normalizeWorkKey, sha256, captureDraftActionCandidates, readActionRegistry, registryBytes, splitActionRegistry, hydrateActionRegistry, projectRegistry, assertExactInvocationAdmissions, renderArticleActions, type ActionRegistry } from '../action-registry.js'
import { draftCandidateEvidenceBinding, actionCommandSourceReferences, actionRecordSourceReferences, actionEvidenceScope, selectActionEvidence } from '../action-evidence-selection.js'
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
function setup(existing = false, command = payloads[0].command, repo = payloads[0].repo) {
  const capturedPayloads = payloads.map((payload, index) => index === 0 ? { ...payload, command, repo } : payload)
  const registry = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  if (existing) registry.records.push({ key: 'existing', original: { ...capturedPayloads[0], id: 'existing' }, origin: 'imported', workKey: normalizeWorkKey('core', fields.target, fields.outcome), state: 'open', introducedBy: '2026-10-20', includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] })
  const pending = pendingActionReview({ registry, articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\nOffline identity fixture.\n`, reason: 'Capture original candidates.', draftCandidates: capturedPayloads, draftContext: { kind: 'none' }, articleStatuses: new Map([[date, 'draft']]) })
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

  it.each(['/review exact first argument', '/review second preserved argument'])('admits exact captured invocation %s through verifier and native output', async command => {
    const { input, candidates, proposal, verification } = setup(false, command)
    const before = JSON.stringify(input.registry)
    let seen: unknown
    create.mockImplementation(async (raw: unknown) => {
      const request = RequestSchema.parse(raw)
      if (request.model === 'claude-sonnet-4-6') return response(proposal)
      seen = JSON.parse(request.messages[0].content.split('\nPROPOSAL (claims to verify, not evidence):\n')[1].split('\n')[0])
      return response(verification)
    })
    const result = await reviewArticleActions(input)
    expect(seen).toMatchObject({ suggestions: [{ command, repo: candidates[0].payload.repo, description: candidates[0].payload.description }] })
    expect(result.registry.records[0].original).toMatchObject({ ...candidates[0].payload, id: result.registry.records[0].key })
    expect(result.registry.records[0].original).not.toHaveProperty('review')
    expect(result.registry.articles[0].draftCandidates?.[0]).toEqual({ ...candidates[0], review: expect.objectContaining({ state: 'promoted', actionKey: result.registry.records[0].key }) })
    expect(result.registry.articles[0].reviewOutput?.createdRecords).toEqual([expect.objectContaining({ actionKey: result.registry.records[0].key, afterRecordSha256: sha256(JSON.stringify(result.registry.records[0])) })])
    expect(JSON.stringify(input.registry)).toBe(before)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6'])
  })

  it('resolves all three actual October 21 captured invocations without changing their payloads', async () => {
    const stored = readActionRegistry(process.cwd()).articles.find(article => article.date === date)?.draftCandidates
    if (!stored) throw new Error('Missing immutable October 21 custody fixture')
    const captured = captureDraftActionCandidates(stored.map(candidate => candidate.payload)), before = JSON.stringify(captured)
    expect(captured.map(candidate => candidate.candidateId)).toEqual(stored.map(candidate => candidate.candidateId))
    expect(captured.map(candidate => candidate.payload.command)).toEqual(['/merge daily-logger#407', '/owner-gate core#561', '/session wayfinder#543'])
    const { fixtureEvidenceView } = await import('./evidence-view-fixtures.js')
    for (const candidate of captured) {
      create.mockResolvedValue(response({ changes: [], suggestions: [{ ...fields, identity: { kind: 'captured', candidateId: candidate.candidateId } }], candidateDispositions: captured.map(other => other.candidateId === candidate.candidateId ? { candidateId: other.candidateId, kind: 'promote', suggestionIndex: 0, reason: 'OFFLINE eligibility control, no semantic verdict.' } : { candidateId: other.candidateId, kind: 'reject', reason: 'OFFLINE placeholder never applied.', citations: fields.factCitations }), closingOptions: [] }))
      const proposal = await createActionAgents().propose('Exact invocation custody; synthetic parser control only.', fixtureEvidenceView(sources), { articleDate: date, draftCandidates: captured, actionKeys: [] })
      expect(proposal).toMatchObject({ suggestions: [{ command: candidate.payload.command, repo: candidate.payload.repo, description: candidate.payload.description }] })
    }
    expect(JSON.stringify(captured)).toBe(before)
    expect(create.mock.calls.map(([request]) => RequestSchema.parse(request).model)).toEqual(Array(3).fill('claude-sonnet-4-6'))
  })

  async function admitInvocation(command = '/review exact preserved arguments') {
    const fixture = setup(false, command)
    create.mockResolvedValueOnce(response(fixture.proposal)).mockResolvedValueOnce(response(fixture.verification))
    const result = await reviewArticleActions(fixture.input)
    return { ...fixture, result }
  }

  it.each(['/review\nother', '/review\rother', '/review\tother', '/review a\u0000b', '/review a\u001bb', '/review a\u2028b', ' /review arg', '/review '])('refuses malformed invocation without normalization: %j', command => {
    expect(ActionCommandSchema.safeParse(command).success).toBe(false)
  })
  it('preserves permitted spacing instead of normalizing command identity', () => {
    const command = '/review  exact argument  '
    expect(ActionCommandSchema.parse(command)).toBe(command)
  })
  it('refuses an uncaptured full command from direct canonical agents before verifier', async () => {
    const { input, candidates } = setup(), verify = vi.fn()
    await expect(reviewArticleActions({ ...input, agents: { propose: async (_prompt, view) => resolveActionSourceLines({ changes: [], suggestions: [{ ...fields, command: '/review uncaptured', repo: 'core', description: 'No capture backs this work.' }], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject', reason: 'Synthetic original accounting.', citations: fields.factCitations })), closingOptions: [] }, view), verify } })).rejects.toThrow(/own exact captured/)
    expect(verify).not.toHaveBeenCalled()
  })
  it('keeps new wire tuples bare-only even when an independent original is rejected', async () => {
    const { input, candidates } = setup()
    create.mockResolvedValue(response({ changes: [], suggestions: [{ ...fields, identity: { kind: 'new', command: '/review uncaptured', repo: 'core', description: 'Cannot bypass captured identity.' } }], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject', reason: 'Synthetic accounting.', citations: fields.factCitations })), closingOptions: [] }))
    await expect(reviewArticleActions(input)).rejects.toThrow()
    expect(create.mock.calls.map(([raw]) => RequestSchema.parse(raw).model)).toEqual(['claude-sonnet-4-6','claude-sonnet-4-6'])
  })
  it('round-trips ordinary invocation birth proof and rejects missing, stale, foreign or imported proof', async () => {
    const { result } = await admitInvocation(), root = mkdtempSync(join(tmpdir(), 'exact-invocation-store-'))
    try {
      writeActionStore(root, result.registry)
      expect(registryBytes(readActionRegistry(root))).toBe(registryBytes(result.registry))
      const path = join(root, `actions/articles/${date}.json`), bytes = readFileSync(path, 'utf8')
      const corruptions = [
        (registry: ActionRegistry) => { delete registry.articles[0].reviewOutput },
        (registry: ActionRegistry) => { registry.articles[0].reviewOutput!.createdRecords[0].afterRecordSha256 = 'f'.repeat(64) },
        (registry: ActionRegistry) => { registry.articles[0].draftCandidateEvidence!.candidates[0].payloadSha256 = 'f'.repeat(64) },
        (registry: ActionRegistry) => { registry.articles[0].verification.promptVersion = 'action-review-v20-captured-candidate-references' },
        (registry: ActionRegistry) => { registry.articles[0].draftCandidates![0].review = { state: 'rejected', reason: 'No birth association.', citations: [] } },
        (registry: ActionRegistry) => { registry.records[0].original.command += ' altered' },
        (registry: ActionRegistry) => { registry.records[0].goal += ' altered' },
        (registry: ActionRegistry) => { registry.records[0].origin = 'imported' },
      ]
      for (const change of corruptions) {
        const registry = structuredClone(result.registry); change(registry)
        expect(() => assertExactInvocationAdmissions(registry)).toThrow(/invocation lacks/)
      }
      const file = JSON.parse(bytes); delete file.snapshot.reviewOutput
      writeFileSync(path, JSON.stringify(file))
      expect(() => readActionRegistry(root)).toThrow(/invocation lacks/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('keeps native birth proof through later same-article lifecycle, projections and reload', async () => {
    const { result } = await admitInvocation(), key = result.registry.records[0].key
    const command = result.registry.records[0].original.command, root = mkdtempSync(join(tmpdir(), 'exact-invocation-lifecycle-'))
    let registry = result.registry
    const original = structuredClone(registry.records[0].original)
    expect(projectRegistry(registry, new Map([[date,'draft']])).proposed[0].command).toBe(command)
    const cite = { sourceId: 'fact', quote: sources[0].content }
    try {
      for (const state of ['open', 'deferred', 'open', 'done'] as const) {
        const markdown = `---\ndate: ${date}\nstatus: accepted\n---\nSynthetic native lifecycle.`
        const priorEvidence = registry.articles[0].draftCandidateEvidence
        if (!priorEvidence) throw Error('Source-bound fixture evidence absent')
        const evidence = { ...priorEvidence, ...draftCandidateEvidenceBinding({ registry, articleDate: date, cycle: generationActionCycle(), markdown }) }
        registry = applyVerifiedActionReview({ registry, articleDate: date, cycle: generationActionCycle(), markdown, sources,
          roundId: sha256(`controlled ${state} ${registry.records[0].history.length}`), articleStatuses: new Map([[date,'accepted']]),
          draftCandidateEvidence: evidence,
          proposal: { changes: [{ actionKey: key, state, description: 'Current synthetic disposition.', reason: 'Controlled lifecycle mechanics, not actual October21 semantics.', citations: [cite] }], suggestions: [], candidateDispositions: [], closingOptions: [] },
          verification: { changes: [{ actionKey: key, verdict: 'pass', reason: 'Controlled offline verdict.' }], suggestions: [], candidateDispositions: [], closingOptions: [] } })
        expect(registry.records[0].original).toEqual(original)
        expect(registry.articles[0].candidateReviewHistory?.[0].reviewOutput.createdRecords[0].actionKey).toBe(key)
        writeActionStore(root, registry); registry = readActionRegistry(root)
        expect(registry.records[0].original.command).toBe(command)
        const view = projectRegistry(registry, new Map([[date,'accepted']]))
        const exportRoot = process.env.EXACT_INVOCATION_FIXTURE_OUT
        if (exportRoot && (state === 'open' || state === 'done')) {
          const directory = join(exportRoot, `${state}-${registry.records[0].history.length}`)
          mkdirSync(directory, { recursive: true })
          writeActionStore(directory, registry)
          writeFileSync(join(directory, 'article-input.md'), markdown)
          writeFileSync(join(directory, 'birth-draft-article.md'), result.markdown)
          expect(() => renderArticleActions(markdown, registry, date, new Map([[date,'accepted']]))).toThrow(/exactly three ranked/)
          writeFileSync(join(directory, 'render-hold.txt'), 'Accepted rendering refuses this one-action mechanical fixture: exactly three ranked suggestions are still required.\n')
          writeFileSync(join(directory, 'projection.json'), JSON.stringify(view, null, 2) + '\n')
          writeFileSync(join(directory, 'record.json'), JSON.stringify(registry.records[0], null, 2) + '\n')
          writeFileSync(join(directory, 'qualification.txt'), 'SYNTHETIC OFFLINE native lifecycle fixture, not actual October21 approval or provider verdict.\n')
        }

        if (state === 'open') expect(view.open[0].command).toBe(command)
        if (state === 'deferred') expect(view.dispositions[0]).toMatchObject({ id: key, state: 'deferred' })
        if (state === 'done') {
          expect(CanonicalActionArraySchema.parse(view.done)[0]).toMatchObject({ id: key, command, status: 'done' })
          expect(() => assertCanonicalActionHistoryConserved({ baselineOpen: [original], baselineDone: [], currentOpen: [], currentDone: view.done })).not.toThrow()
        }
      }
      const split = splitActionRegistry(registry)
      expect(hydrateActionRegistry(split.baseline, split.files).records[0].original).toEqual(original)
      const broken = structuredClone(split.files); broken[0].snapshot.candidateReviewHistory = []
      expect(() => hydrateActionRegistry(split.baseline, broken)).toThrow(/invocation lacks/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it.each(['/review changed arguments', '/review'])('refuses map-existing across invocation mismatch %s despite passing verifier', async incoming => {
    const { result } = await admitInvocation(), before = registryBytes(result.registry), key = result.registry.records[0].key, nextDate = '2026-10-22'
    const captured = captureDraftActionCandidates([{ ...payloads[0], command: incoming, sourceDate: nextDate }])
    expect(() => applyVerifiedActionReview({ registry: result.registry, articleDate: nextDate, cycle: generationActionCycle(), markdown: 'Synthetic mapping control.', sources,
      roundId: sha256(incoming), articleStatuses: new Map([[date,'draft'],[nextDate,'draft']]), draftCandidates: captured,
      draftCandidateEvidence: result.registry.articles[0].draftCandidateEvidence,
      proposal: { changes: [], suggestions: [{ ...fields, command: incoming, repo: 'core', description: captured[0].payload.description, existingKey: key, factCitations: [{sourceId:'fact',quote:sources[0].content}], goalCitations: [{sourceId:'goal',quote:sources[1].content}] }], candidateDispositions: [{candidateId:captured[0].candidateId,kind:'map-existing',suggestionIndex:0,actionKey:key,reason:'Synthetic mapping.'}], closingOptions: [] },
      verification: { changes: [], suggestions: [{candidateIndex:0,existingKey:key,verdict:'pass',reason:'Controlled pass cannot waive exact identity.'}], candidateDispositions: [{candidateId:captured[0].candidateId,verdict:'pass',reason:'Controlled pass.'}], closingOptions: [] } })).toThrow(/Exact invocation mapping/)
    expect(registryBytes(result.registry)).toBe(before)
  })
  it('rejects a direct native full suggestion without its capture even with a passing verifier', () => {
    const { input, candidates } = setup()
    expect(() => applyVerifiedActionReview({ ...input, roundId: sha256('uncaptured native'), proposal: { changes: [], suggestions: [{...fields,command:'/review uncaptured',repo:'core',description:'No captured source.',factCitations:[{sourceId:'fact',quote:sources[0].content}],goalCitations:[{sourceId:'goal',quote:sources[1].content}]}],candidateDispositions:candidates.map(candidate=>({candidateId:candidate.candidateId,kind:'reject',reason:'Synthetic accounting.',citations:[{sourceId:'fact',quote:sources[0].content}]})),closingOptions:[]}, verification:{changes:[],suggestions:[{candidateIndex:0,verdict:'pass',reason:'Cannot grant missing custody.',existingKey:null}],candidateDispositions:candidates.map(candidate=>({candidateId:candidate.candidateId,verdict:'pass',reason:'Controlled.'})),closingOptions:[]} })).toThrow(/own exact captured/)
  })

  it.each([false, true])('preserves birth when a later review is pending with reset=%s', async resetDraftCandidateReviews => {
    const { result } = await admitInvocation()
    const pending = pendingActionReview({ registry: result.registry, articleDate: date, cycle: generationActionCycle(), markdown: result.markdown,
      reason: 'Controlled later provider failure.', articleStatuses: new Map([[date,'draft']]), resetDraftCandidateReviews })
    const split = splitActionRegistry(pending.registry)
    expect(hydrateActionRegistry(split.baseline, split.files).records[0].original.command).toBe(result.registry.records[0].original.command)
    expect(pending.registry.articles[0].candidateReviewHistory).toHaveLength(1)
  })
  it.each(['/review historical argument', '/review changed argument', '/review  changed argument'])('retains an ambiguous historical hold for %s', async command => {
    const { input, proposal, verification } = setup(false, command)
    input.registry.baseline.heldSuggestions.push({articlePath:'_articles/2026-10-01.md',sourceDate:'2026-10-01',line:1,invocation:'/review historical argument',suggestionLineSha256:'a'.repeat(64),suggestion:'> - `/review historical argument` — Review the bounded owner decision. (core)'})
    // Explicitly rebind the synthetic independent input after adding held memory.
    const snapshot=input.registry.articles[0]
    if (!snapshot.draftCandidateEvidence) throw Error('Fixture metadata absent')
    Object.assign(snapshot.draftCandidateEvidence,draftCandidateEvidenceBinding({registry:input.registry,articleDate:date,cycle:generationActionCycle(),markdown:input.markdown}))
    snapshot.stateDigest=actionStateDigest(input.registry,snapshot.actionKeys,snapshot.closing,snapshot.draftContext,{articleDate:date,roundId:snapshot.roundId,includePriorArticleRounds:true,draftCandidates:snapshot.draftCandidates,draftCandidateEvidence:snapshot.draftCandidateEvidence})
    create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
    await expect(reviewArticleActions(input)).rejects.toThrow(/promotion was not admitted/)
    expect(input.registry.records).toHaveLength(0)
  })

  it('maps an exact captured invocation to its cold-reloaded ordinary identity', async () => {
    const { result } = await admitInvocation(), split = splitActionRegistry(result.registry)
    const registry = hydrateActionRegistry(split.baseline, split.files), key = registry.records[0].key, nextDate = '2026-10-22'
    const payload = { ...payloads[0], command: registry.records[0].original.command, sourceDate: nextDate }
    const captured = captureDraftActionCandidates([payload])
    const markdown = 'Synthetic exact existing mapping.'
    const priorEvidence = registry.articles[0].draftCandidateEvidence
    if (!priorEvidence) throw Error('Source-bound fixture missing')
    const evidence = { ...priorEvidence, ...draftCandidateEvidenceBinding({registry,articleDate:nextDate,cycle:generationActionCycle(),markdown,feedback:'',articleStatuses:new Map([[date,'draft'],[nextDate,'draft']]),draftCandidates:captured}), candidates:captured.map(candidate=>({candidateId:candidate.candidateId,payloadSha256:sha256(JSON.stringify(candidate.payload)),references:[],actionRelations:[]})), unassignedReferences:[] }
    const next = applyVerifiedActionReview({ registry, articleDate: nextDate, cycle: generationActionCycle(), markdown, sources,
      roundId: sha256('exact cold map'), articleStatuses: new Map([[date,'draft'],[nextDate,'draft']]), draftCandidates: captured,
      proposal: { changes: [], suggestions: [{...fields,command:payload.command,repo:payload.repo,description:payload.description,existingKey:key,factCitations:[{sourceId:'fact',quote:sources[0].content}],goalCitations:[{sourceId:'goal',quote:sources[1].content}]}], candidateDispositions:[{candidateId:captured[0].candidateId,kind:'map-existing',suggestionIndex:0,actionKey:key,reason:'OFFLINE exact identity map.'}], closingOptions:[]},
      draftCandidateEvidence: evidence,
      verification:{changes:[],suggestions:[{candidateIndex:0,existingKey:key,verdict:'pass',reason:'OFFLINE controlled exact match.'}],candidateDispositions:[{candidateId:captured[0].candidateId,verdict:'pass',reason:'Controlled fixture.'}],closingOptions:[]} })
    expect(next.records).toHaveLength(1)
    expect(next.records[0].original).toEqual(registry.records[0].original)
    expect(next.articles.find(article=>article.date===nextDate)?.draftCandidates?.[0].review).toMatchObject({state:'mapped-existing',actionKey:key})
    expect(() => assertExactInvocationAdmissions(next)).not.toThrow()
  })

  it.each(['articleDate','canonicalIndexSha256','reviewCycle'] as const)('refuses foreign direct-apply full-invocation evidence %s', field => {
    const { input, candidates, verification } = setup(false, '/review exact bound invocation')
    const evidence = structuredClone(input.registry.articles[0].draftCandidateEvidence)
    if (!evidence) throw Error('Fixture source binding missing')
    if (field === 'articleDate') evidence.articleDate = '2020-01-01'
    if (field === 'canonicalIndexSha256') evidence.canonicalIndexSha256 = 'f'.repeat(64)
    if (field === 'reviewCycle') evidence.reviewCycle = {phase:'revision',id:'foreign'}
    expect(() => applyVerifiedActionReview({ ...input, roundId: sha256('foreign apply '+field), draftCandidateEvidence:evidence,
      proposal:{changes:[],suggestions:[{...fields,command:candidates[0].payload.command,repo:candidates[0].payload.repo,description:candidates[0].payload.description,factCitations:[{sourceId:'fact',quote:sources[0].content}],goalCitations:[{sourceId:'goal',quote:sources[1].content}]}],candidateDispositions:[{candidateId:candidates[0].candidateId,kind:'promote',suggestionIndex:0,reason:'Controlled source-bound admission.'},{candidateId:candidates[1].candidateId,kind:'reject',reason:'Controlled original accounting.',citations:[{sourceId:'fact',quote:sources[0].content}]}],closingOptions:[]},verification })).toThrow(/binding is stale or foreign/)
  })

  it('retains command-only compact targets in later collection, selection and subject duties', async () => {
    const { input, proposal, verification } = setup(false, '/review core#561')
    const metadata = input.registry.articles[0].draftCandidateEvidence
    if (!metadata) throw Error('Fixture evidence missing')
    metadata.candidates[0].references = [{classification:'required',reference:'core#561',role:'target',reason:'Explicit compact command target.'}]
    const snapshot = input.registry.articles[0]
    snapshot.stateDigest=actionStateDigest(input.registry,snapshot.actionKeys,snapshot.closing,snapshot.draftContext,{articleDate:date,roundId:snapshot.roundId,includePriorArticleRounds:true,draftCandidates:snapshot.draftCandidates,draftCandidateEvidence:metadata})
    const primary = {id:'github:core#561',kind:'github' as const,locator:'https://github.com/ojfbot/core/issues/561',content:'CURRENT API STATE core#561: state=open; head=not-a-PR; merged_at=none.',trustedContent:['CURRENT API STATE core#561: state=open; head=not-a-PR; merged_at=none.']}
    create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
    const result = await reviewArticleActions({...input,sources:[...sources,primary]})
    const record = result.registry.records[0]
    expect(record.history[0].citations.every(citation=>!citation.sourceId.startsWith('github:'))).toBe(true)
    expect(actionRecordSourceReferences(record)).toContain('core#561')
    expect([...actionCommandSourceReferences('/review core#561')]).toEqual(['core#561'])
    expect(()=>actionCommandSourceReferences('/review foreign#561 #561')).toThrow(/Unsupported qualified/)
    const later = {registry:result.registry,articleDate:'2026-10-22',cycle:generationActionCycle(),markdown:'Synthetic later action review.',feedback:`Review ${record.key}`,articleStatuses:new Map([[date,'draft'],['2026-10-22','draft']])}
    const scope = actionEvidenceScope(later)
    expect([...scope.refs]).toContain('core#561')
    expect(()=>selectActionEvidence({...later,sources})).toThrow(/required.*core#561|core#561.*required/i)
    const unrelated = { ...primary, id:'github:core#562', locator:'https://github.com/ojfbot/core/issues/562',content:'CURRENT API STATE core#562: state=closed; head=not-a-PR; merged_at=none.',trustedContent:['CURRENT API STATE core#562: state=closed; head=not-a-PR; merged_at=none.'] }
    expect(()=>applyVerifiedActionReview({...later,sources:[...sources,primary,unrelated],roundId:sha256('unrelated command-only subject'),proposal:{changes:[{actionKey:record.key,state:'done',description:'Unrelated synthetic completion.',reason:'A fake pass cannot change subject.',citations:[{sourceId:unrelated.id,quote:unrelated.content}]}],suggestions:[],candidateDispositions:[],closingOptions:[]},verification:{changes:[{actionKey:record.key,verdict:'pass',reason:'Controlled fake pass.'}],suggestions:[],candidateDispositions:[],closingOptions:[]}})).toThrow(/unrelated GitHub subject/)
  })

  it('does not admit a compact command target on unrelated required counterevidence despite fake verifier pass', async () => {
    const { input, proposal, verification } = setup(false, '/review core#561')
    const snapshot=input.registry.articles[0], metadata=snapshot.draftCandidateEvidence
    if (!metadata) throw Error('Fixture evidence missing')
    snapshot.draftContext={kind:'retained',markdown:'Target https://github.com/ojfbot/core/issues/561; counterevidence https://github.com/ojfbot/daily-logger/pull/407.'}
    Object.assign(metadata,draftCandidateEvidenceBinding({...input,draftContext:snapshot.draftContext}))
    metadata.candidates[0].references=[{classification:'required',reference:'core#561',role:'target',reason:'Exact command target.'}]
    metadata.unassignedReferences=[{classification:'required',reference:'daily-logger#407',role:'counterevidence',reason:'Required counterevidence is not the command subject.'}]
    snapshot.stateDigest=actionStateDigest(input.registry,snapshot.actionKeys,snapshot.closing,snapshot.draftContext,{articleDate:date,roundId:snapshot.roundId,includePriorArticleRounds:true,draftCandidates:snapshot.draftCandidates,draftCandidateEvidence:metadata})
    const primary={id:'github:core#561',kind:'github' as const,locator:'https://github.com/ojfbot/core/issues/561',content:'CURRENT API STATE core#561: state=open; head=not-a-PR; merged_at=none.',trustedContent:['CURRENT API STATE core#561: state=open; head=not-a-PR; merged_at=none.']}
    const other={id:'github:daily-logger#407',kind:'github' as const,locator:'https://github.com/ojfbot/daily-logger/pull/407',content:'CURRENT API STATE daily-logger#407: state=open; head=abc; merged_at=none.',trustedContent:['CURRENT API STATE daily-logger#407: state=open; head=abc; merged_at=none.']}
    create.mockResolvedValueOnce(response({...proposal,suggestions:[{...proposal.suggestions[0],factCitations:[{sourceId:other.id,startLine:1,endLine:1}]}]})).mockResolvedValueOnce(response(verification))
    const before=JSON.stringify(input.registry)
    await expect(reviewArticleActions({...input,sources:[...sources,primary,other]})).rejects.toThrow(/promotion was not admitted/)
    expect(create.mock.calls.map(([raw])=>RequestSchema.parse(raw).model)).toEqual(['claude-sonnet-4-6','claude-opus-4-6'])
    expect(JSON.stringify(input.registry)).toBe(before)
  })
  it('carries the existing reviewed wayfinder alias only with its explicit captured target association', async () => {
    expect(()=>actionCommandSourceReferences('/session wayfinder#543')).toThrow(/Ambiguous candidate target/)
    expect(()=>actionCommandSourceReferences('/session wayfinder#543',new Set(['core#543','daily-logger#543']))).toThrow(/Ambiguous candidate target/)
    expect([...actionCommandSourceReferences('/session wayfinder#543',new Set(['core#543']))]).toEqual(['core#543'])
    const { input, proposal, verification } = setup(false, '/session wayfinder#543', 'wayfinder')
    const snapshot=input.registry.articles[0], metadata=snapshot.draftCandidateEvidence
    if (!metadata) throw Error('Fixture evidence missing')
    snapshot.draftContext={kind:'retained',markdown:'Explicit reviewed target https://github.com/ojfbot/core/issues/543.'}
    Object.assign(metadata,draftCandidateEvidenceBinding({...input,draftContext:snapshot.draftContext}))
    metadata.candidates[0].references=[{classification:'required',reference:'core#543',role:'target',reason:'Existing narrowly reviewed association; no inferred new alias.'}]
    snapshot.stateDigest=actionStateDigest(input.registry,snapshot.actionKeys,snapshot.closing,snapshot.draftContext,{articleDate:date,roundId:snapshot.roundId,includePriorArticleRounds:true,draftCandidates:snapshot.draftCandidates,draftCandidateEvidence:metadata})
    const primary={id:'github:core#543',kind:'github' as const,locator:'https://github.com/ojfbot/core/issues/543',content:'CURRENT API STATE core#543: state=open; head=not-a-PR; merged_at=none.',trustedContent:['CURRENT API STATE core#543: state=open; head=not-a-PR; merged_at=none.']}
    create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
    const result=await reviewArticleActions({...input,sources:[...sources,primary]})
    const split=splitActionRegistry(result.registry),cold=hydrateActionRegistry(split.baseline,split.files),record=cold.records[0]
    expect(record.original.command).toBe('/session wayfinder#543')
    expect(record.original.repo).toBe('wayfinder')
    expect(actionRecordSourceReferences(record,cold)).toContain('core#543')
    expect([...actionEvidenceScope({registry:cold,articleDate:'2026-10-22',markdown:'Synthetic next review.',feedback:record.key,articleStatuses:new Map([[date,'draft']])}).refs]).toContain('core#543')
  })

})
