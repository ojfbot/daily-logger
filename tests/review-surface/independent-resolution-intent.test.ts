import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createEditorialService, decodeEditorial, editorialDigest, repo } from '../../api/_lib/editorial-continuation.js'
import { prepareEditorial } from '../../.github/scripts/continue-editorial.js'
import { editorialProjectionSchema } from '../../shared/article-review.js'
import { emptyActionFile } from '../../src/__tests__/action-store-fixture.js'
import { createFixture, makeComment, makePullRequest, today } from './fixture.js'

vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => 'fixture-token' }))
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


it('independent: prepare rejects a nonexecuting resolution without publishing an execution failure receipt', async () => {
  const f=await failedCleanAttempt()
  await f.service.write(await resolutionInput(f),'ojfbot')
  const resolutionComment=f.state.prComments.get(42)?.at(-1)
  if (!resolutionComment) throw new Error('Missing resolution comment')
  resolutionComment.created_at=new Date().toISOString(); resolutionComment.updated_at=resolutionComment.created_at
  const event={action:'created' as const,repository:{full_name:'ojfbot/daily-logger'},sender:{login:'ojfbot'},issue:{number:42,pull_request:{url:'https://api.github.com'+repo+'/pulls/42'}},comment:resolutionComment}
  f.state.calls.length=0
  await expect(prepareEditorial({github:f.github,workspace:process.cwd(),policySha:f.state.source,runId:102,attempt:1,event})).rejects.toThrow()
  const posts=f.state.calls.filter(call=>call.startsWith('POST '))
  console.log(JSON.stringify({control:'resolution-through-prepare-native-caller',posts,lastBody:f.state.prComments.get(42)?.at(-1)?.body}))
  expect(posts).toEqual([])
})

