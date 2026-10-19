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
import { TimeReferenceSchema, recordsFromContext } from '../time-references.js'
import { prepareGeneratedTime, persistGeneratedTime, readArticleTime } from '../article-time-metadata.js'
import { detachArticleTime, preserveTimeDuringRevision } from '../article-time-frontmatter.js'
import { stampOutcome } from '../stamp-outcome.js'
import { buildApi } from '../build-api.js'
import { readActionRegistry, registryRevision, writeActionRegistry } from '../action-registry.js'
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
  if (withHistory) { cpSync(join(sourceRoot, 'actions'), join(root, 'actions'), { recursive: true }); cpSync(join(sourceRoot, '_articles'), join(root, '_articles'), { recursive: true }) }
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
const articleJson = z.object({ timeReferences: z.array(TimeReferenceSchema).optional() })
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
    const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map(), articleDate: date, markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
    writeActionRegistry(root, review.registry, registryRevision(registry))
    buildApi(root)
    const apiPath = join(root, 'api/articles', `${date}.json`)
    expect(articleJson.parse(JSON.parse(readFileSync(apiPath, 'utf8'))).timeReferences?.[0]?.at).toBe(at)
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
    const addedSource = readFileSync(persisted.articlePath, 'utf8') + '\nPR [#360](https://github.com/ojfbot/daily-logger/pull/360) merged at 09:10Z.\n'
    const current = readArticleTime({ repoRoot: root, date, markdown: addedSource })
    expect(current.references).toHaveLength(1)
    expect(current.unresolved).toContainEqual({ text: '09:10Z', occurrence: 1, reason: 'missing-evidence' })
    const otherRoot = fixture()
    expect(readArticleTime({ repoRoot: otherRoot, date, markdown: prepared.markdown }).references).toEqual([])
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  }, 30_000)

  it('preserves unchanged metadata bytes and removes model attempts to add or replace time authority', async () => {
    const original = `---\ntitle: "Original"\ndate: ${date}\ntime_records_sha256: ${'a'.repeat(64)}\n---\nBody.\n`
    const unchanged = await preserveTimeDuringRevision({ originalMarkdown: original, revise: async (modelMarkdown) => ({ revisedMarkdown: modelMarkdown, changesSummary: ['No edit.'], changed: false }) })
    expect(unchanged).toMatchObject({ revisedMarkdown: original, changed: false })
    const bare = `---\ntitle: "Original"\ndate: ${date}\n---\nBody.\n`
    expect(detachArticleTime(bare).restore(bare.replace('date:', 'time_records_sha256: fake\ndate:'))).toBe(bare)
  })

  it('the actual dry-run orchestration writes no article, artifact, API or action files', async () => {
    vi.stubEnv('MOCK_LLM', 'true'); vi.stubEnv('DRY_RUN', 'true'); vi.stubEnv('SKIP_COUNCIL', 'true')
    vi.stubEnv('DATE_OVERRIDE', '2026-10-20'); vi.stubEnv('ANTHROPIC_API_KEY', 'mock-only')
    vi.stubEnv('GITHUB_ACTIONS', 'false'); vi.stubEnv('BLOGENGINE_API_URL', '')
    const before = fingerprint(sourceRoot, ['_articles', 'api', 'action-admissions'])
    await main()
    expect(fingerprint(sourceRoot, ['_articles', 'api', 'action-admissions'])).toBe(before)
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
