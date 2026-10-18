import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ActionRegistrySchema, ACTIONS_START, readActionRegistry, registryBytes, registryRevision, writeActionRegistry, setActionInclusion, rebindArticleSnapshot, renderArticleActions, splitActionRegistry, articleActionFileBytes, managedArticleDigest, projectRegistry, type ActionRegistry } from '../action-registry.js'
import { applyVerifiedActionReview, reviewDraftActions } from '../review-actions.js'
import { writeActionStore } from './action-store-fixture.js'

const faults = vi.hoisted(() => ({ rename: false }))
vi.mock('node:fs', async importOriginal => { const actual = await importOriginal<typeof import('node:fs')>(); return { ...actual, renameSync: (from: string, to: string) => { if (faults.rename) { faults.rename = false; throw new Error('Injected sidecar rename failure') } return actual.renameSync(from, to) } } })

const empty = () => ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
const source = { id: 'proof', kind: 'repository' as const, locator: 'ROADMAP.md', content: 'Reliable acceptance requires a verified checkpoint for each article.' }
const prose = (date: string, status = 'draft') => `---\ndate: ${date}\nstatus: ${status}\n---\nA reviewed article.\n`
function propose(date: string, registry = empty(), accepted = false): ActionRegistry {
  const previous = registry.articles.find(article => article.date === date)
  return applyVerifiedActionReview({ registry, articleDate: date, markdown: prose(date, accepted ? 'accepted' : 'draft'), articleStatuses: new Map([[date, accepted ? 'accepted' : 'draft']]), sources: [source], roundId: (accepted ? 'e' : 'd').repeat(64),
    proposal: { changes: (previous?.actionKeys ?? []).map(actionKey => ({ actionKey, state: 'open', description: 'Review this checkpoint.', reason: 'The checkpoint remains necessary.', citations: [{ sourceId: 'proof', quote: 'acceptance requires a verified checkpoint' }] })), suggestions: previous ? [] : [{ command: '/validate', description: `Review ${date}.`, repo: 'daily-logger', target: date, outcome: 'verified acceptance', goal: 'Reliable acceptance', factCitations: [{ sourceId: 'proof', quote: 'acceptance requires a verified checkpoint' }], goalCitations: [{ sourceId: 'proof', quote: 'Reliable acceptance' }], doneWhen: 'The checkpoint is verified.', gates: [], existingKey: null }] },
    verification: { changes: (previous?.actionKeys ?? []).map(actionKey => ({ actionKey, verdict: 'pass', reason: 'Source checked.' })), suggestions: previous ? [] : [{ candidateIndex: 0, verdict: 'pass', reason: 'Source checked.', existingKey: null }] } })
}
it('merges acceptance on D with generation on D+1 without changing the imported baseline (F8)', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-merge-'))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    const date = '2030-01-01', nextDate = '2030-01-02', first = propose(date)
    writeActionStore(root, first); git('init', '-q'); git('add', '.'); git('commit', '-qm', 'draft D')
    const baseline = readFileSync(join(root, 'actions/registry.json'), 'utf8')
    git('branch', 'next'); git('checkout', '-qb', 'accept')
    writeActionStore(root, propose(date, first, true)); git('add', '.'); git('commit', '-qm', 'accept D')
    git('checkout', 'next'); writeActionStore(root, propose(nextDate, first)); git('add', '.'); git('commit', '-qm', 'draft D+1')
    git('checkout', 'accept'); git('merge', '--no-edit', 'next')
    const hydrated = readActionRegistry(root), projection = projectRegistry(hydrated, new Map([[date, 'accepted'], [nextDate, 'draft']]))
    expect(readFileSync(join(root, 'actions/registry.json'), 'utf8')).toBe(baseline)
    expect(projection.open).toHaveLength(1); expect(projection.proposed).toHaveLength(1)
    expect(hydrated.articles.map(article => article.date)).toEqual([date, nextDate])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
it('rejects oversized evidence before either provider call, retains the draft and admits nothing (F3/F4)', async () => {
  let calls = 0
  const result = await reviewDraftActions({ registry: empty(), articleDate: '2030-01-01', markdown: prose('2030-01-01'), feedback: '', articleStatuses: new Map(), sources: [{ ...source, content: 'x'.repeat(129 * 1024) }], agents: { propose: async () => { calls++; throw new Error('must not call') }, verify: async () => { calls++; throw new Error('must not call') } } })
  expect(calls).toBe(0); expect(result.registry.records).toEqual([])
  expect(result.markdown).toContain('Action review pending')
  const file = splitActionRegistry(result.registry).files[0]!
  file.snapshot.rejected = [{ description: 'x'.repeat(65 * 1024), reason: 'oversized' }]
  expect(() => articleActionFileBytes(file)).toThrow(/64 KiB/)
})
it('rebinds an editorial typo without changing evidence, action decisions or model round (F7)', () => {
  const date = '2030-01-01', registry = propose(date), statuses = new Map([[date, 'draft']])
  const before = renderArticleActions(prose(date), registry, date, statuses), after = before.replace('reviewed article', 'reviewed daily article')
  const roundId = registry.articles[0]!.roundId
  const next = rebindArticleSnapshot(registry, { date, beforeMarkdown: before, afterMarkdown: after, expectedRoundId: roundId, actor: 'ojfbot', instruction: 'Fix the wording only.' })
  expect(next.records).toEqual(registry.records)
  expect(next.articles[0]!.roundId).toBe(roundId); expect(next.articles[0]!.sources).toEqual(registry.articles[0]!.sources)
  expect(next.articles[0]!.articleDigest).toBe(managedArticleDigest(after))
  expect(() => rebindArticleSnapshot(registry, { date, beforeMarkdown: before, afterMarkdown: after.replace(ACTIONS_START, `${ACTIONS_START}\nnew decision`), expectedRoundId: roundId, actor: 'ojfbot', instruction: 'Change actions' })).toThrow(/cannot change managed/)
})
it('binds authored suggestion-looking prose instead of ignoring it in the digest (F17)', () => {
  const article = prose('2030-01-01')
  expect(managedArticleDigest(`${article}\n> **Suggested actions**\n> A prose quotation.\n`)).not.toBe(managedArticleDigest(article))
})

it('binds body lines named status, outcome and provenance (F17)', () => {
  const article = prose('2030-01-01')
  for (const key of ['status', 'outcome', 'provenance']) expect(managedArticleDigest(`${article}\n${key}: old`)).not.toBe(managedArticleDigest(`${article}\n${key}: new`))
})

it('round-trips and rejects oversized, misnamed, and unknown-identity files on disk (F3/F8)', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-corruption-')), date = '2030-01-01'
  try {
    const registry = propose(date), path = join(root, `actions/articles/${date}.json`)
    writeActionStore(root, registry)
    expect(registryBytes(readActionRegistry(root))).toBe(registryBytes(registry))
    const bytes = readFileSync(path, 'utf8')
    writeFileSync(path, bytes + ' '.repeat(64 * 1024))
    expect(() => readActionRegistry(root)).toThrow('Oversized')
    writeFileSync(path, bytes); renameSync(path, join(root, 'actions/articles/2030-01-02.json'))
    expect(() => readActionRegistry(root)).toThrow('filename and date')
    renameSync(join(root, 'actions/articles/2030-01-02.json'), path)
    const file = JSON.parse(bytes); file.decisions[0].key = 'unknown-identity'; writeFileSync(path, JSON.stringify(file))
    expect(() => readActionRegistry(root)).toThrow('Unknown action identity')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
it('restores both the published article and dated state if sidecar installation fails (F8)', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-install-')), date = '2030-01-01'
  try {
    const registry = propose(date), article = join(root, `${date}.md`), before = prose(date)
    writeActionStore(root, registry); writeFileSync(article, before)
    const next = setActionInclusion(registry, registry.records[0]!.key, false, 'ojfbot', 'Explicit editorial inclusion checkbox', new Map([[date, 'draft']]))
    faults.rename = true
    expect(() => writeActionRegistry(root, next, registryRevision(registry), { path: article, expected: before, next: 'New prose.', publish: () => writeFileSync(article, 'New prose.') })).toThrow('Injected sidecar rename failure')
    expect(readFileSync(article, 'utf8')).toBe(before)
    expect(registryBytes(readActionRegistry(root))).toBe(registryBytes(registry))
    expect(existsSync(join(root, 'actions/registry.json.lock'))).toBe(false)
  } finally { faults.rename = false; rmSync(root, { recursive: true, force: true }) }
})

it('bounds the verifier prompt including the proposed output before calling the verifier (F3)', async () => {
  let proposals = 0, verifications = 0
  const registry = propose('2030-01-01'), record = registry.records[0]!
  const result = await reviewDraftActions({ registry, articleDate: '2030-01-01', markdown: prose('2030-01-01'), feedback: 'new review', sources: [source], articleStatuses: new Map(), agents: {
    propose: async () => { proposals++; return { changes: [{ actionKey: record.key, state: 'open', description: 'x'.repeat(640 * 1024), reason: 'Grounded.', citations: [{ sourceId: 's1', quote: 'Reliable acceptance' }] }], suggestions: [] } },
    verify: async () => { verifications++; throw new Error('must not call') },
  } })
  expect(proposals).toBe(1); expect(verifications).toBe(0)
  expect(result.registry.articles[0]!.review.state).toBe('pending')
  expect(result.registry.records).toEqual(registry.records)
})
