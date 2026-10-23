import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureEvidenceView } from './evidence-view-fixtures.js'
import { ActionRegistrySchema } from '../action-registry.js'
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
const proposal = {
  changes: [{ actionKey: 'carried', state: 'open', description: 'Obtain owner approval.', reason: 'The explicit gate remains open.', citations: [citation] }],
  suggestions: [{ command: '/review', repo: 'daily-logger', description: 'Inspect the bounded preview.', target: 'preview', outcome: 'Owner records a decision.',
    goal: 'Preserve the owner gate.', doneWhen: 'Owner approval is recorded.', gates: ['Owner approval required.'], existingKey: null,
    factCitations: [citation], goalCitations: [citation] }],
  candidateDispositions: [{ candidateId: 'a'.repeat(64), kind: 'promote', suggestionIndex: 0, reason: 'Review the exact captured candidate.' }],
  closingOptions: [{ kind: 'candidate', candidateIndex: 0, title: 'Inspect the preview', entryPoint: 'Open the preview.', context: 'The owner gate remains open.',
    whyNow: 'Current evidence keeps the gate relevant.', outcome: 'Obtain owner approval.', nextCheck: 'Record the owner verdict.',
    benefit: 'Resolve the owner gate.', start: 'Read the evidence.', replaces: [], factCitations: [citation], goalCitations: [citation] }],
}
const verification = {
  changes: [{ actionKey: 'carried', verdict: 'pass', reason: 'Owner gate retained.' }],
  suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Current sources support review.', existingKey: null }],
  candidateDispositions: [{ candidateId: 'a'.repeat(64), verdict: 'pass', reason: 'Exact captured identity checked.' }],
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
    create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
    const agents = createActionAgents()
    const result = await agents.propose('Complete unmodified evidence.', fixtureEvidenceView([source]))
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
    create.mockResolvedValue(response({ ...proposal, changes: [{ ...proposal.changes[0], citations: [{ ...citation, endLine: 99 }] }] }))
    await expect(createActionAgents().propose('Full evidence.', fixtureEvidenceView([source]))).rejects.toThrow(/citation range/)
  })

  it('repairs one malformed tool response through the existing complete review loop', async () => {
    create.mockResolvedValueOnce({ ...response(empty), content: [{ ...response(empty).content[0], name: 'wrong_tool' }] })
    const result = await reviewArticleActions(reviewInput())
    expect(result.registry.articles[0].review.state).toBe('verified')
    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
    expect(create.mock.calls[1][0].messages[0].content).toContain('Previous structured output was invalid')
  })
  it('repairs one missing verifier array by repeating the same bounded proposer/verifier round', async () => {
    create.mockResolvedValueOnce(response(empty)).mockResolvedValueOnce(response({ changes: [], suggestions: [], candidateDispositions: [] }))
    await reviewArticleActions(reviewInput())
    expect(create.mock.calls.map(([request]) => request.model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
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
