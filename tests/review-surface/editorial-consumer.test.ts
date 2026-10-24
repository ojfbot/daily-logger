import { reviewArticleActions } from '../../src/__tests__/evidence-view-fixtures.js'
import { createHash } from 'node:crypto'
import { acceptanceActionCycle, generationActionCycle, revisionActionCycle } from '../../src/action-review-cycle.js'
import { editorialInputSchema } from '../../shared/article-review.js'
import { editorialProofName, editorialProofSchema } from '../../shared/editorial-action-proof.js'
import { actionFile, emptyActionFile, writeActionStore } from '../../src/__tests__/action-store-fixture.js'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, chmodSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createFixture, makePullRequest, makeComment, today } from './fixture.js'
import { createEditorialService, decodeEditorial, editorialDigest, encodeEditorial, repo } from '../../api/_lib/editorial-continuation.js'
import { mockActionAgents } from '../../src/review-actions.js'
import { ActionRegistrySchema, ArticleActionFileSchema, stripManagedActions } from '../../src/action-registry.js'
import { admitActionRegistry } from '../../.github/scripts/editorial-action-registry.js'
import { admitEditorial, prepareEditorial, pushEditorial, finalizeEditorial, type Execution } from '../../.github/scripts/continue-editorial.js'
const commandFailure = vi.hoisted(() => {
  const state: { error: Error | undefined; childError: Error | undefined; events: string[];
    options: Array<{ shell: unknown; maxBuffer: unknown; timeout: unknown; cwd: unknown }>;
    replacement: { file: string; args: string[]; timeout?: number } | undefined } = {
    error: undefined, childError: undefined, events: [], options: [], replacement: undefined,
  }
  return state
})
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  const run = promisify(actual.execFile)
  const tracked = async (...args: Parameters<typeof run>) => {
    const label = Array.isArray(args[1]) ? args[1].at(-1) ?? '' : ''
    if (args[0] === 'pnpm') {
      commandFailure.events.push(`start:${label}`)
      commandFailure.options.push({ shell: args[2]?.shell, maxBuffer: args[2]?.maxBuffer, timeout: args[2]?.timeout, cwd: args[2]?.cwd })
      if (commandFailure.error) throw commandFailure.error
    }
    try {
      const replacement = args[0] === 'pnpm' ? commandFailure.replacement : undefined
      const result = replacement
        ? await run(replacement.file, replacement.args, { ...args[2], ...(replacement.timeout === undefined ? {} : { timeout: replacement.timeout }) })
        : await run(...args)
      if (args[0] === 'pnpm') commandFailure.events.push(`end:${label}`)
      return result
    } catch (error) {
      if (error instanceof Error) commandFailure.childError = error
      throw error
    }
  }
  const execFile = Object.assign((...args: Parameters<typeof actual.execFile>) => actual.execFile(...args), { [promisify.custom]: tracked })
  return { ...actual, execFile, execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
    const label = Array.isArray(args[1]) ? args[1].at(-1) ?? '' : ''
    if (args[0] === 'pnpm') {
      commandFailure.events.push(`start:${label}`)
      if (commandFailure.error) throw commandFailure.error
    }
    const result = actual.execFileSync(...args)
    if (args[0] === 'pnpm') commandFailure.events.push(`end:${label}`)
    return result
  } }
})
// Native revision cases create Git worktrees and run the actual CLI.
vi.setConfig({ testTimeout: 20_000 })
const cleanups: string[] = []
afterEach(() => { commandFailure.error = undefined; commandFailure.childError = undefined; commandFailure.replacement = undefined; commandFailure.events.length = 0; commandFailure.options.length = 0; vi.unstubAllEnvs(); for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true }) })
function git(cwd: string, ...args: string[]) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
async function setup(noChange = false, corruption: 'code' | 'symlink' | 'executable' | 'blob' | 'missing-registry' | 'registry-symlink' | 'registry-executable' | 'cross-date-choice' | null = null, ambiguousAncestry = false, pendingInitial = false, requestKind: 'revision' | 'clean' = 'revision') {
  vi.stubEnv('MOCK_LLM', 'true')
  vi.stubEnv('DRY_RUN', 'false')
  const root = mkdtempSync(resolve(tmpdir(), 'uik01-consumer-')); cleanups.push(root)
  const workspace = resolve(root, 'repo'), remote = resolve(root, 'remote.git')
  mkdirSync(workspace); git(workspace, 'init', '-q'); git(workspace, 'config', 'user.name', 'Fixture'); git(workspace, 'config', 'user.email', 'fixture@example.invalid')
  mkdirSync(resolve(workspace, '_articles'))
  mkdirSync(resolve(workspace, 'actions/articles'), { recursive: true })
  let registry = JSON.stringify({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [{ key: 'old', original: { id: 'old', command: '/pr-review', description: 'Prior tracked work', repo: 'daily-logger', sourceDate: '2026-10-01', status: 'open' }, origin: 'imported', workKey: 'daily-logger|old|review', state: 'open', introducedBy: '2026-10-01', includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] }], articles: [] })
  writeFileSync(resolve(workspace, 'actions/registry.json'), registry)
  const initialFile = emptyActionFile(today)
  if (pendingInitial) { initialFile.snapshot.status = 'draft'; initialFile.snapshot.review = { state: 'pending', reason: 'Initial action evidence unavailable' }; initialFile.snapshot.reviewCycle = generationActionCycle() }
  writeFileSync(resolve(workspace, `actions/articles/${today}.json`), JSON.stringify(initialFile))
  const article = `---\ntitle: Fixture\ndate: ${today}\nstatus: accepted\ntags: []\nsummary: ${noChange ? 'unchanged' : '"Original"'}\n---\nLiteral body 雪\n`
  const path = `_articles/${today}.md`
  writeFileSync(resolve(workspace, 'package.json'), '{}')
  writeFileSync(resolve(workspace, path), article); git(workspace, 'add', '.'); git(workspace, 'commit', '-qm', 'policy')
  let policySha = git(workspace, 'rev-parse', 'HEAD')
  writeFileSync(resolve(workspace, path), `${article}\nAccepted branch text\n`)
  if (noChange) {
    const reviewed = await reviewArticleActions({ cycle: revisionActionCycle('fixture'), registry: ActionRegistrySchema.parse(JSON.parse(registry)), articleDate: today, articleStatuses: new Map([[today, 'accepted']]), markdown: readFileSync(resolve(workspace, path), 'utf8'), feedback: 'Earlier feedback', sources: [], agents: mockActionAgents })
    registry = JSON.stringify(reviewed.registry)
    writeFileSync(resolve(workspace, path), reviewed.markdown)
    writeActionStore(workspace, reviewed.registry)
    git(workspace, 'add', '.'); git(workspace, 'commit', '-qm', 'trusted earlier review'); policySha = git(workspace, 'rev-parse', 'HEAD')
    writeFileSync(resolve(workspace, path), readFileSync(resolve(workspace, path), 'utf8').replace('Literal body 雪', 'Literal body 雪\nA later clarification.'))
  }
  if (corruption === 'missing-registry') rmSync(resolve(workspace, `actions/articles/${today}.json`))
  if (corruption === 'registry-symlink') { rmSync(resolve(workspace, `actions/articles/${today}.json`)); symlinkSync('../../package.json', resolve(workspace, `actions/articles/${today}.json`)) }
  if (corruption === 'cross-date-choice') {
    const changed = ActionRegistrySchema.parse(JSON.parse(registry)); changed.records[0]!.includeInIndex = false; changed.records[0]!.inclusionOverride = { include: false, actor: 'ojfbot', instruction: 'Explicit editorial inclusion checkbox' }; registry = JSON.stringify(changed); writeFileSync(resolve(workspace, 'actions/registry.json'), registry)
  }
  if (corruption === 'code') writeFileSync(resolve(workspace, 'package.json'), '{"scripts":{"postinstall":"blocked"}}')
  if (corruption === 'symlink') { rmSync(resolve(workspace, path)); symlinkSync('../package.json', resolve(workspace, path)) }
  git(workspace, 'add', '.'); git(workspace, '-c', 'user.name=ojfbot-blog[bot]', 'commit', '-qm', 'accepted by bot')
  if (corruption === 'executable') { chmodSync(resolve(workspace, path), 0o755); git(workspace, 'update-index', '--chmod=+x', path); git(workspace, 'commit', '-qm', 'invalid executable article') }
  if (corruption === 'registry-executable') { git(workspace, 'update-index', '--chmod=+x', `actions/articles/${today}.json`); git(workspace, 'commit', '-qm', 'invalid executable registry') }
  if (ambiguousAncestry) {
    const policyTree = git(workspace, 'rev-parse', `${policySha}^{tree}`)
    const articleTree = git(workspace, 'rev-parse', 'HEAD^{tree}')
    const left = git(workspace, 'commit-tree', policyTree, '-p', policySha, '-m', 'left ancestor')
    const right = git(workspace, 'commit-tree', policyTree, '-p', policySha, '-m', 'right ancestor')
    const mergedHead = git(workspace, 'commit-tree', articleTree, '-p', left, '-p', right, '-m', 'merged acceptance')
    policySha = git(workspace, 'commit-tree', policyTree, '-p', right, '-p', left, '-m', 'merged policy')
    git(workspace, 'checkout', '--detach', mergedHead)
  }
  const head = git(workspace, 'rev-parse', 'HEAD')
  const projectedContent = corruption === 'blob' ? `${article}Different API-only article bytes\n` : corruption === 'symlink' ? `${article}\nAccepted branch text\n` : execFileSync('git', ['show', `HEAD:${path}`], { cwd: workspace, encoding: 'utf8' })
  const blob = execFileSync('git', ['hash-object', '--stdin'], { cwd: workspace, input: projectedContent, encoding: 'utf8' }).trim()
  git(workspace, 'init', '--bare', '-q', remote); git(workspace, 'remote', 'add', 'origin', remote); git(workspace, 'push', '-q', 'origin', `${head}:refs/heads/accept/${today}`)
  const { state, github: fixtureGithub } = createFixture(); state.login = 'ojfbot'
  const pr = makePullRequest(42)
  state.acceptPullNumbers.push(42); state.pullFiles.set(42, [{ filename: path, status: 'modified' }])
  state.pullRequests.set(42, { ...pr, body: 'Original feedback receipt', head: { ...pr.head, sha: head, ref: `accept/${today}` } })
  state.refFiles.set(`${head}:${path}`, projectedContent)
  state.refFiles.set(`${head}:actions/articles/${today}.json`, ['missing-registry', 'registry-symlink'].includes(corruption ?? '')
    ? JSON.stringify(actionFile(ActionRegistrySchema.parse(JSON.parse(registry)), today))
    : git(workspace, 'show', `${head}:actions/articles/${today}.json`))
  if (requestKind === 'clean') state.source = policySha
  let requestCommentId = requestKind === 'clean' ? 1 : 2
  const github: Execution['github'] = async (path, options) => path.startsWith(`${repo}/actions/workflows/editorial-revise.yml/runs?`) ? Response.json({ workflow_runs: [] }) : path === `${repo}/actions/runs/101` ? Response.json({ id: 101, run_attempt: 1, event: 'issue_comment', head_branch: 'main', head_sha: execution.policySha, display_title: `Editorial continuation comment ${requestCommentId}`, path: '.github/workflows/editorial-revise.yml' }) : fixtureGithub(path, options)
  const service = createEditorialService(github)
  const view = await service.load(today, 'ojfbot'); if (view.status !== 'existing') throw new Error('Missing acceptance')
  if (requestKind === 'revision') {
    const versionId = crypto.randomUUID()
    await service.write({ schemaVersion: 1, intent: 'append_editorial_feedback', date: today, requestId: versionId, pullRequest: 42, headSha: head, visibleBlobSha: blob,
      supersedes: view.originalDigest, feedback: { version: 2, notes: [{ kind: 'root', content: ' \t雪 @claude /run\n ' }] } }, 'ojfbot')
    const saved = await service.load(today, 'ojfbot'); if (saved.status !== 'existing' || !saved.versions[0]) throw new Error('No version')
    await service.write({ schemaVersion: 1, intent: 'request_editorial_revision', date: today, requestId: crypto.randomUUID(), pullRequest: 42, headSha: head, articleBlobSha: blob,
      feedbackId: versionId, feedbackDigest: saved.versions[0].digest }, 'ojfbot')
  } else {
    const clean = editorialInputSchema.parse({ schemaVersion: 1, intent: 'request_clean_acceptance', date: today, requestId: crypto.randomUUID(), pullRequest: 42,
      headSha: head, articleBlobSha: blob, registryBlobSha: git(workspace, 'rev-parse', `${head}:actions/articles/${today}.json`), policySha })
    await service.write(clean, 'ojfbot')
  }
  const comment = state.prComments.get(42)?.[requestCommentId - 1]; if (!comment) throw new Error('No request comment')
  requestCommentId = comment.id
  comment.created_at = new Date().toISOString(); comment.updated_at = comment.created_at
  const event = { action: 'created', repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' }, issue: { number: 42, pull_request: { url: `https://api.github.com${repo}/pulls/42` } }, comment }
  const execution: Execution = { github, workspace, policyDirectory: process.cwd(), policySha, runId: 101, attempt: 1, event }
  return { execution, state, head, blob, remote, path, comment, requestKind }
}
async function publishProof(f: Awaited<ReturnType<typeof setup>>, initial = false) {
  const path = resolve(f.execution.workspace, '.git/editorial-output.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (initial) { if (manifest.actionReviewMode !== 'revision') delete manifest.requestDigest; delete manifest.requestCommentId; writeFileSync(path, JSON.stringify(manifest)) }
  f.state.artifacts.set(101, { id: 101, name: editorialProofName(manifest), expired: false, workflow_run: { id: 101, head_sha: initial ? f.head : f.execution.policySha } })
  await finalizeEditorial(f.execution, 101)
}
it.each(['edited', 'actor', 'pr_author', 'payload', 'head', 'blob', 'ordinary', 'rerun'])('actual admission rejects %s before a claim', async kind => {
  const f = await setup()
  const event = f.execution.event
  if (!event || typeof event !== 'object') throw new Error('Missing event')
  if (kind === 'edited') f.execution.event = { ...event, action: 'edited' }
  if (kind === 'actor') f.execution.event = { ...event, sender: { login: 'other' } }
  if (kind === 'ordinary') f.execution.event = { ...event, comment: { ...f.comment, body: 'Quote: ## Explicit editorial revision request' } }
  if (kind === 'payload') f.comment.body += '\nchanged'
  if (kind === 'rerun') f.execution.attempt = 2
  if (kind === 'pr_author' || kind === 'head') {
    const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
    f.state.pullRequests.set(42, kind === 'pr_author' ? { ...pr, user: { login: 'other' } } : { ...pr, head: { ...pr.head, sha: 'd'.repeat(40) } })
  }
  if (kind === 'blob') f.state.refFiles.set(`${f.head}:${f.path}`, 'different article')
  await expect(admitEditorial(f.execution)).rejects.toThrow()
  expect(f.state.prComments.get(42)).toHaveLength(2)
})
it.each(['actor', 'pr_author', 'repository', 'date', 'head', 'article', 'registry', 'policy', 'rerun'] as const)('clean admission rejects wrong %s before a claim', async kind => {
  const f = await setup(false, null, false, false, 'clean')
  const event = f.execution.event
  if (!event || typeof event !== 'object') throw new Error('Missing event')
  if (kind === 'actor') f.execution.event = { ...event, sender: { login: 'other' } }
  if (kind === 'repository') f.execution.event = { ...event, repository: { full_name: 'other/daily-logger' } }
  if (kind === 'rerun') f.execution.attempt = 2
  if (kind === 'date') {
    const record = decodeEditorial(f.comment.body)
    if (!record || record.intent !== 'request_clean_acceptance') throw new Error('Missing clean request')
    f.comment.body = encodeEditorial({ ...record, date: '2026-10-13' })
  }
  if (kind === 'pr_author' || kind === 'head') {
    const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
    f.state.pullRequests.set(42, kind === 'pr_author' ? { ...pr, user: { login: 'other' } } : { ...pr, head: { ...pr.head, sha: 'd'.repeat(40) } })
  }
  if (kind === 'article') f.state.refFiles.set(`${f.head}:${f.path}`, `${git(f.execution.workspace, 'show', `${f.head}:${f.path}`)}\nchanged`)
  if (kind === 'registry') {
    const path = `${f.head}:actions/articles/${today}.json`
    const file = ArticleActionFileSchema.parse(JSON.parse(f.state.refFiles.get(path) ?? 'null'))
    file.snapshot.verification.proposer = 'different-reviewed-agent'
    f.state.refFiles.set(path, JSON.stringify(file))
  }
  if (kind === 'policy') f.state.source = 'f'.repeat(40)
  await expect(admitEditorial(f.execution)).rejects.toThrow()
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('clean admission never consumes a genuine feedback version added before invocation', async () => {
  const f = await setup(false, null, false, false, 'clean')
  const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
  const feedback = encodeEditorial({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: f.head, visibleBlobSha: f.blob, supersedes: editorialDigest(pr.body ?? ''),
    feedback: { version: 2, notes: [{ kind: 'root', content: 'New genuine feedback must block clean mode.' }] }, actor: 'ojfbot', originalBody: pr.body ?? '' })
  f.state.prComments.get(42)?.push(makeComment(feedback, 2, 'ojfbot', 42))
  await expect(admitEditorial(f.execution)).rejects.toThrow('no genuine editorial feedback')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
})
it('a new trusted main before the clean invocation claim stops without calling the native review', async () => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  const github = f.execution.github
  let mainReads = 0
  f.execution.github = (path, options) => {
    if (path === `${repo}/git/ref/heads/main` && ++mainReads >= 3) return Promise.resolve(Response.json({ object: { sha: 'f'.repeat(40) } }))
    return github(path, options)
  }
  await expect(prepareEditorial(f.execution)).rejects.toThrow('Trusted main moved before the clean acceptance claim')
  expect(mainReads).toBeGreaterThanOrEqual(3)
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('clean admission requires the PR head to integrate the complete pinned trusted policy before a claim', async () => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  const oldPolicy = git(f.execution.workspace, 'rev-parse', `${f.head}^`)
  git(f.execution.workspace, 'checkout', '--detach', oldPolicy)
  const registryPath = resolve(f.execution.workspace, 'actions/registry.json')
  const registry = ActionRegistrySchema.parse(JSON.parse(readFileSync(registryPath, 'utf8')))
  registry.records[0]!.gates = [{ kind: 'owner', value: 'human-review-required' }]
  writeFileSync(registryPath, JSON.stringify(registry))
  git(f.execution.workspace, 'add', 'actions/registry.json'); git(f.execution.workspace, 'commit', '-qm', 'new trusted owner gate')
  const currentPolicy = git(f.execution.workspace, 'rev-parse', 'HEAD')
  git(f.execution.workspace, 'checkout', '--detach', f.head)
  const record = decodeEditorial(f.comment.body)
  if (!record || record.intent !== 'request_clean_acceptance') throw new Error('Missing clean request')
  f.comment.body = encodeEditorial({ ...record, policySha: currentPolicy })
  f.execution.policySha = currentPolicy; f.state.source = currentPolicy
  await expect(prepareEditorial(f.execution)).rejects.toThrow('fully integrated into the PR head')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it.each(['feedback', 'main'] as const)('clean preparation rechecks %s after the durable claim and before native invocation', async kind => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  const original = f.execution.github
  f.execution.github = async (path, options) => {
    const response = await original(path, options)
    if (options?.method === 'POST' && String(options.body).includes('Editorial execution claim')) {
      if (kind === 'main') f.state.source = 'f'.repeat(40)
      else {
        const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
        const feedback = encodeEditorial({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
          pullRequest: 42, headSha: f.head, visibleBlobSha: f.blob, supersedes: editorialDigest(pr.body ?? ''),
          feedback: { version: 2, notes: [{ kind: 'root', content: 'New canonical feedback arrived during claim acknowledgement.' }] }, actor: 'ojfbot', originalBody: pr.body ?? '' })
        f.state.prComments.get(42)?.push(makeComment(feedback, 99, 'ojfbot', 42))
      }
    }
    return response
  }
  await expect(prepareEditorial(f.execution)).resolves.toBeNull()
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('No provider was invoked')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('actual consumer claims before native MOCK_LLM and pushes the article and registry to local bare remote', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution)
  expect(prepared).not.toBeNull()
  if (!prepared) throw new Error('Missing output')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(prepared.outputCommit)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'diff', '--name-only', f.head, prepared.outputCommit)).toBe(`${f.path}\nactions/articles/${today}.json`)
  expect(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')).toContain(`"outputCommit":"${prepared.outputCommit}"`)
  expect(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')).toContain('"outcome":"changed"')
  await expect(prepareEditorial(f.execution)).rejects.toThrow('invocation claim')
})
it('runs one guarded clean acceptance on the existing PR without revising prose or inventing a new logical cycle', async () => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  const inputArticle = git(f.execution.workspace, 'show', `${f.head}:${f.path}`)
  const inputFile = ArticleActionFileSchema.parse(JSON.parse(git(f.execution.workspace, 'show', `${f.head}:actions/articles/${today}.json`)))
  const prepared = await prepareEditorial(f.execution)
  expect(prepared).not.toBeNull()
  if (!prepared) throw new Error('Missing clean output')
  expect(prepared.request.intent).toBe('request_clean_acceptance')
  expect(git(prepared.worktree, 'rev-parse', 'HEAD^')).toBe(f.head)
  const outputArticle = git(prepared.worktree, 'show', `${prepared.outputCommit}:${f.path}`)
  expect(stripManagedActions(outputArticle).replace(/^outcome: accepted\n/m, '').trimEnd()).toBe(stripManagedActions(inputArticle).trimEnd())
  const outputFile = ArticleActionFileSchema.parse(JSON.parse(git(prepared.worktree, 'show', `${prepared.outputCommit}:actions/articles/${today}.json`)))
  expect(outputFile.snapshot.review.state).toBe('verified')
  expect(outputFile.snapshot.reviewCycle).toEqual(acceptanceActionCycle('pull-request:42:clean-acceptance', inputFile.snapshot))
  expect(f.state.prComments.get(42)?.find(comment => comment.body.startsWith('## Editorial execution claim\n'))?.body).toContain('"actionReviewMode":"clean-acceptance"')
  const pinnedPolicy = f.execution.policySha
  f.state.source = 'f'.repeat(40)
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  const manifest = editorialProofSchema.parse(JSON.parse(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')))
  expect(manifest).toMatchObject({ actionReviewMode: 'clean-acceptance', requestIntent: 'request_clean_acceptance', requestCommentId: f.comment.id, policySha: pinnedPolicy, inputHead: f.head, outputCommit: prepared.outputCommit })
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: prepared.outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).resolves.toBeUndefined()
  expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', policySha: 'f'.repeat(40), outstanding: false })
})
it('admits and prepares a distinct current request while the resolved old run stays permanently scoped to the old request', async () => {
  const f = await setup(false, null, false, false, 'clean')
  const current = decodeEditorial(f.comment.body)
  if (!current || current.intent !== 'request_clean_acceptance') throw new Error('Missing current clean request')
  const oldRequest = { ...current, requestId: crypto.randomUUID() }
  const oldRequestDigest = editorialDigest(oldRequest)
  const claim = { requestDigest: oldRequestDigest, requestId: oldRequest.requestId, requestCommentId: 1,
    intent: oldRequest.intent, actionReviewMode: 'clean-acceptance', inputHead: oldRequest.headSha,
    inputBlob: oldRequest.articleBlobSha, inputRegistryBlob: oldRequest.registryBlobSha,
    policySha: oldRequest.policySha, runId: 100, attempt: 1 }
  const receipt = { requestDigest: oldRequestDigest, requestCommentId: 1, runId: 100, policySha: oldRequest.policySha,
    outcome: 'uncertain', reason: 'Invocation was claimed. Preparation failed; do not replay automatically.' }
  const entries = [
    { commentId: 1, kind: 'owner-record', semanticDigest: oldRequestDigest },
    { commentId: 2, kind: 'claim', semanticDigest: editorialDigest(claim) },
    { commentId: 3, kind: 'receipt', semanticDigest: editorialDigest(receipt) },
  ]
  const resolution = {
    schemaVersion: 1 as const, intent: 'resolve_editorial_request' as const, requestId: crypto.randomUUID(),
    date: today, pullRequest: 42, headSha: oldRequest.headSha, priorRequestDigest: oldRequestDigest,
    articleBlobSha: oldRequest.articleBlobSha, registryBlobSha: oldRequest.registryBlobSha,
    policySha: oldRequest.policySha, prefix: { throughCommentId: 3, sha256: editorialDigest(entries) },
    acknowledgment: 'close_uncertain_attempt_without_review_or_billing_claim' as const,
    reason: 'Retire only the failed old scheduling slot.', actor: 'ojfbot' as const,
    evidence: { requestCommentId: 1, requestDigest: oldRequestDigest,
      claim: { commentId: 2, semanticDigest: editorialDigest(claim) },
      receipt: { commentId: 3, semanticDigest: editorialDigest(receipt) },
      attempt: { runId: 100, number: 1 as const, policySha: oldRequest.policySha, event: 'issue_comment' as const,
        branch: 'main' as const, path: '.github/workflows/editorial-revise.yml' as const,
        displayTitle: 'Editorial continuation comment 1', status: 'completed' as const, conclusion: 'failure' as const } },
  }
  f.comment.id = 5
  const comments = [
    makeComment(encodeEditorial(oldRequest), 1, 'ojfbot', 42),
    makeComment(`## Editorial execution claim\n${JSON.stringify(claim)}`, 2, 'github-actions[bot]', 42),
    makeComment(`## Editorial execution receipt\n${JSON.stringify(receipt)}`, 3, 'github-actions[bot]', 42),
    makeComment(encodeEditorial(resolution), 4, 'ojfbot', 42),
    f.comment,
  ]
  f.state.prComments.set(42, comments)
  const base = f.execution.github
  const oldRun = { id: 100, run_attempt: 1, status: 'completed', conclusion: 'failure', event: 'issue_comment',
    head_sha: oldRequest.policySha, head_branch: 'main', path: '.github/workflows/editorial-revise.yml',
    display_title: 'Editorial continuation comment 1' }
  f.execution.github = async (path, options) => {
    if (path.startsWith(`${repo}/actions/workflows/editorial-revise.yml/runs?`)) return Response.json({ workflow_runs: [
      oldRun,
      { id: 101, run_attempt: 1, status: 'in_progress', conclusion: null, display_title: 'Editorial continuation comment 5' },
    ] })
    if (path === `${repo}/actions/runs/100/attempts/1`) return Response.json(oldRun)
    if (path.startsWith(`${repo}/actions/runs/100/artifacts?`)) return Response.json({ total_count: 0, artifacts: [] })
    return base(path, options)
  }
  f.state.login = 'github-actions[bot]'

  const before = await createEditorialService(f.execution.github).load(today, 'ojfbot')
  expect(before).toMatchObject({ status: 'existing', requestState: { kind: 'outstanding', request: { commentId: 5 } },
    recovery: { kind: 'blocked' }, executionReadiness: { kind: 'ready' } })
  expect((await admitEditorial(f.execution)).request.commentId).toBe(5)
  const prepared = await prepareEditorial(f.execution)
  expect(prepared).not.toBeNull()
  expect(prepared?.request.requestId).toBe(current.requestId)
  expect(comments.slice(0, 4).map(comment => comment.body)).toEqual([
    encodeEditorial(oldRequest),
    `## Editorial execution claim\n${JSON.stringify(claim)}`,
    `## Editorial execution receipt\n${JSON.stringify(receipt)}`,
    encodeEditorial(resolution),
  ])
  expect(comments.at(-1)?.body).toContain(`"requestDigest":"${editorialDigest(current)}"`)
})
it.each(['mode', 'intent', 'digest'] as const)('a clean continuation receipt cannot borrow the wrong %s', async kind => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution); if (!prepared) throw new Error('Missing clean output')
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  const manifest = editorialProofSchema.parse(JSON.parse(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')))
  const changed = kind === 'mode' ? { ...manifest, actionReviewMode: 'revision' as const }
    : kind === 'intent' ? { ...manifest, requestIntent: 'request_editorial_revision' as const }
    : { ...manifest, requestDigest: 'd'.repeat(64) }
  const receipt = f.state.prComments.get(42)?.at(-1); if (!receipt) throw new Error('Missing receipt')
  receipt.body = `## Editorial execution receipt\n${JSON.stringify({ ...changed, artifactId: 101 })}`
  f.state.artifacts.set(101, { id: 101, name: editorialProofName(changed), expired: false, workflow_run: { id: 101, head_sha: f.execution.policySha } })
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: prepared.outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).rejects.toThrow('trusted editorial output receipt')
  expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: true })
})
it('native unchanged prose still publishes the new verified action receipt', async () => {
  const f = await setup(true); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution)
  if (!prepared) throw new Error('Missing verified output')
  expect(git(prepared.worktree, 'diff', '--name-only', f.head, prepared.outputCommit)).toBe(`actions/articles/${today}.json`)
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  expect(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')).toContain('"outcome":"changed"')
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain(`"outputRegistryBlob":"${prepared.outputRegistryBlob}"`)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('invocation claim')
})
it('uncertain claim response stops before the native revision command and suppresses replay', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const original = f.execution.github
  f.execution.github = async (path, options) => {
    const response = await original(path, options)
    if (options?.method === 'POST' && String(options.body).includes('Editorial execution claim')) throw new Error('lost response')
    return response
  }
  await expect(prepareEditorial(f.execution)).rejects.toThrow('lost response')
  f.execution.github = original
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('invocation claim')
})
it('actual workflow admits before PR concurrency and retains legacy author guard without cancellation', () => {
  const workflow = readFileSync('.github/workflows/editorial-revise.yml', 'utf8')
  expect(workflow).not.toMatch(/^concurrency:/m)
  expect(workflow).not.toContain('cancel-in-progress: true')
  expect(workflow).toContain("editorial-revision-admission.mjs")
  expect(workflow).toContain('needs: admit-continuation')
  expect(workflow).toContain('editorial-revise-${{ needs.admit-continuation.outputs.pull_request }}')
  expect(workflow).toContain("github.event_name == 'pull_request_target'")
  expect(workflow).toContain("startsWith(github.event.comment.body, '## Explicit clean acceptance request')")
  expect(workflow).not.toContain('workflow_dispatch:')
  expect(workflow).toContain('pnpm exec tsx .github/scripts/continue-editorial.ts admit')
})
it('preserves the exact preparation error when the uncertain receipt POST fails', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const primary = new Error('Native preparation failed', { cause: new Error('Original review cause') })
  commandFailure.error = primary
  const original = f.execution.github
  let receiptAttempts = 0
  f.execution.github = (path, options) => {
    if (options?.method === 'POST' && String(options.body).startsWith('{"body":"## Editorial execution receipt')) {
      receiptAttempts++
      throw Object.assign(new TypeError('DO_NOT_LOG_FIXTURE_SECRET'), { cause: { code: 'ECONNRESET', message: 'Bearer DO_NOT_LOG_FIXTURE_SECRET' } })
    }
    return original(path, options)
  }
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const failure: unknown = await prepareEditorial(f.execution).catch((error: unknown) => error)
    expect(failure).toBe(primary)
    expect(primary.cause).toMatchObject({ message: 'Original review cause' })
    expect(receiptAttempts).toBe(1)
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: 'editorial_receipt_delivery_uncertain', runId: 101,
      requestDigest: editorialDigest(decodeEditorial(f.comment.body)), outcome: 'uncertain', transportCodes: ['ECONNRESET'] }))
    expect(JSON.stringify(logged.mock.calls)).not.toContain('DO_NOT_LOG_FIXTURE_SECRET')
    expect(f.state.prComments.get(42)?.filter(comment => comment.body.startsWith('## Editorial execution receipt'))).toEqual([])
    expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
    await expect(prepareEditorial(f.execution)).rejects.toThrow('invocation claim')
    expect(receiptAttempts).toBe(1)
  } finally { logged.mockRestore() }
})
const unsafeReceiptFailures: Array<{ kind: string; makeError: () => unknown; codes: string[] }> = [
  { kind: 'primitive', makeError: () => 'DO_NOT_LOG_FIXTURE_SECRET\nAuthorization: Bearer private', codes: [] },
  { kind: 'unrecognized code and sensitive fields', makeError: () => ({ code: 'ECONNRESET\nDO_NOT_LOG_FIXTURE_SECRET',
    message: 'DO_NOT_LOG_FIXTURE_SECRET', stack: 'private stack', request: { headers: { Authorization: 'private' } },
    response: { body: 'private source' }, cause: { code: 'ENOTFOUND', address: 'private host' } }), codes: ['ENOTFOUND'] },
  { kind: 'throwing accessor', makeError: () => Object.defineProperty({}, 'code', { get() { throw new Error('DO_NOT_LOG_FIXTURE_SECRET') } }), codes: [] },
  { kind: 'hostile proxy', makeError: () => new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('DO_NOT_LOG_FIXTURE_SECRET') } }), codes: [] },
  { kind: 'cyclic cause', makeError: () => { const error = new Error('DO_NOT_LOG_FIXTURE_SECRET'); return Object.assign(error, { code: 'UND_ERR_SOCKET', cause: error }) }, codes: ['UND_ERR_SOCKET'] },
  { kind: 'deep cause', makeError: () => {
    let error: unknown = { code: 'ENOTFOUND', message: 'DO_NOT_LOG_FIXTURE_SECRET' }
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET']) error = { code, cause: error }
    return error
  }, codes: ['UND_ERR_SOCKET', 'EPIPE', 'ETIMEDOUT', 'ECONNRESET'] },
]
it.each(unsafeReceiptFailures)('bounds receipt diagnostics for $kind without replacing the primary error', async ({ makeError, codes }) => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const primary = new Error('Native preparation failed')
  commandFailure.error = primary
  const original = f.execution.github
  let receiptAttempts = 0
  f.execution.github = (path, options) => {
    if (options?.method === 'POST' && String(options.body).startsWith('{"body":"## Editorial execution receipt')) {
      receiptAttempts++; throw makeError()
    }
    return original(path, options)
  }
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(prepareEditorial(f.execution)).rejects.toBe(primary)
    expect(receiptAttempts).toBe(1)
    expect(logged).toHaveBeenCalledTimes(1)
    const line = logged.mock.calls[0]?.[0]
    if (typeof line !== 'string') throw new Error('Missing structured diagnostic')
    expect(JSON.parse(line)).toEqual({ event: 'editorial_receipt_delivery_uncertain', runId: 101,
      requestDigest: editorialDigest(decodeEditorial(f.comment.body)), outcome: 'uncertain', transportCodes: codes })
    expect(Buffer.byteLength(line)).toBeLessThan(512)
    expect(line).not.toContain('DO_NOT_LOG_FIXTURE_SECRET')
    expect(line).not.toContain('private')
    expect(line).not.toContain('\n')
  } finally { logged.mockRestore() }
})
it('preserves the primary error even when secondary diagnostic reporting fails', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const primary = new Error('Native preparation failed'); commandFailure.error = primary
  const original = f.execution.github
  let receiptAttempts = 0
  f.execution.github = (path, options) => {
    if (options?.method === 'POST' && String(options.body).startsWith('{"body":"## Editorial execution receipt')) {
      receiptAttempts++; throw new Error('Secondary receipt error')
    }
    return original(path, options)
  }
  const logged = vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('Diagnostic sink unavailable') })
  try { await expect(prepareEditorial(f.execution)).rejects.toBe(primary); expect(receiptAttempts).toBe(1) }
  finally { logged.mockRestore() }
})
it('keeps an acknowledged uncertain receipt unchanged while rethrowing the primary error', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const primary = new Error('Native preparation failed'); commandFailure.error = primary
  const original = f.execution.github
  let receiptAttempts = 0
  f.execution.github = (path, options) => {
    if (options?.method === 'POST' && String(options.body).startsWith('{"body":"## Editorial execution receipt')) receiptAttempts++
    return original(path, options)
  }
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(prepareEditorial(f.execution)).rejects.toBe(primary)
    expect(receiptAttempts).toBe(1); expect(logged).not.toHaveBeenCalled()
    const receipt = f.state.prComments.get(42)?.at(-1)
    expect(receipt?.body).toBe(`## Editorial execution receipt\n${JSON.stringify({ requestDigest: editorialDigest(decodeEditorial(f.comment.body)),
      requestCommentId: f.comment.id, outcome: 'uncertain', runId: 101, policySha: f.execution.policySha,
      reason: 'Invocation was claimed. Provider or output preparation failed; do not replay this request automatically.' })}`)
    expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: true })
  } finally { logged.mockRestore() }
})
it('does not suppress a successful-output finalization receipt failure', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution); if (!prepared) throw new Error('Missing output')
  await pushEditorial(f.execution, prepared)
  const original = f.execution.github, transport = new TypeError('Final receipt response lost')
  let receiptAttempts = 0
  f.execution.github = (path, options) => {
    if (options?.method === 'POST' && String(options.body).startsWith('{"body":"## Editorial execution receipt')) {
      receiptAttempts++; throw transport
    }
    return original(path, options)
  }
  await expect(publishProof(f)).rejects.toBe(transport)
  expect(receiptAttempts).toBe(1)
  expect(f.state.prComments.get(42)?.some(comment => comment.body.includes('"outcome":"changed"'))).toBe(false)
})
it('the actual CLI preserves a push failure and emits only safe receipt transport diagnostics', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution); if (!prepared) throw new Error('Missing output')
  const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
  writeFileSync(resolve(f.execution.workspace, '.git/editorial-prepared.json'), JSON.stringify({ ...prepared, worktree: realpathSync(prepared.worktree) }))
  const eventPath = resolve(f.execution.workspace, 'event.json'), preload = resolve(f.execution.workspace, 'offline-cli-fixture.mjs')
  const attemptsPath = resolve(f.execution.workspace, 'receipt-attempts.jsonl')
  writeFileSync(eventPath, JSON.stringify(f.execution.event))
  writeFileSync(preload, `import {appendFileSync} from 'node:fs'
const pull=${JSON.stringify(pr)}
globalThis.fetch=async (url,options={})=>{
 const path=new URL(url).pathname,method=options.method??'GET'
 if(method==='GET'&&path==='/repos/ojfbot/daily-logger/pulls/42')return Response.json(pull)
 if(method==='POST'&&path==='/repos/ojfbot/daily-logger/issues/42/comments'){
  appendFileSync(${JSON.stringify(attemptsPath)},JSON.stringify({method,path})+'\\n')
  throw Object.assign(new TypeError('DO_NOT_LOG_FIXTURE_SECRET'),{cause:{code:'ECONNRESET',message:'Bearer DO_NOT_LOG_FIXTURE_SECRET',response:{body:'private source'}}})
 }
 throw Error('Unexpected offline CLI route')
}
`)
  git(f.execution.workspace, 'remote', 'set-url', 'origin', resolve(f.execution.workspace, 'missing-remote.git'))
  const result = spawnSync('pnpm', ['exec', 'node', '--import', import.meta.resolve('tsx'), '--import', pathToFileURL(preload).href,
    resolve(process.cwd(), '.github/scripts/continue-editorial.ts'), 'push'], { cwd: f.execution.workspace, encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: 'offline-fixture-token', GITHUB_SHA: f.execution.policySha,
      GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_PATH: eventPath } })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Command failed: git push')
  expect(result.stderr).not.toContain('DO_NOT_LOG_FIXTURE_SECRET')
  expect(result.stderr).not.toContain('private source')
  const line = result.stderr.split('\n').find(value => value.startsWith('{"event":"editorial_receipt_delivery_uncertain"'))
  if (!line) throw new Error('Missing CLI receipt diagnostic')
  expect(JSON.parse(line)).toEqual({ event: 'editorial_receipt_delivery_uncertain', runId: 101,
    requestDigest: prepared.requestDigest, outcome: 'uncertain', transportCodes: ['ECONNRESET'] })
  expect(readFileSync(attemptsPath, 'utf8').trim().split('\n')).toHaveLength(1)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('pre-invocation failure records failure without a claim or remote article write', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
  f.state.pullRequests.set(42, { ...pr, state: 'closed' })
  await expect(prepareEditorial(f.execution)).rejects.toThrow()
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('"outcome":"failed"')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('all-time irrelevant history is scoped out instead of disabling a new request', async () => {
  const f = await setup()
  const base = f.execution.github
  let read = false
  f.execution.github = async (path, options) => {
    if (path.includes('/actions/workflows/')) {
      const url = new URL(path, 'https://api.github.com')
      expect(url.pathname).toBe(`${repo}/actions/workflows/editorial-revise.yml/runs`)
      expect(url.searchParams.get('created')).toBe(`>=${f.comment.created_at}`)
      expect(url.searchParams.get('event')).toBe('issue_comment')
      read = true
      const lifetime = Array.from({ length: 250 }, (_, index) => ({ id: index + 1, display_title: 'Historical unrelated request', created_at: '2000-01-01T00:00:00Z' }))
      const lower = url.searchParams.get('created')?.slice(2) ?? ''
      const relevant = lifetime.filter(run => Date.parse(run.created_at) >= Date.parse(lower))
      expect(lifetime).toHaveLength(250)
      expect(relevant).toHaveLength(0)
      return Response.json({ total_count: relevant.length, workflow_runs: relevant })
    }
    return base(path, options)
  }
  expect((await admitEditorial(f.execution)).record.pullRequest).toBe(42)
  expect(read).toBe(true)
})
it('finds relevant prior execution on a later page and never emits a safe failed receipt for a missing claim', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const base = f.execution.github
  const pages: string[] = []
  f.execution.github = async (path, options) => {
    if (path.includes('/actions/workflows/')) {
      const page = new URL(path, 'https://api.github.com').searchParams.get('page') ?? '1'; pages.push(page)
      return page === '1'
        ? Response.json({ workflow_runs: Array.from({ length: 100 }, (_, n) => ({ id: 200 + n, display_title: 'Unrelated recent request' })) }, { headers: { link: '<https://api.github.com/next>; rel="next"' } })
        : Response.json({ workflow_runs: [{ id: 100, display_title: `Editorial continuation comment ${f.comment.id}` }] })
    }
    return base(path, options)
  }
  await expect(prepareEditorial(f.execution)).rejects.toThrow('prior workflow')
  expect(pages).toContain('2')
  expect(f.state.prComments.get(42)).toHaveLength(2)
  expect(f.state.prComments.get(42)?.some(comment => comment.body.includes('"outcome":"failed"'))).toBe(false)
})
it('incomplete relevant history blocks invocation and cannot establish a safe admission failure', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const base = f.execution.github
  let reads = 0
  f.execution.github = async (path, options) => {
    if (path.includes('/actions/workflows/')) { reads++; return Response.json({ workflow_runs: [] }, { headers: { link: '<https://api.github.com/next>; rel="next"' } }) }
    return base(path, options)
  }
  await expect(prepareEditorial(f.execution)).rejects.toThrow('bounded reader')
  expect(reads).toBe(10) // Five admission pages and five pages before refusing a false terminal receipt.
  expect(f.state.prComments.get(42)).toHaveLength(2)
})

it.each<'code' | 'symlink' | 'executable' | 'blob'>(['code', 'symlink', 'executable', 'blob'])('actual new consumer rejects %s bytes after main diverges before claiming or invoking the revision script', async corruption => {
  const f = await setup(false, corruption); f.state.login = 'github-actions[bot]'
  advancePolicy(f, { 'api/entries.json': '{"main":"advanced"}' })
  await expect(prepareEditorial(f.execution)).rejects.toThrow('Only the pinned regular article')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('"outcome":"failed"')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it.each([false, true])('a rerun cannot emit safe failure with deleted claim, separate run evidence=%s', async otherRun => {
  const f = await setup(); f.state.login = 'github-actions[bot]'; f.execution.attempt = 2
  const base = f.execution.github
  f.execution.github = async (path, options) => path.includes('/actions/workflows/') ? Response.json({ workflow_runs: otherRun ? [{ id: 102, display_title: `Editorial continuation comment ${f.comment.id}` }] : [] }) : base(path, options)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('rerun')
  expect(f.state.prComments.get(42)).toHaveLength(2)
})
it('a head change after claim is stale with no native revision or remote write', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const base = f.execution.github
  f.execution.github = async (path, options) => {
    const response = await base(path, options)
    if (options?.method === 'POST' && String(options.body).includes('Editorial execution claim')) {
      const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('No PR')
      f.state.pullRequests.set(42, { ...pr, head: { ...pr.head, sha: 'e'.repeat(40) } })
    }
    return response
  }
  expect(await prepareEditorial(f.execution)).toBeNull()
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('"outcome":"stale"')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('moving the target after preparation cannot force-push a stale candidate', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const prepared = await prepareEditorial(f.execution); if (!prepared) throw new Error('No prepared article')
  const pr = f.state.pullRequests.get(42); if (!pr) throw new Error('No PR')
  f.state.pullRequests.set(42, { ...pr, head: { ...pr.head, sha: 'e'.repeat(40) } })
  await pushEditorial(f.execution, prepared)
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('"outcome":"stale"')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})

it('a duplicate request comment cannot emit failure or unlock the canonical queued request', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const duplicate = makeComment(f.comment.body, 3, 'ojfbot', 42)
  duplicate.created_at = f.comment.created_at; duplicate.updated_at = duplicate.created_at
  f.state.prComments.get(42)?.push(duplicate)
  const event = f.execution.event
  if (!event || typeof event !== 'object') throw new Error('No event')
  f.execution.event = { ...event, comment: duplicate }
  const base = f.execution.github
  f.execution.github = async (path, options) => path.includes('/actions/workflows/') ? Response.json({ workflow_runs: [{ id: 100, display_title: `Editorial continuation comment ${f.comment.id}` }] }) : base(path, options)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('canonical request')
  expect(f.state.prComments.get(42)).toHaveLength(3)
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution receipt\n'))).toBe(false)
  expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: true })
})
it('the earliest workflow delivery can proceed while a later duplicate cannot', async () => {
  const f = await setup()
  const base = f.execution.github
  f.execution.github = async (path, options) => path.includes('/actions/workflows/') ? Response.json({ workflow_runs: [101, 102].map(id => ({ id, display_title: `Editorial continuation comment ${f.comment.id}` })) }) : base(path, options)
  expect((await admitEditorial(f.execution)).request.commentId).toBe(f.comment.id)
  await expect(admitEditorial({ ...f.execution, runId: 102 })).rejects.toThrow('prior workflow')
  expect(f.state.prComments.get(42)).toHaveLength(2)
})

function advancePolicy(fixture: Awaited<ReturnType<typeof setup>>, files: Record<string, string>) {
  const workspace = fixture.execution.workspace
  git(workspace, 'checkout', '--detach', fixture.execution.policySha)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(workspace, path)), { recursive: true })
    writeFileSync(resolve(workspace, path), content)
  }
  git(workspace, 'add', '.')
  git(workspace, 'commit', '-qm', 'trusted main advances independently')
  fixture.execution.policySha = git(workspace, 'rev-parse', 'HEAD')
}
it.each(['unrelated code', 'same article'])('native continuation uses the pinned PR article when trusted main advances in %s', async kind => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  advancePolicy(f, kind === 'unrelated code'
    ? { 'api/entries.json': '{"new":"published"}', 'src/revise-article.ts': 'throw new Error("fixture main code must not execute")' }
    : { [f.path]: 'Different trusted main article; never substitute this for the reviewed input.\n' })
  const policyTree = git(f.execution.workspace, 'rev-parse', `${f.execution.policySha}^{tree}`)
  const prepared = await prepareEditorial(f.execution)
  if (!prepared) throw new Error('Missing output')
  expect(git(prepared.worktree, 'rev-parse', 'HEAD^')).toBe(f.head)
  expect(readFileSync(resolve(prepared.worktree, f.path), 'utf8')).toContain('Accepted branch text')
  expect(readFileSync(resolve(prepared.worktree, f.path), 'utf8')).not.toContain('Different trusted main article')
  expect(git(prepared.worktree, 'diff', '--name-only', f.head, prepared.outputCommit)).toBe(`${f.path}\nactions/articles/${today}.json`)
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(prepared.outputCommit)
  expect(git(f.execution.workspace, 'rev-parse', `${f.execution.policySha}^{tree}`)).toBe(policyTree)
  expect(git(f.execution.workspace, 'rev-parse', 'HEAD')).toBe(f.execution.policySha)
  expect(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')).toContain('"outcome":"changed"')
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain(`"inputHead":"${f.head}"`)
  expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: false })
})

it('nonarticle PR changes remain rejected when trusted main independently publishes the same code', async () => {
  const f = await setup(false, 'code'); f.state.login = 'github-actions[bot]'
  // A two-dot comparison hides this package change because both tips now contain it.
  advancePolicy(f, { 'package.json': '{"scripts":{"postinstall":"blocked"}}' })
  expect(git(f.execution.workspace, 'diff', '--name-only', f.execution.policySha, f.head)).toBe(f.path)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('Only the pinned regular article')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('an identical article subsequently published on main still allows revision of the PR change set', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  advancePolicy(f, { [f.path]: git(f.execution.workspace, 'show', `${f.head}:${f.path}`) + '\n' })
  expect(git(f.execution.workspace, 'diff', '--name-only', f.execution.policySha, f.head)).toBe('')
  const prepared = await prepareEditorial(f.execution)
  if (!prepared) throw new Error('Missing prepared revision')
  await pushEditorial(f.execution, prepared)
  await publishProof(f)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(prepared.outputCommit)
})
it('unrelated trusted policy history is rejected before a claim without a provider or branch write', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const tree = git(f.execution.workspace, 'rev-parse', `${f.execution.policySha}^{tree}`)
  f.execution.policySha = git(f.execution.workspace, 'commit-tree', tree, '-m', 'unrelated trusted history')
  await expect(prepareEditorial(f.execution)).rejects.toThrow('unique common ancestor')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(f.state.prComments.get(42)?.at(-1)?.body).toContain('"outcome":"failed"')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it('ambiguous criss-cross merge ancestry is rejected before claiming instead of choosing a favorable base', async () => {
  const f = await setup(false, null, true); f.state.login = 'github-actions[bot]'
  const workspace = f.execution.workspace
  expect(git(workspace, 'merge-base', '--all', f.execution.policySha, f.head).split('\n')).toHaveLength(2)
  await expect(prepareEditorial(f.execution)).rejects.toThrow('unique common ancestor')
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})

it.each(['missing-registry', 'registry-symlink', 'registry-executable', 'cross-date-choice'] as const)('native consumer rejects %s before invocation or a claim', async corruption => {
  const f = await setup(false, corruption); f.state.login = 'github-actions[bot]'
  await expect(prepareEditorial(f.execution)).rejects.toThrow()
  expect(f.state.prComments.get(42)?.some(comment => comment.body.startsWith('## Editorial execution claim\n'))).toBe(false)
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it.each([false, true])('both original workflow modes validate the actual Git registry delta; cross-date choice=%s', async corrupt => {
  const f = await setup(false, corrupt ? 'cross-date-choice' : null)
  {
    const run = () => execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), resolve(process.cwd(), 'scripts/check-editorial-actions.ts'), f.execution.policySha, f.head, today, 'ojfbot', '42'], { cwd: f.execution.workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (corrupt) await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: f.head, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).rejects.toThrow('may change only')
    else expect(run()).toBe('')
  }
})
const initialFeedback = 'A bounded owner revision.'
const initialFeedbackDigest = createHash('sha256').update(initialFeedback).digest('hex')
function initialWorkflowRun(f: Awaited<ReturnType<typeof setup>>) {
  return { id: 101, run_attempt: 1, event: 'pull_request_target', head_branch: `accept/${today}`, head_sha: f.head,
    display_title: 'Editorial acceptance', path: '.github/workflows/editorial-revise.yml',
    pull_requests: [{ number: 42, url: `https://api.github.com${repo}/pulls/42`,
      base: { sha: f.execution.policySha, repo: { url: `https://api.github.com${repo}` } },
      head: { sha: f.head, repo: { url: `https://api.github.com${repo}` } } }] }
}
async function initialActionOutput(f: Awaited<ReturnType<typeof setup>>, mode: 'clean-acceptance' | 'revision' = 'clean-acceptance') {
  execFileSync('pnpm', ['exec', 'node', '--import', 'tsx', resolve(process.cwd(), mode === 'revision' ? 'src/revise-article.ts' : 'scripts/reconcile-actions.ts')], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, MOCK_LLM: 'true', EDITORIAL_FEEDBACK: initialFeedback, ACTION_REVIEW_REQUEST: `pull-request:42:${mode}${mode === 'revision' ? `:${initialFeedbackDigest}` : ''}`, ACTION_REPO_ROOT: f.execution.workspace, ARTICLE_PATH: resolve(f.execution.workspace, f.path) },
  })
  git(f.execution.workspace, 'add', '.'); git(f.execution.workspace, 'commit', '-qm', 'actual clean acceptance action review')
  execFileSync('pnpm', ['exec', 'node', '--import', 'tsx', resolve(process.cwd(), 'scripts/write-action-output.ts'), mode], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ACTION_REPO_ROOT: f.execution.workspace, ARTICLE_PATH: f.path, REQUEST_DIGEST: initialFeedbackDigest, PR_NUMBER: '42', GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: f.execution.policySha, INPUT_HEAD: f.head },
  })
  await publishProof(f, true)
  const comment = f.state.prComments.get(42)?.at(-1); if (!comment) throw new Error('Missing receipt')
  comment.body = `## Verified action registry\n${JSON.stringify({ ...JSON.parse(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')), artifactId: 101 })}`
  const github = f.execution.github
  f.execution.github = (path, options) => path.endsWith('/actions/runs/101') ? Promise.resolve(Response.json(initialWorkflowRun(f))) : github(path, options)
  return git(f.execution.workspace, 'rev-parse', 'HEAD')
}
it.each(['clean-acceptance', 'revision'] as const)('immutable %s receipt survives the workflow push and later main metadata', async mode => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const outputCommit = await initialActionOutput(f, mode)
  const laterMain = git(f.execution.workspace, 'commit-tree', `${f.execution.policySha}^{tree}`, '-p', f.execution.policySha, '-m', 'later main')
  const run = initialWorkflowRun(f)
  const associated = run.pull_requests[0]; if (!associated) throw new Error('Missing PR association')
  associated.head.sha = outputCommit
  associated.base.sha = laterMain
  expect(run.head_sha).toBe(f.head)
  expect(associated.head.sha).not.toBe(run.head_sha)
  expect(associated.base.sha).not.toBe(f.execution.policySha)
  const github: Execution['github'] = (path, options) => path.endsWith('/actions/runs/101') ? Promise.resolve(Response.json(run)) : f.execution.github(path, options)
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: laterMain, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github })).resolves.toBeUndefined()
})
it('immutable receipt admission still rejects unrelated PR, run, policy and artifact evidence', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const outputCommit = await initialActionOutput(f, 'revision')
  const run = initialWorkflowRun(f)
  const associated = run.pull_requests[0]; if (!associated) throw new Error('Missing PR association')
  associated.head.sha = outputCommit
  type Run = ReturnType<typeof initialWorkflowRun>
  const wrongRuns: Array<[string, Partial<Run>]> = [
    ['PR number', { pull_requests: [{ ...associated, number: 43 }] }],
    ['PR URL', { pull_requests: [{ ...associated, url: 'https://api.github.com/repos/other/daily-logger/pulls/42' }] }],
    ['head repository', { pull_requests: [{ ...associated, head: { ...associated.head, repo: { url: 'https://api.github.com/repos/other/daily-logger' } } }] }],
    ['base repository', { pull_requests: [{ ...associated, base: { ...associated.base, repo: { url: 'https://api.github.com/repos/other/daily-logger' } } }] }],
    ['missing PR association', { pull_requests: [] }],
    ['immutable input', { head_sha: outputCommit }],
    ['run ID', { id: 102 }],
    ['event', { event: 'workflow_dispatch' }],
    ['branch', { head_branch: 'main' }],
    ['workflow', { path: '.github/workflows/pr-check.yml' }],
    ['attempt', { run_attempt: 2 }],
  ]
  const input = { workspace: f.execution.workspace, base: f.execution.policySha, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42 }
  for (const [label, change] of wrongRuns) {
    const changed = { ...run, ...change }
    const github: Execution['github'] = (path, options) => path.endsWith('/actions/runs/101') ? Promise.resolve(Response.json(changed)) : f.execution.github(path, options)
    await expect(admitActionRegistry({ ...input, github }), label).rejects.toThrow()
  }
  const github: Execution['github'] = (path, options) => path.endsWith('/actions/runs/101') ? Promise.resolve(Response.json(run)) : f.execution.github(path, options)
  const manifest = editorialProofSchema.parse(JSON.parse(readFileSync(resolve(f.execution.workspace, '.git/editorial-output.json'), 'utf8')))
  const artifact = { id: 101, name: editorialProofName(manifest), expired: false, workflow_run: { id: 101, head_sha: f.head } }
  for (const changed of [{ ...artifact, expired: true }, { ...artifact, name: 'unbound-output' },
    { ...artifact, workflow_run: { id: 102, head_sha: f.head } }, { ...artifact, workflow_run: { id: 101, head_sha: outputCommit } }]) {
    f.state.artifacts.set(101, changed)
    await expect(admitActionRegistry({ ...input, github })).rejects.toThrow('trusted editorial output receipt')
  }
  f.state.artifacts.set(101, artifact)
  const comment = f.state.prComments.get(42)?.at(-1); if (!comment) throw new Error('Missing receipt')
  const originalBody = comment.body
  comment.body = `## Verified action registry\n${JSON.stringify({ ...manifest, policySha: 'f'.repeat(40), artifactId: 101 })}`
  await expect(admitActionRegistry({ ...input, github })).rejects.toThrow('trusted editorial output receipt')
  const unrelatedPolicy = git(f.execution.workspace, 'commit-tree', `${f.execution.policySha}^{tree}`, '-m', 'unrelated policy')
  const unrelated = { ...manifest, policySha: unrelatedPolicy }
  comment.body = `## Verified action registry\n${JSON.stringify({ ...unrelated, artifactId: 101 })}`
  f.state.artifacts.set(101, { ...artifact, name: editorialProofName(unrelated) })
  await expect(admitActionRegistry({ ...input, github })).rejects.toThrow('trusted editorial output receipt')
  comment.body = originalBody; f.state.artifacts.set(101, artifact)
  await expect(admitActionRegistry({ ...input, github })).resolves.toBeUndefined()
})
it.each(['initial', 'continued'])('only an exact %s workflow receipt authorizes prior output; forged snapshots cannot bypass either agent', async kind => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  let outputCommit: string
  if (kind === 'initial') outputCommit = await initialActionOutput(f)
  else {
    const prepared = await prepareEditorial(f.execution); if (!prepared) throw new Error('Missing verified output')
    await pushEditorial(f.execution, prepared); await publishProof(f)
    outputCommit = prepared.outputCommit
  }
  const input = { workspace: f.execution.workspace, base: f.execution.policySha, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github }
  await expect(admitActionRegistry(input)).resolves.toBeUndefined()
  git(f.execution.workspace, 'checkout', '--detach', outputCommit)
  const registryPath = resolve(f.execution.workspace, `actions/articles/${today}.json`)
  const forged = ArticleActionFileSchema.parse(JSON.parse(readFileSync(registryPath, 'utf8')))
  forged.snapshot.verification.proposer = 'manual'
  writeFileSync(registryPath, JSON.stringify(forged)); git(f.execution.workspace, 'add', '.'); git(f.execution.workspace, 'commit', '-qm', 'hand-authored snapshot')
  await expect(admitActionRegistry({ ...input, head: git(f.execution.workspace, 'rev-parse', 'HEAD') })).rejects.toThrow('trusted editorial output receipt')
}, 20_000)
it.each(['clean-acceptance', 'revision'] as const)('trusted %s mode distinguishes pending-generation retry from an actual revision', async mode => {
  const f = await setup(false, null, false, true); f.state.login = 'github-actions[bot]'
  const outputCommit = await initialActionOutput(f, mode)
  const file = ArticleActionFileSchema.parse(JSON.parse(readFileSync(resolve(f.execution.workspace, `actions/articles/${today}.json`), 'utf8')))
  expect(file.snapshot.reviewCycle).toEqual(mode === 'clean-acceptance' ? generationActionCycle() : revisionActionCycle(`pull-request:42:revision:${initialFeedbackDigest}`))
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).resolves.toBeUndefined()
})
it('a receipt cannot borrow a different feedback digest on the same PR', async () => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const outputCommit = await initialActionOutput(f, 'revision')
  const path = resolve(f.execution.workspace, '.git/editorial-output.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.requestDigest = createHash('sha256').update('Different human feedback.').digest('hex')
  writeFileSync(path, JSON.stringify(manifest)); await publishProof(f, true)
  const comment = f.state.prComments.get(42)?.at(-1); if (!comment) throw new Error('Missing receipt')
  comment.body = `## Verified action registry\n${JSON.stringify({ ...manifest, artifactId: 101 })}`
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).rejects.toThrow('trusted editorial output receipt')
})
it.each(['generation', 'wrong-request', 'v5'])('an artifact-bound output cannot borrow the wrong action cycle: %s', async kind => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  await initialActionOutput(f)
  const path = resolve(f.execution.workspace, `actions/articles/${today}.json`)
  const file = ArticleActionFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  file.snapshot.reviewCycle = kind === 'generation' ? { phase: 'generation' } : revisionActionCycle(kind === 'v5' ? 'pull-request:42:clean-acceptance' : 'another-request')
  if (kind === 'v5') file.snapshot.verification.promptVersion = 'action-review-v5-terminal-citations'
  writeFileSync(path, JSON.stringify(file)); git(f.execution.workspace, 'add', '.'); git(f.execution.workspace, 'commit', '--amend', '-qm', 'wrong phase output')
  const outputCommit = git(f.execution.workspace, 'rev-parse', 'HEAD')
  const manifestPath = resolve(f.execution.workspace, '.git/editorial-output.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.outputCommit = outputCommit; manifest.outputRegistryBlob = git(f.execution.workspace, 'rev-parse', `HEAD:actions/articles/${today}.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest)); await publishProof(f, true)
  const comment = f.state.prComments.get(42)?.at(-1); if (!comment) throw new Error('Missing receipt')
  comment.body = `## Verified action registry\n${JSON.stringify({ ...manifest, artifactId: 101 })}`
  await expect(admitActionRegistry({ workspace: f.execution.workspace, base: f.execution.policySha, head: outputCommit, date: today, actor: 'ojfbot', pullRequest: 42, github: f.execution.github })).rejects.toThrow('trusted editorial output receipt')
})

it.each(['failed', 'stale', 'uncertain'])('an unbound %s bot comment cannot clear the outstanding request (F13)', async outcome => {
  const f = await setup()
  const request = (await createEditorialService(f.execution.github).load(today, 'ojfbot'))
  if (request.status !== 'existing') throw new Error('Missing request')
  const digest = request.requests[0]!.digest
  f.state.prComments.get(42)!.push(makeComment(`## Editorial execution receipt\n${JSON.stringify({ requestDigest: digest, requestCommentId: f.comment.id, runId: 101, policySha: f.execution.policySha, outcome })}`, 99, 'github-actions[bot]', 42))
  expect(await createEditorialService(f.execution.github).load(today, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: true })
})

it('keeps the parent loop responsive while native clean commands finish serially', async () => {
  const f = await setup(false, null, false, false, 'clean'); f.state.login = 'github-actions[bot]'
  let heartbeats = 0
  const interval = setInterval(() => { if (commandFailure.events.at(-1)?.startsWith('start:')) heartbeats++ }, 5)
  try { expect(await prepareEditorial(f.execution)).not.toBeNull() }
  finally { clearInterval(interval) }
  expect(heartbeats).toBeGreaterThan(0)
  expect(commandFailure.events.map(event => event.slice(0, event.indexOf(':') + 1) + basename(event.slice(event.indexOf(':') + 1)))).toEqual([
    'start:stamp-outcome.ts', 'end:stamp-outcome.ts', 'start:reconcile-actions.ts', 'end:reconcile-actions.ts',
  ])
  expect(commandFailure.options).toEqual([0, 1].map(() => ({ shell: false, maxBuffer: 1024 * 1024, timeout: 0, cwd: f.execution.policyDirectory })))
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
it.each(['nonzero', 'signal', 'spawn', 'overflow', 'timeout'] as const)('preserves a real %s child failure and stops before any later output step', async kind => {
  const f = await setup(); f.state.login = 'github-actions[bot]'
  const scripts = {
    nonzero: "process.stdout.write('bounded stdout');process.stderr.write('bounded stderr');process.exitCode=7",
    signal: "process.kill(process.pid,'SIGTERM')",
    spawn: '',
    overflow: 'process.stdout.write(Buffer.alloc(1024*1024+1,120))',
    timeout: 'setInterval(()=>{},1000)',
  }
  commandFailure.replacement = { file: kind === 'spawn' ? resolve(f.execution.workspace, 'missing-command') : process.execPath,
    args: ['-e', scripts[kind]], ...(kind === 'timeout' ? { timeout: 100 } : {}) }
  const failure: unknown = await prepareEditorial(f.execution).catch((error: unknown) => error)
  expect(failure).toBe(commandFailure.childError)
  expect(failure).toBeInstanceOf(Error)
  if (kind === 'nonzero') expect(failure).toMatchObject({ code: 7, stdout: 'bounded stdout', stderr: 'bounded stderr' })
  if (kind === 'signal') expect(failure).toMatchObject({ signal: 'SIGTERM' })
  if (kind === 'spawn') expect(failure).toMatchObject({ code: 'ENOENT' })
  if (kind === 'timeout') expect(failure).toMatchObject({ killed: true, signal: 'SIGTERM' })
  if (kind === 'overflow') {
    expect(failure).toMatchObject({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })
    const bounded = z.object({ stdout: z.string(), stderr: z.string() }).parse(failure)
    expect(Buffer.byteLength(bounded.stdout)).toBeLessThanOrEqual(1024 * 1024)
    expect(bounded.stderr).toBe('')
  }
  expect(commandFailure.events.map(event => basename(event))).toEqual(['revise-article.ts'])
  const receipts = f.state.prComments.get(42)?.filter(comment => comment.body.startsWith('## Editorial execution receipt'))
  expect(receipts).toHaveLength(1)
  expect(receipts?.[0]?.body).toContain('"outcome":"uncertain"')
  expect(git(f.execution.workspace, '--git-dir', f.remote, 'rev-parse', `refs/heads/accept/${today}`)).toBe(f.head)
})
