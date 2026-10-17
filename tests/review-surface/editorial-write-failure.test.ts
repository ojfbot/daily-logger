import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/article-reviews.js'
import { createEditorialService, decodeEditorial, EditorialWriteFailure, versionTitle } from '../../api/_lib/editorial-continuation.js'
import { ReviewError } from '../../api/_lib/article-review-sources.js'
import { editorialInputSchema, editorialProjectionSchema, editorialWriteFailureSchema, type EditorialInput } from '../../shared/article-review.js'
import { createFixture, makeComment, makePullRequest, today } from './fixture.js'

const auth = vi.hoisted(() => ({ authenticated: true }))
vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => auth.authenticated ? 'fixture-token' : null }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.authenticated = true })

async function invoke(method = 'GET', body?: unknown, csrf = true) {
  const req = Object.assign(new IncomingMessage(new Socket()), { query: { date: today, view: 'editorial' }, cookies: {}, body })
  req.method = method
  if (csrf) req.headers['x-requested-with'] = 'XMLHttpRequest'
  let output: unknown
  const res = Object.assign(new ServerResponse(req), { status(n: number) { res.statusCode = n; return res }, json(value: unknown) { output = value; return res }, send() { throw new Error('Unexpected send') }, redirect() { throw new Error('Unexpected redirect') } })
  await handler(req, res)
  return { status: res.statusCode, output }
}

async function setup(intent: EditorialInput['intent']) {
  const { state, github } = createFixture()
  state.login = 'ojfbot'
  const original = makePullRequest(42)
  const pr = { ...original, head: { ...original.head, ref: `accept/${today}` }, body: 'Original submitted feedback' }
  state.acceptPullNumbers.push(42)
  state.pullRequests.set(42, pr)
  state.pullFiles.set(42, [{ filename: `_articles/${today}.md`, status: 'modified' }])
  state.refFiles.set(`${pr.head.sha}:_articles/${today}.md`, '---\nstatus: accepted\n---\nPinned article')
  vi.stubEnv('ALLOWED_USERS', 'ojfbot,editor')
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => github(url.replace('https://api.github.com', ''), options))
  const view = editorialProjectionSchema.parse((await invoke()).output)
  if (view.status !== 'existing') throw new Error('Missing acceptance PR')
  let input = editorialInputSchema.parse({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: pr.head.sha, visibleBlobSha: view.article.blobSha, supersedes: view.originalDigest,
    feedback: { version: 2, notes: [{ kind: 'root', content: 'Follow-up feedback' }] } })
  if (intent === 'request_editorial_revision') {
    expect((await invoke('POST', input)).status).toBe(200)
    const saved = editorialProjectionSchema.parse((await invoke()).output)
    if (saved.status !== 'existing' || !saved.versions[0]) throw new Error('Missing feedback version')
    input = editorialInputSchema.parse({ schemaVersion: 1, intent, requestId: crypto.randomUUID(), date: today,
      pullRequest: 42, headSha: pr.head.sha, articleBlobSha: saved.article.blobSha,
      feedbackId: input.requestId, feedbackDigest: saved.versions[0].digest })
  }
  state.calls.length = 0
  return { state, github, pr, input, initialComments: state.prComments.get(42)?.length ?? 0 }
}

function expectFailure(output: unknown, input: EditorialInput, outcome: 'rejected_before_append' | 'uncertain') {
  expect(editorialWriteFailureSchema.parse(output)).toMatchObject({ requestId: input.requestId, intent: input.intent, outcome })
}

describe.each(['append_editorial_feedback', 'request_editorial_revision'] satisfies EditorialInput['intent'][])('%s failure phases', intent => {
  it.each(['owner', 'head', 'history_schema', 'history_conflict', 'source_unavailable'])('binds pre-append %s rejection with zero appends', async kind => {
    const f = await setup(intent)
    if (kind === 'owner') f.state.login = 'editor'
    const input = { ...f.input, ...(kind === 'head' ? { headSha: 'd'.repeat(40) } : {}) }
    if (kind === 'history_schema' || kind === 'history_conflict') {
      const comments = f.state.prComments.get(42) ?? []
      const body = kind === 'history_conflict' ? `${versionTitle}malformed` : `${versionTitle}\n<!-- EDITORIAL_CONTINUATION_V1_START -->\ne30=\n<!-- EDITORIAL_CONTINUATION_V1_END -->`
      comments.push(makeComment(body, 99, 'ojfbot', 42))
      f.state.prComments.set(42, comments)
    }
    if (kind === 'source_unavailable') f.state.failRoutes.add('/issues/42/comments')
    const before = f.state.prComments.get(42)?.length ?? 0
    const response = await invoke('POST', input)
    expect(response.status).toBe(kind === 'owner' ? 403 : kind === 'history_schema' ? 400 : kind === 'source_unavailable' ? 503 : 409)
    expectFailure(response.output, input, 'rejected_before_append')
    expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
    expect(f.state.prComments.get(42) ?? []).toHaveLength(before)
  })

  it.each(['head_move_409', 'malformed_record_409', 'record_schema_400', 'record_json_400', 'post_response_schema_400', 'unexpected_author_503'])('retains uncertainty after durable append: %s', async kind => {
    const f = await setup(intent)
    let appended = false
    vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
      const path = url.replace('https://api.github.com', '')
      if ((options?.method ?? 'GET') === 'POST') {
        const response = await f.github(path, options)
        appended = true
        if (kind === 'post_response_schema_400') return Response.json({ incomplete: 'acknowledgment' }, { status: 201 })
        if (kind === 'unexpected_author_503') return Response.json({ ...await response.json(), user: { login: 'editor' } }, { status: 201 })
        return response
      }
      if (appended && path === '/repos/ojfbot/daily-logger/pulls/42' && kind === 'head_move_409') return Response.json({ ...f.pr, head: { ...f.pr.head, sha: 'b'.repeat(40) } })
      if (appended && path.startsWith('/repos/ojfbot/daily-logger/issues/42/comments') && ['malformed_record_409', 'record_schema_400', 'record_json_400'].includes(kind)) {
        const payload = kind === 'record_json_400' ? '{' : '{}'
        const body = kind === 'malformed_record_409' ? `${versionTitle}malformed` : `${versionTitle}\n<!-- EDITORIAL_CONTINUATION_V1_START -->\n${Buffer.from(payload).toString('base64')}\n<!-- EDITORIAL_CONTINUATION_V1_END -->`
        return Response.json([...(f.state.prComments.get(42) ?? []), makeComment(body, 99, 'ojfbot', 42)])
      }
      return f.github(path, options)
    })
    const response = await invoke('POST', f.input)
    expect(response.status).toBe(kind.endsWith('409') ? 409 : kind.endsWith('503') ? 503 : 400)
    expectFailure(response.output, f.input, 'uncertain')
    expect(f.state.prComments.get(42)).toHaveLength(f.initialComments + 1)
    expect(f.state.calls.filter(call => call.startsWith('POST '))).toHaveLength(1)
    expect(decodeEditorial(f.state.prComments.get(42)?.at(-1)?.body ?? '')?.requestId).toBe(f.input.requestId)
  })

  it.each(['auth', 'csrf', 'allowlist', 'parser'])('leaves early %s failures generic and performs no append', async kind => {
    const f = await setup(intent)
    if (kind === 'auth') auth.authenticated = false
    if (kind === 'allowlist') f.state.login = 'outsider'
    const response = await invoke('POST', kind === 'parser' ? { ...f.input, requestId: 'invalid-uuid' } : f.input, kind !== 'csrf')
    expect(response.status).toBe(kind === 'auth' ? 401 : kind === 'parser' ? 400 : 403)
    expect(editorialWriteFailureSchema.safeParse(response.output).success).toBe(false)
    expect(response.output).toEqual({ error: expect.any(String) })
    expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
    expect(f.state.prComments.get(42) ?? []).toHaveLength(f.initialComments)
  })

  it('keeps an append transport exception uncertain even without an observed fixture append', async () => {
    const f = await setup(intent)
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') throw new Error('Connection lost before acknowledgment')
      return f.github(url.replace('https://api.github.com', ''), options)
    })
    const response = await invoke('POST', f.input)
    expect(response.status).toBe(503)
    expectFailure(response.output, f.input, 'uncertain')
    expect(f.state.prComments.get(42) ?? []).toHaveLength(f.initialComments)
  })

  it('does not treat a moved head and empty fresh history as a fence against an old append', async () => {
    const f = await setup(intent)
    let arrive: (() => void) | undefined
    let release: (() => void) | undefined
    const arrived = new Promise<void>(resolve => { arrive = resolve })
    const blocked = new Promise<void>(resolve => { release = resolve })
    let posts = 0
    vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST' && ++posts === 1) { arrive?.(); await blocked }
      return f.github(url.replace('https://api.github.com', ''), options)
    })
    const oldPending = invoke('POST', f.input)
    await arrived
    const movedHead = 'b'.repeat(40)
    f.state.pullRequests.set(42, { ...f.pr, head: { ...f.pr.head, sha: movedHead } })
    f.state.refFiles.set(`${movedHead}:_articles/${today}.md`, '---\nstatus: accepted\n---\nPinned article')
    try {
      const fresh = editorialProjectionSchema.parse((await invoke()).output)
      if (fresh.status !== 'existing') throw new Error('Missing fresh projection')
      expect(fresh.pullRequest.headSha).toBe(movedHead)
      expect(intent === 'append_editorial_feedback' ? fresh.versions : fresh.requests).toHaveLength(0)
      expect(f.state.prComments.get(42) ?? []).toHaveLength(f.initialComments)
      expect((await invoke('POST', { ...f.input, requestId: crypto.randomUUID(), headSha: movedHead })).status).toBe(200)
    } finally { release?.() }
    const oldResponse = await oldPending
    expect(oldResponse.status).toBe(409)
    expectFailure(oldResponse.output, f.input, 'uncertain')
    expect(f.state.prComments.get(42)).toHaveLength(f.initialComments + 2)
    expect(decodeEditorial(f.state.prComments.get(42)?.at(-1)?.body ?? '')?.requestId).toBe(f.input.requestId)
  })
})

it('encodes an oversized feedback comment before crossing the append boundary', async () => {
  const f = await setup('append_editorial_feedback')
  if (f.input.intent !== 'append_editorial_feedback') throw new Error('Wrong test input')
  const input = { ...f.input, feedback: { version: 2, notes: [{ kind: 'root', content: '雪'.repeat(16000) }] } }
  const response = await invoke('POST', input)
  expect(response.status).toBe(400)
  expectFailure(response.output, f.input, 'rejected_before_append')
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toEqual([])
})

it('preserves the service cause and validated binding without adding HTTP policy', async () => {
  const f = await setup('request_editorial_revision')
  const cause = new Error('Discovery failed')
  const service = createEditorialService(async () => { throw cause })
  const failure: unknown = await service.write(f.input, 'ojfbot').catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(EditorialWriteFailure)
  if (!(failure instanceof EditorialWriteFailure)) throw new Error('Missing phase-aware failure')
  expect(failure).toMatchObject({ cause, requestId: f.input.requestId, intent: f.input.intent, outcome: 'rejected_before_append' })
  const ownerFailure: unknown = await service.write(f.input, 'editor').catch((error: unknown) => error)
  if (!(ownerFailure instanceof EditorialWriteFailure)) throw new Error('Missing owner failure')
  expect(ownerFailure.cause).toBeInstanceOf(ReviewError)
  if (!(ownerFailure.cause instanceof ReviewError)) throw new Error('Missing original cause')
  expect(ownerFailure.cause.status).toBe(403)
  await expect(service.write({ ...f.input, requestId: 'invalid-uuid' }, 'ojfbot')).rejects.not.toBeInstanceOf(EditorialWriteFailure)
})

it('requires strict bound failure fields', () => {
  const valid = { error: 'Rejected', outcome: 'rejected_before_append', requestId: crypto.randomUUID(), intent: 'append_editorial_feedback' }
  expect(editorialWriteFailureSchema.safeParse(valid).success).toBe(true)
  for (const invalid of [{ ...valid, extra: true }, { ...valid, requestId: 'invalid' }, { ...valid, outcome: 'rejected' }, { ...valid, intent: 'comment' }]) {
    expect(editorialWriteFailureSchema.safeParse(invalid).success).toBe(false)
  }
})
