import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionRegistrySchema, articleActionRecords, projectRegistry, readActionRegistry, registryBytes, registryRevision, renderArticleActions, renderArticleActionHtml, setActionInclusion, writeActionRegistry, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { ActionVerificationSchema, actionGithubReferences, applyVerifiedActionReview, reviewArticleActions, renderGithubEvidence, resolveActionSourceLines, type ActionProposal, type ActionVerification } from '../review-actions.js'

const articleDate = '2026-10-17'
const articleStatuses = new Map([[articleDate, 'accepted']])
const markdown = `---\ntitle: "Review"\ndate: ${articleDate}\nstatus: "accepted"\n---\n## What's next\n\n> **Suggested actions**\n> - \`/adr\` — Old generator output. (daily-logger)\n`
const sources: ActionSource[] = [
  { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: 'The operator goal is reliable editorial acceptance.' },
  { id: 'evidence', kind: 'github', locator: 'https://github.com/ojfbot/daily-logger/pull/373', content: 'The mandatory ADR prerequisite was explicitly superseded. The source confirms a queue and article mismatch.' },
]
function seed(): ActionRegistry {
  return ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [{ key: 'act-existing', original: { id: 'act-existing', command: '/adr', description: 'Old generator output.', repo: 'daily-logger', status: 'open', sourceDate: articleDate }, origin: 'imported', workKey: 'old-adr', state: 'open', introducedBy: articleDate, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] }], articles: [] })
}
const candidate = { command: '/implement', description: 'Make article actions and queue state agree.', repo: 'daily-logger', target: 'editorial action reconciliation', outcome: 'consistent article and queue', goal: 'Reliable editorial acceptance', goalCitations: [{ sourceId: 'goal', quote: 'reliable editorial acceptance' }], factCitations: [{ sourceId: 'evidence', quote: 'a queue and article mismatch' }], doneWhen: 'A repeat build preserves the same action identities.', gates: ['Human merges the editorial PR.'], existingKey: null }
function propose(): ActionProposal { return { changes: [{ actionKey: 'act-existing', state: 'superseded', description: 'The ADR prerequisite is superseded.', reason: 'The prerequisite was explicitly superseded.', citations: [{ sourceId: 'evidence', quote: 'mandatory ADR prerequisite was explicitly superseded' }] }], suggestions: [structuredClone(candidate)] } }
function verify(): ActionVerification { return { changes: [{ actionKey: 'act-existing', verdict: 'pass', reason: 'The exact prerequisite is superseded.' }], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'A bounded step toward the operator goal.', existingKey: null }] } }
function apply(registry = seed(), proposal = propose(), verification = verify()) { return applyVerifiedActionReview({ registry, articleStatuses, articleDate, markdown, sources, roundId: 'd'.repeat(64), proposal, verification }) }
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('canonical action review and publication', () => {
  it('collects bare repository/PR references and preserves explicit issue identity', () => {
    const refs = actionGithubReferences({ markdown: 'Review daily-logger #372. See core #524 at https://github.com/ojfbot/core/issues/524. Ignore unknown-repository #1 and https://github.com/ojfbot/selfco/issues/1.', feedback: '' })
    expect(refs.map(([, ref]) => ref)).toEqual([{ repo: 'core', kind: 'issues', number: '524' }, { repo: 'daily-logger', kind: 'pull', number: '372' }])
  })
  it('resolves bounded source-line selections into exact evidence before verification', () => {
    const source: ActionSource = { id: 's1', kind: 'github', locator: 'source', content: 'Heading\nThe **exact** primary evidence.\nA second source line.' }
    const proposal = { changes: [{ ...propose().changes[0], citations: [{ sourceId: 's1', startLine: 2, endLine: 3 }] }], suggestions: [] }
    expect(resolveActionSourceLines(proposal, [source]).changes[0].citations).toEqual([{ sourceId: 's1', quote: 'The **exact** primary evidence.\nA second source line.' }])
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
    const proposal: ActionProposal = { changes: propose().changes, suggestions: [{ ...candidate, description: 'Reworded recommendation for the same work.', existingKey: key }] }
    const verification: ActionVerification = { changes: verify().changes, suggestions: [{ candidateIndex: 0, verdict: 'pass', existingKey: key, reason: 'The same target and outcome already have an identity.' }] }
    const second = apply(optedOut, proposal, verification)
    const output = projectRegistry(second, new Map([[articleDate, 'accepted']]))
    expect(second.records.map(record => [record.key, record.includeInIndex])).toEqual([['act-existing', true], [key, false]])
    expect(output.open).toEqual([])
    expect(output.dispositions[0].state).toBe('superseded')
    expect(renderArticleActions(markdown, second, articleDate, articleStatuses)).toContain('Article only')
    const completed = applyVerifiedActionReview({ registry: second, articleDate, articleStatuses: new Map([[articleDate, 'draft']]), markdown, sources, roundId: 'e'.repeat(64), proposal: { changes: [...propose().changes, { ...propose().changes[0], actionKey: key, state: 'done', description: candidate.description }], suggestions: [] }, verification: { changes: [...verify().changes, { actionKey: key, verdict: 'pass', reason: 'Delivery evidence checked.' }], suggestions: [] } })
    expect(projectRegistry(completed, articleStatuses).done).toEqual([])
    expect(renderArticleActions(markdown, completed, articleDate, articleStatuses)).toContain('/implement · Completed')
  })

  it('uses one result for retries without re-running agents or adding history', async () => {
    let proposals = 0, verifications = 0
    const agents = { propose: async () => { proposals++; return propose() }, verify: async () => { verifications++; return verify() } }
    const first = await reviewArticleActions({ articleStatuses, registry: seed(), articleDate, markdown, feedback: 'Apply the review.', sources, agents })
    const second = await reviewArticleActions({ articleStatuses, registry: first.registry, articleDate, markdown: first.markdown, feedback: 'Apply the review.', sources, agents })
    expect([proposals, verifications, second.cached]).toEqual([1, 1, true])
    expect(registryBytes(second.registry)).toBe(registryBytes(first.registry))
    expect(second.markdown).toBe(first.markdown)
  })

  it('reruns both agents when a draft is promoted and binds every carried identity to the new accepted round', async () => {
    let calls = 0
    const agents = { propose: async () => { calls++; return propose() }, verify: async () => { calls++; return verify() } }
    const first = await reviewArticleActions({ registry: seed(), articleStatuses: new Map([[articleDate, 'draft']]), articleDate, markdown: markdown.replace('"accepted"', '"draft"'), feedback: '', sources, agents })
    const accepted = await reviewArticleActions({ registry: first.registry, articleStatuses, articleDate, markdown: first.markdown.replace('"draft"', '"accepted"'), feedback: '', sources, agents })
    expect(calls).toBe(4)
    expect(accepted.cached).toBe(false)
    expect(accepted.registry.articles[0].status).toBe('accepted')
    expect(accepted.registry.articles[0].roundId).not.toBe(first.registry.articles[0].roundId)
    expect(accepted.registry.records.every(record => record.history.at(-1)?.roundId === accepted.registry.articles[0].roundId)).toBe(true)
  })

  it('moves original wording into history and never infers membership from quoted commands', () => {
    const reviewed = apply()
    const body = renderArticleActions(markdown, reviewed, articleDate, articleStatuses)
    expect(body.match(/> \*\*Suggested actions\*\*/g)).toHaveLength(1)
    expect(body.split('Resolved suggestions')[0]).not.toContain('Old generator output.')
    expect(body).toContain('<p>Old generator output.</p>')
    expect(body).toContain('superseded')
    expect(projectRegistry(readActionRegistryFixture(reviewed), new Map([[articleDate, 'accepted']])).open.map(action => action.description)).toEqual(['Make article actions and queue state agree.'])
    const html = renderArticleActionHtml(markdown, reviewed, articleDate, articleStatuses)
    expect(html).toContain('<section class="action-history-card"')
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
    const hostileSource: ActionSource = { id: '<img src=x onerror=alert(4)>', kind: 'github', locator: '<script>alert(6)</script>', content: '<script>alert(5)</script>' }
    proposal.changes[0].citations.push({ sourceId: hostileSource.id, quote: hostileSource.content })
    const reviewed = applyVerifiedActionReview({ registry, articleStatuses, articleDate, markdown: prose, sources: [...sources, hostileSource], roundId: 'd'.repeat(64), proposal, verification: verify() })
    const html = renderArticleActionHtml(prose, reviewed, articleDate, articleStatuses)
    expect(html).toContain('<section class="action-history-card"')
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
    expect(reviewed.articles[0].rejected).toEqual([{ description: 'Invented architecture task.', reason: 'Missing exact primary factual evidence. Unsubstantiated model assertion.' }])
  })

  it('cannot recreate terminal work under a different date or description', () => {
    const first = apply()
    const proposal: ActionProposal = { changes: [], suggestions: [{ ...candidate, description: 'Another ADR amendment.', existingKey: 'act-existing' }] }
    const reviewed = applyVerifiedActionReview({ registry: first, articleStatuses, articleDate: '2026-10-18', markdown: markdown.replace(articleDate, '2026-10-18'), sources, roundId: 'e'.repeat(64), proposal, verification: { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'The previous action already addresses this intent.', existingKey: 'act-existing' }] } })
    expect(reviewed.records.map(record => record.key)).toEqual(first.records.map(record => record.key))
    expect(reviewed.records[0].state).toBe('superseded')
  })

  it('rejects missing independent verdicts and unsafe closure evidence', () => {
    expect(() => apply(seed(), propose(), { changes: [], suggestions: [] })).toThrow(/verification is incomplete/)
    const verification = verify(); verification.changes[0].verdict = 'reject'
    expect(() => apply(seed(), propose(), verification)).toThrow(/requires further review/)
    const valid = apply()
    expect(projectRegistry(valid, new Map([[articleDate, 'accepted']])).open[0].command).toBe('/implement')
    expect(ActionVerificationSchema.parse({ changes: [] })).toEqual({ changes: [], suggestions: [] })
    expect(() => apply(seed(), propose(), ActionVerificationSchema.parse({ changes: verify().changes }))).toThrow(/verification is incomplete/)
  })

  it('rejects stale ledger writes and preserves the newer operator choice', () => {
    const reviewed = apply(); const root = mkdtempSync(join(tmpdir(), 'action-ledger-')); roots.push(root); mkdirSync(join(root, 'actions'))
    writeFileSync(join(root, 'actions/registry.json'), registryBytes(reviewed))
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
    const draft = applyVerifiedActionReview({ registry: first, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'e'.repeat(64), proposal, verification })
    expect(projectRegistry(draft, statuses).open.map(action => action.id)).toContain(key)
    expect(renderArticleActions(markdown, draft, articleDate, statuses)).toContain('> - `/implement`')
    expect(articleActionRecords(draft, articleDate, statuses).find(record => record.key === key)?.state).toBe('proposed')
    const corrected = applyVerifiedActionReview({ registry: draft, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'f'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'open' }] }, verification })
    expect(corrected.records[1].state).toBe('open')
    statuses.set(laterDate, 'accepted')
    const accepted = applyVerifiedActionReview({ registry: draft, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown.replace('"draft"', '"accepted"'), sources, roundId: 'f'.repeat(64), proposal, verification })
    expect(projectRegistry(accepted, statuses).done.map(action => action.id)).toContain(key)
    expect(renderArticleActions(markdown, accepted, articleDate, statuses)).not.toContain('> - `/implement`')
    expect(renderArticleActions(markdown, accepted, articleDate, statuses)).toContain('Bounded work delivered.')
    expect(() => applyVerifiedActionReview({ registry: accepted, articleStatuses: statuses, articleDate: laterDate, markdown: laterMarkdown, sources, roundId: 'a'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'open' }] }, verification })).toThrow(/cannot be reopened/)
  })

  it('rolls back the article and retains the registry if publication fails inside its lock', () => {
    const registry = apply(), root = mkdtempSync(join(tmpdir(), 'action-publication-')); roots.push(root); mkdirSync(join(root, 'actions'))
    const path = join(root, 'article.md'); writeFileSync(path, markdown); writeFileSync(join(root, 'actions/registry.json'), registryBytes(registry))
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
    expect(applyVerifiedActionReview({ registry: seed(), articleStatuses, articleDate, markdown, sources: [operator], roundId: 'd'.repeat(64), proposal, verification }).records[0].state).toBe('deferred')
    expect(() => applyVerifiedActionReview({ registry: seed(), articleStatuses, articleDate, markdown, sources: [operator], roundId: 'd'.repeat(64), proposal: { ...proposal, changes: [{ ...proposal.changes[0], state: 'done' }] }, verification })).toThrow(/exact quotes/)
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

  it('does not replenish the two-identity budget after suggestions are disposed of', () => {
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
  writeFileSync(join(root, 'actions/registry.json'), registryBytes(registry))
  // Fake projection edits cannot alter the canonical records.
  mkdirSync(join(root, 'api')); writeFileSync(join(root, 'api/actions.json'), '[{"description":"forged"}]')
  return readActionRegistry(root)
}
