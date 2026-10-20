import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const { github } = vi.hoisted(() => ({ github: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: github }))
import { ActionRegistrySchema, readActionRegistry, registryRevision, sha256, writeActionRegistry, type ActionRegistry, type ActionSource } from '../action-registry.js'
import { writeActionStore } from './action-store-fixture.js'
import { ACTION_EVIDENCE_SELECTION_VERSION, actionEvidenceScope, actionReviewIndex, canonicalActionSources, COVERAGE_SOURCE, selectActionEvidence } from '../action-evidence-selection.js'
import { revisionActionCycle } from '../action-review-cycle.js'
import { collectActionSources, reviewArticleActions, reviewDraftActions, type ActionVerification } from '../review-actions.js'

const date = '2030-01-01'
const empty = () => ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
const markdown = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\n${Array.from({ length: 10 }, (_, i) => `https://github.com/ojfbot/daily-logger/pull/${i + 1}`).join('\n')}\n## What's next\nReview daily-logger #385 and daily-logger #386.\n`
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks(); github.mockReset() })

function fixture(options: { markdown?: string; feedback?: string; acceptedPreview?: boolean; registry?: ActionRegistry; compact?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'action-selection-')); roots.push(root)
  const ownerGate = 'OWNER GATE: human visual acceptance is required before merge.'
  const completion = 'OWNER DELIVERY: the human accepted the visual preview and verified every preview acceptance check.'
  const middle = Array.from({ length: options.compact ? 0 : 201 }, (_, i) => ({ author_association: i === 100 || i === 200 && options.acceptedPreview ? 'OWNER' : 'NONE',
    body: i === 100 ? ownerGate : i === 200 && options.acceptedPreview ? completion : `Comment ${i}: ${'背景🙂 '.repeat(15)}` }))
  github.mockImplementation((_command, args: string[], options: { timeout: number }) => {
    expect(args.slice(0, 3)).toEqual(['api', '--paginate', '--slurp'])
    expect(options.timeout).toBeGreaterThan(0); expect(options.timeout).toBeLessThanOrEqual(10000)
    const endpoint = args.at(-1) ?? ''
    if (endpoint.includes('/contents/')) return JSON.stringify([{ type: 'file', sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from('Goal: reliable evidence-backed queue and article decisions.').toString('base64') }])
    if (/\/issues\/\d+$/.test(endpoint)) return JSON.stringify([{ state: 'open', author_association: 'OWNER', body: 'The exact obligation remains open.' }])
    if (endpoint.includes('/comments')) return JSON.stringify([middle])
    throw new Error(`Unexpected fake GitHub endpoint: ${endpoint}`)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const sources = collectActionSources({ repoRoot: root, registry: options.registry ?? empty(), markdown: options.markdown ?? markdown, feedback: options.feedback ?? '' })
  return { root, sources, ownerGate, completion }
}
function input(sources: ActionSource[]) { return { registry: empty(), articleDate: date, cycle: revisionActionCycle('offline-source-selection-control'), articleStatuses: new Map([[date, 'draft']]), markdown, feedback: '', sources } }

it('revalidates a carried closing checkpoint even after authored next-step prose changes', () => {
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'verified' }, articleDigest: 'd'.repeat(64), roundId: 'e'.repeat(64), actionKeys: [],
    closing: { kind: 'options', options: [{ kind: 'checkpoint', title: 'Review the current pilot', target: 'https://github.com/ojfbot/daily-logger/pull/385', entryPoint: 'Open the current PR.', context: 'The prior review retained a human gate.', whyNow: 'The gate is unresolved.', outcome: 'Close the pilot evidence gap.', nextCheck: 'Record the visual verdict.', factCitations: [{ sourceId: 'github:daily-logger#385@' + 'a'.repeat(64), quote: 'CURRENT API STATE daily-logger#385: state=open.' }], goalCitations: [{ sourceId: 'github:daily-logger#385@' + 'a'.repeat(64), quote: 'Human visual acceptance remains required.' }] }] },
    stateDigest: sha256('empty'), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'legacy-closing-fixture', proposalSha256: 'f'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const revised = `---\ndate: ${date}\nstatus: draft\n---\n## What's next\nThe authored prose no longer repeats a PR number.\n`

  expect(actionEvidenceScope({ registry, articleDate: date, markdown: revised, feedback: '' }).refs).toEqual(new Set(['daily-logger#385']))
})

it('recollects and selects all three maintained targets after one becomes unresolved and review goes pending', async () => {
  const targets = [900, 901, 902].map(number => `https://github.com/ojfbot/daily-logger/issues/${number}`)
  const goal = 'Maintain the source-supported existing checkpoint shortlist.'
  const evidence: ActionSource[] = [
    ...targets.map((target, index) => {
      const number = 900 + index
      const content = `CURRENT API STATE daily-logger#${number}: state=open; head=not-a-PR; merged_at=none.`
      return { id: `github:daily-logger#${number}`, kind: 'github' as const, locator: target, content, trustedContent: [content] }
    }),
    { id: 'goal', kind: 'goal', locator: 'ROADMAP.md', content: goal },
  ]
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## Roadmap pulse\nThree existing obligations need current review.\n`
  const statuses = new Map([[date, 'draft']])
  const cycle = revisionActionCycle('three-maintained-targets')
  const options = targets.map((target, index) => ({
    kind: 'checkpoint' as const,
    target,
    title: `Review existing checkpoint ${900 + index}`,
    benefit: 'Keep an existing obligation grounded in current evidence.',
    start: 'Review the current issue.',
    entryPoint: `Begin at checkpoint ${900 + index}.`,
    context: 'This is an existing open checkpoint.',
    whyNow: 'Current owner evidence retains the checkpoint.',
    outcome: `Return the supported disposition for checkpoint ${900 + index}.`,
    nextCheck: 'Return the current owner decision.',
    factCitations: [{ sourceId: `github:daily-logger#${900 + index}`, quote: `CURRENT API STATE daily-logger#${900 + index}: state=open; head=not-a-PR; merged_at=none.` }],
    goalCitations: [{ sourceId: 'goal', quote: goal }],
  }))
  const pass = [0, 1, 2].map(optionIndex => ({ optionIndex, verdict: 'pass' as const, reason: 'Current exact facts and goal support this checkpoint.' }))
  const base = { cycle, articleDate: date, articleStatuses: statuses, markdown: article, sources: evidence }
  const ready = await reviewArticleActions({
    ...base,
    registry: empty(),
    feedback: targets.join('\n'),
    agents: { propose: async () => ({ changes: [], suggestions: [], closingOptions: options }), verify: async () => ({ changes: [], suggestions: [], closingOptions: pass }) },
  })
  const partialVerdicts: NonNullable<ActionVerification['closingOptions']> = [...pass]
  partialVerdicts[0] = { optionIndex: 0, verdict: 'hold', reason: 'This checkpoint needs another independent review.' }
  const partial = await reviewArticleActions({
    ...base,
    registry: ready.registry,
    markdown: ready.markdown,
    feedback: 'Recheck the maintained shortlist.',
    agents: { propose: async () => ({ changes: [], suggestions: [], closingOptions: options }), verify: async () => ({ changes: [], suggestions: [], closingOptions: partialVerdicts }) },
  })
  const partialClosing = partial.registry.articles[0].closing
  if (partialClosing?.kind !== 'needs-evidence') throw new Error('Missing partial maintained shortlist fixture')
  expect(partialClosing.unresolvedRecommendations).toMatchObject([{ target: targets[0] }])
  const pending = await reviewDraftActions({
    ...base,
    registry: partial.registry,
    markdown: partial.markdown,
    feedback: 'Retry after an injected provider failure.',
    agents: { propose: async () => { throw new Error('injected provider timeout') }, verify: async () => ({}) },
  })

  const scoped = actionEvidenceScope({ registry: pending.registry, articleDate: date, markdown: pending.markdown, feedback: '' })
  expect([...scoped.refs].sort()).toEqual(['daily-logger#900', 'daily-logger#901', 'daily-logger#902'])
  const selected = selectActionEvidence({ registry: pending.registry, articleDate: date, markdown: pending.markdown, feedback: '', sources: evidence })
  expect(selected.receipt.requiredReferences).toEqual(['daily-logger#900', 'daily-logger#901', 'daily-logger#902'])
  expect(selected.sources.filter(source => source.kind === 'github').map(source => source.locator).sort()).toEqual([...targets].sort())

  const { sources: recollected } = fixture({ registry: pending.registry, markdown: pending.markdown, compact: true })
  expect(targets.every(target => recollected.some(source => source.locator === target))).toBe(true)
})

it('recollects references from retained draft context after visible prose is normalized', () => {
  const registry = empty()
  registry.articles.push({
    date, status: 'draft', review: { state: 'verified' }, articleDigest: 'd'.repeat(64), roundId: 'e'.repeat(64), actionKeys: [],
    draftContext: { kind: 'retained', markdown: 'Review daily-logger #385 before changing the owner gate.' },
    closing: { kind: 'needs-evidence', question: 'Which option is supported?', missingEvidence: 'No option passed.', nextCheck: 'Recheck primary evidence.', recommendations: [] },
    stateDigest: sha256('empty'), verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'legacy-closing-fixture', proposalSha256: 'f'.repeat(64), verdicts: [] }, sources: [], rejected: [],
  })
  const normalized = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\nNo reader-facing action list.\n`

  fixture({ registry, markdown: normalized, compact: true })

  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/385'))).toBe(true)
})

it.each(['feedback', 'next-actions'])('follows an older action explicitly named in %s through collector, whole-source selection and both closure prompts', async location => {
  const key = 'old-owned-action'
  const feedback = location === 'feedback' ? `Reconcile ${key} against its recorded completion condition; retain every owner gate.` : ''
  const shipments = Array.from({ length: 20 }, (_, i) => `https://github.com/ojfbot/daily-logger/pull/${i + 1}`).join('\n')
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What shipped\n${shipments}\n## What's next\n${location === 'next-actions' ? `Reconcile ${key}.` : ''}\n`
  const registry = empty()
  const original = { id: key, command: '/review', description: 'Review the visual preview for daily-logger #385.', repo: 'daily-logger', status: 'open' as const, sourceDate: '2029-12-31' }
  registry.records.push({ key, original, origin: 'imported', workKey: 'preview-obligation', state: 'open', introducedBy: original.sourceDate,
    includeInIndex: true, inclusionOverride: null, goal: 'A human accepts the preview.', doneWhen: 'The human accepted the visual preview and verified every preview acceptance check.', gates: ['Human visual acceptance is required.'], history: [] })
  registry.records.push({ ...structuredClone(registry.records[0]), key: 'context-neighbor', original: { ...original, id: 'context-neighbor' },
    workKey: 'other-obligation', goal: 'Separate contextual work.', gates: ['Also inspect daily-logger #999.'] })
  const { sources, ownerGate, completion } = fixture({ registry, markdown: article, feedback, acceptedPreview: true })
  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/385'))).toBe(true)
  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('/issues/999'))).toBe(false)
  expect(sources.filter(source => source.kind === 'github')).toHaveLength(12)
  const reviewInput = { ...input(sources), registry, markdown: article, feedback }
  const selected = selectActionEvidence(reviewInput)
  expect(selected.receipt.requiredReferences).toEqual(['daily-logger#385'])
  expect(selected.expandedActionKeys).toContain('context-neighbor')
  const prompts: string[] = []
  const result = await reviewArticleActions({ ...reviewInput, agents: {
    propose: async (prompt, modelSources) => {
      prompts.push(prompt)
      const source = modelSources.find(source => source.locator === 'https://github.com/ojfbot/daily-logger/issues/385')
      if (!source) throw new Error('Named older action lost its collected dependency')
      expect(source.content).toContain(ownerGate)
      expect(source.content).toContain(completion)
      expect(source.trustedContent).toContain(completion)
      return { changes: [{ actionKey: key, state: 'done', description: 'The human accepted the visual preview.', reason: 'The owner confirmed the exact preview completion condition.', citations: [{ sourceId: source.id, quote: completion }] }], suggestions: [] }
    }, verify: async prompt => { prompts.push(prompt); return { changes: [{ actionKey: key, verdict: 'pass', reason: 'The complete owner discussion retains its gate and later exact delivery confirmation.' }], suggestions: [] } },
  } })
  expect(prompts).toHaveLength(2)
  expect(prompts.every(prompt => prompt.includes(ownerGate) && prompt.includes(completion))).toBe(true)
  expect(result.registry.records.find(record => record.key === key)?.state).toBe('done')
  expect(result.registry.records.find(record => record.key === 'context-neighbor')).toEqual(registry.records[1])
  expect(result.registry.articles[0].rejected).toEqual([])
  const calls = vi.fn()
  const missing = await reviewDraftActions({ ...reviewInput, sources: sources.filter(source => source.kind !== 'github'), agents: {
    propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} },
  } })
  expect(calls).not.toHaveBeenCalled()
  expect(missing.registry.articles[0].review.state).toBe('pending')
  expect(missing.registry.records).toEqual(registry.records)
})

it('keeps thirteen mandatory references pending under the unchanged twelve-discussion collector limit', async () => {
  const article = `---\ndate: ${date}\nstatus: draft\n---\n## What's next\nInspect the explicitly named evidence.\n`
  const feedback = Array.from({ length: 13 }, (_, index) => `Inspect daily-logger #${100 + index}.`).join('\n')
  const { sources } = fixture({ markdown: article, feedback, compact: true })
  expect(sources.filter(source => source.kind === 'github')).toHaveLength(12)
  const calls = vi.fn()
  const result = await reviewDraftActions({ ...input(sources), markdown: article, feedback, agents: {
    propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} },
  } })
  expect(calls).not.toHaveBeenCalled()
  expect(result.registry.records).toEqual([])
  expect(result.registry.articles[0].review).toMatchObject({ state: 'pending', reason: expect.stringContaining('Required action evidence unavailable') })
})

it('runs full collector→selection→both prompt paths with twelve oversized discussions, preserving an older owner gate', async () => {
  const { root, sources, ownerGate } = fixture()
  expect(sources.reduce((total, source) => total + Buffer.byteLength(source.content), 0)).toBeGreaterThan(384 * 1024)
  const prompts: string[] = []
  const result = await reviewArticleActions({ ...input(sources), agents: {
    propose: async (prompt, selected) => {
      prompts.push(prompt)
      expect(selected.filter(source => source.kind === 'github')).toHaveLength(2)
      for (const source of selected.filter(source => source.kind === 'github')) {
        expect(source.content).toContain(ownerGate)
        expect(source.trustedContent).toContain(ownerGate)
        expect(source.content).toContain('Comment 0:'); expect(source.content).toContain('Comment 200:')
      }
      return { changes: [], suggestions: [] }
    }, verify: async prompt => { prompts.push(prompt); return { changes: [], suggestions: [] } },
  } })
  expect(prompts).toHaveLength(2)
  expect(prompts.every(prompt => Buffer.byteLength(prompt) < 640 * 1024)).toBe(true)
  const retained = result.registry.articles[0].sources.find(source => source.id.startsWith(COVERAGE_SOURCE))
  expect(retained).toBeDefined()
  const selection = selectActionEvidence(input(sources))
  expect(retained?.content).toBe(JSON.stringify(selection.receipt))
  writeActionStore(root, empty())
  writeActionRegistry(root, result.registry, registryRevision(empty()))
  const datedBytes = readFileSync(join(root, `actions/articles/${date}.json`), 'utf8')
  expect(Buffer.byteLength(datedBytes)).toBeLessThanOrEqual(64 * 1024)
  expect(readActionRegistry(root).articles[0].sources.find(source => source.id === retained?.id)).toEqual(retained)
  expect(selection.receipt.sources.filter(source => source.kind === 'github' && !source.included)).toHaveLength(10)
  for (const item of selection.receipt.sources) expect(item.fullContentSha256).toBe(sha256(sources.find(source => source.id === item.id)?.content ?? ''))
  const retry = await reviewArticleActions({ ...input([...sources, sources[0]].reverse()), registry: result.registry, markdown: result.markdown, agents: {
    propose: async () => { throw new Error('Cached retry called proposer') }, verify: async () => { throw new Error('Cached retry called verifier') },
  } })
  expect(retry.cached).toBe(true)
  expect(retry.registry).toEqual(result.registry)
})

it('canonicalizes exact duplicates and property-order equivalents without losing citation IDs', () => {
  const source: ActionSource = { id: 'github:core#1', kind: 'github', locator: 'https://github.com/ojfbot/core/issues/1', content: 'Current factual evidence.', trustedContent: ['Current factual evidence.'] }
  const equivalent: ActionSource = { content: source.content, trustedContent: source.trustedContent, locator: source.locator, kind: source.kind, id: source.id }
  expect(canonicalActionSources([source, equivalent, source])).toEqual([source])
  expect(canonicalActionSources([equivalent, source])).toEqual([source])
  expect(() => canonicalActionSources([source, { ...source, trustedContent: ['Different authority.'] }])).toThrow(/Conflicting action evidence identity/)
  expect(() => canonicalActionSources([source, { ...source, id: `${source.id}@${'a'.repeat(64)}` }])).toThrow(/Conflicting action evidence identity/)
})

it('keeps semantic rejection and distinct cycle quota holds separate in global rejection memory', () => {
  const registry = readActionRegistry(process.cwd())
  const article = registry.articles[0]
  if (!article) throw new Error('Missing registry fixture article')
  const common = { description: 'Bounded work.', reason: 'Retained for independent review.', workKey: 'daily-logger|target|outcome', evidenceDigest: sha256('unchanged factual evidence') }
  const hold = (id: string) => ({ ...common, quotaHold: { articleDate: article.date, cycle: revisionActionCycle(id) } })
  article.rejected.push(common, hold('request-1'), hold('request-2'), hold('request-1'))
  const index = actionReviewIndex({ registry, articleDate: date, articleStatuses: new Map(), expandedActionKeys: [] })
  const matches = index.rejectionMemory.filter(item => item.workKey === common.workKey)
  expect(matches).toHaveLength(3)
  expect(matches).toEqual(expect.arrayContaining([
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest },
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest, quotaHold: hold('request-1').quotaHold },
    { workKey: common.workKey, evidenceDigest: common.evidenceDigest, quotaHold: hold('request-2').quotaHold },
  ]))
})

it.each(['missing', 'excerpt', 'oversized-unicode'])('keeps %s required evidence pending before either model call', async mode => {
  const { sources } = fixture()
  const required = sources.find(source => source.id.startsWith('github:daily-logger#385@'))
  if (!required) throw new Error('Missing fixture source')
  const changed = sources.filter(source => source !== required)
  if (mode !== 'missing') {
    const content = mode === 'excerpt' ? 'An incomplete excerpt.' : '🙂'.repeat(33 * 1024)
    changed.push({ ...required, id: mode === 'excerpt' ? required.id : `github:daily-logger#385@${sha256(content)}`, content,
      fullContentSha256: mode === 'excerpt' ? sha256(required.content) : sha256(content) })
  }
  const calls = vi.fn()
  const result = await reviewDraftActions({ ...input(changed), agents: { propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} } } })
  expect(calls).not.toHaveBeenCalled()
  expect(result.registry.records).toEqual([])
  expect(result.registry.articles[0].review.state).toBe('pending')
  expect(result.markdown).toContain('Action review pending')
})

it('omits an oversized irrelevant source without silently truncating or treating it as negative evidence', () => {
  const { sources } = fixture()
  const source: ActionSource = { id: 'github:core#999', kind: 'github', locator: 'https://github.com/ojfbot/core/issues/999', content: '🙂'.repeat(80 * 1024) }
  const selected = selectActionEvidence(input([...sources, source]))
  expect(selected.sources.some(item => item.id === source.id)).toBe(false)
  expect(selected.receipt.sources.find(item => item.id === source.id)).toMatchObject({ included: false, fullContentSha256: sha256(source.content), reason: 'outside current action/feedback scope' })
  expect(selected.receipt.authority).toContain('cannot justify completion')
})

it('rejects conflicting full source identities at the review boundary rather than selecting a version by input order', async () => {
  const { sources } = fixture()
  const conflicting = [...sources, { ...sources[0], content: 'Contradictory collection.' }]
  expect(() => selectActionEvidence(input(conflicting))).toThrow(/Conflicting action evidence identity/)
  const calls = vi.fn()
  await expect(reviewArticleActions({ ...input(conflicting), agents: { propose: async () => { calls(); return {} }, verify: async () => { calls(); return {} } } })).rejects.toThrow(/Conflicting action evidence identity/)
  expect(calls).not.toHaveBeenCalled()
})

it('keeps all 216 identities, 138 held records and protected/inclusion gates in compact global context', () => {
  const registry = readActionRegistry(process.cwd())
  const index = actionReviewIndex({ registry, articleDate: date, articleStatuses: new Map(), expandedActionKeys: [] })
  expect(index.actions).toHaveLength(216); expect(index.held).toHaveLength(138)
  expect(index.actions.map(record => record.workKey)).toEqual(registry.records.map(record => record.workKey))
  expect(index.actions.filter(record => record.protected)).toHaveLength(3)
  for (const record of registry.records) {
    const item = index.actions.find(item => item.key === record.key)
    expect(item?.includeInIndex).toBe(record.includeInIndex)
    expect(item?.inclusionOverride).toEqual(record.inclusionOverride)
    if (record.gates.length) expect(item).toHaveProperty('gates', record.gates)
  }
})

it('refuses a terminal disposition supported only by the coverage index, even if both agents pass it', async () => {
  const { sources } = fixture()
  const registry = empty()
  registry.records.push({ key: 'carried', original: { id: 'carried', command: '/review', description: 'Inspect daily-logger #385.', repo: 'daily-logger', status: 'open', sourceDate: date }, origin: 'imported', workKey: 'existing', state: 'open', introducedBy: date, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: 'Owner accepts the preview.', gates: ['Human acceptance required.'], history: [] })
  const result = await reviewDraftActions({ ...input(sources), registry, agents: {
    propose: async (_prompt, selected) => {
      const coverage = selected.find(source => source.locator === ACTION_EVIDENCE_SELECTION_VERSION)
      if (!coverage) throw new Error('Missing coverage')
      return { changes: [{ actionKey: 'carried', state: 'done', description: 'Completed.', reason: 'The index exists.', citations: [{ sourceId: coverage.id, quote: 'Missing or omitted content is unknown' }] }], suggestions: [] }
    }, verify: async () => ({ changes: [{ actionKey: 'carried', verdict: 'pass', reason: 'Index says unknown.' }], suggestions: [] }),
  } })
  expect(result.registry.articles[0].review.state).toBe('pending')
  expect(result.registry.records[0]).toEqual(registry.records[0])
})
