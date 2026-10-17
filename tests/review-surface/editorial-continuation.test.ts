import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/article-reviews.js'
import { createFixture, makePullRequest, seedOpenReview, makeComment, today } from './fixture.js'
vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => 'fixture-token' }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
async function invoke(method = 'GET', body?: unknown, csrf = true) {
  const req = Object.assign(new IncomingMessage(new Socket()), { query: { date: today, view: 'editorial' }, body })
  req.method = method
  if (csrf) req.headers['x-requested-with'] = 'XMLHttpRequest'
  let output: unknown
  const res = Object.assign(new ServerResponse(req), { status(n: number) { res.statusCode = n; return res }, json(value: unknown) { output = value; return res } })
  await handler(req, res)
  return { status: res.statusCode, output }
}
function setup() {
  const { state, github } = createFixture()
  state.login = 'ojfbot'
  const pr = makePullRequest(42)
  const text = '---\nstatus: accepted\n---\nPinned PR article 雪'
  state.acceptPullNumbers.push(42)
  state.pullRequests.set(42, { ...pr, head: { ...pr.head, ref: `accept/${today}` }, body: 'Original submitted feedback' })
  state.pullFiles.set(42, [{ filename: `_articles/${today}.md`, status: 'modified' }])
  state.refFiles.set(`${pr.head.sha}:_articles/${today}.md`, text)
  vi.stubEnv('ALLOWED_USERS', 'ojfbot,editor')
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => github(url.replace('https://api.github.com', ''), options))
  return { state, pr, text }
}
describe('continued editorial feedback through authenticated handler', () => {
  it('recovers the existing acceptance PR and its distinct pinned article without writing', async () => {
    const { state, text } = setup()
    const result = await invoke()
    expect(result.status).toBe(200)
    expect(result.output).toMatchObject({ status: 'existing', pullRequest: { number: 42 }, article: { text }, eligible: true })
    expect(state.calls.filter(call => !call.startsWith('GET '))).toEqual([])
  })
})

import { editorialProjectionSchema } from '../../shared/article-review.js'
async function saved() {
  const f = setup()
  const view = editorialProjectionSchema.parse((await invoke()).output)
  if (view.status !== 'existing') throw new Error('No acceptance PR')
  const input = { schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: f.pr.head.sha, visibleBlobSha: view.article.blobSha, supersedes: view.originalDigest,
    feedback: { version: 2, notes: [{ kind: 'root', content: ' \t雪 e\u0301 😀\n@claude /run\n<!-- EDITORIAL_CONTINUATION_V1_START -->\n ' }] } }
  return { ...f, input }
}
it('appends literal feedback on the same acceptance PR and safely reuses its UUID', async () => {
  const { input, state } = await saved()
  seedOpenReview(state, 43)
  const original = state.pullRequests.get(42)?.body
  const first = await invoke('POST', input)
  expect(first.status).toBe(200)
  expect(first.output).toMatchObject({ reused: false, execution: 'not_started' })
  expect((await invoke('POST', input)).output).toMatchObject({ reused: true })
  const view = editorialProjectionSchema.parse((await invoke()).output)
  expect(view).toMatchObject({ status: 'existing', originalBody: original, versions: [{ record: { feedback: input.feedback } }], requests: [] })
  expect(state.prComments.get(42)?.[0]?.body).not.toContain('@claude')
  expect(state.pullRequests.get(42)?.body).toBe(original)
  expect(state.calls.filter(call => !call.startsWith('GET '))).toEqual(['POST /repos/ojfbot/daily-logger/issues/42/comments'])
  expect((await invoke('POST', { ...input, feedback: { version: 2, notes: [{ kind: 'root', content: 'changed' }] } })).status).toBe(409)
})
it.each(['actor', 'pr_author', 'csrf', 'forgery', 'head', 'blob', 'parent'])('rejects invalid %s without appending', async kind => {
  const { input, state } = await saved()
  if (kind === 'actor') state.login = 'editor'
  if (kind === 'pr_author') { const pr = state.pullRequests.get(42); if (!pr) throw new Error('Missing PR'); state.pullRequests.set(42, { ...pr, user: { login: 'editor' } }) }
  const invalid = { ...input, ...(kind === 'forgery' ? { actor: 'ojfbot' } : {}), ...(kind === 'head' ? { headSha: 'd'.repeat(40) } : {}), ...(kind === 'blob' ? { visibleBlobSha: 'd'.repeat(40) } : {}), ...(kind === 'parent' ? { supersedes: 'd'.repeat(64) } : {}) }
  expect((await invoke('POST', invalid, kind !== 'csrf')).status).toBeGreaterThanOrEqual(400)
  expect(state.calls.filter(call => !call.startsWith('GET '))).toEqual([])
})
it('uses separate explicit request binding and blocks a second outstanding request', async () => {
  const { input, state } = await saved()
  await invoke('POST', input)
  const view = editorialProjectionSchema.parse((await invoke()).output)
  if (view.status !== 'existing' || !view.versions[0]) throw new Error('No feedback')
  const request = { schemaVersion: 1, intent: 'request_editorial_revision', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: view.pullRequest.headSha, articleBlobSha: view.article.blobSha,
    feedbackId: input.requestId, feedbackDigest: view.versions[0].digest }
  expect((await invoke('POST', { ...request, articleBlobSha: 'd'.repeat(40) })).status).toBe(409)
  expect((await invoke('POST', request)).output).toMatchObject({ execution: 'requested' })
  expect((await invoke('POST', request)).output).toMatchObject({ reused: true })
  expect((await invoke('POST', { ...request, requestId: crypto.randomUUID() })).status).toBe(409)
  expect(state.calls.filter(call => !call.startsWith('GET '))).toEqual(Array(2).fill('POST /repos/ojfbot/daily-logger/issues/42/comments'))
})
it('fails closed for ambiguous and incomplete acceptance discovery', async () => {
  const { state } = setup()
  state.acceptPullNumbers.push(43)
  const pr = state.pullRequests.get(42); if (!pr) throw new Error('Missing PR')
  state.pullRequests.set(43, { ...pr, number: 43 })
  expect((await invoke()).status).toBe(409)
  state.acceptPullNumbers.pop()
  state.failRoutes.add('/issues/42/comments')
  expect((await invoke()).status).toBe(503)
})

it('retains identical duplicate receipts and blocks conflicting outstanding requests', async () => {
  const { input, state } = await saved()
  await invoke('POST', input)
  const comments = state.prComments.get(42); if (!comments?.[0]) throw new Error('Missing saved version')
  comments.push(makeComment(comments[0].body, 2, 'ojfbot', 42))
  const view = editorialProjectionSchema.parse((await invoke()).output)
  if (view.status !== 'existing' || !view.versions[0]) throw new Error('Missing history')
  expect(view.versions).toHaveLength(1)
  expect(view.versions[0].duplicateUrls).toHaveLength(1)
  const request = { schemaVersion: 1, intent: 'request_editorial_revision', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: view.pullRequest.headSha, articleBlobSha: view.article.blobSha,
    feedbackId: input.requestId, feedbackDigest: view.versions[0].digest }
  await invoke('POST', request)
  const latest = comments.at(-1); if (!latest) throw new Error('No request')
  const { decodeEditorial, encodeEditorial } = await import('../../api/_lib/editorial-continuation.js')
  const record = decodeEditorial(latest.body); if (!record) throw new Error('No record')
  comments.push(makeComment(encodeEditorial({ ...record, requestId: crypto.randomUUID() }), 4, 'ojfbot', 42))
  expect((await invoke()).status).toBe(409)
})
