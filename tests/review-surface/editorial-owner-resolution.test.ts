import { createHash } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import handler from '../../api/article-reviews.js'
import { createEditorialService, decodeEditorial, editorialDigest, repo } from '../../api/_lib/editorial-continuation.js'
import { admitEditorial, type Execution } from '../../.github/scripts/continue-editorial.js'
import { editorialProjectionSchema } from '../../shared/article-review.js'
import { emptyActionFile } from '../../src/__tests__/action-store-fixture.js'
import { createFixture, makeComment, makePullRequest, today } from './fixture.js'

vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => 'fixture-token' }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

async function invoke(method = 'GET', body?: unknown) {
  const req = Object.assign(new IncomingMessage(new Socket()), { query: { date: today, view: 'editorial' }, cookies: {}, body })
  req.method = method
  if (method === 'POST') req.headers['x-requested-with'] = 'XMLHttpRequest'
  let output: unknown
  const res = Object.assign(new ServerResponse(req), { status(n: number) { res.statusCode = n; return res }, json(value: unknown) { output = value; return res }, send() { throw new Error('Unexpected send') }, redirect() { throw new Error('Unexpected redirect') } })
  await handler(req, res)
  return { status: res.statusCode, output }
}

async function failedCleanAttempt() {
  const { state, github } = createFixture()
  state.login = 'ojfbot'
  const pr = makePullRequest(42)
  const article = '---\nstatus: accepted\n---\nPinned article'
  const registry = JSON.stringify(emptyActionFile(today))
  const registryBlobSha = createHash('sha1').update(`blob ${Buffer.byteLength(registry)}\0`).update(registry).digest('hex')
  state.acceptPullNumbers.push(42)
  state.pullRequests.set(42, { ...pr, head: { ...pr.head, ref: `accept/${today}` }, body: 'Original submitted feedback' })
  state.pullFiles.set(42, [{ filename: `_articles/${today}.md`, status: 'modified' }])
  state.refFiles.set(`${pr.head.sha}:_articles/${today}.md`, article)
  state.refFiles.set(`${pr.head.sha}:actions/articles/${today}.json`, registry)
  vi.stubEnv('ALLOWED_USERS', 'ojfbot,editor')
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => github(url.replace('https://api.github.com', ''), options))
  const service = createEditorialService(github)
  const before = editorialProjectionSchema.parse(await service.load(today, 'ojfbot'))
  if (before.status !== 'existing') throw new Error('Missing acceptance PR')
  await service.write({ schemaVersion: 1, intent: 'request_clean_acceptance', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: pr.head.sha, articleBlobSha: before.article.blobSha, registryBlobSha, policySha: state.source }, 'ojfbot')
  const comments = state.prComments.get(42)
  const requestComment = comments?.[0]
  const request = decodeEditorial(requestComment?.body ?? '')
  if (!comments || !requestComment || request?.intent !== 'request_clean_acceptance') throw new Error('Missing clean request')
  requestComment.created_at = new Date().toISOString(); requestComment.updated_at = requestComment.created_at
  const requestDigest = editorialDigest(request)
  const claim = { requestDigest, requestId: request.requestId, requestCommentId: requestComment.id, intent: request.intent,
    actionReviewMode: 'clean-acceptance', inputHead: request.headSha, inputBlob: request.articleBlobSha,
    inputRegistryBlob: request.registryBlobSha, policySha: request.policySha, runId: 101, attempt: 1 }
  const receipt = { requestDigest, requestCommentId: requestComment.id, outcome: 'uncertain', runId: 101,
    policySha: request.policySha, reason: 'Invocation was claimed. Preparation failed; do not replay automatically.' }
  const claimComment = makeComment(`## Editorial execution claim\n${JSON.stringify(claim)}`, 2, 'github-actions[bot]', 42)
  const receiptComment = makeComment(`## Editorial execution receipt\n${JSON.stringify(receipt)}`, 3, 'github-actions[bot]', 42)
  comments.push(claimComment, receiptComment)
  const run = { id: 101, run_attempt: 1, status: 'completed', conclusion: 'failure', event: 'issue_comment',
    head_sha: request.policySha, head_branch: 'main', path: '.github/workflows/editorial-revise.yml',
    display_title: `Editorial continuation comment ${requestComment.id}`, created_at: requestComment.created_at, updated_at: requestComment.created_at }
  state.workflowRuns.set(101, run)
  state.workflowRunAttempts.set('101:1', run)
  state.runArtifacts.set(101, [])
  state.calls.length = 0
  return { state, github, service, pr, article, registry, registryBlobSha, request, requestComment, requestDigest, claim, claimComment, receipt, receiptComment, run }
}

async function resolutionInput(f: Awaited<ReturnType<typeof failedCleanAttempt>>, reason = 'Retire the failed claimed attempt while preserving uncertainty.') {
  const view = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (view.status !== 'existing' || view.recovery.kind !== 'available') throw new Error('Missing recovery target')
  return { ...view.recovery.input, intent: 'resolve_editorial_request' as const, requestId: crypto.randomUUID(),
    acknowledgment: 'close_uncertain_attempt_without_review_or_billing_claim' as const, reason }
}

it('records one non-executing owner resolution, preserves the failed attempt, and permits save-only feedback', async () => {
  const f = await failedCleanAttempt()
  const input = await resolutionInput(f)
  const originalBodies = [f.requestComment.body, f.claimComment.body, f.receiptComment.body]
  f.state.calls.length = 0

  expect((await invoke('POST', input))).toMatchObject({ status: 200, output: { reused: false, execution: 'not_started' } })
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual(['POST /repos/ojfbot/daily-logger/issues/42/comments'])
  const resolved = editorialProjectionSchema.parse((await invoke()).output)
  if (resolved.status !== 'existing') throw new Error('Missing resolved history')
  expect(resolved).toMatchObject({ outstanding: false, requestState: { kind: 'owner_resolved', request: { digest: f.requestDigest } },
    executionReadiness: { kind: 'ready' }, resolutions: [{ record: { intent: 'resolve_editorial_request', reason: input.reason } }] })
  expect(resolved.requests).toHaveLength(1)
  expect(f.state.prComments.get(42)?.slice(0, 3).map(comment => comment.body)).toEqual(originalBodies)

  const feedback = { schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: resolved.pullRequest.headSha, visibleBlobSha: resolved.article.blobSha, supersedes: resolved.originalDigest,
    feedback: { version: 2, notes: [{ kind: 'root', content: 'Genuine save-only follow-up.' }] } }
  expect((await invoke('POST', feedback))).toMatchObject({ status: 200, output: { execution: 'not_started' } })
  const saved = editorialProjectionSchema.parse((await invoke()).output)
  expect(saved).toMatchObject({ status: 'existing', outstanding: false, versions: [{ record: { intent: 'append_editorial_feedback' } }],
    resolutions: [{ record: { intent: 'resolve_editorial_request' } }] })
})

it('reuses only the identical resolution identity and allows a separately authorized distinct clean request', async () => {
  const f = await failedCleanAttempt()
  const input = await resolutionInput(f)
  expect((await invoke('POST', input)).output).toMatchObject({ reused: false, execution: 'not_started' })
  expect((await invoke('POST', input)).output).toMatchObject({ reused: true, execution: 'not_started' })
  expect((await invoke('POST', { ...input, reason: 'Different acknowledgment.' })).status).toBe(409)
  expect((await invoke('POST', { ...input, requestId: crypto.randomUUID() })).status).toBe(409)

  const current = editorialProjectionSchema.parse((await invoke()).output)
  if (current.status !== 'existing') throw new Error('Missing resolved history')
  const next = { schemaVersion: 1, intent: 'request_clean_acceptance', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: current.pullRequest.headSha, articleBlobSha: current.article.blobSha,
    registryBlobSha: current.registryBlobSha, policySha: current.policySha }
  expect((await invoke('POST', next)).output).toMatchObject({ reused: false, execution: 'requested' })
  const queued = editorialProjectionSchema.parse((await invoke()).output)
  expect(queued).toMatchObject({ status: 'existing', outstanding: true, requestState: { kind: 'outstanding' } })
  if (queued.status !== 'existing') throw new Error('Missing queued history')
  expect(queued.requests).toHaveLength(2)
  expect(queued.resolutions).toHaveLength(1)
})

it('permanently refuses the resolved old request before any replacement or command boundary', async () => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const event = { action: 'created' as const, repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' },
    issue: { number: 42, pull_request: { url: `https://api.github.com${repo}/pulls/42` } }, comment: f.requestComment }
  const execution: Execution = { github: f.github, workspace: process.cwd(), policySha: f.request.policySha, runId: 101, attempt: 1, event }
  await expect(admitEditorial(execution)).rejects.toThrow(/owner-resolved|no longer executable/i)
  const withoutClaim = f.state.prComments.get(42)?.filter(comment => comment.id !== f.claimComment.id) ?? []
  f.state.prComments.set(42, withoutClaim)
  await expect(admitEditorial(execution)).rejects.toThrow()
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toHaveLength(1)
})

it('binds freshly observed current policy without requiring ancestry for the non-executing resolution', async () => {
  const f = await failedCleanAttempt()
  f.state.source = 'f'.repeat(40)
  const input = await resolutionInput(f)
  expect(input.policySha).toBe('f'.repeat(40))
  expect((await invoke('POST', input))).toMatchObject({ status: 200, output: { execution: 'not_started' } })
  const view = editorialProjectionSchema.parse((await invoke()).output)
  if (view.status !== 'existing' || view.resolutions[0]?.record.intent !== 'resolve_editorial_request') throw new Error('Missing resolution')
  expect(view.resolutions[0].record.policySha).toBe('f'.repeat(40))
  expect(view.resolutions[0].record.evidence.attempt.policySha).toBe(f.request.policySha)
})

it.each(['owner', 'head', 'article', 'registry', 'request_digest', 'prefix', 'policy', 'unknown_outcome'] as const)(
  'rejects wrong %s pins or authority before resolution append', async kind => {
    const f = await failedCleanAttempt()
    const input = await resolutionInput(f)
    let changed: typeof input = input
    if (kind === 'owner') f.state.login = 'editor'
    if (kind === 'head') {
      const current = f.state.pullRequests.get(42); if (!current) throw new Error('Missing PR')
      const head = 'd'.repeat(40)
      f.state.pullRequests.set(42, { ...current, head: { ...current.head, sha: head } })
      f.state.refFiles.set(`${head}:_articles/${today}.md`, f.article)
      f.state.refFiles.set(`${head}:actions/articles/${today}.json`, f.registry)
    }
    if (kind === 'article') f.state.refFiles.set(`${f.pr.head.sha}:_articles/${today}.md`, `${f.article}\nChanged.`)
    if (kind === 'registry') f.state.refFiles.set(`${f.pr.head.sha}:actions/articles/${today}.json`, `${f.registry}\n`)
    if (kind === 'request_digest') changed = { ...input, priorRequestDigest: 'd'.repeat(64) }
    if (kind === 'prefix') changed = { ...input, prefix: { ...input.prefix, throughCommentId: input.prefix.throughCommentId + 1 } }
    if (kind === 'policy') changed = { ...input, policySha: 'd'.repeat(40) }
    if (kind === 'unknown_outcome') f.receiptComment.body = `## Editorial execution receipt\n${JSON.stringify({ ...f.receipt, outcome: 'mystery' })}`
    f.state.calls.length = 0
    expect((await invoke('POST', changed)).status).toBeGreaterThanOrEqual(400)
    expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
  })

it.each(['edited_claim', 'edited_receipt', 'wrong_run', 'wrong_attempt', 'in_progress', 'artifact', 'output', 'incomplete_history'] as const)(
  'holds resolution for %s evidence without appending', async kind => {
    const f = await failedCleanAttempt()
    if (kind === 'edited_claim') f.claimComment.updated_at = '2030-01-01T00:00:00.000Z'
    if (kind === 'edited_receipt') f.receiptComment.updated_at = '2030-01-01T00:00:00.000Z'
    if (kind === 'wrong_run') f.state.workflowRunAttempts.set('101:1', { ...f.run, id: 102 })
    if (kind === 'wrong_attempt') f.state.workflowRunAttempts.set('101:1', { ...f.run, run_attempt: 2 })
    if (kind === 'in_progress') {
      f.state.workflowRuns.set(101, { ...f.run, status: 'in_progress', conclusion: null })
      f.state.workflowRunAttempts.set('101:1', { ...f.run, status: 'in_progress', conclusion: null })
    }
    if (kind === 'artifact') f.state.runArtifacts.set(101, [{ id: 1, name: 'unexpected-output' }])
    if (kind === 'output') f.state.prComments.get(42)?.push(makeComment(`## Editorial execution receipt\n${JSON.stringify({ ...f.receipt, outcome: 'changed' })}`, 4, 'github-actions[bot]', 42))
    if (kind === 'incomplete_history') f.state.nextPageRoutes.add('/actions/workflows/editorial-revise.yml/runs')
    const before = f.state.prComments.get(42)?.length
    const view = await invoke()
    if (view.status === 200) expect(view.output).toMatchObject({ status: 'existing', recovery: { kind: 'blocked' } })
    else expect(view.status).toBeGreaterThanOrEqual(400)
    expect(f.state.prComments.get(42)).toHaveLength(before)
    expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
  })

it('fails a stale-policy race before append and reuses the same UUID after a lost acknowledgment', async () => {
  const f = await failedCleanAttempt()
  const input = await resolutionInput(f)
  const original = f.github
  let mainReads = 0
  const racing = createEditorialService(async (path, options) => {
    if (path === `${repo}/git/ref/heads/main` && ++mainReads === 2) f.state.source = 'f'.repeat(40)
    return original(path, options)
  })
  await expect(racing.write(input, 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])

  f.state.source = f.request.policySha
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    const response = await original(url.replace('https://api.github.com', ''), options)
    if (options?.method === 'POST') throw new Error('Acknowledgment lost after append')
    return response
  })
  expect((await invoke('POST', input))).toMatchObject({ status: 503, output: { outcome: 'uncertain' } })
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => original(url.replace('https://api.github.com', ''), options))
  expect((await invoke('POST', input))).toMatchObject({ status: 200, output: { reused: true, execution: 'not_started' } })
})

it('keeps historical resolution valid across later main/head/output noise but blocks uncovered old execution', async () => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  f.state.prComments.get(42)?.push(makeComment('Unrelated deployment greeting, edited later.', 90, 'github-actions[bot]', 42))
  const nextHead = 'e'.repeat(40)
  const pr = f.state.pullRequests.get(42)
  if (!pr) throw new Error('Missing PR')
  f.state.pullRequests.set(42, { ...pr, head: { ...pr.head, sha: nextHead } })
  f.state.refFiles.set(`${nextHead}:_articles/${today}.md`, f.article)
  f.state.refFiles.set(`${nextHead}:actions/articles/${today}.json`, f.registry)
  f.state.source = 'f'.repeat(40)
  const advanced = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  expect(advanced).toMatchObject({ status: 'existing', policySha: 'f'.repeat(40), pullRequest: { headSha: nextHead },
    requestState: { kind: 'owner_resolved' }, executionReadiness: { kind: 'ready' }, resolutions: [{ record: { intent: 'resolve_editorial_request' } }] })

  f.state.workflowRuns.set(102, { ...f.run, id: 102 })
  const blocked = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  expect(blocked).toMatchObject({ status: 'existing', requestState: { kind: 'owner_resolved' }, executionReadiness: { kind: 'blocked' },
    resolutions: [{ record: { intent: 'resolve_editorial_request' } }] })
  if (blocked.status !== 'existing') throw new Error('Missing blocked history')
  const next = { schemaVersion: 1, intent: 'request_clean_acceptance', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: blocked.pullRequest.headSha, articleBlobSha: blocked.article.blobSha,
    registryBlobSha: blocked.registryBlobSha, policySha: blocked.policySha }
  await expect(f.service.write(next, 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
})

it('keeps save-only feedback available while additional old execution correspondence holds new execution', async () => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  f.state.prComments.get(42)?.push(makeComment(`## Editorial execution claim\n${JSON.stringify({ ...f.claim,
    materialObservation: 'A distinct late claim requires diagnosis.' })}`, 5, 'github-actions[bot]', 42))
  const blocked = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (blocked.status !== 'existing') throw new Error('Missing blocked projection')
  expect(blocked.executionReadiness.kind).toBe('blocked')
  const feedback = { schemaVersion: 1 as const, intent: 'append_editorial_feedback' as const, requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: blocked.pullRequest.headSha, visibleBlobSha: blocked.article.blobSha, supersedes: blocked.originalDigest,
    feedback: { version: 2 as const, notes: [{ kind: 'root' as const, content: 'Preserve genuine notes while execution is held.' }] } }
  await expect(f.service.write(feedback, 'ojfbot')).resolves.toMatchObject({ execution: 'not_started' })
  expect(await f.service.load(today, 'ojfbot')).toMatchObject({ status: 'existing', executionReadiness: { kind: 'blocked' },
    versions: [{ record: { intent: 'append_editorial_feedback' } }] })
})
