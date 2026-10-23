import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createEditorialService, decodeEditorial, encodeEditorial, editorialDigest, repo } from '../../api/_lib/editorial-continuation.js'
import { admitEditorial, prepareEditorial } from '../../.github/scripts/continue-editorial.js'
import { editorialProjectionSchema, editorialRecordSchema } from '../../shared/article-review.js'
import { emptyActionFile } from '../../src/__tests__/action-store-fixture.js'
import { createFixture, makeComment, makePullRequest, today } from './fixture.js'
// Every API/run/comment below is a synthetic fixture; no GitHub/provider executes.
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
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


function existing(view: Awaited<ReturnType<ReturnType<typeof createEditorialService>['load']>>) {
  if (view.status !== 'existing') throw new Error('Missing view')
  return view
}
function lateOldRecord(f: Awaited<ReturnType<typeof failedCleanAttempt>>, kind: 'claim' | 'receipt', id: number) {
  const value = kind === 'claim' ? { ...f.claim, materialObservation: 'A distinct late claim requires diagnosis.' } : { ...f.receipt, reason: 'A distinct late uncertainty receipt requires diagnosis.' }
  const title = kind === 'claim' ? '## Editorial execution claim\n' : '## Editorial execution receipt\n'
  return makeComment(title + JSON.stringify(value), id, 'github-actions[bot]', 42)
}
async function freshRequest(f: Awaited<ReturnType<typeof failedCleanAttempt>>, service = f.service) {
  const current = existing(await service.load(today, 'ojfbot'))
  return { schemaVersion: 1 as const, intent: 'request_clean_acceptance' as const, requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: current.pullRequest.headSha, articleBlobSha: current.article.blobSha,
    registryBlobSha: current.registryBlobSha, policySha: current.policySha }
}

it.each(['feedback', 'claim', 'receipt'] as const)('SEC1: material %s inserted in prefix-to-resolution gap is held', async kind => {
  const f = await failedCleanAttempt(), input = await resolutionInput(f)
  let inserted = false
  const racing = createEditorialService(async (path, options) => {
    if (options?.method === 'POST' && !inserted) {
      inserted = true
      const comments = f.state.prComments.get(42)!
      if (kind === 'feedback') {
        const view = existing(await f.service.load(today, 'ojfbot'))
        const record = editorialRecordSchema.parse({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
          pullRequest: 42, headSha: f.pr.head.sha, visibleBlobSha: view.article.blobSha, supersedes: view.originalDigest,
          feedback: { version: 2, notes: [{ kind: 'root', content: 'Concurrent genuine saved feedback.' }] }, actor: 'ojfbot', originalBody: view.originalBody })
        comments.push(makeComment(encodeEditorial(record), 4, 'ojfbot', 42))
      } else comments.push(lateOldRecord(f, kind, 4))
    }
    return f.github(path, options)
  })
  let failure: unknown
  try { await racing.write(input, 'ojfbot') } catch (error) { failure = error }
  const view = existing(await f.service.load(today, 'ojfbot'))
  // A non-transactional append may remain durable, but cannot silently clear the hold.
  expect({ failed: !!failure, readiness: view.executionReadiness.kind, state: view.requestState.kind }).not.toEqual({ failed: false, readiness: 'ready', state: 'owner_resolved' })
})

it.each(['claim', 'receipt'] as const)('SEC2: late old-request %s after resolution blocks a new request', async kind => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  f.state.prComments.get(42)!.push(lateOldRecord(f, kind, 5))
  const view = existing(await f.service.load(today, 'ojfbot'))
  expect(view.executionReadiness.kind).toBe('blocked')
  await expect(f.service.write(await freshRequest(f), 'ojfbot')).rejects.toThrow()
})

it('SEC3: an owner-shaped historical record cannot bypass wrong claim intent/mode', async () => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const comments = f.state.prComments.get(42)!
  const resolutionComment = comments.at(-1)!
  const original = decodeEditorial(resolutionComment.body)
  if (original?.intent !== 'resolve_editorial_request' || 'kind' in original.evidence.receipt) throw new Error('Missing uncertain-receipt resolution')
  // Reconstruct a source-forged-from-creation fixture; no real comment is edited.
  // The historical read must enforce the same semantic provenance as initial eligibility.
  const wrongClaim = { ...f.claim, intent: 'request_editorial_revision', actionReviewMode: 'revision' }
  f.claimComment.body = '## Editorial execution claim\n' + JSON.stringify(wrongClaim)
  const prefixEntries = [
    { commentId: f.requestComment.id, kind: 'owner-record', semanticDigest: f.requestDigest },
    { commentId: f.claimComment.id, kind: 'claim', semanticDigest: editorialDigest(wrongClaim) },
    { commentId: f.receiptComment.id, kind: 'receipt', semanticDigest: original.evidence.receipt.semanticDigest },
  ]
  resolutionComment.body = encodeEditorial(editorialRecordSchema.parse({ ...original,
    prefix: { ...original.prefix, sha256: editorialDigest(prefixEntries) },
    evidence: { ...original.evidence, claim: { ...original.evidence.claim, semanticDigest: editorialDigest(wrongClaim) } },
  }))
  let failure: unknown, view: ReturnType<typeof existing> | undefined
  try { view = existing(await f.service.load(today, 'ojfbot')) } catch (error) { failure = error }
  expect({ failed: !!failure, readiness: view?.executionReadiness.kind, state: view?.requestState.kind }).not.toEqual({ failed: false, readiness: 'ready', state: 'owner_resolved' })
})

it('SEC4: explicitly incomplete workflow history is unknown, not a unique failed run', async () => {
  const f = await failedCleanAttempt()
  const incomplete = createEditorialService(async (path, options) => {
    if (path.includes('/actions/workflows/editorial-revise.yml/runs?')) return Response.json({ total_count: 2, workflow_runs: [f.run] })
    return f.github(path, options)
  })
  const view = existing(await incomplete.load(today, 'ojfbot'))
  expect(view.recovery.kind).toBe('blocked')
})


it.each(['claim', 'receipt'] as const)('SEC2: late %s blocks a distinct request at service and native admission', async kind => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  f.state.prComments.get(42)!.push(lateOldRecord(f, kind, 5))
  const next = await freshRequest(f)
  await expect(f.service.write(next, 'ojfbot')).rejects.toThrow()
  const record = editorialRecordSchema.parse({ ...next, actor: 'ojfbot' })
  const comment = makeComment(encodeEditorial(record), 6, 'ojfbot', 42)
  f.state.prComments.get(42)!.push(comment)
  const time = new Date().toISOString()
  comment.created_at = time; comment.updated_at = time
  f.state.workflowRuns.set(202, { ...f.run, id: 202, status: 'in_progress', conclusion: null, display_title: `Editorial continuation comment ${comment.id}`, created_at: time })
  const event = { action: 'created' as const, repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' },
    issue: { number: 42, pull_request: { url: `https://api.github.com${repo}/pulls/42` } }, comment }
  await expect(admitEditorial({ github: f.github, workspace: process.cwd(), policySha: next.policySha, runId: 202, attempt: 1, event }))
    .rejects.toThrow(/additional or changed execution correspondence/i)
})


it('SEC5: non-executing resolution event cannot emit an execution-failure receipt', async () => {
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const comment = f.state.prComments.get(42)!.at(-1)!
  const now = new Date().toISOString(); comment.created_at = now; comment.updated_at = now
  const event = { action: 'created' as const, repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' },
    issue: { number: 42, pull_request: { url: `https://api.github.com${repo}/pulls/42` } }, comment }
  f.state.calls.length = 0
  f.state.login = 'github-actions[bot]'
  await expect(prepareEditorial({ github: f.github, workspace: process.cwd(), policySha: f.request.policySha, runId: 202, attempt: 1, event })).rejects.toThrow()
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
})
