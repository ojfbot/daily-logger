import { createHash } from 'node:crypto'
import { generationActionCycle, revisionActionCycle } from '../../src/action-review-cycle.js'
import { editorialProofName } from '../../shared/editorial-action-proof.js'
import { actionFile, emptyActionFile, writeActionStore } from '../../src/__tests__/action-store-fixture.js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createFixture, makePullRequest, makeComment, today } from './fixture.js'
import { createEditorialService, repo } from '../../api/_lib/editorial-continuation.js'
import { reviewArticleActions, mockActionAgents } from '../../src/review-actions.js'
import { ActionRegistrySchema, ArticleActionFileSchema } from '../../src/action-registry-schema.js'
import { admitActionRegistry } from '../../.github/scripts/editorial-action-registry.js'
import { admitEditorial, prepareEditorial, pushEditorial, finalizeEditorial, type Execution } from '../../.github/scripts/continue-editorial.js'
// Native revision cases create Git worktrees and run the actual CLI.
vi.setConfig({ testTimeout: 20_000 })
const cleanups: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true }) })
function git(cwd: string, ...args: string[]) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
async function setup(noChange = false, corruption: 'code' | 'symlink' | 'executable' | 'blob' | 'missing-registry' | 'registry-symlink' | 'registry-executable' | 'cross-date-choice' | null = null, ambiguousAncestry = false, pendingInitial = false) {
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
  state.refFiles.set(`${head}:actions/articles/${today}.json`, JSON.stringify(actionFile(ActionRegistrySchema.parse(JSON.parse(registry)), today)))
  const github: Execution['github'] = async (path, options) => path.startsWith(`${repo}/actions/workflows/editorial-revise.yml/runs?`) ? Response.json({ workflow_runs: [] }) : path === `${repo}/actions/runs/101` ? Response.json({ id: 101, run_attempt: 1, event: 'issue_comment', head_branch: 'main', head_sha: execution.policySha, display_title: 'Editorial continuation comment 2', path: '.github/workflows/editorial-revise.yml' }) : fixtureGithub(path, options)
  const service = createEditorialService(github)
  const view = await service.load(today, 'ojfbot'); if (view.status !== 'existing') throw new Error('Missing acceptance')
  const versionId = crypto.randomUUID()
  await service.write({ schemaVersion: 1, intent: 'append_editorial_feedback', date: today, requestId: versionId, pullRequest: 42, headSha: head, visibleBlobSha: blob,
    supersedes: view.originalDigest, feedback: { version: 2, notes: [{ kind: 'root', content: ' \t雪 @claude /run\n ' }] } }, 'ojfbot')
  const saved = await service.load(today, 'ojfbot'); if (saved.status !== 'existing' || !saved.versions[0]) throw new Error('No version')
  await service.write({ schemaVersion: 1, intent: 'request_editorial_revision', date: today, requestId: crypto.randomUUID(), pullRequest: 42, headSha: head, articleBlobSha: blob,
    feedbackId: versionId, feedbackDigest: saved.versions[0].digest }, 'ojfbot')
  const comment = state.prComments.get(42)?.[1]; if (!comment) throw new Error('No request comment')
  comment.created_at = new Date().toISOString(); comment.updated_at = comment.created_at
  const event = { action: 'created', repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' }, issue: { number: 42, pull_request: { url: `https://api.github.com${repo}/pulls/42` } }, comment }
  const execution: Execution = { github, workspace, policyDirectory: process.cwd(), policySha, runId: 101, attempt: 1, event }
  return { execution, state, head, blob, remote, path, comment }
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
  expect(workflow).toContain('pnpm exec tsx .github/scripts/continue-editorial.ts admit')
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
  f.execution.github = (path, options) => path.endsWith('/actions/runs/101') ? Promise.resolve(Response.json({ id: 101, run_attempt: 1, event: 'pull_request_target', head_branch: `accept/${today}`, head_sha: f.head, display_title: 'Editorial acceptance', path: '.github/workflows/editorial-revise.yml', pull_requests: [{ number: 42, base: { sha: f.execution.policySha }, head: { sha: f.head } }] })) : github(path, options)
  return git(f.execution.workspace, 'rev-parse', 'HEAD')
}
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
