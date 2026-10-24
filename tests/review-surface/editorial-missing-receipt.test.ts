import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createEditorialService, decodeEditorial, encodeEditorial, editorialDigest, repo } from '../../api/_lib/editorial-continuation.js'
import { editorialRecordSchema } from '../../shared/article-review.js'
import { admitEditorial, type Execution } from '../../.github/scripts/continue-editorial.js'
import { createFixture, makeComment, makePullRequest } from './fixture.js'

const captured = z.object({ request: editorialRecordSchema, requestComment: z.object({ id: z.number(), created_at: z.string(), updated_at: z.string() }),
  claim: z.record(z.string(), z.unknown()), claimComment: z.object({ id: z.number(), created_at: z.string(), updated_at: z.string() }),
  attempt: z.object({ id: z.number(), run_attempt: z.number(), status: z.string(), conclusion: z.string(), event: z.string(), head_sha: z.string(),
    head_branch: z.string(), path: z.string(), display_title: z.string(), created_at: z.string(), updated_at: z.string() })
}).parse(JSON.parse(readFileSync('tests/review-surface/fixtures/missing-terminal-receipt.json', 'utf8')))
if (captured.request.intent !== 'request_clean_acceptance') throw new Error('Fixture must pin the actual clean request')
const request = captured.request, date = request.date, runId = captured.attempt.id
const missingAck = 'close_missing_receipt_attempt_without_review_or_billing_claim' as const

function fixture() {
  const { state, github: raw } = createFixture()
  state.login = 'ojfbot'; state.source = request.policySha
  const pr = makePullRequest(416)
  state.acceptPullNumbers.push(416)
  state.pullRequests.set(416, { ...pr, head: { ...pr.head, sha: request.headSha, ref: `accept/${date}` } })
  state.pullFiles.set(416, [{ filename: `_articles/${date}.md`, status: 'modified' }])
  const article = readFileSync(`_articles/${date}.md`, 'utf8').replace('status: "draft"', 'status: "accepted"')
  state.refFiles.set(`${request.headSha}:_articles/${date}.md`, article)
  state.refFiles.set(`${request.headSha}:actions/articles/${date}.json`, readFileSync(`actions/articles/${date}.json`, 'utf8'))
  const requestComment = Object.assign(makeComment(encodeEditorial(request), captured.requestComment.id, 'ojfbot', 416), captured.requestComment)
  const claim = Object.assign(makeComment('## Editorial execution claim\n' + JSON.stringify(captured.claim), captured.claimComment.id, 'github-actions[bot]', 416), captured.claimComment)
  state.prComments.set(416, [requestComment, claim])
  state.workflowRuns.set(runId, { ...captured.attempt }); state.workflowRunAttempts.set(`${runId}:1`, { ...captured.attempt }); state.runArtifacts.set(runId, [])
  let history: 'complete' | 'missing-total' | 'incomplete' | 'changed-total' = 'complete'
  const github: typeof raw = async (path, options) => {
    const response = await raw(path, options)
    if (path.includes('/actions/workflows/editorial-revise.yml/runs?')) {
      const body = z.object({ workflow_runs: z.array(z.unknown()) }).parse(await response.json())
      if (history === 'missing-total') return Response.json(body)
      if (history === 'incomplete') return Response.json({ ...body, total_count: body.workflow_runs.length + 1 })
      if (history === 'changed-total') return path.endsWith('page=1')
        ? Response.json({ ...body, total_count: 2 }, { headers: { link: '<https://api.github.com/next>; rel="next"' } })
        : Response.json({ workflow_runs: [], total_count: 1 })
      return Response.json({ ...body, total_count: state.workflowRuns.size })
    }
    if (options?.method === 'POST') {
      const comments = state.prComments.get(416)
      const appended = comments?.at(-1)
      if (!comments || !appended) throw new Error('No fixture append')
      appended.id = Math.max(...comments.slice(0, -1).map(c => c.id)) + 1
      appended.created_at = '2026-10-23T17:00:00Z'; appended.updated_at = appended.created_at
      appended.html_url = `https://github.com/ojfbot/daily-logger/pull/416#issuecomment-${appended.id}`
      return Response.json(appended, { status: 201 })
    }
    return response
  }
  const service = createEditorialService(github)
  return { state, github, service, requestComment, claim, setHistory(value: typeof history) { history = value } }
}
async function input(f: ReturnType<typeof fixture>) {
  const view = await f.service.load(date, 'ojfbot')
  if (view.status !== 'existing' || view.recovery.kind !== 'available') throw new Error('Missing explicit recovery projection')
  return { ...view.recovery.input, intent: 'resolve_editorial_request' as const, requestId: crypto.randomUUID(),
    acknowledgment: missingAck, reason: 'Retire only this immutable failed scheduling attempt; its terminal receipt is missing and review/billing remain unknown.' }
}
const receipt = (outcome: string) => makeComment('## Editorial execution receipt\n' + JSON.stringify({ requestDigest: editorialDigest(request),
  requestCommentId: captured.requestComment.id, runId, policySha: request.policySha, outcome }), captured.claimComment.id + 10, 'github-actions[bot]', 416)
const conflictingRunClaim = () => makeComment('## Editorial execution claim\n' + JSON.stringify({ ...captured.claim,
  requestId: crypto.randomUUID(), requestDigest: 'f'.repeat(64), requestCommentId: 1 }), captured.claimComment.id + 20, 'github-actions[bot]', 416)

it('offers explicit missing-outcome evidence for actual attempt39984220336 without inventing a receipt', async () => {
  const f = fixture(), before = await f.service.load(date, 'ojfbot')
  expect(before).toMatchObject({ status: 'existing', outstanding: true, requestState: { kind: 'outstanding' }, recovery: { kind: 'available',
    evidence: { receipt: { kind: 'missing-terminal-receipt' }, attempt: { runId: 39984220336, number: 1, status: 'completed', conclusion: 'failure' } } } })
  const original = f.state.prComments.get(416)?.map(c => c.body)
  const resolve = await input(f)
  expect(await f.service.write(resolve, 'ojfbot')).toMatchObject({ execution: 'not_started', reused: false })
  const after = await f.service.load(date, 'ojfbot')
  expect(after).toMatchObject({ status: 'existing', outstanding: false, requestState: { kind: 'owner_resolved' }, executionReadiness: { kind: 'ready' },
    resolutions: [{ record: { acknowledgment: missingAck, evidence: { receipt: { kind: 'missing-terminal-receipt' } } } }] })
  expect(f.state.prComments.get(416)?.slice(0, 2).map(c => c.body)).toEqual(original)
  expect(f.state.calls.filter(c => c.startsWith('POST '))).toEqual(['POST /repos/ojfbot/daily-logger/issues/416/comments'])
  expect(await f.service.write(resolve, 'ojfbot')).toMatchObject({ reused: true, execution: 'not_started' })
  const execution: Execution = { github: f.github, workspace: process.cwd(), policySha: request.policySha, runId, attempt: 1,
    event: { action: 'created', repository: { full_name: 'ojfbot/daily-logger' }, sender: { login: 'ojfbot' }, issue: { number: 416,
      pull_request: { url: `https://api.github.com${repo}/pulls/416` } }, comment: f.requestComment } }
  const replayClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T17:00:00Z'))
  try {
    await expect(admitEditorial(execution)).rejects.toThrow(/owner-resolved|no longer executable/i)
    replayClock.mockReturnValue(Date.parse(captured.requestComment.created_at) + 86_400_001)
    await expect(admitEditorial(execution)).rejects.toThrow('Request is outside the supported execution-history window.')
  } finally { replayClock.mockRestore() }
  expect(f.state.calls.filter(c => c.startsWith('POST '))).toEqual(['POST /repos/ojfbot/daily-logger/issues/416/comments'])
})

it.each(['active', 'rerun', 'wrong_run', 'wrong_policy', 'wrong_title', 'wrong_path', 'wrong_event', 'wrong_branch', 'duplicate_claim',
  'edited_claim', 'wrong_claim_input', 'missing_claim', 'receipt', 'success', 'artifact', 'missing_total', 'incomplete', 'changed_total',
  'competing_success_run', 'incomplete_comments', 'incomplete_artifacts', 'mismatched_receipt', 'same_run_claim'] as const)(
  'blocks missing-outcome recovery for %s before any append', async kind => {
    const f = fixture()
    const attempt = { ...captured.attempt }
    if (kind === 'active') Object.assign(attempt, { status: 'in_progress', conclusion: null })
    if (kind === 'rerun') attempt.run_attempt = 2
    if (kind === 'wrong_run') attempt.id++
    if (kind === 'wrong_policy') attempt.head_sha = 'f'.repeat(40)
    if (kind === 'wrong_title') attempt.display_title = 'Editorial continuation comment 1'
    if (kind === 'wrong_path') attempt.path = '.github/workflows/daily-blog.yml'
    if (kind === 'wrong_event') attempt.event = 'workflow_dispatch'
    if (kind === 'wrong_branch') attempt.head_branch = 'other'
    f.state.workflowRunAttempts.set(`${runId}:1`, attempt)
    if (kind === 'rerun') f.state.workflowRuns.set(runId, attempt)
    if (kind === 'duplicate_claim') f.state.prComments.get(416)?.push({ ...f.claim, id: f.claim.id + 1 })
    if (kind === 'same_run_claim') f.state.prComments.get(416)?.push(conflictingRunClaim())
    if (kind === 'edited_claim') f.claim.updated_at = '2026-10-24T00:00:00Z'
    if (kind === 'wrong_claim_input') f.claim.body = '## Editorial execution claim\n' + JSON.stringify({ ...captured.claim, inputHead: 'f'.repeat(40) })
    if (kind === 'missing_claim') f.state.prComments.set(416, [f.requestComment, makeComment('Ordinary report: receipt POST fetchfailed.', f.claim.id + 1, 'ojfbot', 416)])
    if (kind === 'receipt') f.state.prComments.get(416)?.push(receipt('failed'))
    if (kind === 'success') f.state.prComments.get(416)?.push(receipt('changed'))
    if (kind === 'mismatched_receipt') {
      const value = receipt('uncertain')
      value.body = '## Editorial execution receipt\n' + JSON.stringify({ requestDigest: 'f'.repeat(64), requestCommentId: 1, runId,
        policySha: request.policySha, outcome: 'uncertain' })
      f.state.prComments.get(416)?.push(value)
    }
    if (kind === 'artifact') f.state.runArtifacts.set(runId, [{ id: 1, name: 'unexpected-output' }])
    if (kind === 'competing_success_run') f.state.workflowRuns.set(runId + 1, { ...captured.attempt, id: runId + 1, conclusion: 'success' })
    if (kind === 'incomplete_comments') f.state.nextPageRoutes.add('/issues/416/comments')
    if (kind === 'incomplete_artifacts') f.state.nextPageRoutes.add(`/actions/runs/${runId}/artifacts`)
    if (kind === 'missing_total') f.setHistory('missing-total')
    if (kind === 'incomplete') f.setHistory('incomplete')
    if (kind === 'changed_total') f.setHistory('changed-total')
    let blocked = false
    try { const view = await f.service.load(date, 'ojfbot'); blocked = view.status === 'existing' && view.recovery.kind === 'blocked' } catch { blocked = true }
    expect(blocked).toBe(true)
    expect(f.state.calls.filter(c => c.startsWith('POST '))).toEqual([])
  })

it.each(['head', 'policy', 'owner', 'wrong_ack'] as const)('rejects %s drift or authority before owner append', async kind => {
  const f = fixture(), resolve = await input(f)
  if (kind === 'policy') f.state.source = 'f'.repeat(40)
  if (kind === 'head') {
    const pr = f.state.pullRequests.get(416); if (!pr) throw new Error('No PR')
    f.state.pullRequests.set(416, { ...pr, head: { ...pr.head, sha: 'f'.repeat(40) } })
  }
  const changed = kind === 'wrong_ack' ? { ...resolve, acknowledgment: 'close_uncertain_attempt_without_review_or_billing_claim' as const } : resolve
  await expect(f.service.write(changed, kind === 'owner' ? 'editor' : 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
  expect(f.state.calls.filter(c => c.startsWith('POST '))).toEqual([])
})

it.each(['receipt', 'success', 'artifact', 'rerun', 'claim', 'same_run_claim'] as const)('preserves owner history but holds later %s evidence', async kind => {
  const f = fixture(); await f.service.write(await input(f), 'ojfbot')
  if (kind === 'receipt' || kind === 'success') f.state.prComments.get(416)?.push(receipt(kind === 'success' ? 'changed' : 'uncertain'))
  if (kind === 'artifact') f.state.runArtifacts.set(runId, [{ id: 1, name: 'late-output' }])
  if (kind === 'rerun') f.state.workflowRuns.set(runId, { ...captured.attempt, run_attempt: 2 })
  if (kind === 'claim') f.state.prComments.get(416)?.push({ ...f.claim, id: f.claim.id + 20 })
  if (kind === 'same_run_claim') f.state.prComments.get(416)?.push(conflictingRunClaim())
  const view = await f.service.load(date, 'ojfbot')
  expect(view).toMatchObject({ status: 'existing', requestState: { kind: 'owner_resolved' }, executionReadiness: { kind: 'blocked' }, resolutions: [{ record: { acknowledgment: missingAck } }] })
  await expect(f.service.write({ schemaVersion: 1, intent: 'request_clean_acceptance', requestId: crypto.randomUUID(), date,
    pullRequest: 416, headSha: request.headSha, articleBlobSha: request.articleBlobSha, registryBlobSha: request.registryBlobSha,
    policySha: f.state.source }, 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
})

it('ignores ordinary later correspondence but rejects terminal evidence arriving during resolution checks', async () => {
  const f = fixture(), resolve = await input(f)
  f.state.prComments.get(416)?.push(makeComment('Ordinary outcome correspondence: fetchfailed does not grant recovery or another attempt.', f.claim.id + 10, 'ojfbot', 416))
  expect(await f.service.write(resolve, 'ojfbot')).toMatchObject({ execution: 'not_started', reused: false })
  const race = fixture(), target = await input(race); let reads = 0
  const service = createEditorialService(async (path, options) => {
    if (path.includes('/issues/416/comments?') && ++reads === 2) race.state.prComments.get(416)?.push(receipt('uncertain'))
    return race.github(path, options)
  })
  await expect(service.write(target, 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
  expect(race.state.calls.filter(c => c.startsWith('POST '))).toEqual([])
})

it('holds a receipt in the recheck-to-append gap without removing the owner record or starting execution', async () => {
  const f = fixture(), target = await input(f)
  const service = createEditorialService(async (path, options) => {
    if (options?.method === 'POST') f.state.prComments.get(416)?.push(receipt('uncertain'))
    return f.github(path, options)
  })
  expect(await service.write(target, 'ojfbot')).toMatchObject({ execution: 'not_started', reused: false })
  expect(await f.service.load(date, 'ojfbot')).toMatchObject({ status: 'existing', requestState: { kind: 'owner_resolved' },
    executionReadiness: { kind: 'blocked' }, resolutions: [{ record: { acknowledgment: missingAck } }] })
})

it('refuses a same-run conflicting claim arriving after preview before any owner append', async () => {
  const f = fixture(), target = await input(f)
  f.state.prComments.get(416)?.push(conflictingRunClaim())
  expect(await f.service.load(date, 'ojfbot')).toMatchObject({ status: 'existing', outstanding: true, recovery: { kind: 'blocked' } })
  await expect(f.service.write(target, 'ojfbot')).rejects.toMatchObject({ outcome: 'rejected_before_append' })
  expect(f.state.calls.filter(c => c.startsWith('POST '))).toEqual([])
})

it('refuses owner-shaped missing-receipt history if its own prefix contains a receipt', async () => {
  const f = fixture(); await f.service.write(await input(f), 'ojfbot')
  const comments = f.state.prComments.get(416), resolution = comments?.at(-1)
  const original = decodeEditorial(resolution?.body ?? '')
  if (!comments || !resolution || original?.intent !== 'resolve_editorial_request') throw new Error('No resolution')
  const injected = receipt('uncertain'); injected.id = f.claim.id - 1
  comments.splice(1, 0, injected)
  const value = JSON.parse(injected.body.split('\n').slice(1).join('\n'))
  const entries = [
    { commentId: f.requestComment.id, kind: 'owner-record', semanticDigest: editorialDigest(request) },
    { commentId: injected.id, kind: 'receipt', semanticDigest: editorialDigest(value) },
    { commentId: f.claim.id, kind: 'claim', semanticDigest: editorialDigest(captured.claim) },
  ]
  resolution.body = encodeEditorial(editorialRecordSchema.parse({ ...original, prefix: { ...original.prefix, sha256: editorialDigest(entries) } }))
  await expect(f.service.load(date, 'ojfbot')).rejects.toThrow(/did not prove a missing terminal receipt/)
})
