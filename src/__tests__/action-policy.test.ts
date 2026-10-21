import { describe, expect, it, vi } from 'vitest'
import { ActionRegistrySchema, ArticleActionFileSchema, articleActionFileBytes, hydrateActionRegistry, projectRegistry, renderArticleActions, sha256, splitActionRegistry, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { acceptanceActionCycle, generationActionCycle, revisionActionCycle, type ActionReviewCycle } from '../action-review-cycle.js'
import { ActionProposalSchema, applyVerifiedActionReview, reviewArticleActions, reviewDraftActions, type ActionProposal, type ActionVerification } from '../review-actions.js'
import { parseActionModelView } from '../action-model-view.js'

const date = '2026-10-20'
const markdown = `---\ndate: ${date}\nstatus: draft\n---\nA bounded article.\n`
const statuses = new Map([[date, 'draft']])
const sources: ActionSource[] = [
  { id: 'facts', kind: 'repository', locator: 'evidence.md', content: 'Repository evidence verifies each concrete bounded gap and its recorded delivery or disproved premise.' },
  { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: 'Owner goal is a correct, bounded action queue.' },
]
function seed(): ActionRegistry {
  return ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
}
function candidate(index: number): ActionProposal['suggestions'][number] {
  return { command: '/investigate', repo: 'daily-logger', description: `Investigate bounded gap ${index}.`, target: `gap ${index}`, outcome: `Verified disposition ${index}`, goal: 'Correct bounded action queue',
    factCitations: [{ sourceId: 'facts', quote: 'Repository evidence verifies each concrete bounded gap' }], goalCitations: [{ sourceId: 'goal', quote: 'Owner goal is a correct, bounded action queue.' }],
    doneWhen: `Owner receives evidence for gap ${index}.`, gates: ['Owner decides any execution or merge.'], existingKey: null }
}
function carried(registry: ActionRegistry): ActionProposal['changes'] {
  const keys = registry.articles.find(article => article.date === date)?.actionKeys ?? []
  return registry.records.filter(record => keys.includes(record.key)).map(record => ({ actionKey: record.key, state: record.state === 'proposed' ? 'open' : record.state,
    description: record.history.at(-1)?.description ?? record.original.description, reason: 'Retain the independently checked disposition and owner gate.', citations: [{ sourceId: 'facts', quote: sources[0].content }] }))
}
function verdicts(proposal: ActionProposal): ActionVerification {
  return { changes: proposal.changes.map(change => ({ actionKey: change.actionKey, verdict: 'pass', reason: 'Exact obligation and owner gates checked.' })), suggestions: proposal.suggestions.map((_, candidateIndex) => ({ candidateIndex, verdict: 'pass', reason: 'Concrete factual and owner-goal support checked.', existingKey: null })) }
}
function apply(registry: ActionRegistry, cycle: ActionReviewCycle, suggestions: ActionProposal['suggestions'], changes = carried(registry)) {
  const proposal = ActionProposalSchema.parse({ changes, suggestions })
  return applyVerifiedActionReview({ registry, cycle, articleDate: date, articleStatuses: statuses, markdown, sources, roundId: sha256(JSON.stringify({ cycle, proposal })), proposal, verification: verdicts(proposal) })
}

describe('trusted generation and revision action budgets', () => {
  it.each([3, 5])('initial generation can admit %i justified identities', count => {
    const result = apply(seed(), generationActionCycle(), Array.from({ length: count }, (_, i) => candidate(i)))
    expect(result.records).toHaveLength(count)
    expect(result.records.every(record => record.admission?.phase === 'generation')).toBe(true)
    const split = splitActionRegistry(result)
    expect(hydrateActionRegistry(split.baseline, split.files)).toEqual(result)
    expect(articleActionFileBytes(split.files[0])).toContain('generation')
  })
  it('admits two new revision identities with five already present and excludes the third', () => {
    const initial = apply(seed(), generationActionCycle(), Array.from({ length: 5 }, (_, i) => candidate(i)))
    const result = apply(initial, revisionActionCycle('request-1'), [candidate(5), candidate(6), candidate(7)])
    expect(result.records).toHaveLength(7)
    expect(result.articles[0].rejected.at(-1)?.reason).toContain('cycle admission limit')
    expect(result.records.filter(record => record.admission?.phase === 'revision')).toHaveLength(2)
    expect(result.records.slice(0, 5).map(record => record.original)).toEqual(initial.records.map(record => record.original))
    expect(result.records.every(record => record.gates.includes('Owner decides any execution or merge.'))).toBe(true)
    const split = splitActionRegistry(result)
    expect(hydrateActionRegistry(split.baseline, split.files)).toEqual(result)
  })
  it('a new revision has two slots after initial admissions reached the old lifetime cap', () => {
    const initial = apply(seed(), generationActionCycle(), [candidate(0), candidate(1)])
    expect(apply(initial, revisionActionCycle('request-1'), [candidate(2), candidate(3)]).records).toHaveLength(4)
  })
  it('does not replenish a logical revision after disposal; a later request has its own two slots', () => {
    const cycle = revisionActionCycle('request-1')
    const first = apply(seed(), cycle, [candidate(0), candidate(1)])
    const changes = carried(first).map((change, i) => ({ ...change, state: i ? 'dismissed' : 'done' } satisfies ActionProposal['changes'][number]))
    const same = apply(first, cycle, [candidate(2)], changes)
    expect(same.records).toHaveLength(2)
    const body = renderArticleActions(markdown, same, date, statuses)
    const active = body.split('<details class="suggestions-handled"')[0]
    expect(active).not.toContain('Investigate bounded gap')
    expect(body).toContain('Completed'); expect(body).toContain('Dismissed')
    expect(same.records.map(record => record.original)).toEqual(first.records.map(record => record.original))
    const next = apply(same, revisionActionCycle('request-2'), [candidate(3), candidate(4)])
    expect(next.records).toHaveLength(4)
    expect(next.records.slice(0, 2).map(record => record.state)).toEqual(['done', 'dismissed'])
  })
  it('rewording and existing links reuse identities without using a new slot', () => {
    const first = apply(seed(), revisionActionCycle('request-1'), [candidate(0), candidate(1)])
    const linked = { ...candidate(0), description: 'Check the same bounded gap carefully.', existingKey: first.records[0].key }
    const proposal = { changes: carried(first), suggestions: [linked, candidate(2), candidate(3)] }
    const verification = verdicts(proposal); verification.suggestions[0].existingKey = first.records[0].key
    const result = applyVerifiedActionReview({ registry: first, cycle: revisionActionCycle('request-2'), articleDate: date, articleStatuses: statuses, markdown, sources, roundId: sha256('linked-round'), proposal, verification })
    expect(result.records).toHaveLength(4)
    expect(result.records.filter(record => record.admission?.phase === 'revision' && record.admission.id === revisionActionCycle('request-2').id)).toHaveLength(2)
    expect(result.records[0].key).toBe(first.records[0].key)
  })
  it('requires reconciliation of every carried identity before publishing additional actions', () => {
    const first = apply(seed(), generationActionCycle(), Array.from({ length: 5 }, (_, i) => candidate(i)))
    expect(() => apply(first, revisionActionCycle('request-1'), [candidate(5)], [])).toThrow('omitted from independent review')
  })
  it('allows fewer or zero initial actions rather than admitting unsupported filler', () => {
    expect(apply(seed(), generationActionCycle(), []).records).toHaveLength(0)
    expect(apply(seed(), generationActionCycle(), [candidate(0)]).records).toHaveLength(1)
    const unsupported = { ...candidate(0), factCitations: [{ sourceId: 'absent', quote: 'Unsupported claimed gap.' }] }
    expect(apply(seed(), generationActionCycle(), [unsupported]).records).toHaveLength(0)
  })
  it('retains the generation budget through a pending initial retry and gives clean acceptance a follow-up cycle', async () => {
    const cycle = generationActionCycle()
    const pending = await reviewDraftActions({ registry: seed(), cycle, articleDate: date, articleStatuses: statuses, markdown, feedback: '', sources, agents: { propose: async () => { throw new Error('Source budget unavailable') }, verify: vi.fn() } })
    expect(pending.registry.articles[0].reviewCycle).toEqual(cycle)
    const retryCycle = acceptanceActionCycle('pull-request:42', pending.registry.articles[0])
    expect(retryCycle).toEqual(cycle)
    const retried = apply(pending.registry, retryCycle, Array.from({ length: 5 }, (_, i) => candidate(i)))
    const followUp = acceptanceActionCycle('pull-request:42', retried.articles[0])
    expect(followUp).toEqual(revisionActionCycle('pull-request:42'))
    expect(apply(retried, followUp, [candidate(5), candidate(6)]).records).toHaveLength(7)
  })
  it('caches the same logical input, separates phases and never reuses a v5 receipt', async () => {
    let registry = seed()
    const agents = { propose: vi.fn(async (_prompt: string) => ({ changes: carried(registry), suggestions: registry.records.length ? [] : [candidate(0)] })), verify: vi.fn(async () => verdicts({ changes: carried(registry), suggestions: registry.records.length ? [] : [candidate(0)] })) }
    const input = { registry, cycle: generationActionCycle(), articleDate: date, articleStatuses: statuses, markdown, feedback: '', sources, agents }
    const first = await reviewArticleActions(input); registry = first.registry
    expect((await reviewArticleActions({ ...input, registry, markdown: first.markdown })).cached).toBe(true)
    registry.articles[0].verification.promptVersion = 'action-review-v5-terminal-citations'
    expect((await reviewArticleActions({ ...input, registry, markdown: first.markdown })).cached).toBe(false)
    const revised = await reviewArticleActions({ ...input, registry, cycle: revisionActionCycle('request-1'), markdown: first.markdown })
    expect(revised.cached).toBe(false)
    const prompt = agents.propose.mock.calls.at(-1)?.[0] ?? ''
    expect(parseActionModelView(prompt.slice(0, prompt.indexOf('\nReturn a change for every requiredActionKey.'))).reviewCycle).toEqual(revisionActionCycle('request-1'))
  })
  it('requires the phase protocol when loading an isolated v6 dated file', () => {
    const result = apply(seed(), generationActionCycle(), [candidate(0)])
    const file = splitActionRegistry(result).files[0]
    delete file.snapshot.reviewCycle
    expect(ArticleActionFileSchema.safeParse(file).success).toBe(false)
  })
  it('keeps acceptance and prose revision requests distinct on the same PR', () => {
    expect(revisionActionCycle('pull-request:42:revision')).not.toEqual(acceptanceActionCycle('pull-request:42:clean-acceptance'))
  })
  it('keeps identical PR feedback in one cycle and gives changed explicit feedback a distinct cycle', () => {
    const request = (feedback: string) => revisionActionCycle(`pull-request:42:revision:${sha256(feedback)}`)
    const first = apply(seed(), request('Owner request A'), [candidate(0), candidate(1)])
    expect(apply(first, request('Owner request A'), [candidate(2)]).records).toHaveLength(2)
    expect(apply(first, request('Owner request B'), [candidate(2), candidate(3)]).records).toHaveLength(4)
  })
  it('does not refresh a consumed revision allowance when evidence is recollected', async () => {
    const cycle = revisionActionCycle('request-1')
    const firstProposal = { changes: [], suggestions: [candidate(0), candidate(1)] }
    const first = await reviewArticleActions({ registry: seed(), cycle, articleDate: date, articleStatuses: statuses, markdown, feedback: 'A source-backed request', sources, agents: { propose: async () => firstProposal, verify: async () => verdicts(firstProposal) } })
    const retryProposal = { changes: carried(first.registry), suggestions: [candidate(2), candidate(3)] }
    const refreshed = sources.map(source => ({ ...source, content: source.content + '\nFresh owner source readback.' }))
    const retry = await reviewArticleActions({ registry: first.registry, cycle, articleDate: date, articleStatuses: statuses, markdown: first.markdown, feedback: 'A source-backed request', sources: refreshed, agents: { propose: async () => retryProposal, verify: async () => verdicts(retryProposal) } })
    expect(retry.cached).toBe(false)
    expect(retry.registry.records).toHaveLength(2)
    expect(retry.registry.articles[0].rejected).toHaveLength(2)
    expect(retry.registry.articles[0].rejected.every(item => item.reason.includes('cycle admission limit'))).toBe(true)
  })
  it('reconsiders a typed quota hold only in a later cycle with a fresh independent pair', async () => {
    const cycle = revisionActionCycle('request-1')
    const first = apply(seed(), cycle, [candidate(0), candidate(1), candidate(2)])
    const hold = first.articles[0].rejected[0]
    expect(hold.quotaHold).toEqual({ articleDate: date, cycle })
    async function retry(registry: ActionRegistry, nextCycle: ActionReviewCycle, verdict: 'pass' | 'hold', feedback: string) {
      const proposal = { changes: carried(registry), suggestions: [candidate(2)] }
      const verification = verdicts(proposal)
      verification.suggestions[0].verdict = verdict
      const agents = { propose: vi.fn(async (_prompt: string) => proposal), verify: vi.fn(async () => verification) }
      const result = await reviewArticleActions({ registry, cycle: nextCycle, articleDate: date, articleStatuses: statuses, markdown, feedback, sources, agents })
      expect(agents.propose).toHaveBeenCalledTimes(1)
      expect(agents.verify).toHaveBeenCalledTimes(1)
      expect(agents.propose.mock.calls[0][0]).toContain('quotaHold')
      return result.registry
    }
    const same = await retry(first, cycle, 'pass', 'Retry the same logical request with refreshed evidence.')
    expect(same.records).toHaveLength(2)
    expect(same.articles[0].rejected.every(item => item.quotaHold)).toBe(true)
    const laterCycle = revisionActionCycle('request-2')
    expect((await retry(same, laterCycle, 'hold', 'Fresh consideration; evidence still needs review.')).records).toHaveLength(2)
    const later = await retry(same, laterCycle, 'pass', 'Fresh consideration of the independently supported candidate.')
    expect(later.records).toHaveLength(3)
    expect(later.records[2].admission).toEqual(laterCycle)
    expect(later.articles[0].rejected).toContainEqual(hold)
    expect(later.records.slice(0, 2).map(record => record.original)).toEqual(first.records.map(record => record.original))
  })
  it('scopes generation quota holds by article date and re-verifies on the next date', async () => {
    const initial = apply(seed(), generationActionCycle(), Array.from({ length: 5 }, (_, i) => candidate(i)))
    const held = apply(initial, generationActionCycle(), [candidate(5)])
    expect(held.articles[0].rejected[0].quotaHold).toEqual({ articleDate: date, cycle: generationActionCycle() })
    expect(apply(held, generationActionCycle(), [candidate(5)]).records).toHaveLength(5)
    const nextDate = '2026-10-21'
    const proposal = { changes: [], suggestions: [candidate(5)] }
    const agents = { propose: vi.fn(async () => proposal), verify: vi.fn(async () => verdicts(proposal)) }
    const result = await reviewArticleActions({ registry: held, cycle: generationActionCycle(), articleDate: nextDate, articleStatuses: new Map([...statuses, [nextDate, 'draft']]), markdown: markdown.replace(date, nextDate), feedback: '', sources, agents })
    expect(agents.propose).toHaveBeenCalledTimes(1)
    expect(agents.verify).toHaveBeenCalledTimes(1)
    expect(result.registry.records).toHaveLength(6)
    expect(result.registry.records[5].introducedBy).toBe(nextDate)
    expect(result.registry.articles.find(article => article.date === date)?.rejected).toEqual(held.articles[0].rejected)
  })
  it('does not reinterpret legacy quota wording or semantic rejections as scoped holds', () => {
    const first = apply(seed(), revisionActionCycle('request-1'), [candidate(0), candidate(1), candidate(2)])
    delete first.articles[0].rejected[0].quotaHold
    expect(apply(first, revisionActionCycle('request-2'), [candidate(2)]).records).toHaveLength(2)
    const proposal = { changes: carried(first), suggestions: [candidate(3)] }
    const verification = verdicts(proposal)
    verification.suggestions[0].verdict = 'reject'
    const rejected = applyVerifiedActionReview({ registry: first, cycle: revisionActionCycle('request-2'), articleDate: date, articleStatuses: statuses, markdown, sources, roundId: sha256('semantic-rejection'), proposal, verification })
    expect(rejected.articles[0].rejected.at(-1)?.quotaHold).toBeUndefined()
    expect(apply(rejected, revisionActionCycle('request-3'), [candidate(3)]).records).toHaveLength(2)
  })
  it('does not invent an initial phase for a legacy pending receipt', () => {
    expect(acceptanceActionCycle('pull-request:42:clean-acceptance', { review: { state: 'pending' } })).toEqual(revisionActionCycle('pull-request:42:clean-acceptance'))
  })
  it('does not let models select a phase or reopen terminal accepted work', () => {
    expect(ActionProposalSchema.safeParse({ changes: [], suggestions: [], reviewCycle: generationActionCycle() }).success).toBe(false)
    const first = apply(seed(), revisionActionCycle('request-1'), [candidate(0)])
    const completed = apply(first, revisionActionCycle('request-2'), [], carried(first).map(change => ({ ...change, state: 'done' })))
    completed.articles[0].status = 'accepted'
    const proposal = { changes: carried(completed).map(change => ({ ...change, state: 'open' } satisfies ActionProposal['changes'][number])), suggestions: [] }
    expect(() => applyVerifiedActionReview({ registry: completed, cycle: revisionActionCycle('request-3'), articleDate: date, articleStatuses: new Map([[date, 'accepted']]), markdown, sources, roundId: sha256('reopen'), proposal, verification: verdicts(proposal) })).toThrow('cannot be reopened')
    expect(projectRegistry(completed, new Map([[date, 'accepted']])).done).toHaveLength(1)
  })
})
