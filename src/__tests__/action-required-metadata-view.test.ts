import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { github } = vi.hoisted(() => ({ github: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: github }))
import { ActionRegistrySchema, decodeActionEvidenceViewSources, sha256, type ActionSource } from '../action-registry.js'
import { ActionSourceCollection, PreparedActionEvidenceView } from '../action-evidence-view.js'
import { expandGithubMetadataView } from '../github-metadata-view.js'
import { selectActionEvidence } from '../action-evidence-selection.js'
import { revisionActionCycle } from '../action-review-cycle.js'
import { collectActionSources, reviewProducedDraftActions } from '../review-actions.js'

const date = '2030-01-01'
const registry = () => ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
const markdown = `---\ndate: ${date}\nstatus: "accepted"\n---\n## What shipped\nBackground https://github.com/ojfbot/core/issues/556.\n`
const feedback = 'Inspect core #561, core #543 and daily-logger #407 without waiving any owner gate.'
const cycle = revisionActionCycle('required-row-offline-control')
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); github.mockReset(); vi.restoreAllMocks() })

function fixture(avatarBytes = 1000) {
  const root = mkdtempSync(join(tmpdir(), 'required-metadata-')); roots.push(root)
  const account = { id: 1, login: 'ojfbot', avatar_url: 'x'.repeat(avatarBytes) }
  const record = (number: number, pull = false) => ({ id: number, html_url: `https://github.com/ojfbot/core/issues/${number}`, author_association: 'OWNER', state: 'open', user: account, ...(pull ? { pull_request: {} } : {}), body: 'Owner review is required; this fixture is not approval.' })
  github.mockImplementation((_file: string, args: string[]) => {
    const endpoint = args.at(-1) ?? ''
    if (endpoint.includes('/contents/')) return JSON.stringify([{ type: 'file', sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from('Goal: useful surfaces with owner approval.').toString('base64') }])
    if (/\/issues\/\d+$/.test(endpoint)) return JSON.stringify([record(Number(endpoint.split('/').at(-1)), endpoint.includes('daily-logger/'))])
    if (/\/pulls\/\d+$/.test(endpoint)) return JSON.stringify([{ ...record(407), head: { sha: 'b'.repeat(40) }, merged_at: null }])
    if (endpoint.includes('/reviews')) return JSON.stringify([[]])
    if (endpoint.includes('/comments')) return JSON.stringify([[{ id: 900, html_url: 'https://github.com/ojfbot/core/issues/561#issuecomment-900', author_association: 'OWNER', user: account, body: 'Consumer counterevidence: no commitment has been accepted.' }]])
    throw new Error(`Unexpected offline endpoint: ${endpoint}`)
  })
  const input = { registry: registry(), articleDate: date, articleStatuses: new Map([[date, 'accepted']]), cycle, markdown, feedback }
  const sources = collectActionSources({ ...input, repoRoot: root })
  return { root, input, sources, get selection() { return selectActionEvidence({ ...input, sources }) } }
}

function assertCompleteRequiredSource(view: PreparedActionEvidenceView, source: ActionSource) {
  const index = view.rawSources().findIndex(row => row.id === source.id), model = view.promptSources()[index]
  const receipt = decodeActionEvidenceViewSources(view.receipt)[index]
  expect(model).toBeDefined(); expect(receipt).toBeDefined()
  if (!model || !receipt) throw new Error('Required fixture source is missing from its bound view')
  expect(receipt.rawSha256).toBe(sha256(source.content))
  if (receipt.hiddenLines.length) {
    expect(expandGithubMetadataView(model.content)).toBe(source.content)
    for (const line of receipt.hiddenLines) expect(() => view.resolve(model.id, line, line)).toThrow(/partial metadata/)
    expect(() => view.resolve(model.id, 1, source.content.split('\n').length)).toThrow(/partial metadata/)
  } else {
    expect(model.content).toBe(source.content.split('\n').map((line, offset) => `L${offset + 1}: ${line}`).join('\n'))
    expect(view.resolve(model.id, 1, source.content.split('\n').length).quote).toBe(source.content)
  }
  const lines = source.content.split('\n')
  for (const text of [lines[0], 'Owner review is required; this fixture is not approval.', 'Consumer counterevidence: no commitment has been accepted.']) {
    const line = lines.indexOf(text) + 1
    expect(line).toBeGreaterThan(0)
    expect(model.content).toContain(`L${line}: ${text}`)
    expect(view.resolve(model.id, line, line).quote).toBe(text)
  }
  expect(model.authoritativeLines).toContain(1)
  const counterevidenceLines = lines.flatMap((text, offset) => text === 'Consumer counterevidence: no commitment has been accepted.' ? [offset + 1] : [])
  for (const line of counterevidenceLines) {
    // Repeated authored text remains visible but cannot become an unambiguous terminal citation.
    if (counterevidenceLines.length === 1) expect(model.authoritativeLines).toContain(line)
    else expect(model.authoritativeLines).not.toContain(line)
  }
  expect(model.authoritativeLines).not.toContain(2)
}

it.each([0, 1000])('makes required rows complete or losslessly expandable while optional rows stay compact (%i avatar bytes)', (avatarBytes) => {
  const { sources, selection } = fixture(avatarBytes)
  expect(sources).toBeInstanceOf(ActionSourceCollection)
  const view = PreparedActionEvidenceView.prepare(sources, sha256('case'), sha256('state'), sources, selection.receipt.requiredReferences)
  const rows = decodeActionEvidenceViewSources(view.receipt)
  for (const reference of ['core#561', 'core#543', 'daily-logger#407']) {
    const index = sources.findIndex(source => source.id.startsWith(`github:${reference}@`)), source = sources[index]
    expect(index).toBeGreaterThanOrEqual(0)
    assertCompleteRequiredSource(view, source)
  }
  const optional = sources.findIndex(source => source.id.startsWith('github:core#556@'))
  expect(rows[optional].hiddenLines).toContain(2)
  expect(() => view.resolve(`s${optional + 1}`, 2, 2)).toThrow(/partial metadata/)
  expect(view.rawSources()).toEqual(sources.map(source => ({ ...source })))
})

it('validates genuine capture provenance before completing required metadata and changes the old view identity', () => {
  const { sources, selection } = fixture()
  const source = sources.find(source => source.id.startsWith('github:core#561@'))!
  const compact = PreparedActionEvidenceView.prepare([source], sha256('case'), sha256('state'), sources)
  const complete = PreparedActionEvidenceView.prepare([source], sha256('case'), sha256('state'), sources, selection.receipt.requiredReferences)
  expect(complete.roundId).not.toBe(compact.roundId)
  expect(complete.receipt.policySha256).not.toBe(compact.receipt.policySha256)
  expect(() => complete.assertBinding([source], compact.roundId, sha256('state'))).toThrow(/does not match/)
  for (const changed of [{ ...source, content: source.content + 'changed' }, { ...source, locator: source.locator + '/wrong' }, { ...source, id: source.id.replace(/@[a-f0-9]{64}$/, '@' + 'f'.repeat(64)) }]) {
    expect(() => PreparedActionEvidenceView.prepare([changed], sha256('case'), sha256('state'), sources, selection.receipt.requiredReferences)).toThrow(/Collector provenance changed/)
  }
})

it.each([0, 1000])('uses one bound raw-or-lossless view through both roles on Accepted-intent composition (%i avatar bytes)', async (avatarBytes) => {
  const { input, root, sources } = fixture(avatarBytes)
  let proposerView: PreparedActionEvidenceView | undefined
  const verify = vi.fn(async (prompt: string, view: PreparedActionEvidenceView) => {
    expect(view).toBe(proposerView)
    view.assertBinding(view.rawSources(), view.roundId, view.receipt.inputStateSha256)
    for (const model of view.promptSources()) expect(prompt).toContain(model.content)
    for (const ref of ['core#561', 'core#543', 'daily-logger#407']) {
      const source = view.rawSources().find(source => source.id.startsWith(`github:${ref}@`))!
      assertCompleteRequiredSource(view, source)
    }
    return { changes: [], suggestions: [], candidateDispositions: [], closingOptions: [0, 1, 2].map(optionIndex => ({ optionIndex, verdict: 'pass', reason: 'OFFLINE test double; no real semantic verdict.' })) }
  })
  const propose = vi.fn(async (prompt: string, view: PreparedActionEvidenceView) => {
      proposerView = view
      const source = view.rawSources().find(source => source.id.startsWith('github:core#561@'))!
      assertCompleteRequiredSource(view, source)
      view.assertBinding(view.rawSources(), view.roundId, view.receipt.inputStateSha256)
      for (const model of view.promptSources()) expect(prompt).toContain(model.content)
      const goal = view.rawSources().find(source => source.kind === 'goal')!
      const closingOptions = ['core#561', 'core#543', 'daily-logger#407'].map((ref, index) => {
        const primary = view.rawSources().find(source => source.id.startsWith(`github:${ref}@`))!
        return { kind: 'checkpoint', target: primary.locator, title: `OFFLINE checkpoint ${index}`, entryPoint: 'Read the existing owner record.', context: 'Synthetic composition control, not a recommendation.', whyNow: 'Exercise Accepted rendering only.', outcome: `Record fixture verdict ${index}`, nextCheck: 'Owner decision remains required.', benefit: 'Test the native view boundary.', start: 'Read the source.', replaces: [], factCitations: [view.resolve(primary.id, 1, 1)], goalCitations: [view.resolve(goal.id, 1, 1)] }
      })
      return { changes: [], suggestions: [], candidateDispositions: [], closingOptions }
  })
  const result = await reviewProducedDraftActions({ ...input, repoRoot: root, collectSources: () => sources.appendRaw([]), agents: { propose, verify } })
  expect(propose).toHaveBeenCalledOnce()
  expect(verify).toHaveBeenCalledOnce()
  expect(result.registry.articles[0].status).toBe('accepted')
  expect(result.registry.articles[0].review.state).toBe('verified')
  expect(result.registry.articles[0].verification.evidenceView).toEqual(proposerView?.receipt)
})

it('keeps the source budget and Accepted article/registry unchanged on failure before either agent', async () => {
  const { input, root, sources } = fixture(132 * 1024)
  const articlePath = join(root, 'article.md'), registryPath = join(root, 'registry.json')
  writeFileSync(articlePath, markdown); const prior = JSON.stringify(input.registry); writeFileSync(registryPath, prior)
  const propose = vi.fn(), verify = vi.fn()
  await expect(reviewProducedDraftActions({ ...input, repoRoot: root, collectSources: () => sources, agents: { propose, verify } })).rejects.toThrow(/pending persistence refused|source limit|bounded source view/)
  expect(propose).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled()
  expect(readFileSync(articlePath, 'utf8')).toBe(markdown); expect(readFileSync(registryPath, 'utf8')).toBe(prior)
})
