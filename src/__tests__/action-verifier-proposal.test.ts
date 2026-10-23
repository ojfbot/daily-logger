import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Response as SdkResponse } from '@anthropic-ai/sdk/_shims/registry'
import { ActionRegistrySchema, sha256 } from '../action-registry.js'
import { PreparedActionEvidenceView, ActionSourceCollection, actionEvidenceRegistryDigest, captureGithubActionSource } from '../action-evidence-view.js'
import { generationActionCycle } from '../action-review-cycle.js'
import { parseActionModelView } from '../action-model-view.js'
import { createActionAgents, reviewArticleActions, resolveActionSourceLines, ActionProposalSchema, actionVerificationProposal, applyVerifiedActionReview } from '../review-actions.js'

type SdkOptions = NonNullable<ConstructorParameters<typeof import('@anthropic-ai/sdk').default>[0]>
const transport = vi.hoisted(() => ({ fetch: vi.fn<NonNullable<SdkOptions['fetch']>>() }))
vi.mock('@anthropic-ai/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  return { ...actual, default: class extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super({ ...options, apiKey: 'offline-fixture-not-a-credential', fetch: transport.fetch })
    }
  } }
})
const requestSchema = z.object({ model: z.string(), max_tokens: z.number().optional(), system: z.string(), tools: z.array(z.object({ name: z.string(), strict: z.boolean().optional() }).passthrough()), tool_choice: z.object({ type: z.literal('tool'), name: z.literal('review_actions') }), messages: z.tuple([z.object({ role: z.literal('user'), content: z.string() })]) }).passthrough()
const date = '2099-01-02'
const quote = 'Owner approval remains mandatory; counterevidence stays visible. café é 🧪 "\\n. '.repeat(80)
const sources = [{ id: 'fact', kind: 'repository' as const, locator: 'offline-owner-gate.md', content: quote }, { id: 'goal', kind: 'goal' as const, locator: 'offline-goal.md', content: 'The owner decides after independent review.' }]
const markdown = `---\ndate: ${date}\nstatus: draft\n---\nOffline complete-round fixture.\n`
function seed() { return ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [{ key: 'existing', original: { id: 'existing', command: '/review', description: 'Retain the owner gate.', repo: 'core', status: 'open', sourceDate: date }, origin: 'imported', workKey: 'core|owner|decision', state: 'open', introducedBy: date, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] }], articles: [] }) }
const marker = '\nPROPOSAL (claims to verify, not evidence):\n'
beforeEach(() => { transport.fetch.mockReset() })

it('uses real SDK serialization for a bounded two-role round while retaining exact native quote records', async () => {
  const calls: Array<{ path: string; request: z.infer<typeof requestSchema>; bytes: number }> = []
  let proposed: ReturnType<typeof ActionProposalSchema.parse> | undefined
  transport.fetch.mockImplementation(async (url, init) => {
    if (typeof init?.body !== 'string') throw new Error('Expected actual SDK serialized JSON')
    const request = requestSchema.parse(JSON.parse(init.body)), prompt = request.messages[0].content
    calls.push({ path: new URL(String(url)).pathname, request, bytes: Buffer.byteLength(init.body) })
    if (String(url).endsWith('/count_tokens')) {
      // Synthetic counter reproduces the observed 188102+12000 refusal when
      // expanded proposal quotes are repeated. It is not a token estimate.
      const expanded = prompt.includes(marker) && prompt.slice(prompt.indexOf(marker)).includes('"quote":')
      return new SdkResponse(JSON.stringify({ input_tokens: expanded ? 188102 : 1000 }), { headers: { 'content-type': 'application/json' } })
    }
    let input: unknown
    if (request.model === 'claude-sonnet-4-6') {
      const view = parseActionModelView(prompt.slice(0, prompt.indexOf('\nReturn a change for every requiredActionKey.')))
      const fact = view.sources.find(source => source.locator === sources[0].locator), goal = view.sources.find(source => source.locator === sources[1].locator)
      if (!fact || !goal) throw new Error('Missing complete source view')
      const common = { factCitations: [{ sourceId: fact.id, startLine: 1, endLine: 1 }], goalCitations: [{ sourceId: goal.id, startLine: 1, endLine: 1 }] }
      input = { changes: [{ actionKey: 'existing', state: 'open', description: 'Retain the owner gate.', reason: 'Owner approval is still mandatory.', citations: common.factCitations }], suggestions: [{ command: '/review', repo: 'core', target: 'offline-fixture', outcome: 'Record owner decision.', description: 'Review the bounded fixture.', goal: 'Retain independent review.', doneWhen: 'The owner records a decision.', gates: ['Owner approval remains mandatory.'], existingKey: null, ...common }], candidateDispositions: [], closingOptions: [{ kind: 'candidate', candidateIndex: 0, title: 'Review the owner gate', benefit: 'Preserve the decision boundary.', start: 'Read the complete evidence.', entryPoint: 'offline-owner-gate.md', context: 'The owner gate remains.', whyNow: 'Current fixture evidence requires a decision.', outcome: 'Record a decision.', nextCheck: 'Obtain owner approval.', replaces: [], ...common }] }
    } else {
      const proposalText = prompt.slice(prompt.indexOf(marker) + marker.length).split('\n')[0]
      expect(proposalText).not.toContain('"quote":')
      expect(prompt).toContain(quote)
      input = { changes: [{ actionKey: 'existing', verdict: 'pass', reason: 'Owner gate retained.' }], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Complete source supports the fixture.', existingKey: null }], candidateDispositions: [], closingOptions: [{ optionIndex: 0, verdict: 'pass', reason: 'Owner decision remains required.' }] }
    }
    return new SdkResponse(JSON.stringify({ id: 'msg_offline', type: 'message', role: 'assistant', model: request.model, stop_reason: 'tool_use', stop_sequence: null, content: [{ type: 'tool_use', id: 'tool_offline', name: 'review_actions', input }], usage: { input_tokens: 1000, output_tokens: 500 } }), { headers: { 'content-type': 'application/json' } })
  })
  const agents = createActionAgents(), nativePropose = agents.propose
  agents.propose = async (prompt, view) => { proposed = ActionProposalSchema.parse(await nativePropose(prompt, view)); return proposed }
  const result = await reviewArticleActions({ registry: seed(), articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', sources, articleStatuses: new Map([[date, 'draft']]), agents })
  expect(result.registry.articles[0].review.state).toBe('verified')
  expect(result.registry.records).toHaveLength(2)
  expect(result.registry.records[0].history[0].citations[0]).toEqual({ sourceId: 'fact', quote, sourceLineStart: 1, sourceLineEnd: 1 })
  expect(result.registry.records[1].gates).toEqual(['Owner approval remains mandatory.'])
  expect(result.registry.records[1].history[0].citations[0].quote).toBe(quote)
  expect(proposed?.suggestions[0].factCitations[0].quote).toBe(quote)
  expect(calls.map(call => [call.path, call.request.model])).toEqual([['/v1/messages/count_tokens', 'claude-sonnet-4-6'], ['/v1/messages', 'claude-sonnet-4-6'], ['/v1/messages/count_tokens', 'claude-opus-4-6'], ['/v1/messages', 'claude-opus-4-6']])
  for (const [count, create] of [[calls[0], calls[1]], [calls[2], calls[3]]]) {
    const { max_tokens, ...body } = create.request
    expect(max_tokens).toBe(12000); expect(count.request).toEqual(body)
    expect(create.bytes).toBeLessThanOrEqual(655360)
    expect(create.request.tools[0]).not.toHaveProperty('strict')
  }
})

function completeProposal(view: PreparedActionEvidenceView, startLine = 4, endLine = 4) {
  const citation = { sourceId: 's1', startLine, endLine }
  const common = { factCitations: [citation], goalCitations: [citation] }
  const closing = { title: 'Retain owner decision', benefit: 'Preserve the gate.', start: 'Read complete sources.', entryPoint: 'fixture.md', context: 'Both owners remain visible.', whyNow: 'A decision is required.', outcome: 'Record the owner verdict.', nextCheck: 'Check counterevidence.', replaces: ['prior-owner-checkpoint'], ...common }
  return ActionProposalSchema.parse(resolveActionSourceLines({
    changes: [{ actionKey: 'existing', state: 'open', description: 'Keep owner gate.', reason: 'Unchanged duty.', citations: [citation] }],
    suggestions: [{ command: '/review', repo: 'core', description: 'Review owner evidence.', target: 'owner-fixture', outcome: 'A recorded decision.', goal: 'Independent review.', doneWhen: 'Owner verdict recorded.', gates: ['Owner approval', 'Counterevidence remains required'], existingKey: null, ...common }],
    candidateDispositions: [
      { candidateId: 'a'.repeat(64), kind: 'promote', suggestionIndex: 0, reason: 'Exact immutable payload.' },
      { candidateId: 'b'.repeat(64), kind: 'map-existing', suggestionIndex: 0, actionKey: 'existing', reason: 'Exact existing identity.' },
      { candidateId: 'c'.repeat(64), kind: 'reject', reason: 'Counterevidence retained.', citations: [citation] },
      { candidateId: 'd'.repeat(64), kind: 'verified-closure', actionKey: null, reason: 'Primary evidence retained.', citations: [citation] },
    ],
    closingOptions: [{ kind: 'action', actionKey: 'existing', ...closing }, { kind: 'candidate', candidateIndex: 0, ...closing }, { kind: 'checkpoint', target: 'https://example.test/owner', ...closing }],
  }, view))
}
const duplicate = 'Identical wording, distinct owner context.'
const repeatedSource = { id: 'owner-source', kind: 'repository' as const, locator: 'owner-context.md', content: `Owner A\n${duplicate}\nOwner B\n${duplicate}\ncafé é 🧪 literal \" \\n\nSecond Unicode line.` }
function prepared(source = repeatedSource) { return PreparedActionEvidenceView.prepare([source], sha256('case'), sha256('state')) }

it('keeps every typed proposal field/index and the original repeated-text location exactly', () => {
  const view = prepared(), proposal = completeProposal(view), original = structuredClone(proposal)
  const compact = actionVerificationProposal(proposal, view)
  expect(compact.changes[0].citations).toEqual([{ sourceId: 's1', startLine: 4, endLine: 4 }])
  expect(JSON.stringify(compact)).not.toContain('"quote":')
  expect(ActionProposalSchema.parse(resolveActionSourceLines(compact, view))).toEqual(original)
  expect(proposal).toEqual(original)
  expect(view.promptSources()[0].content).toContain(`L3: Owner B\nL4: ${duplicate}`)
})

it('round-trips multiline Unicode and literal escapes without normalization or reverse lookup', () => {
  const view = prepared(), proposal = completeProposal(view, 5, 6)
  const compact = actionVerificationProposal(proposal, view)
  expect(compact.suggestions[0].factCitations).toEqual([{ sourceId: 's1', startLine: 5, endLine: 6 }])
  expect(ActionProposalSchema.parse(resolveActionSourceLines(compact, view))).toEqual(proposal)
  expect(proposal.changes[0].citations[0].quote).toBe(repeatedSource.content.split('\n').slice(4, 6).join('\n'))
})

it.each(['quote', 'source', 'start', 'end', 'reversed', 'missing-start', 'missing-end'])('rejects dishonest or drifted %s before removing quote bytes', mode => {
  const view = prepared(), proposal = completeProposal(view), citation = proposal.changes[0].citations[0]
  if (mode === 'quote') citation.quote = 'Different owner approval.'
  if (mode === 'source') citation.sourceId = `owner-source@${'f'.repeat(64)}`
  if (mode === 'start') citation.sourceLineStart = 0
  if (mode === 'end') citation.sourceLineEnd = 99
  if (mode === 'reversed') { citation.sourceLineStart = 5; citation.sourceLineEnd = 4 }
  if (mode === 'missing-start') delete citation.sourceLineStart
  if (mode === 'missing-end') delete citation.sourceLineEnd
  expect(() => actionVerificationProposal(proposal, view)).toThrow()
})

it('keeps empty and absent citation validation at the existing native boundary', () => {
  const view = prepared(), proposal = completeProposal(view)
  proposal.changes[0].citations[0].quote = ''
  expect(() => ActionProposalSchema.parse(proposal)).toThrow()
  proposal.changes[0].citations = []
  expect(() => ActionProposalSchema.parse(proposal)).toThrow()
})

it('rejects a source view whose original line bytes changed', () => {
  const proposal = completeProposal(prepared())
  const drift = prepared({ ...repeatedSource, content: repeatedSource.content.replaceAll(duplicate, 'Different owner obligation.') })
  expect(() => actionVerificationProposal(proposal, drift)).toThrow(/quote differs/)
})

it('cannot turn an unseen collector metadata row into a verifier citation', () => {
  const record = { id: 1, html_url: 'https://github.com/ojfbot/core/issues/1', author_association: 'OWNER', user: { id: 1, login: 'owner', avatar_url: 'https://example.test/avatar' }, body: 'A complete visible owner duty.' }
  const capture = captureGithubActionSource({ id: 'github:core#1', locator: record.html_url, observation: 'CURRENT API STATE', responses: [JSON.stringify(record)], trustedContent: [record.body] })
  const source = capture.source, collection = new ActionSourceCollection([source], [capture])
  const view = PreparedActionEvidenceView.prepare(collection, sha256('hidden-case'), sha256('state'), collection)
  const proposal = ActionProposalSchema.parse({ changes: [{ actionKey: 'existing', state: 'open', description: 'Retain duty.', reason: 'Fixture only.', citations: [{ sourceId: 's1', quote: source.content.split('\n')[1], sourceLineStart: 2, sourceLineEnd: 2 }] }], suggestions: [] })
  expect(() => actionVerificationProposal(proposal, view)).toThrow(/partial metadata/)
})

it('keeps verifier proposal size independent of repeated expanded quote length', () => {
  const sizes = [12, 1000, 16000].map(length => {
    const source = { ...repeatedSource, content: 'x'.repeat(length) }, view = prepared(source), proposal = completeProposal(view, 1, 1)
    const compact = actionVerificationProposal(proposal, view)
    expect(ActionProposalSchema.parse(resolveActionSourceLines(compact, view))).toEqual(proposal)
    return { full: Buffer.byteLength(JSON.stringify(proposal)), compact: Buffer.byteLength(JSON.stringify(compact)) }
  })
  expect(sizes[2].full - sizes[0].full).toBe(175868)
  expect(sizes.map(value => value.compact)).toEqual([sizes[0].compact, sizes[0].compact, sizes[0].compact])
  expect(sizes[2].compact).toBeLessThan(5000)
})

it('produces identical native records, proposal hashes and exact citations after compact round-trip', () => {
  const registry = seed(), view = PreparedActionEvidenceView.prepare(sources, sha256('equivalent-case'), actionEvidenceRegistryDigest(registry, date))
  const citation = view.resolve('fact', 1, 1)
  const proposal = ActionProposalSchema.parse({ changes: [{ actionKey: 'existing', state: 'open', description: 'Retain the owner gate.', reason: 'Owner approval remains mandatory.', citations: [citation] }], suggestions: [] })
  const restored = resolveActionSourceLines(actionVerificationProposal(proposal, view), view)
  const input = { registry, articleDate: date, cycle: generationActionCycle(), markdown, sources, evidenceView: view, roundId: view.roundId, articleStatuses: new Map([[date, 'draft']]), verification: { changes: [{ actionKey: 'existing', verdict: 'pass' as const, reason: 'Owner gate preserved.' }], suggestions: [] } }
  const direct = applyVerifiedActionReview({ ...input, proposal }), roundTrip = applyVerifiedActionReview({ ...input, proposal: restored })
  expect(roundTrip).toEqual(direct)
  expect(roundTrip.articles[0].roundId).toBe(view.roundId)
  expect(view.receipt.rawCaseDigest).toBe(sha256('equivalent-case'))
  expect(roundTrip.records[0].history[0].citations[0].quote).toBe(quote)
  expect(roundTrip.articles[0].verification.proposalSha256).toBe(direct.articles[0].verification.proposalSha256)
})


it('preserves legacy literal history while refusing current-view substring proposals without widening them', () => {
  const fragment = 'wording, distinct owner'
  const legacy = seed()
  legacy.records[0].history.push({ roundId: sha256('legacy-round'), articleDate: date, state: 'open', description: 'Retain owner history.', reason: 'Historical literal quotation.', citations: [{ sourceId: 'owner-source', quote: fragment }], verifiedBy: 'legacy-reviewer', verificationReason: 'Historical native record.' })
  const restored = ActionRegistrySchema.parse(JSON.parse(JSON.stringify(legacy)))
  expect(restored).toEqual(legacy)
  expect(restored.records[0].history[0].citations).toEqual([{ sourceId: 'owner-source', quote: fragment }])
  const proposal = ActionProposalSchema.parse({ changes: [{ actionKey: 'existing', state: 'open', description: 'Retain owner duty.', reason: 'Fixture only.', citations: [{ sourceId: 'owner-source', quote: fragment }] }], suggestions: [] })
  const registry = seed(), evidence = [repeatedSource]
  const view = PreparedActionEvidenceView.prepare(evidence, sha256('legacy-boundary-case'), actionEvidenceRegistryDigest(registry, date))
  const original = structuredClone(proposal)
  // This complete-line gate already governed current application at the base.
  expect(() => applyVerifiedActionReview({ registry, articleDate: date, cycle: generationActionCycle(), markdown, sources: evidence, evidenceView: view, roundId: view.roundId, proposal, verification: { changes: [{ actionKey: 'existing', verdict: 'pass', reason: 'Fixture only.' }], suggestions: [] }, articleStatuses: new Map([[date, 'draft']]) })).toThrow(/original line endpoints/)
  expect(() => actionVerificationProposal(proposal, view)).toThrow(/original line endpoints/)
  expect(proposal).toEqual(original)
})
