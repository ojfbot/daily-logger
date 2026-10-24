import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ActionRegistrySchema, articleActionCard, articleCompletionOutcome, completeArticleWithPendingActions, isArticleOnlyAcceptanceOutput, projectRegistry, readActionRegistry, readArticleStatuses, registryRevision, renderArticleActions, splitActionRegistry, writeActionRegistry } from '../action-registry.js'
import { prepareConservativeDraftCandidateEvidence } from '../action-evidence-selection.js'
import { acceptanceActionCycle } from '../action-review-cycle.js'
import { writeActionStore } from './action-store-fixture.js'

const date = '2026-10-21'
const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'article-completion-original-draft-'))
beforeAll(() => {
  const archive = execFileSync('git', ['archive', '9ca54f6a197be4cc992a8044e5fa9119f1de3df0', 'actions', '_articles'], { cwd: new URL('../..', import.meta.url), maxBuffer: 32 * 1024 * 1024 })
  execFileSync('tar', ['-x', '-C', fixtureRoot], { input: archive })
})
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

function fixture() {
  const registry = readActionRegistry(fixtureRoot)
  const prior = registry.articles.find(article => article.date === date)
  if (!prior || prior.review.state !== 'pending') throw new Error('Expected original pending October21 fixture')
  const markdown = readFileSync(resolve(fixtureRoot, '_articles', `${date}.md`), 'utf8').replace(/^status:.*$/m, 'status: "accepted"\noutcome: accepted')
  const statuses = readArticleStatuses(fixtureRoot).set(date, 'accepted')
  const cycle = acceptanceActionCycle('fixture-clean-acceptance', prior)
  const evidence = prepareConservativeDraftCandidateEvidence({ registry, articleDate: date, markdown, articleStatuses: statuses, cycle, draftCandidates: prior.draftCandidates ?? [] })
  const result = completeArticleWithPendingActions({ registry, articleDate: date, markdown, articleStatuses: statuses, cycle, failureKind: 'invalid-output', sources: [], draftCandidateEvidence: evidence })
  return { registry, prior, mixed: result.registry, markdown: result.markdown, statuses, evidence }
}

describe('article completion with unresolved actions', () => {
  it('accepts only the explicit article-only Accepted/pending combination', () => {
    const { mixed } = fixture()
    expect(ActionRegistrySchema.safeParse(mixed).success).toBe(true)
    const snapshot = mixed.articles.at(-1)
    if (!snapshot) throw new Error('Missing snapshot')
    expect(ActionRegistrySchema.safeParse({ ...mixed, articles: [...mixed.articles.slice(0, -1), { ...snapshot, status: 'rejected' }] }).success).toBe(false)
    expect(ActionRegistrySchema.safeParse({ ...mixed, articles: [...mixed.articles.slice(0, -1), { ...snapshot, review: { state: 'pending', reason: 'Unbound pending review' } }] }).success).toBe(false)
  })

  it('shows every original as Needs review and never claims acceptance is blocked', () => {
    const { mixed, markdown, statuses, prior } = fixture()
    const html = renderArticleActions(markdown, ActionRegistrySchema.parse(mixed), date, statuses)
    expect(html).toContain('Article accepted. These suggestions still need independent review.')
    expect(html).not.toContain('Acceptance remains blocked')
    for (const candidate of prior.draftCandidates ?? []) expect(html).toContain(`data-draft-candidate-id="${candidate.candidateId}"`)
    expect(html.match(/Needs review/g)).toHaveLength(3)
  })

  it('derives public held reasons from the closed failure kind rather than saved error text', () => {
    const { mixed, markdown, statuses } = fixture()
    const snapshot = mixed.articles.find(article => article.date === date)
    if (snapshot?.review.state !== 'pending') throw new Error('Missing held snapshot')
    snapshot.review.reason = 'PRIVATE_ERROR_SENTINEL'
    expect(renderArticleActions(markdown, mixed, date, statuses)).not.toContain('PRIVATE_ERROR_SENTINEL')
    expect(JSON.stringify(projectRegistry(mixed, statuses))).not.toContain('PRIVATE_ERROR_SENTINEL')
    expect(JSON.stringify(articleActionCard(mixed, date, statuses))).not.toContain('PRIVATE_ERROR_SENTINEL')
  })

  it('retains original candidate identities in a non-dispatchable index without changing healthy work', () => {
    const { mixed, statuses, registry, prior } = fixture()
    const before = projectRegistry(registry, readArticleStatuses(fixtureRoot))
    const after = projectRegistry(ActionRegistrySchema.parse(mixed), statuses)
    expect(after.open).toEqual(before.open)
    expect(after.done).toEqual(before.done)
    expect(after.proposed.filter(row => row.status === 'needs-review')).toEqual((prior.draftCandidates ?? []).map(candidate => ({
      id: candidate.candidateId, command: candidate.payload.command, description: candidate.payload.description, repo: candidate.payload.repo,
      sourceDate: date, status: 'needs-review', includeInIndex: false, dispatchable: false,
      reason: 'The agent returned an incomplete response; these suggestions still need review.',
    })))
  })

  it('atomically saves and cold-reloads the original records, sources, candidates and failure binding', () => {
    const { registry, mixed, markdown, prior } = fixture()
    const root = mkdtempSync(resolve(tmpdir(), 'article-completion-'))
    try {
      mkdirSync(resolve(root, '_articles'))
      const path = resolve(root, '_articles', `${date}.md`), original = readFileSync(resolve(fixtureRoot, '_articles', `${date}.md`), 'utf8')
      writeFileSync(path, original); writeActionStore(root, registry)
      writeActionRegistry(root, mixed, registryRevision(registry), { path, expected: original, next: markdown, publish: () => writeFileSync(path, markdown) })
      const reloaded = readActionRegistry(root), snapshot = reloaded.articles.find(article => article.date === date)
      expect(reloaded.records).toEqual(registry.records)
      expect(snapshot?.sources).toEqual(prior.sources)
      expect(snapshot?.draftCandidates).toEqual(prior.draftCandidates)
      const before = splitActionRegistry(registry).files.find(file => file.date === date), after = splitActionRegistry(reloaded).files.find(file => file.date === date)
      if (!before || !after) throw new Error('Missing native dated files')
      expect(isArticleOnlyAcceptanceOutput(before, after)).toBe(true)
      expect(articleCompletionOutcome(before, after)).toMatchObject({ state: 'pending', heldCandidateIds: prior.draftCandidates?.map(candidate => candidate.candidateId) })
      const changed = structuredClone(after); changed.snapshot.draftCandidates?.reverse()
      expect(isArticleOnlyAcceptanceOutput(before, changed)).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('refuses missing, empty or already verified custody and any later Accepted downgrade', () => {
    const { registry, markdown, statuses, prior, evidence } = fixture()
    for (const mode of ['missing', 'empty', 'verified', 'accepted'] as const) {
      const altered = structuredClone(registry), snapshot = altered.articles.find(article => article.date === date)
      if (!snapshot) throw new Error('Missing fixture')
      if (mode === 'missing') delete snapshot.draftCandidates
      if (mode === 'empty') snapshot.draftCandidates = []
      if (mode === 'verified') snapshot.review = { state: 'verified' }
      if (mode === 'accepted') snapshot.status = 'accepted'
      expect(() => completeArticleWithPendingActions({ registry: altered, articleDate: date, markdown, articleStatuses: statuses, cycle: acceptanceActionCycle('bad', prior), failureKind: 'invalid-output', sources: [], draftCandidateEvidence: evidence })).toThrow('original Draft')
    }
  })

  it('records only bounded fresh source custody and never raw fresh content', () => {
    const { registry, markdown, statuses, prior, evidence } = fixture()
    const result = completeArticleWithPendingActions({ registry, articleDate: date, markdown, articleStatuses: statuses, cycle: acceptanceActionCycle('source-custody', prior), failureKind: 'evidence-required', sources: [{ id: 'source:fixture', kind: 'repository', locator: 'fixture.txt', content: 'PRIVATE_FRESH_SOURCE_SENTINEL' }], draftCandidateEvidence: { ...evidence, reviewCycle: acceptanceActionCycle('source-custody', prior) } })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_FRESH_SOURCE_SENTINEL')
    expect(result.registry.articles.at(-1)?.review).toMatchObject({ state: 'pending', articleAcceptance: { rawContentRetained: false, sources: [{ id: 'source:fixture', locator: 'fixture.txt' }] } })
  })
})
