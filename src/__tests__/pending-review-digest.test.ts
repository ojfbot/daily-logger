import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../action-intake.js', () => ({ verifyRecordedAdmissions: vi.fn() }))

import { revisionActionCycle } from '../action-review-cycle.js'
import { ActionRegistrySchema, renderArticleActions, sha256, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { buildApi } from '../build-api.js'
import { applyVerifiedActionReview, reviewDraftActions, type ActionProposal, type ActionVerification } from '../review-actions.js'
import { writeActionStore } from './action-store-fixture.js'

const firstDate = '2030-02-01'
const laterDate = '2030-02-02'
const firstMarkdown = `---\ntitle: "Pending review"\ndate: ${firstDate}\nstatus: draft\n---\n\n## What shipped\n\nA bounded action remains open.\n`
const laterMarkdown = firstMarkdown.replace('Pending review', 'Later review').replace(firstDate, laterDate)
const target = 'https://github.com/ojfbot/daily-logger/issues/900'
const current = 'CURRENT API STATE daily-logger#900: state=open; head=not-a-PR; merged_at=none.'
const goal = 'The roadmap requires a verified owner checkpoint before acceptance.'
const sources: ActionSource[] = [
  { id: 'issue', kind: 'github', locator: target, content: current, trustedContent: [current] },
  { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: goal },
]
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function seed(): ActionRegistry {
  return ActionRegistrySchema.parse({
    schemaVersion: 1,
    baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] },
    records: [{
      key: 'act-existing',
      original: { id: 'act-existing', command: '/validate', description: 'Validate the bounded handoff.', repo: 'daily-logger', status: 'open', sourceDate: firstDate },
      origin: 'imported',
      workKey: 'daily-logger|bounded handoff|verified owner checkpoint',
      state: 'open',
      introducedBy: firstDate,
      includeInIndex: true,
      inclusionOverride: null,
      goal: '',
      doneWhen: '',
      gates: [],
      history: [],
    }],
    articles: [],
  })
}

function checkpoint(title: string, outcome: string) {
  return {
    kind: 'checkpoint' as const,
    title,
    benefit: 'Keep the next owner decision grounded in current evidence.',
    start: 'Open the current issue state.',
    target,
    entryPoint: 'Review issue #900 and its current API state.',
    context: 'The bounded handoff remains open.',
    whyNow: 'The owner checkpoint is still required.',
    outcome,
    nextCheck: 'Record the owner verdict against the current issue state.',
    factCitations: [{ sourceId: 'issue', quote: current }],
    goalCitations: [{ sourceId: 'goal', quote: goal }],
  }
}

function actionOption() {
  return {
    kind: 'action' as const,
    actionKey: 'act-existing',
    title: 'Continue the bounded handoff',
    benefit: 'Advance the existing action without creating another identity.',
    start: 'Resume the recorded validation.',
    entryPoint: 'Open the current action and issue #900.',
    context: 'The bounded handoff remains open.',
    whyNow: 'The verified action still needs an owner checkpoint.',
    outcome: 'Reach the verified owner checkpoint.',
    nextCheck: 'Record the owner verdict against the current issue state.',
    factCitations: [{ sourceId: 'issue', quote: current }],
    goalCitations: [{ sourceId: 'goal', quote: goal }],
  }
}

function proposal(): ActionProposal {
  return {
    changes: [{ actionKey: 'act-existing', state: 'open', description: 'Validate the bounded handoff against the current issue state.', reason: 'The current API state remains open.', citations: [{ sourceId: 'issue', quote: current }] }],
    suggestions: [],
    closingOptions: [actionOption(), checkpoint('Confirm the owner checkpoint', 'Confirm the owner verdict.'), checkpoint('Confirm the roadmap checkpoint', 'Confirm the roadmap gate.')],
  }
}

function verification(): ActionVerification {
  return {
    changes: [{ actionKey: 'act-existing', verdict: 'pass', reason: 'The current API state supports retaining the open action.' }],
    suggestions: [],
    closingOptions: [0, 1, 2].map(optionIndex => ({ optionIndex, verdict: 'pass' as const, reason: 'Current facts, goal, entry point and next checkpoint are supported.' })),
  }
}

describe('dated pending-review state digests', () => {
  it('keeps a historical pending review renderable and buildable after a later decision', async () => {
    const firstStatuses = new Map([[firstDate, 'draft']])
    const ready = applyVerifiedActionReview({
      registry: seed(),
      cycle: revisionActionCycle('dated-pending-ready'),
      articleDate: firstDate,
      articleStatuses: firstStatuses,
      markdown: firstMarkdown,
      sources,
      roundId: sha256('dated-pending-ready'),
      proposal: proposal(),
      verification: verification(),
    })
    const pending = await reviewDraftActions({
      registry: ready,
      cycle: revisionActionCycle('dated-pending-retry'),
      articleDate: firstDate,
      articleStatuses: firstStatuses,
      markdown: firstMarkdown,
      feedback: 'Retry after an injected provider failure.',
      sources,
      agents: { propose: async () => { throw new Error('injected provider timeout') }, verify: async () => verification() },
    })
    const statuses = new Map([[firstDate, 'draft'], [laterDate, 'draft']])
    const withLaterDecision = applyVerifiedActionReview({
      registry: pending.registry,
      cycle: revisionActionCycle('dated-pending-later'),
      articleDate: laterDate,
      articleStatuses: statuses,
      markdown: laterMarkdown,
      sources,
      roundId: sha256('dated-pending-later'),
      proposal: proposal(),
      verification: verification(),
    })

    const historicalRender = renderArticleActions(pending.markdown, withLaterDecision, firstDate, statuses)
    expect(historicalRender).toBe(pending.markdown)
    expect(withLaterDecision.records[0].history.map(decision => decision.articleDate)).toEqual([firstDate, laterDate])

    const tampered = structuredClone(withLaterDecision)
    const historical = tampered.articles.find(article => article.date === firstDate)
    if (historical?.closing?.kind !== 'shortlist' || historical.closing.options[0].kind !== 'action') throw new Error('Missing historical pending shortlist fixture')
    historical.closing.options[0].title = 'Tampered same-day handoff'
    expect(() => renderArticleActions(pending.markdown, tampered, firstDate, statuses)).toThrow(/action review state is stale/i)

    const root = mkdtempSync(join(tmpdir(), 'dated-pending-build-'))
    roots.push(root)
    mkdirSync(join(root, '_articles'), { recursive: true })
    writeFileSync(join(root, '_articles', `${firstDate}.md`), pending.markdown)
    writeFileSync(join(root, '_articles', `${laterDate}.md`), laterMarkdown)
    writeActionStore(root, withLaterDecision)

    expect(() => buildApi(root)).not.toThrow()
    const built = JSON.parse(readFileSync(join(root, 'api', 'articles', `${firstDate}.json`), 'utf8')) as { bodyHtml: string }
    expect(built.bodyHtml).toContain('Action review pending')
  })

  it('retires an unresolved action recommendation after its verified terminal disposition', () => {
    const delivery = 'Repository receipt proves the bounded action completion condition is satisfied.'
    const evidence: ActionSource[] = [...sources, { id: 'delivery', kind: 'repository', locator: 'evidence/delivery.md', content: delivery }]
    const statuses = new Map([[firstDate, 'draft']])
    const apply = (registry: ActionRegistry, nextProposal: ActionProposal, round: string) => applyVerifiedActionReview({
      registry,
      cycle: revisionActionCycle('terminal-unresolved-action'),
      articleDate: firstDate,
      articleStatuses: statuses,
      markdown: firstMarkdown,
      sources: evidence,
      roundId: sha256(round),
      proposal: nextProposal,
      verification: {
        changes: nextProposal.changes.map(change => ({ actionKey: change.actionKey, verdict: 'pass' as const, reason: 'The authoritative evidence supports this disposition.' })),
        suggestions: [],
        closingOptions: (nextProposal.closingOptions ?? []).map((_, optionIndex) => ({ optionIndex, verdict: 'pass' as const, reason: 'Current facts, goal, entry point and next checkpoint are supported.' })),
      },
    })
    const readyProposal = proposal()
    const ready = apply(seed(), readyProposal, 'terminal-ready')
    const readyClosing = ready.articles[0].closing
    if (readyClosing?.kind !== 'shortlist' || readyClosing.options[0].kind !== 'action') throw new Error('Missing ready action recommendation')
    const actionIdentity = readyClosing.options[0].identity
    const partialProposal: ActionProposal = { ...proposal(), closingOptions: [checkpoint('Confirm the owner checkpoint', 'Confirm the owner verdict.'), checkpoint('Confirm the roadmap checkpoint', 'Confirm the roadmap gate.')] }
    const partial = apply(ready, partialProposal, 'terminal-partial')
    const partialClosing = partial.articles[0].closing
    if (partialClosing?.kind !== 'needs-evidence') throw new Error('Missing partial action recommendation')
    expect(partialClosing.unresolvedRecommendations).toMatchObject([{ kind: 'action', identity: actionIdentity, actionKey: 'act-existing' }])
    const terminalProposal = proposal()
    terminalProposal.changes[0] = { actionKey: 'act-existing', state: 'done', description: 'The bounded handoff is complete.', reason: 'Repository delivery evidence satisfies the completion condition.', citations: [{ sourceId: 'delivery', quote: delivery }] }
    terminalProposal.closingOptions = [
      checkpoint('Confirm the owner checkpoint', 'Confirm the owner verdict.'),
      checkpoint('Confirm the roadmap checkpoint', 'Confirm the roadmap gate.'),
      checkpoint('Confirm the evidence checkpoint', 'Confirm the evidence gate.'),
    ]

    const terminal = apply(partial, terminalProposal, 'terminal-done')

    expect(terminal.records[0].state).toBe('done')
    expect(terminal.articles[0].closing).toMatchObject({ kind: 'shortlist' })
    if (terminal.articles[0].closing?.kind === 'needs-evidence') expect(terminal.articles[0].closing.unresolvedIdentities).not.toContain(actionIdentity)
  })
})
