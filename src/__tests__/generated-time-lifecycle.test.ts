import { generationActionCycle } from '../action-review-cycle.js'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { BlogContext } from '../types.js'
import { TimeReferenceSchema, issueSources, recordsFromContext, type TimeRecord } from '../time-references.js'
import { ShipmentTimeSchema } from '../shipment-times.js'
import { IssueTimeSchema } from '../issue-times.js'
import { issueEventsFromContext } from '../issue-times.js'
import { prepareGeneratedTime, persistGeneratedTime, readArticleTime } from '../article-time-metadata.js'
import { detachArticleTime, preserveTimeDuringRevision } from '../article-time-frontmatter.js'
import { stampOutcome } from '../stamp-outcome.js'
import { buildApi } from '../build-api.js'
import { checkShipmentTimeCoverage, requiresShipmentTimeCoverage } from '../shipment-time-coverage.js'
import { readActionRegistry, readArticleStatuses, registryRevision, rebindArticleSnapshot, renderArticleActionHtml, stripManagedActions, writeActionRegistry } from '../action-registry.js'
import { reviewArticleActions, mockActionAgents } from '../review-actions.js'

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMessage } } }))
vi.mock('../collect-context.js', () => ({ collectContext: vi.fn(async (requestedDate: string) => ({ ...context, date: requestedDate })) }))
import { generateArticle, toMarkdown } from '../generate-article.js'
import { main } from '../index.js'
import { reviseArticle } from '../revise-article.js'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const date = '2026-10-19'
const source = 'PR [#359](https://github.com/ojfbot/daily-logger/pull/359)'
const at = '2026-10-14T09:10:41.000Z'
const context: BlogContext = { date, repos: ['daily-logger'], commits: [], mergedPRs: [{ number: 359, repo: 'daily-logger', title: 'Observed merge', url: 'https://github.com/ojfbot/daily-logger/pull/359', mergedAt: at, author: 'editor', additions: 1, deletions: 0 }], openPRs: [], recentPRs: [], closedIssues: [], openIssues: [], openActions: [], projectVision: '', previousArticles: [] }
const payload = { schemaVersion: 2, date, title: 'Observed merge', tags: [{ name: 'daily-logger', type: 'repo' }], summary: 'The source event.', whatShipped: [{ repo: 'daily-logger', description: `${source} merged at 09:10Z.`, commits: [] }], decisions: [], roadmapPulse: 'No additional activity.', whatsNext: 'Inspect the next run.', suggestedActions: [], commitCount: 1, reposActive: ['daily-logger'], activityType: 'build' }
const roots: string[] = []
function fixture(withHistory = false) {
  const root = mkdtempSync(join(tmpdir(), 'generated-time-lifecycle-'))
  if (withHistory) execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--shared', '--quiet', sourceRoot, root])
  else mkdirSync(join(root, 'action-admissions'))
  if (withHistory) {
    cpSync(join(sourceRoot, 'actions'), join(root, 'actions'), { recursive: true })
    cpSync(join(sourceRoot, '_articles'), join(root, '_articles'), { recursive: true })
    // This fixture generates a new dated record; live decisions for that date are unrelated inputs.
    rmSync(join(root, 'actions/articles', `${date}.json`), { force: true })
  }
  roots.push(root)
  return root
}
function git(root: string, ...args: string[]) { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Offline test', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim() }
function fingerprint(root: string, directories: string[]) {
  const hash = createHash('sha256')
  function visit(path: string) { for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const child = join(path, entry.name); hash.update(child); if (entry.isDirectory()) visit(child); else if (entry.isFile()) hash.update(readFileSync(child)) } }
  for (const directory of directories) visit(join(root, directory))
  return hash.digest('hex')
}
const articleJson = z.object({ timeReferences: z.array(TimeReferenceSchema).optional(), shipmentTimes: z.array(ShipmentTimeSchema).optional(), issueTimes: z.array(IssueTimeSchema).optional() })
beforeEach(() => {
  vi.stubEnv('MOCK_LLM', 'false')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this offline lifecycle') }))
  createMessage.mockResolvedValue({ content: [{ type: 'tool_use', input: payload }] })
})
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); createMessage.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('generation, retained facts, ordinary revision and API publication', () => {
  it('publishes the same source event after body/footer edits and the real one-file revision CLI, without backfill', async () => {
    const root = fixture(true)
    const generated = await generateArticle(context)
    expect(createMessage).toHaveBeenCalledTimes(1)
    const prepared = prepareGeneratedTime({ date, markdown: toMarkdown(generated), records: recordsFromContext(context), capture: { observedAt: '2026-10-18T09:01:00.000Z', window: null } })
    const persisted = persistGeneratedTime({ repoRoot: root, prepared })
    const originalArtifact = readFileSync(persisted.artifactPath)
    expect(prepared.markdown).toContain(`time_records_sha256: ${prepared.digest}`)
    expect(prepared.markdown).not.toContain('time_references:')
    const registry = readActionRegistry(root)
    expect(registry.articles.some(article => article.date === date)).toBe(false)
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))
    buildApi(root)
    const apiPath = join(root, 'api/articles', `${date}.json`)
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).timeReferences?.[0]?.at).toBe(at)
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).shipmentTimes?.[0]).toMatchObject({ status: 'available', at, source: { ref: '359' } })
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Generated article and immutable source facts')
    const generation = git(root, 'rev-parse', 'HEAD')
    const revised = await preserveTimeDuringRevision({ originalMarkdown: prepared.markdown, revise: async (modelMarkdown) => {
      expect(modelMarkdown).not.toContain('time_records_sha256')
      const attempted = modelMarkdown.replace('merged at', 'merged exactly at').replace(/^---\n/, `---\ntime_records_sha256: ${'f'.repeat(64)}\ntime_references: []\n`)
      return { revisedMarkdown: stampOutcome(`${attempted}\nEditorial footer changed.\n`, 'edited'), changesSummary: ['Clarified the event wording.'], changed: true }
    } })
    expect(revised.revisedMarkdown).toContain(`time_records_sha256: ${prepared.digest}`)
    expect(revised.revisedMarkdown).not.toContain('time_references:')
    writeFileSync(persisted.articlePath, revised.revisedMarkdown)
    const cli = execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../revise-article.ts', import.meta.url))], { cwd: sourceRoot, env: { ...process.env, ARTICLE_PATH: persisted.articlePath, EDITORIAL_FEEDBACK: 'Apply the offline fixture summary change.', ACTION_REVIEW_REQUEST: 'fixture:time-preservation', MOCK_LLM: 'true', DRY_RUN: 'false' }, encoding: 'utf8' })
    expect(cli).toContain('"changed":true')
    expect(readFileSync(persisted.articlePath, 'utf8')).toContain(`time_records_sha256: ${prepared.digest}`)
    expect(readFileSync(persisted.artifactPath).equals(originalArtifact)).toBe(true)
    git(root, 'add', `_articles/${date}.md`, `actions/articles/${date}.json`)
    git(root, 'commit', '-qm', 'Ordinary one-file editorial revision')
    const revision = git(root, 'rev-parse', 'HEAD')
    // These are the same changed-path and regular-file conditions enforced by both editorial workflow gates.
    expect(git(root, 'diff', '--name-only', generation, revision)).toBe(`_articles/${date}.md\nactions/articles/${date}.json`)
    expect(git(root, 'ls-tree', revision, '--', `_articles/${date}.md`)).toMatch(/^100644 blob /)
    buildApi(root)
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).timeReferences?.[0]).toMatchObject({ at, evidence: { repo: 'ojfbot/daily-logger', ref: '359', event: 'merged' } })
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).shipmentTimes?.[0]).toMatchObject({ status: 'available', at, source: { ref: '359' } })
    const addedSource = readFileSync(persisted.articlePath, 'utf8') + '\nPR [#360](https://github.com/ojfbot/daily-logger/pull/360) merged at 09:10Z.\n'
    const current = readArticleTime({ repoRoot: root, date, markdown: addedSource })
    expect(current.references).toHaveLength(1)
    expect(current.unresolved).toContainEqual({ text: '09:10Z', occurrence: 1, reason: 'missing-evidence' })
    const otherRoot = fixture()
    expect(readArticleTime({ repoRoot: otherRoot, date, markdown: prepared.markdown }).references).toEqual([])
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  }, 30_000)

  it('delivers merge-time coverage when the model omits every clock and preserves it through revision', async () => {
    const root = fixture(true)
    const generated = await generateArticle(context)
    generated.body = generated.body.replace('merged at 09:10Z', 'shipped without an authored clock')
    const prepared = prepareGeneratedTime({ date, markdown: toMarkdown(generated), records: recordsFromContext(context), capture: { observedAt: '2026-10-18T09:01:00.000Z', window: null } })
    const persisted = persistGeneratedTime({ repoRoot: root, prepared })
    const registry = readActionRegistry(root)
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))

    expect(readArticleTime({ repoRoot: root, date, markdown: prepared.markdown }).shipmentCoverage).toMatchObject({ status: 'complete', times: [{ status: 'available', at, source: { ref: '359' } }] })
    buildApi(root)
    const apiPath = join(root, 'api/articles', `${date}.json`)
    const generatedApi = articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8')))
    expect(generatedApi.timeReferences).toBeUndefined()
    expect(generatedApi.shipmentTimes).toEqual([{ status: 'available', at, source: { repo: 'ojfbot/daily-logger', ref: '359', url: 'https://github.com/ojfbot/daily-logger/pull/359' } }])
    expect(checkShipmentTimeCoverage(root, date)).toMatchObject({ candidates: 1, available: 1, unavailable: 0, excluded: 0 })

    writeFileSync(persisted.articlePath, `${prepared.markdown}\nUnbuilt source edit.\n`)
    expect(() => checkShipmentTimeCoverage(root, date)).toThrow(/API article is stale/i)
    writeFileSync(persisted.articlePath, prepared.markdown.replace(prepared.digest, 'f'.repeat(64)))
    expect(() => checkShipmentTimeCoverage(root, date)).toThrow(/immutable shipment-time coverage is not enabled/i)
    expect(() => buildApi(root)).toThrow(/required immutable shipment-time coverage is unavailable/i)
    writeFileSync(persisted.articlePath, prepared.markdown.replace(`date: ${date}`, 'date: 2020-10-19'))
    expect(() => buildApi(root)).toThrow(/action review is stale/i)
    expect(requiresShipmentTimeCoverage(date, prepared.markdown.replace(`date: ${date}`, `date: "${date}"`))).toBe(true)
    writeFileSync(persisted.articlePath, prepared.markdown)

    const revised = await preserveTimeDuringRevision({ originalMarkdown: prepared.markdown, revise: async (modelMarkdown) => ({ revisedMarkdown: `${modelMarkdown}\nClock still intentionally omitted.\n`, changesSummary: ['Kept prose clock-free.'], changed: true }) })
    writeFileSync(persisted.articlePath, revised.revisedMarkdown)
    const revisedRegistry = readActionRegistry(root)
    const revisedReview = await reviewArticleActions({ cycle: generationActionCycle(), registry: revisedRegistry, articleStatuses: new Map(), articleDate: date, markdown: revised.revisedMarkdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, revisedReview.registry, registryRevision(revisedRegistry))
    buildApi(root)
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).shipmentTimes).toEqual(generatedApi.shipmentTimes)
  }, 30_000)

  it('projects an explicit unavailable state through the immutable artifact and static API', async () => {
    const root = fixture(true)
    const generated = await generateArticle(context)
    generated.body = generated.body.replace('merged at 09:10Z', 'shipped without an authored clock')
    const prepared = prepareGeneratedTime({ date, markdown: toMarkdown(generated), records: [], capture: { observedAt: '2026-10-18T09:01:00.000Z', window: null } })
    persistGeneratedTime({ repoRoot: root, prepared })
    const registry = readActionRegistry(root)
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))

    buildApi(root)
    const api = articleJson.parse(JSON.parse(readFileSync(join(root, 'api/articles', `${date}.json`), 'utf8')))
    expect(api.timeReferences).toBeUndefined()
    expect(api.shipmentTimes).toEqual([{ status: 'unavailable', reason: 'missing-merge-time', source: { repo: 'ojfbot/daily-logger', ref: '359', url: 'https://github.com/ojfbot/daily-logger/pull/359' } }])
    expect(checkShipmentTimeCoverage(root, date)).toMatchObject({ candidates: 1, available: 0, unavailable: 1, excluded: 0 })
  }, 30_000)

  it('projects immutable issue Created and Updated clocks through the static API without model clocks', async () => {
    const root = fixture(true)
    const ctx: BlogContext = { ...context, openIssues: [
      { repo: 'daily-logger', number: 386, title: 'New', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/386', createdAt: '2026-10-18T15:57:36Z', updatedAt: '2026-10-18T15:57:36Z', createdInWindow: true },
      { repo: 'daily-logger', number: 357, title: 'Ongoing', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/357', createdAt: '2026-10-13T15:53:55Z', updatedAt: '2026-10-18T15:35:18Z' },
    ] }
    const generated = await generateArticle(ctx)
    generated.body += '\nNew [#386](https://github.com/ojfbot/daily-logger/issues/386) and ongoing [#357](https://github.com/ojfbot/daily-logger/issues/357).\n'
    const draftMarkdown = toMarkdown(generated)
    const prepared = prepareGeneratedTime({ date, markdown: draftMarkdown, records: recordsFromContext(ctx), issueEvents: issueEventsFromContext(ctx, draftMarkdown), capture: { observedAt: '2026-10-19T09:01:00.000Z', window: null } })
    const persisted = persistGeneratedTime({ repoRoot: root, prepared })
    expect(JSON.parse(readFileSync(persisted.artifactPath, 'utf8')).records.filter((record: TimeRecord) => record.evidence.kind === 'github-issue')).toHaveLength(4)
    const registry = readActionRegistry(root)
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))
    buildApi(root)
    const api = articleJson.parse(JSON.parse(readFileSync(join(root, 'api/articles', `${date}.json`), 'utf8')))
    expect(api.issueTimes).toMatchObject([
      { source: { ref: '386' }, event: 'created', at: '2026-10-18T15:57:36.000Z' },
      { source: { ref: '357' }, event: 'updated', at: '2026-10-18T15:35:18.000Z' },
    ])
    expect(api.shipmentTimes?.[0]).toMatchObject({ source: { ref: '359' }, status: 'available' })
  }, 30_000)

  it('projects an issue linked only in a native action card without admitting card clock text', () => {
    const root = fixture(true)
    rmSync(join(root, '_articles', `${date}.md`), { force: true })
    const articleDate = '2026-10-20'
    const path = join(root, '_articles', `${articleDate}.md`)
    const original = readFileSync(path, 'utf8')
    const proseOnly = original.replace(/\[([^\]]+)\]\(https:\/\/github\.com\/ojfbot\/daily-logger\/issues\/(?:357|386)(?:#issuecomment-\d+)?\)/g, '$1')
    expect(issueSources(stripManagedActions(proseOnly))).toEqual([])
    const before = readActionRegistry(root)
    const snapshot = before.articles.find((article) => article.date === articleDate)!
    const rebound = rebindArticleSnapshot(before, { date: articleDate, beforeMarkdown: original, afterMarkdown: proseOnly, expectedRoundId: snapshot.roundId, actor: 'offline-test', instruction: 'Keep issue links only in the verified action card.' })
    writeActionRegistry(root, rebound, registryRevision(before))
    const statuses = readArticleStatuses(root)
    const renderedHtml = renderArticleActionHtml(proseOnly, rebound, articleDate, statuses)
    expect(issueSources(proseOnly, renderedHtml).map((source) => source.ref)).toContain('386')
    const originalDigest = /^time_records_sha256: ([a-f0-9]{64})$/m.exec(original)![1]
    const originalRecords: TimeRecord[] = JSON.parse(readFileSync(join(root, 'api/time-records', articleDate, `${originalDigest}.json`), 'utf8')).records
    const prAndCommitRecords = originalRecords.filter((record) => record.evidence.kind !== 'github-issue')
    expect(prAndCommitRecords).toHaveLength(44)
    const issue: TimeRecord = { at: '2026-10-18T15:57:36.000Z', evidence: { kind: 'github-issue', repo: 'ojfbot/daily-logger', ref: '386', event: 'created', url: 'https://github.com/ojfbot/daily-logger/issues/386' } }
    const prepared = prepareGeneratedTime({ date: articleDate, markdown: proseOnly, renderedHtml, records: [...prAndCommitRecords, issue], issueEvents: [{ source: { repo: 'ojfbot/daily-logger', ref: '386', url: 'https://github.com/ojfbot/daily-logger/issues/386' }, event: 'created' }], capture: { observedAt: '2026-10-20T12:00:00.000Z', window: null } })
    persistGeneratedTime({ repoRoot: root, prepared })
    buildApi(root)
    const api = JSON.parse(readFileSync(join(root, 'api/articles', `${articleDate}.json`), 'utf8'))
    expect(api.issueTimes).toEqual([{ source: { repo: 'ojfbot/daily-logger', ref: '386', url: 'https://github.com/ojfbot/daily-logger/issues/386' }, event: 'created', at: issue.at }])
    expect(api.timeReferences?.some((reference: { text: string }) => reference.text === '09:10Z')).not.toBe(true)
  }, 30_000)

  it('checks a changed article against retained PR identity in both API and CI paths', () => {
    const root = fixture(true)
    const articleDate = '2026-10-20'
    const path = join(root, '_articles', `${articleDate}.md`)
    const original = readFileSync(path, 'utf8')
    const revised = original.replace('[#389](https://github.com/ojfbot/daily-logger/pull/389)', '[#389](https://github.com/ojfbot/daily-logger/issues/389)')
    expect(revised).not.toBe(original)
    const base = git(root, 'rev-parse', 'HEAD')
    const before = readActionRegistry(root)
    const snapshot = before.articles.find((article) => article.date === articleDate)!
    const rebound = rebindArticleSnapshot(before, { date: articleDate, beforeMarkdown: original, afterMarkdown: revised, expectedRoundId: snapshot.roundId, actor: 'offline-test', instruction: 'Test retained resource identity.' })
    writeActionRegistry(root, rebound, registryRevision(before))
    writeFileSync(path, revised)
    expect(() => buildApi(root)).toThrow(/wrong GitHub resource kind for daily-logger#389/i)
    git(root, 'add', path, join(root, 'actions/articles', `${articleDate}.json`))
    git(root, 'commit', '-qm', 'Offline wrong-kind article fixture')
    const head = git(root, 'rev-parse', 'HEAD')
    const script = fileURLToPath(new URL('../../scripts/check-article-references.ts', import.meta.url))
    const loader = fileURLToPath(new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url))
    expect(() => execFileSync(process.execPath, ['--import', loader, script], { cwd: root, env: { ...process.env, BASE_SHA: base, HEAD_SHA: head }, encoding: 'utf8', stdio: 'pipe' })).toThrow(/wrong GitHub resource kind for daily-logger#389/i)
  }, 30_000)

  it('gates and projects shipments from every repeated What shipped section', async () => {
    const root = fixture(true)
    const generated = await generateArticle(context)
    const secondSection = [
      '## What shipped',
      '',
      'Second-section [merged PR](https://github.com/ojfbot/daily-logger/pull/360) and [unknown PR](https://github.com/ojfbot/daily-logger/pull/361).',
      '',
      '## The decisions',
    ].join('\n')
    const markdown = toMarkdown(generated).replace('## The decisions', secondSection)
    const records = [
      ...recordsFromContext(context),
      { at: '2026-10-18T10:30:00.000Z', evidence: { kind: 'github-pull-request' as const, repo: 'ojfbot/daily-logger', ref: '360', event: 'merged' as const, url: 'https://github.com/ojfbot/daily-logger/pull/360' } },
    ]
    const prepared = prepareGeneratedTime({ date, markdown, records, capture: { observedAt: '2026-10-18T11:00:00.000Z', window: null } })
    persistGeneratedTime({ repoRoot: root, prepared })
    const registry = readActionRegistry(root)
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))

    expect(requiresShipmentTimeCoverage(date, prepared.markdown)).toBe(true)
    buildApi(root)
    const api = articleJson.parse(JSON.parse(readFileSync(join(root, 'api/articles', `${date}.json`), 'utf8')))
    expect(api.shipmentTimes).toEqual([
      { status: 'available', at, source: { repo: 'ojfbot/daily-logger', ref: '359', url: 'https://github.com/ojfbot/daily-logger/pull/359' } },
      { status: 'available', at: '2026-10-18T10:30:00.000Z', source: { repo: 'ojfbot/daily-logger', ref: '360', url: 'https://github.com/ojfbot/daily-logger/pull/360' } },
      { status: 'unavailable', reason: 'missing-merge-time', source: { repo: 'ojfbot/daily-logger', ref: '361', url: 'https://github.com/ojfbot/daily-logger/pull/361' } },
    ])
    expect(checkShipmentTimeCoverage(root, date)).toMatchObject({ candidates: 3, available: 2, unavailable: 1, excluded: 0 })
  }, 30_000)

  it('preserves unchanged metadata bytes and removes model attempts to add or replace time authority', async () => {
    const original = `---\ntitle: "Original"\ndate: ${date}\ntime_records_sha256: ${'a'.repeat(64)}\n---\nBody.\n`
    const unchanged = await preserveTimeDuringRevision({ originalMarkdown: original, revise: async (modelMarkdown) => ({ revisedMarkdown: modelMarkdown, changesSummary: ['No edit.'], changed: false }) })
    expect(unchanged).toMatchObject({ revisedMarkdown: original, changed: false })
    const bare = `---\ntitle: "Original"\ndate: ${date}\n---\nBody.\n`
    expect(detachArticleTime(bare).restore(bare.replace('date:', 'time_records_sha256: fake\ndate:'))).toBe(bare)
  })

  it('the actual dry-run orchestration on a fresh date writes no article, artifact, API or action files', async () => {
    const freshDate = '2099-01-01'
    expect(readArticleStatuses(sourceRoot).has(freshDate)).toBe(false)
    vi.stubEnv('MOCK_LLM', 'true'); vi.stubEnv('DRY_RUN', 'true'); vi.stubEnv('SKIP_COUNCIL', 'true')
    vi.stubEnv('DATE_OVERRIDE', freshDate); vi.stubEnv('ANTHROPIC_API_KEY', 'mock-only')
    vi.stubEnv('GITHUB_ACTIONS', 'false'); vi.stubEnv('BLOGENGINE_API_URL', '')
    const before = fingerprint(sourceRoot, ['_articles', 'api', 'actions', 'action-admissions'])
    await expect(main()).resolves.toBeUndefined()
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('Structured draft candidate evidence requirements are missing'))
    expect(fingerprint(sourceRoot, ['_articles', 'api', 'actions', 'action-admissions'])).toBe(before)
    expect(createMessage).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not stamp authoring or outcome for a discarded model-only pointer edit', async () => {
    const original = ['---', 'title: "Original"', `date: ${date}`, 'tags: ["daily-logger"]', 'summary: "Original"', 'status: "draft"', `time_records_sha256: ${'a'.repeat(64)}`, '---', 'Body.', ''].join('\n')
    const modelBody = detachArticleTime(original).markdown.replace(/^---\n/, `---\ntime_records_sha256: ${'f'.repeat(64)}\n`)
    createMessage.mockResolvedValue({ content: [{ type: 'tool_use', input: { revisedMarkdown: modelBody, changesSummary: ['Attempted source replacement.'] } }] })
    const result = await reviseArticle({ articleContent: original, feedback: 'Leave prose unchanged.', mode: 'model', dryRun: false })
    expect(result).toMatchObject({ changed: false, revisedMarkdown: original })
    expect(result.revisedMarkdown).not.toContain('outcome:')
    expect(result.revisedMarkdown).not.toContain('provenance:')
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(createMessage.mock.calls[0])).not.toContain('time_records_sha256')
  })
})
