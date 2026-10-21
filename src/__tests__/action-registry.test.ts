import { revisionActionCycle } from '../action-review-cycle.js'
import { writeActionStore } from './action-store-fixture.js'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionRegistrySchema, actionStateDigest, articleActionRecords, projectRegistry, readActionRegistry, registryBytes, registryRevision, renderArticleActions, renderArticleActionHtml, setActionInclusion, writeActionRegistry, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { ActionVerificationSchema, actionGithubReferences, applyVerifiedActionReview, reviewArticleActions, reviewDraftActions, renderGithubEvidence, resolveActionSourceLines, type ActionProposal, type ActionVerification } from '../review-actions.js'

const articleDate = '2026-10-17'
const articleStatuses = new Map([[articleDate, 'accepted']])
const markdown = `---\ntitle: "Review"\ndate: ${articleDate}\nstatus: "accepted"\n---\n## What's next\n`
const sources: ActionSource[] = [
  { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: 'The operator goal is reliable editorial acceptance.' },
  { id: 'evidence', kind: 'github', locator: 'https://github.com/ojfbot/daily-logger/pull/373', content: 'The mandatory ADR prerequisite was explicitly superseded. The source confirms a queue and article mismatch.', trustedContent: ['The mandatory ADR prerequisite was explicitly superseded. The source confirms a queue and article mismatch.'] },
]
function seed(): ActionRegistry {
  return ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [{ key: 'act-existing', original: { id: 'act-existing', command: '/adr', description: 'Old generator output.', repo: 'daily-logger', status: 'open', sourceDate: articleDate }, origin: 'imported', workKey: 'old-adr', state: 'open', introducedBy: articleDate, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] }], articles: [] })
}
const candidate = { command: '/implement', description: 'Make article actions and queue state agree.', repo: 'daily-logger', target: 'editorial action reconciliation', outcome: 'consistent article and queue', goal: 'Reliable editorial acceptance', goalCitations: [{ sourceId: 'goal', quote: 'reliable editorial acceptance' }], factCitations: [{ sourceId: 'evidence', quote: 'a queue and article mismatch' }], doneWhen: 'A repeat build preserves the same action identities.', gates: ['Human merges the editorial PR.'], existingKey: null }
function propose(): ActionProposal { return { changes: [{ actionKey: 'act-existing', state: 'superseded', description: 'The ADR prerequisite is superseded.', reason: 'The prerequisite was explicitly superseded.', citations: [{ sourceId: 'evidence', quote: 'mandatory ADR prerequisite was explicitly superseded' }] }], suggestions: [structuredClone(candidate)] } }
function verify(): ActionVerification { return { changes: [{ actionKey: 'act-existing', verdict: 'pass', reason: 'The exact prerequisite is superseded.' }], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'A bounded step toward the operator goal.', existingKey: null }] } }
function actionHandoff(actionKey: string, context = 'The prior review retained this current action.') { return { kind: 'action' as const, actionKey, title: 'Continue the reviewed action', benefit: 'Move the reviewed obligation to its next decision.', start: 'Resume the existing handoff.', entryPoint: 'Resume the existing action from its recorded gates.', context, whyNow: 'The verified obligation remains current.', outcome: 'Advance the existing obligation without creating another identity.', nextCheck: 'Record the next verified checkpoint on the existing action.', factCitations: [{ sourceId: 'evidence', quote: 'a queue and article mismatch' }], goalCitations: [{ sourceId: 'goal', quote: 'reliable editorial acceptance' }] } }
function closingVerdict() { return { optionIndex: 0, verdict: 'pass' as const, reason: 'The current action is a useful handoff with a concrete checkpoint.' } }
function apply(registry = seed(), proposal = propose(), verification = verify()) { return applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry, articleStatuses, articleDate, markdown, sources, roundId: 'd'.repeat(64), proposal, verification }) }
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs() })

describe('canonical action review and publication', () => {
  it('does not treat third-party GitHub comments as terminal evidence (F12)', () => {
    const proposal = propose()
    const untrusted = sources.map(source => source.kind === 'github' ? { ...source, trustedContent: ['CURRENT API STATE: state=open; head=current.'] } : source)
    expect(() => applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: untrusted, roundId: 'd'.repeat(64), proposal, verification: verify() })).toThrow(/OWNER\/MEMBER\/COLLABORATOR/)
    const trusted = sources.map(source => source.kind === 'github' ? { ...source, trustedContent: [source.content] } : source)
    expect(applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: trusted, roundId: 'd'.repeat(64), proposal, verification: verify() }).records[0].state).toBe('superseded')
  })
  it('sends only the fresh source version to both agents and does not revive older CURRENT API STATE text (F11)', async () => {
    const first = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources, feedback: '', agents: { propose: async () => propose(), verify: async () => verify() } })
    first.registry.articles[0].sources.push({ id: `github:stale@${'a'.repeat(64)}`, kind: 'github', locator: 'old source', content: 'CURRENT API STATE: obsolete open handoff.' })
    const prompts: string[] = []
    await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry: first.registry, articleStatuses, articleDate, markdown: first.markdown, sources, feedback: 'Fresh review', agents: { propose: async prompt => { prompts.push(prompt); return propose() }, verify: async prompt => { prompts.push(prompt); return verify() } } })
    expect(prompts).toHaveLength(2)
    expect(prompts.every(prompt => !prompt.includes('obsolete open handoff'))).toBe(true)
  })
  it('drops a held optional closure and rejects an invalid identity link without losing the article (F4)', async () => {
    const registry = seed(); registry.records[0].introducedBy = '2026-10-16'
    const result = await reviewDraftActions({ cycle: revisionActionCycle('fixture'), registry, articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents: {
      propose: async () => ({ changes: propose().changes, suggestions: [{ ...candidate, existingKey: 'missing' }] }),
      verify: async () => ({ changes: [{ actionKey: 'act-existing', verdict: 'hold', reason: 'No authoritative closure evidence.' }], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Bad identity link.', existingKey: 'missing' }] }),
    } })
    expect(result.markdown).toContain('Suggested actions')
    expect(result.registry.records).toEqual(registry.records)
    expect(result.registry.articles[0].review.state).toBe('verified')
    expect(result.registry.articles[0].rejected).toHaveLength(2)
  })
  it('retains the daily draft with zero admissions when a provider fails and blocks acceptance (F4)', async () => {
    const registry = { ...seed(), records: [] }
    let calls = 0
    const result = await reviewDraftActions({ cycle: revisionActionCycle('fixture'), registry, articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents: { propose: async () => { calls++; throw new Error('529 provider unavailable') }, verify: async () => { throw new Error('Verifier must not run') } } })
    expect(calls).toBe(1)
    expect(result.markdown).toContain('Action review pending')
    expect(result.registry.records).toEqual([])
    expect(result.registry.articles[0].review).toEqual({ state: 'pending', reason: '529 provider unavailable' })
    expect(projectRegistry(result.registry, new Map([[articleDate, 'draft']])).open).toEqual([])
    expect(() => renderArticleActions(result.markdown.replace('"draft"', '"accepted"'), result.registry, articleDate, articleStatuses)).toThrow()
  })
  it('does not renegotiate a semantic hold with another pair of model calls (F5)', async () => {
    let calls = 0
    const result = await reviewDraftActions({ cycle: revisionActionCycle('fixture'), registry: seed(), articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents: { propose: async () => { calls++; return propose() }, verify: async () => { calls++; return { ...verify(), changes: [{ actionKey: 'act-existing', verdict: 'hold', reason: 'Further evidence needed.' }] } } } })
    expect(calls).toBe(2)
    expect(result.registry.articles[0].review.state).toBe('pending')
  })
  it('does not repair verified output that exceeds the dated storage cap (F5r)', async () => {
    const proposal = propose(); proposal.suggestions[0].description = 'x'.repeat(66 * 1024)
    const proposer = vi.fn(async () => proposal), verifier = vi.fn(async () => verify())
    const result = await reviewDraftActions({ cycle: revisionActionCycle('fixture'), registry: seed(), articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents: { propose: proposer, verify: verifier } })
    expect(proposer).toHaveBeenCalledTimes(1)
    expect(verifier).toHaveBeenCalledTimes(1)
    expect(result.registry.articles[0].review.state).toBe('pending')
    expect(result.registry.records).toEqual(seed().records)
  })
  it('requires every terminal citation to be primary evidence, with no metadata or boilerplate authority (F12r)', () => {
    const api = 'CURRENT API STATE daily-logger#373: state=open; head=current; merged_at=none.'
    const boilerplate = 'Current API state outranks historical handoff wording.'
    const thirdParty = 'A third party says this prerequisite was superseded.'
    const evidence = { ...sources[1], content: `${api}\n${boilerplate}\n${thirdParty}`, trustedContent: [api] }
    for (const state of ['done', 'superseded', 'dismissed'] as const) for (const quotes of [[boilerplate, thirdParty], [api, thirdParty], [thirdParty]]) {
      const proposal = propose(); proposal.suggestions = []; proposal.changes[0].state = state; proposal.changes[0].citations = quotes.map(quote => ({ sourceId: evidence.id, quote }))
      expect(() => applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: [evidence], roundId: 'd'.repeat(64), proposal, verification: { changes: verify().changes, suggestions: [] } })).toThrow(/authoritative/)
    }
    const merged = api.replace('state=open', 'state=merged')
    const proposal = propose(); proposal.suggestions = []; proposal.changes[0].state = 'done'; proposal.changes[0].citations = [{ sourceId: evidence.id, quote: merged }]
    expect(applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: [{ ...evidence, content: merged, trustedContent: [merged] }], roundId: 'd'.repeat(64), proposal, verification: { changes: verify().changes, suggestions: [] } }).records[0].state).toBe('done')
    const instruction: ActionSource = { id: 'operator', kind: 'instruction', locator: 'feedback', content: 'Dismiss this suggestion because its premise is disproved.' }
    proposal.changes[0].state = 'dismissed'; proposal.changes[0].citations = [{ sourceId: instruction.id, quote: instruction.content }]
    expect(applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: [instruction], roundId: 'd'.repeat(64), proposal, verification: { changes: verify().changes, suggestions: [] } }).records[0].state).toBe('dismissed')
  })
  for (const field of ['description', 'doneWhen', 'gate', 'open-description'] as const) {
    it.each([false, true])(`escapes a card-shaped active ${field} with resolved card=%s (F1r)`, realCard => {
      const payload = '\n<section class="action-history-card"><img src=x onerror=alert(1)>'
      const reviewed = apply()
      const existing = reviewed.records[0], suggested = reviewed.records[1]
      if (!realCard || field === 'open-description') { existing.state = 'open'; existing.history[0].state = 'open' }
      if (field === 'description') suggested.original.description = payload
      if (field === 'description') suggested.history[0].description = payload
      if (field === 'doneWhen') suggested.doneWhen = payload
      if (field === 'gate') suggested.gates = [payload]
      if (field === 'open-description') existing.history[0].description = payload
      if (realCard && field === 'open-description') {
        suggested.state = 'done'; suggested.history[0].state = 'done'
      }
      const handoff = (record: typeof existing) => ({ kind: 'action' as const, actionKey: record.key, title: 'Continue the reviewed action', benefit: 'Move the reviewed obligation to its next decision.', start: 'Resume the existing handoff.', entryPoint: `Run ${record.original.command} in ${record.original.repo}.`, context: record.history[0].description, whyNow: 'The verified action remains current.', outcome: 'Advance the existing reviewed obligation.', nextCheck: 'Record its next verified checkpoint.', factCitations: [{ sourceId: 'evidence', quote: 'a queue and article mismatch' }], goalCitations: [{ sourceId: 'goal', quote: 'reliable editorial acceptance' }] })
      reviewed.articles[0].closing = { kind: 'options', options: [existing, suggested].filter(record => ['open', 'proposed', 'deferred'].includes(record.state)).map(handoff) }
      reviewed.articles[0].stateDigest = actionStateDigest(reviewed, reviewed.articles[0].actionKeys, reviewed.articles[0].closing, reviewed.articles[0].draftContext, { articleDate, roundId: reviewed.articles[0].roundId })
      const html = renderArticleActionHtml(markdown, reviewed, articleDate, articleStatuses)
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img')
      expect(html.includes('<details class="suggestions-handled"')).toBe(realCard)
    })
  }
  it('keeps marker-shaped active fields inside a single rerenderable managed block (F1r audit)', () => {
    const reviewed = apply(), record = reviewed.records[1]
    const payload = 'Keep <!-- ACTIONS_START --> and <!-- ACTIONS_END --> as quoted text.'
    record.original.command = payload; record.original.repo = payload; record.original.description = payload
    record.history[0].description = payload; record.doneWhen = payload; record.gates = [payload]
    reviewed.articles[0].closing = { kind: 'options', options: [actionHandoff(record.key, payload)] }
    reviewed.articles[0].stateDigest = actionStateDigest(reviewed, reviewed.articles[0].actionKeys, reviewed.articles[0].closing, reviewed.articles[0].draftContext, { articleDate, roundId: reviewed.articles[0].roundId })
    const first = renderArticleActions(markdown, reviewed, articleDate, articleStatuses)
    expect(first.match(/<!-- ACTIONS_START -->/g)).toHaveLength(1)
    expect(first.match(/<!-- ACTIONS_END -->/g)).toHaveLength(1)
    expect(renderArticleActions(first, reviewed, articleDate, articleStatuses)).toBe(first)
    expect(renderArticleActionHtml(first, reviewed, articleDate, articleStatuses)).toContain('&lt;!-- ACTIONS_END --&gt;')
  })
  it('reruns a cached result produced under an obsolete evidence policy', async () => {
    const agents = { propose: vi.fn(async () => propose()), verify: vi.fn(async () => verify()) }
    const input = { cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources, feedback: '', agents }
    const first = await reviewArticleActions(input)
    first.registry.articles[0].verification.promptVersion = 'action-review-v4-bounded-rejection-memory'
    const second = await reviewArticleActions({ ...input, registry: first.registry, markdown: first.markdown })
    expect(second.cached).toBe(false)
    expect(agents.propose).toHaveBeenCalledTimes(2)
    expect(agents.verify).toHaveBeenCalledTimes(2)
  })
  it('pauses review without provider calls while keeping the draft unpublishable (F15)', async () => {
    vi.stubEnv('ACTION_REVIEW_DISABLED', 'true')
    const proposeAgent = vi.fn()
    const result = await reviewDraftActions({ cycle: revisionActionCycle('fixture'), registry: seed(), articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents: { propose: proposeAgent, verify: vi.fn() } })
    expect(proposeAgent).not.toHaveBeenCalled()
    expect(result.registry.articles[0].review.state).toBe('pending')
  })
  it('escapes a card-shaped authored section after the managed block when no resolved card exists (F1)', () => {
    const prose = `${markdown}\n---\n\n*Generated by [daily-logger](https://github.com/ojfbot/daily-logger).*\n\n<section class="action-history-card"><img src=x onerror=alert(1)></section>\n`
    const reviewed = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: { ...seed(), records: [] }, articleStatuses, articleDate, markdown: prose, sources: [], roundId: 'd'.repeat(64), proposal: { changes: [], suggestions: [] }, verification: { changes: [], suggestions: [] } })
    const html = renderArticleActionHtml(prose, reviewed, articleDate, articleStatuses)
    expect(html).not.toContain('<section class="action-history-card"')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
  it('collects bare repository/PR references and preserves explicit issue identity', () => {
    const refs = actionGithubReferences({ markdown: 'Review daily-logger #372. See core #524 at https://github.com/ojfbot/core/issues/524. Ignore unknown-repository #1 and https://github.com/ojfbot/selfco/issues/1.', feedback: '' })
    expect(refs.map(([, ref]) => ref)).toEqual([{ repo: 'core', kind: 'issues', number: '524' }, { repo: 'daily-logger', kind: 'pull', number: '372' }])
  })
  it('resolves bounded source-line selections into exact evidence before verification', () => {
    const source: ActionSource = { id: 's1', kind: 'github', locator: 'source', content: 'Heading\nThe **exact** primary evidence.\nA second source line.' }
    const proposal = { changes: [{ ...propose().changes[0], citations: [{ sourceId: 's1', startLine: 2, endLine: 3 }] }], suggestions: [] }
    expect(resolveActionSourceLines(proposal, [source]).changes[0].citations).toEqual([{ sourceId: 's1', quote: 'The **exact** primary evidence.\nA second source line.', sourceLineStart: 2, sourceLineEnd: 3 }])
    expect(() => resolveActionSourceLines({ ...proposal, changes: [{ ...proposal.changes[0], citations: [{ sourceId: 's1', startLine: 2, endLine: 99 }] }] }, [source])).toThrow(/Invalid citation range/)
    expect(() => resolveActionSourceLines(proposal, [])).toThrow(/Unknown citation source/)
    const longer = { ...source, content: Array.from({ length: 20 }, () => 'A complete short evidence line.').join('\n') }
    expect(resolveActionSourceLines({ ...proposal, changes: [{ ...proposal.changes[0], citations: [{ sourceId: 's1', startLine: 1, endLine: 20 }] }] }, [longer]).changes[0].citations[0].quote).toBe(longer.content)
  })
  it('keeps draft suggestions proposed and commits dispositions only with acceptance', () => {
    const reviewed = apply()
    const draft = projectRegistry(reviewed, new Map([[articleDate, 'draft']]))
    expect(draft.open.map(action => action.id)).toEqual(['act-existing'])
    expect(draft.proposed.map(action => [action.description, action.status, action.includeInIndex])).toEqual([['Make article actions and queue state agree.', 'proposed', true]])
    const accepted = projectRegistry(reviewed, new Map([[articleDate, 'accepted']]))
    expect(accepted.open.map(action => action.description)).toEqual(['Make article actions and queue state agree.'])
    expect(accepted.dispositions.map(action => [action.id, action.state])).toEqual([['act-existing', 'superseded']])
    expect(accepted.done).toEqual([])
  })

  it('preserves an opt-out across rewording and later verification rounds', () => {
    const first = apply()
    const key = first.records[1].key
    const optedOut = setActionInclusion(first, key, false, 'editor', 'Leave this suggestion in the article only.', new Map([[articleDate, 'draft']]))
    const proposal: ActionProposal = { changes: propose().changes, suggestions: [{ ...candidate, description: 'Reworded recommendation for the same work.', existingKey: key }], closingOptions: [actionHandoff(key)] }
    const verification: ActionVerification = { changes: verify().changes, suggestions: [{ candidateIndex: 0, verdict: 'pass', existingKey: key, reason: 'The same target and outcome already have an identity.' }], closingOptions: [closingVerdict()] }
    const second = apply(optedOut, proposal, verification)
    const output = projectRegistry(second, new Map([[articleDate, 'accepted']]))
    expect(second.records.map(record => [record.key, record.includeInIndex])).toEqual([['act-existing', true], [key, false]])
    expect(output.open).toEqual([])
    expect(output.dispositions[0].state).toBe('superseded')
    expect(renderArticleActions(markdown, second, articleDate, articleStatuses)).toContain('Article only')
    const completed = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: second, articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown, sources, roundId: 'e'.repeat(64), proposal: { changes: [...propose().changes, { ...propose().changes[0], actionKey: key, state: 'done', description: candidate.description }], suggestions: [] }, verification: { changes: [...verify().changes, { actionKey: key, verdict: 'pass', reason: 'Delivery evidence checked.' }], suggestions: [] } })
    expect(projectRegistry(completed, articleStatuses).done).toEqual([])
    expect(renderArticleActions(markdown, completed, articleDate, articleStatuses)).toContain('/implement · Completed')
  })

  it('suppresses unchanged rejected work across dates and permits fresh evidence to be reviewed', () => {
    const rejectedVerdict = verify(); rejectedVerdict.suggestions[0].verdict = 'reject'
    const first = apply(seed(), propose(), rejectedVerdict), nextDate = '2026-10-18'
    const input = { cycle: revisionActionCycle('fixture'), registry: first, articleDate: nextDate, articleStatuses: new Map([[articleDate, 'accepted'], [nextDate, 'draft']]), markdown: markdown.replace(articleDate, nextDate).replace('"accepted"', '"draft"'), sources, roundId: 'e'.repeat(64), proposal: { changes: [], suggestions: [structuredClone(candidate)] }, verification: { changes: [], suggestions: verify().suggestions } }
    const repeat = applyVerifiedActionReview(input)
    expect(repeat.records.filter(record => record.origin === 'suggested')).toHaveLength(0)
    expect(repeat.articles.find(article => article.date === nextDate)?.rejected[0].reason).toContain('unchanged source evidence')
    const amended = sources.map(source => source.id === 'evidence' ? { ...source, content: `${source.content} A new owner checkpoint is now required.` } : source)
    for (const unchangedCitations of [amended, [...sources, { id: 'unrelated', kind: 'goal' as const, locator: 'OTHER.md', content: 'An unrelated source changed.' }]]) {
      const stillRejected = applyVerifiedActionReview({ ...input, sources: unchangedCitations })
      expect(stillRejected.records.filter(record => record.origin === 'suggested')).toHaveLength(0)
    }
    const freshCandidate = { ...structuredClone(candidate), factCitations: [{ sourceId: 'evidence', quote: 'A new owner checkpoint is now required.' }] }
    const fresh = applyVerifiedActionReview({ ...input, sources: amended, proposal: { changes: [], suggestions: [freshCandidate] } })
    expect(fresh.records.filter(record => record.origin === 'suggested')).toHaveLength(1)
  })

  it('cannot admit the exact held historical suggestion even if both agents pass it', () => {
    const registry = seed()
    registry.baseline.heldSuggestions.push({ articlePath: '_articles/2026-10-01.md', sourceDate: '2026-10-01', line: 1, invocation: '/implement article actions', suggestionLineSha256: 'a'.repeat(64), suggestion: `> - \`/implement article actions\` — ${candidate.description} (${candidate.repo})` })
    const result = apply(registry)
    expect(result.records.filter(record => record.origin === 'suggested')).toHaveLength(0)
    expect(result.articles[0].rejected[0].reason).toContain('historical suggestion remains held')
  })

  it('uses accepted corrected wording and gates for work from an earlier article', async () => {
    const initial = propose(); initial.changes[0] = { ...initial.changes[0], state: 'open', description: 'Review with the documented owner and preview gates.' }; initial.suggestions = []
    const registry = apply(seed(), initial, { changes: verify().changes, suggestions: [] }), date = '2026-10-18'
    registry.records[0].gates = ['Owner decides readiness.']
    const contexts: string[] = []
    await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry, articleDate: date, articleStatuses: new Map([[articleDate, 'accepted'], [date, 'draft']]), markdown: markdown.replace(articleDate, date).replace('"accepted"', '"draft"'), feedback: '', sources, agents: { propose: async context => { contexts.push(context); return { changes: [], suggestions: [] } }, verify: async context => { contexts.push(context); return { changes: [], suggestions: [] } } } })
    for (const context of contexts) { const action = JSON.parse(context.split('\n')[0]).actions[0]; expect(action.description).toBe('Review with the documented owner and preview gates.'); expect(action.gates).toEqual(['Owner decides readiness.']) }
  })

  it('uses one result for retries without re-running agents or adding history', async () => {
    let proposals = 0, verifications = 0
    const agents = { propose: async () => { proposals++; return propose() }, verify: async () => { verifications++; return verify() } }
    const first = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), articleStatuses, registry: seed(), articleDate, markdown, feedback: 'Apply the review.', sources, agents })
    const second = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), articleStatuses, registry: first.registry, articleDate, markdown: first.markdown, feedback: 'Apply the review.', sources, agents })
    expect([proposals, verifications, second.cached]).toEqual([1, 1, true])
    expect(registryBytes(second.registry)).toBe(registryBytes(first.registry))
    expect(second.markdown).toBe(first.markdown)
  })

  it('reruns both agents when a draft is promoted and binds every carried identity to the new accepted round', async () => {
    let calls = 0
    const agents = { propose: async () => { calls++; return propose() }, verify: async () => { calls++; return verify() } }
    const first = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses: new Map([[articleDate, 'draft']]), articleDate, markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents })
    const accepted = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry: first.registry, articleStatuses, articleDate, markdown: first.markdown.replace('"draft"', '"accepted"'), feedback: '', sources, agents })
    expect(calls).toBe(4)
    expect(accepted.cached).toBe(false)
    expect(accepted.registry.articles[0].status).toBe('accepted')
    expect(accepted.registry.articles[0].roundId).not.toBe(first.registry.articles[0].roundId)
    expect(accepted.registry.records.every(record => record.history.at(-1)?.roundId === accepted.registry.articles[0].roundId)).toBe(true)
  })

  it('moves original wording into history and never infers membership from quoted commands', () => {
    const reviewed = apply()
    const body = renderArticleActions(markdown, reviewed, articleDate, articleStatuses)
    expect(body.match(/>Suggested actions<\/h3>/g)).toHaveLength(1)
    expect(body.indexOf('Continue the reviewed action')).toBeLessThan(body.indexOf('Suggestions handled at draft'))
    expect(body).toContain('<p>Old generator output.</p>')
    expect(body).toContain('superseded')
    expect(projectRegistry(readActionRegistryFixture(reviewed), new Map([[articleDate, 'accepted']])).open.map(action => action.description)).toEqual(['Make article actions and queue state agree.'])
    const html = renderArticleActionHtml(markdown, reviewed, articleDate, articleStatuses)
    expect(html).toContain('<section class="suggested-actions-card')
    expect(html).not.toContain('&lt;section')
  })

  it('rejects a stale article binding before rendering its suggestions', () => {
    const reviewed = apply()
    expect(() => renderArticleActions(markdown.replace('Review', 'Different facts'), reviewed, articleDate, articleStatuses)).toThrow(/review is stale/)
    expect(() => renderArticleActions(markdown, reviewed, articleDate, new Map([[articleDate, 'draft']]))).toThrow(/status is stale/)
  })

  it('escapes both authored HTML and action-history text around the generated card', () => {
    const registry = seed(); registry.records[0].original.description = '<script>alert(1)</script>'
    const prose = markdown + '\n<img src=x onerror=alert(2)>\n'
    const proposal = propose(); proposal.changes[0].reason = '<img src=x onerror=alert(3)>'
    const hostileSource: ActionSource = { id: '<img src=x onerror=alert(4)>', kind: 'github', locator: '<script>alert(6)</script>', content: '<script>alert(5)</script>', trustedContent: ['<script>alert(5)</script>'] }
    proposal.changes[0].citations.push({ sourceId: hostileSource.id, quote: hostileSource.content })
    const reviewed = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry, articleStatuses, articleDate, markdown: prose, sources: [...sources, hostileSource], roundId: 'd'.repeat(64), proposal, verification: verify() })
    const html = renderArticleActionHtml(prose, reviewed, articleDate, articleStatuses)
    expect(html).toContain('<section class="suggested-actions-card')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(3)&gt;')
    expect(html).not.toContain('alert(5)')
    expect(html).toContain('&lt;script&gt;alert(6)&lt;/script&gt;')
  })

  it('requires a verified snapshot for new articles and prevents using opt-out to close accepted work', () => {
    expect(() => renderArticleActions(markdown, seed(), articleDate, articleStatuses)).toThrow(/review is missing/)
    const reviewed = apply()
    expect(() => setActionInclusion(reviewed, reviewed.records[1].key, false, 'editor', 'Exclude it.', new Map([[articleDate, 'accepted']]))).toThrow(/requires a disposition/)
    expect(projectRegistry(reviewed, new Map([[articleDate, 'accepted']])).open).toHaveLength(1)
  })

  it('holds unsupported candidates even when the model says pass, and retains valid work', () => {
    const proposal = propose(); proposal.suggestions.push({ ...candidate, target: 'unrelated', description: 'Invented architecture task.', factCitations: [{ sourceId: 'article', quote: 'The article says it is necessary.' }] })
    const verification = verify(); verification.suggestions.push({ candidateIndex: 1, verdict: 'pass', reason: 'Unsubstantiated model assertion.', existingKey: null })
    const reviewed = apply(seed(), proposal, verification)
    expect(reviewed.records.map(record => record.original.description)).toEqual(['Old generator output.', 'Make article actions and queue state agree.'])
    expect(reviewed.articles[0].rejected).toEqual([expect.objectContaining({ description: 'Invented architecture task.', reason: 'Missing exact primary factual evidence. Unsubstantiated model assertion.', workKey: 'daily-logger|unrelated|consistent article and queue', evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })])
  })

  it('cannot recreate terminal work under a different date or description', () => {
    const first = apply()
    const proposal: ActionProposal = { changes: [], suggestions: [{ ...candidate, description: 'Another ADR amendment.', existingKey: 'act-existing' }] }
    const reviewed = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: first, articleStatuses, articleDate: '2026-10-18', markdown: markdown.replace(articleDate, '2026-10-18'), sources, roundId: 'e'.repeat(64), proposal, verification: { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'The previous action already addresses this intent.', existingKey: 'act-existing' }] } })
    expect(reviewed.records.map(record => record.key)).toEqual(first.records.map(record => record.key))
    expect(reviewed.records[0].state).toBe('superseded')
  })

  it('rejects missing independent verdicts and unsafe closure evidence', () => {
    expect(() => apply(seed(), propose(), { changes: [], suggestions: [] })).toThrow(/verification is incomplete/)
    const verification = verify(); verification.changes[0].verdict = 'reject'
    expect(() => apply(seed(), propose(), verification)).toThrow(/requires further review/)
    const valid = apply()
    expect(projectRegistry(valid, new Map([[articleDate, 'accepted']])).open[0].command).toBe('/implement')
    expect(ActionVerificationSchema.parse({ changes: [] })).toEqual({ changes: [], suggestions: [], candidateDispositions: [], closingOptions: [] })
    expect(() => apply(seed(), propose(), ActionVerificationSchema.parse({ changes: verify().changes }))).toThrow(/verification is incomplete/)
  })

  it('rejects stale ledger writes and preserves the newer operator choice', () => {
    const reviewed = apply(); const root = mkdtempSync(join(tmpdir(), 'action-ledger-')); roots.push(root); mkdirSync(join(root, 'actions'))
    writeActionStore(root, reviewed)
    const next = setActionInclusion(reviewed, reviewed.records[1].key, false, 'editor', 'Do not add to the master index.', new Map([[articleDate, 'draft']]))
    writeActionRegistry(root, next, registryRevision(reviewed))
    expect(() => writeActionRegistry(root, reviewed, registryRevision(reviewed))).toThrow(/changed during review/)
    expect(readActionRegistry(root).records[1].includeInIndex).toBe(false)
  })

  it('keeps a later draft disposition out of accepted articles and permits correcting it before promotion', () => {
    const first = apply(), key = first.records[1].key, laterDate = '2026-10-18'
    const laterMarkdown = markdown.replace(articleDate, laterDate).replace('"accepted"', '"draft"')
    const statuses = new Map([[articleDate, 'accepted'], [laterDate, 'draft']])
    const proposal: ActionProposal = { changes: [{ ...propose().changes[0], actionKey: key, state: 'done', reason: 'Bounded work delivered.' }], suggestions: [] }
    const verification: ActionVerification = { changes: [{ actionKey: key, verdict: 'pass', reason: 'Exact delivery evidence checked.' }], suggestions: [] }
    const draft = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: first, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'e'.repeat(64), proposal, verification })
    expect(projectRegistry(draft, statuses).open.map(action => action.id)).toContain(key)
    expect(renderArticleActions(markdown, draft, articleDate, statuses)).toContain('needs one more review')
    expect(articleActionRecords(draft, articleDate, statuses).find(record => record.key === key)?.state).toBe('proposed')
    const corrected = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: draft, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'f'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'open' }] }, verification })
    expect(corrected.records[1].state).toBe('open')
    statuses.set(laterDate, 'accepted')
    const accepted = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: draft, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown.replace('"draft"', '"accepted"'), sources, roundId: 'f'.repeat(64), proposal, verification })
    expect(projectRegistry(accepted, statuses).done.map(action => action.id)).toContain(key)
    expect(renderArticleActions(markdown, accepted, articleDate, statuses)).not.toContain('> - `/implement`')
    expect(renderArticleActions(markdown, accepted, articleDate, statuses)).toContain('Bounded work delivered.')
    expect(() => applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: accepted, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'a'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'open' }] }, verification })).toThrow(/cannot be reopened/)
  })

  it('rolls back the article and retains the registry if publication fails inside its lock', () => {
    const registry = apply(), root = mkdtempSync(join(tmpdir(), 'action-publication-')); roots.push(root); mkdirSync(join(root, 'actions'))
    const path = join(root, `${articleDate}.md`); writeFileSync(path, markdown); writeActionStore(root, registry)
    const next = setActionInclusion(registry, registry.records[1].key, false, 'editor', 'Article only.', new Map())
    expect(() => writeActionRegistry(root, next, registryRevision(registry), { path, expected: markdown, next: 'new article', publish: () => { writeFileSync(path, 'new article'); throw new Error('Injected publication failure') } })).toThrow(/Injected/)
    expect(readFileSync(path, 'utf8')).toBe(markdown)
    expect(registryBytes(readActionRegistry(root))).toBe(registryBytes(registry))
    writeFileSync(path, 'Concurrent author edit')
    expect(() => writeActionRegistry(root, next, registryRevision(registry), { path, expected: markdown, next: 'new article', publish: () => writeFileSync(path, 'new article') })).toThrow(/Article changed/)
    expect(readFileSync(path, 'utf8')).toBe('Concurrent author edit')
  })

  it('accepts an explicit operator deferral but still requires delivery evidence for completion', () => {
    const operator: ActionSource = { id: 'operator', kind: 'instruction', locator: 'feedback', content: 'Defer this action until I return with the source evidence.' }
    const proposal: ActionProposal = { changes: [{ ...propose().changes[0], state: 'deferred', citations: [{ sourceId: 'operator', quote: operator.content }] }], suggestions: [] }
    const verification = { changes: verify().changes, suggestions: [] }
    expect(applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: [operator], roundId: 'd'.repeat(64), proposal, verification }).records[0].state).toBe('deferred')
    expect(() => applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: seed(), articleStatuses, articleDate, markdown, sources: [operator], roundId: 'd'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'done' }] }, verification })).toThrow(/exact quotes/)
    expect(renderGithubEvidence(JSON.stringify([[{ body: 'An exact quote.\nWith a second line.', state: 'open' }]]))).toContain('An exact quote.\nWith a second line.')
  })

  it('holds a same-repository identity link with a different target or outcome', () => {
    const registry = apply(), key = registry.records[1].key
    const proposal = { changes: [...propose().changes, { ...propose().changes[0], actionKey: key, state: 'open' as const, description: candidate.description }], suggestions: [{ ...candidate, target: 'a different obligation', existingKey: key }] }
    const verification = { changes: [...verify().changes, { actionKey: key, verdict: 'pass' as const, reason: 'Retain the same bounded work.' }], suggestions: [{ candidateIndex: 0, verdict: 'pass' as const, reason: 'An incorrect same-repo link.', existingKey: key }] }
    const next = apply(registry, proposal, verification)
    expect(next.records).toHaveLength(2)
    expect(next.records[1].history.at(-1)?.description).toBe(candidate.description)
    expect(next.articles[0].rejected.at(-1)?.reason).toContain('lacks a matching target and outcome')
    const inventedGoal = apply(registry, { ...proposal, suggestions: [{ ...candidate, existingKey: key, goalCitations: [{ sourceId: 'invented', quote: 'Unverifiable goal claim.' }] }] }, verification)
    expect(inventedGoal.articles[0].rejected.at(-1)?.reason).toContain('contextual citation')
    expect(inventedGoal.records[1].history.flatMap(decision => decision.citations).some(citation => citation.sourceId === 'invented')).toBe(false)
  })

  it('preserves suggested originals and birth cycles in the real canonical writer', () => {
    const registry = apply(), root = mkdtempSync(join(tmpdir(), 'action-birth-')); roots.push(root)
    writeActionStore(root, registry)
    for (const kind of ['birth', 'original', 'missing'] as const) {
      const changed = structuredClone(registry), record = changed.records[1]
      if (kind === 'birth') record.admission = revisionActionCycle('invented quota')
      if (kind === 'original') record.original.description = 'A rewritten original payload'
      if (kind === 'missing') changed.records.splice(1, 1)
      expect(() => writeActionRegistry(root, changed, registryRevision(registry))).toThrow('birth cycle cannot change')
      expect(registryRevision(readActionRegistry(root))).toBe(registryRevision(registry))
    }
  })

  it('does not replenish the revision-cycle two-identity budget after suggestions are disposed of', () => {
    const empty = seed(); empty.records = []
    const proposal: ActionProposal = { changes: [], suggestions: [candidate, { ...candidate, target: 'second target', outcome: 'second outcome' }] }
    const verification: ActionVerification = { changes: [], suggestions: [0, 1].map(candidateIndex => ({ candidateIndex, verdict: 'pass', reason: 'A grounded bounded action.', existingKey: null })) }
    const first = apply(empty, proposal, verification)
    const changes = first.records.map(record => ({ ...propose().changes[0], actionKey: record.key, state: 'dismissed' as const }))
    const second = apply(first, { changes, suggestions: [{ ...candidate, target: 'third target', outcome: 'third outcome' }] }, { changes: changes.map(change => ({ actionKey: change.actionKey, verdict: 'pass', reason: 'The proposal is disposed of.' })), suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Another proposal.', existingKey: null }] })
    expect(second.records).toHaveLength(2)
    expect(second.records.every(record => record.state === 'dismissed')).toBe(true)
    expect(second.articles[0].rejected.at(-1)?.reason).toContain('admission limit reached')
  })
})

function readActionRegistryFixture(registry: ActionRegistry): ActionRegistry {
  const root = mkdtempSync(join(tmpdir(), 'action-roundtrip-')); roots.push(root); mkdirSync(join(root, 'actions'))
  writeActionStore(root, registry)
  // Fake projection edits cannot alter the canonical records.
  mkdirSync(join(root, 'api')); writeFileSync(join(root, 'api/actions.json'), '[{"description":"forged"}]')
  return readActionRegistry(root)
}
