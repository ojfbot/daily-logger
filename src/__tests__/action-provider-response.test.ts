import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureEvidenceView } from './evidence-view-fixtures.js'
import { ActionRegistrySchema, captureDraftActionCandidates } from '../action-registry.js'
import { generationActionCycle } from '../action-review-cycle.js'

const { create, countTokens, constructed } = vi.hoisted(() => ({
  create: vi.fn(), countTokens: vi.fn(), constructed: vi.fn(),
}))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  constructor(options: unknown) { constructed(options) }
  messages = { create, countTokens }
} }))
import { actionProviderRequest, createActionAgents, reviewArticleActions } from '../review-actions.js'

const empty = { changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] }
const response = (input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tool_offline', name: 'review_actions', input }], usage: { output_tokens: 100 } })
const source = { id: 'facts', kind: 'repository' as const, locator: 'evidence.md', content: 'The owner must approve the preview.\nThe current gate remains open.' }
const citation = { sourceId: 's1', startLine: 1, endLine: 1 }
const captured = captureDraftActionCandidates([{ command: '/review', repo: 'daily-logger', description: 'Inspect the bounded preview.', status: 'open', sourceDate: '2026-10-21' }])
const proposal = {
  changes: [{ actionKey: 'carried', state: 'open', description: 'Obtain owner approval.', reason: 'The explicit gate remains open.', citations: [citation] }],
  suggestions: [{ command: '/review', repo: 'daily-logger', description: 'Inspect the bounded preview.', target: 'preview', outcome: 'Owner records a decision.',
    goal: 'Preserve the owner gate.', doneWhen: 'Owner approval is recorded.', gates: ['Owner approval required.'], existingKey: null,
    factCitations: [citation], goalCitations: [citation] }],
  candidateDispositions: [{ candidateId: captured[0].candidateId, kind: 'promote', suggestionIndex: 0, reason: 'Review the exact captured candidate.' }],
  closingOptions: [{ kind: 'candidate', candidateIndex: 0, title: 'Inspect the preview', entryPoint: 'Open the preview.', context: 'The owner gate remains open.',
    whyNow: 'Current evidence keeps the gate relevant.', outcome: 'Obtain owner approval.', nextCheck: 'Record the owner verdict.',
    benefit: 'Resolve the owner gate.', start: 'Read the evidence.', replaces: [], factCitations: [citation], goalCitations: [citation] }],
}
const verification = {
  changes: [{ actionKey: 'carried', verdict: 'pass', reason: 'Owner gate retained.' }],
  suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Current sources support review.', existingKey: null }],
  candidateDispositions: [{ candidateId: captured[0].candidateId, verdict: 'pass', reason: 'Exact captured identity checked.' }],
  closingOptions: [{ optionIndex: 0, verdict: 'hold', reason: 'Owner approval is still required.' }],
}

beforeEach(() => {
  create.mockReset().mockResolvedValue(response(empty))
  countTokens.mockReset().mockResolvedValue({ input_tokens: 1000 })
  constructed.mockClear()
})

function reviewInput() {
  const date = '2026-10-21'
  return { registry: ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] }),
    articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\n---\nOffline review.\n`, feedback: '', sources: [],
    agents: createActionAgents(), articleStatuses: new Map([[date, 'draft']]) }
}

describe('native-validated forced-tool response boundary', () => {
  it('preserves both nonempty native roles and full count/create parity without a provider strict flag', async () => {
    const wire = { ...proposal, suggestions: proposal.suggestions.map(({ command: _command, repo: _repo, description: _description, ...fields }) => ({ ...fields, identity: { kind: 'captured', candidateId: captured[0].candidateId } })) }
    create.mockResolvedValueOnce(response(wire)).mockResolvedValueOnce(response(verification))
    const agents = createActionAgents()
    const result = await agents.propose('Complete unmodified evidence.', fixtureEvidenceView([source]), { articleDate: '2026-10-21', draftCandidates: captured, actionKeys: ['carried'] })
    expect(result).toEqual({ ...proposal,
      changes: proposal.changes.map(change => ({ ...change, citations: [{ sourceId: 's1', quote: source.content.split('\n')[0], sourceLineStart: 1, sourceLineEnd: 1 }] })),
      suggestions: proposal.suggestions.map(candidate => ({ ...candidate, factCitations: [{ sourceId: 's1', quote: source.content.split('\n')[0], sourceLineStart: 1, sourceLineEnd: 1 }], goalCitations: [{ sourceId: 's1', quote: source.content.split('\n')[0], sourceLineStart: 1, sourceLineEnd: 1 }] })),
      closingOptions: proposal.closingOptions.map(option => ({ ...option, factCitations: [{ sourceId: 's1', quote: source.content.split('\n')[0], sourceLineStart: 1, sourceLineEnd: 1 }], goalCitations: [{ sourceId: 's1', quote: source.content.split('\n')[0], sourceLineStart: 1, sourceLineEnd: 1 }] })),
    })
    expect(await agents.verify('Full independent verification.', fixtureEvidenceView([source]))).toEqual(verification)
    expect(constructed).toHaveBeenCalledExactlyOnceWith({ timeout: 120000, maxRetries: 0 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(countTokens).toHaveBeenCalledTimes(2)
    for (const [index, [request]] of create.mock.calls.entries()) {
      const { max_tokens, ...countRequest } = request
      expect(max_tokens).toBe(12000)
      expect(countTokens.mock.calls[index][0]).toEqual(countRequest)
      expect(request.model).toBe(index === 0 ? 'claude-sonnet-4-6' : 'claude-opus-4-6')
      expect(request.tools).toHaveLength(1)
      expect(request.tools[0]).not.toHaveProperty('strict')
      expect(request.tool_choice).toEqual({ type: 'tool', name: 'review_actions' })
      expect(request).toEqual(actionProviderRequest(index === 0 ? 'proposer' : 'verifier', request.messages[0].content))
    }
  })

  const malformed = [
    ['null response', null],
    ['missing stop', { content: response(empty).content }],
    ['missing content', { stop_reason: 'tool_use' }],
    ['empty content', { ...response(empty), content: [] }],
    ['wrong named tool', { ...response(empty), content: [{ ...response(empty).content[0], name: 'other_tool' }] }],
    ['missing tool identity', { ...response(empty), content: [{ type: 'tool_use', name: 'review_actions', input: empty }] }],
    ['missing tool input', { ...response(empty), content: [{ type: 'tool_use', id: 'tool_offline', name: 'review_actions' }] }],
    ['two tool blocks', { ...response(empty), content: [...response(empty).content, ...response(empty).content] }],
    ['text plus tool', { ...response(empty), content: [{ type: 'text', text: 'Claims are not evidence.' }, ...response(empty).content] }],
    ['text only', { ...response(empty), content: [{ type: 'text', text: JSON.stringify(empty) }] }],
    ['string payload', response(JSON.stringify(empty))],
    ['JSON string wrapper', response({ payload: JSON.stringify(empty) })],
    ['missing required arrays', response({ changes: [], suggestions: [] })],
    ['extra native fields', response({ ...empty, extra: 'Do not drop this field.' })],
    ['output usage above reserve', { ...response(empty), usage: { output_tokens: 12001 } }],
  ] as const
  it.each(malformed)('rejects %s for both native roles', async (_name, value) => {
    const agents = createActionAgents()
    for (const call of [agents.propose, agents.verify]) {
      create.mockResolvedValueOnce(value)
      await expect(call('Full evidence.', fixtureEvidenceView([source]))).rejects.toThrow()
    }
  })
  it.each(['changes', 'suggestions', 'candidateDispositions', 'closingOptions'])('requires the %s array from both provider roles', async section => {
    const agents = createActionAgents()
    const input = Object.fromEntries(Object.entries(empty).filter(([name]) => name !== section))
    for (const call of [agents.propose, agents.verify]) {
      create.mockResolvedValueOnce(response(input))
      await expect(call('Full evidence.', fixtureEvidenceView([source]))).rejects.toThrow()
    }
  })

  it('rejects invalid native verdicts at the provider boundary', async () => {
    create.mockResolvedValue(response({ ...verification, suggestions: [{ candidateIndex: -1, verdict: 'unknown', reason: '', existingKey: null }] }))
    await expect(createActionAgents().verify('Full evidence.', fixtureEvidenceView([source]))).rejects.toThrow()
  })
  it('rejects unseen source ranges without synthesizing a quote', async () => {
    create.mockResolvedValue(response({ ...proposal, candidateDispositions: [], suggestions: [], changes: [{ ...proposal.changes[0], citations: [{ ...citation, endLine: 99 }] }] }))
    await expect(createActionAgents().propose('Full evidence.', fixtureEvidenceView([source]))).rejects.toThrow(/citation range/)
  })

  it('repairs one malformed tool response through the existing complete review loop', async () => {
    create.mockResolvedValueOnce({ ...response(empty), content: [{ ...response(empty).content[0], name: 'wrong_tool' }] })
    const result = await reviewArticleActions(reviewInput())
    expect(result.registry.articles[0].review.state).toBe('verified')
    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
    expect(create.mock.calls[1][0].messages[0].content).toContain('Previous structured output was invalid')
  })
  it('repairs only the malformed verifier with its exact validated proposal and evidence', async () => {
    create.mockResolvedValueOnce(response(empty)).mockResolvedValueOnce(response({ changes: [], suggestions: [], candidateDispositions: [] }))
    const input = reviewInput(), viewCalls: unknown[] = []
    const verify = input.agents.verify
    input.agents.verify = async (prompt, view) => { viewCalls.push(view); return verify(prompt, view) }
    await reviewArticleActions(input)
    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-6'])
    const first = create.mock.calls[1][0].messages[0].content
    const repaired = create.mock.calls[2][0].messages[0].content
    expect(repaired).toContain('role=verifier')
    expect(repaired).toContain('candidateDispositions')
    expect(repaired.split('PROPOSAL (claims to verify, not evidence):')[0]).toBe(first.split('PROPOSAL (claims to verify, not evidence):')[0])
    expect(repaired.split('PROPOSAL (claims to verify, not evidence):\n')[1].split('\n')[0]).toBe(first.split('PROPOSAL (claims to verify, not evidence):\n')[1].split('\n')[0])
    expect(viewCalls[0]).toBe(viewCalls[1])
  })
  it.each([
    ['forbidden suggestionIndex', { candidateId: captured[0].candidateId, kind: 'reject', suggestionIndex: 0, reason: 'PRIVATE REASON', citations: [citation] }, 'suggestionIndex', 'reason,citations'],
    ['missing reason', { candidateId: captured[0].candidateId, kind: 'promote', suggestionIndex: 0 }, 'reason', 'suggestionIndex,reason'],
  ])('retains bounded trusted shape context for the logged-equivalent %s failure', async (_name, disposition, field, fields) => {
    create.mockResolvedValueOnce(response({ ...empty, candidateDispositions: [disposition] }))
    const error = await createActionAgents().propose('Full evidence.', fixtureEvidenceView([source]), { articleDate: '2026-10-21', draftCandidates: captured, actionKeys: [] }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) throw new Error('Missing validation failure')
    expect(error.message).toContain('role=proposer')
    expect(error.message).toContain('phase=tool-input')
    expect(error.message).toContain('candidateDispositions.0')
    expect(error.message).toContain(captured[0].candidateId)
    expect(error.message).toContain(field)
    for (const key of fields.split(',')) expect(error.message).toContain(key)
    expect(error.message).not.toContain('PRIVATE REASON')
    expect(Buffer.byteLength(error.message)).toBeLessThanOrEqual(2048)
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('shares one repair across roles without sending a verifier error back to the proposer', async () => {
    create.mockResolvedValueOnce(response({ ...empty, suggestions: null })).mockResolvedValueOnce(response(empty)).mockResolvedValueOnce(response({ ...empty, changes: null }))
    const input = reviewInput(), before = structuredClone(input.registry)
    await expect(reviewArticleActions(input)).rejects.toThrow()
    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
    expect(input.registry).toEqual(before)
  })
  it('never logs or replays arbitrary provider values, keys, IDs, reason text or issue messages', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      create.mockResolvedValueOnce(response({ ...empty, candidateDispositions: [{ candidateId: 'UNTRUSTED_ID', kind: 'PRIVATE_KIND', reason: 'PRIVATE_REASON', PRIVATE_KEY: 'PRIVATE_VALUE' }], PRIVATE_ROOT: 'PRIVATE_SOURCE' }))
      await reviewArticleActions(reviewInput())
      const repair = create.mock.calls[1][0].messages[0].content
      const logs = JSON.stringify(log.mock.calls)
      for (const secret of ['UNTRUSTED_ID', 'PRIVATE_KIND', 'PRIVATE_REASON', 'PRIVATE_KEY', 'PRIVATE_VALUE', 'PRIVATE_ROOT', 'PRIVATE_SOURCE']) {
        expect(repair).not.toContain(secret)
        expect(logs).not.toContain(secret)
      }
      expect(repair).toContain('role=proposer')
      expect(countTokens).toHaveBeenCalledTimes(3)
    } finally { log.mockRestore() }
  })
  it.each(['token-overflow', 'count-unavailable', 'provider-error'] as const)('never repairs %s as malformed output', async kind => {
    const failure = new Error('Offline provider transport failure')
    if (kind === 'token-overflow') countTokens.mockResolvedValue({ input_tokens: 188001 })
    if (kind === 'count-unavailable') countTokens.mockRejectedValue(failure)
    if (kind === 'provider-error') create.mockRejectedValue(failure)
    const input = reviewInput(), before = structuredClone(input.registry)
    const error = await reviewArticleActions(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(create).toHaveBeenCalledTimes(kind === 'provider-error' ? 1 : 0)
    expect(countTokens).toHaveBeenCalledTimes(1)
    if (kind === 'provider-error') expect(error).toBe(failure)
    expect(input.registry).toEqual(before)
  })
  it('requalifies the complete repair request and stops before another generation if its count cannot fit', async () => {
    create.mockResolvedValueOnce(response({ ...empty, closingOptions: null }))
    countTokens.mockResolvedValueOnce({ input_tokens: 1000 }).mockResolvedValueOnce({ input_tokens: 188001 })
    const input = reviewInput(), before = structuredClone(input.registry)
    await expect(reviewArticleActions(input)).rejects.toThrow(/exceeds token budget/)
    expect(countTokens).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(1)
    expect(input.registry).toEqual(before)
  })
  it('bounds many malformed fields and arbitrary oversized keys without retaining their content', async () => {
    create.mockResolvedValueOnce(response({ ...empty, candidateDispositions: Array.from({ length: 5 }, () => ({ candidateId: captured[0].candidateId, kind: 'reject', reason: 0, citations: null, suggestionIndex: 0, ['PRIVATE'.repeat(1000)]: 'PRIVATE_VALUE' })) }))
    const error = await createActionAgents().propose('Full evidence.', fixtureEvidenceView([source]), { articleDate: '2026-10-21', draftCandidates: captured, actionKeys: [] }).catch((caught: unknown) => caught)
    if (!(error instanceof Error)) throw new Error('Missing shape failure')
    expect(Buffer.byteLength(error.message)).toBeLessThanOrEqual(2048)
    expect(error.message).toContain('additionalIssues=')
    expect(error.message).not.toContain('PRIVATE')
    expect(error).not.toHaveProperty('cause')
    expect(error).not.toHaveProperty('issues')
  })
  it('does not negotiate past the one malformed-output repair', async () => {
    create.mockResolvedValue({ ...response(empty), content: [] })
    const input = reviewInput()
    await expect(reviewArticleActions(input)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
    expect(input.registry.records).toEqual([])
    expect(input.registry.articles).toEqual([])
  })
  it('stops incomplete output without retrying a truncated response', async () => {
    create.mockResolvedValue({ ...response(empty), stop_reason: 'max_tokens' })
    await expect(reviewArticleActions(reviewInput())).rejects.toThrow(/did not finish/)
    expect(create).toHaveBeenCalledTimes(1)
  })
  it.each([
    { stop_reason: 'max_tokens', content: [], usage: { output_tokens: 12001 } },
    { stop_reason: 'max_tokens', content: null, usage: { output_tokens: 'invalid' } },
    { stop_reason: 'end_turn', content: 'not a tool block', usage: null },
  ])('stops explicit $stop_reason before malformed content or usage can trigger a repair', async incomplete => {
    create.mockResolvedValue(incomplete)
    const error = await reviewArticleActions(reviewInput()).then(() => null, (caught: unknown) => caught)
    expect(create).toHaveBeenCalledTimes(1)
    expect(countTokens).toHaveBeenCalledTimes(1)
    expect(error).toMatchObject({ message: expect.stringContaining('did not finish') })
  })
})
