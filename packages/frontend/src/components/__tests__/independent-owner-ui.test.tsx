// @vitest-environment jsdom
// Read the same frozen native fixture bytes through cwd, avoiding Vite/jsdom's HTTP import.meta.url.
vi.mock('../../../../../tests/review-surface/article-snapshots.js', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const directory = process.cwd() + '/tests/review-surface/fixtures/'
  const manifest = JSON.parse(readFileSync(directory + 'manifest.json', 'utf8'))
  return { readArticleSnapshot: (ref: string, date: string) => {
    const matches = manifest.articles.filter((entry: { sourceCommitSha: string; date: string }) => entry.sourceCommitSha === ref && entry.date === date)
    if (matches.length !== 1) throw new Error('No unique native snapshot')
    const snapshot = matches[0], bytes = readFileSync(directory + snapshot.file)
    const blob = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    if (blob !== snapshot.blobSha || createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) throw new Error('Native fixture byte mismatch')
    return { ...snapshot, content: bytes.toString('utf8') }
  } }
})
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorialContinuation } from '../EditorialContinuation.tsx'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createEditorialService, decodeEditorial, editorialDigest } from '../../../../../api/_lib/editorial-continuation.js'
import { editorialProjectionSchema } from '../../../../../shared/article-review.js'
import { emptyActionFile } from '../../../../../src/__tests__/action-store-fixture.js'
import { createFixture, makeComment, makePullRequest, today } from '../../../../../tests/review-surface/fixture.js'

vi.mock('../../../../../api/_lib/cookies.js', () => ({ extractToken: () => 'fixture-token' }))
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


// Independent review controls. Prepended with the real failedCleanAttempt and
// resolutionInput helpers from the frozen native resolution test file.
async function renderRecovered(view: Extract<ReturnType<typeof editorialProjectionSchema.parse>, { status: 'existing' }>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await act(async () => root.render(createElement(EditorialContinuation, {
    view, date: today, login: 'ojfbot', visibleBlobSha: view.article.blobSha, refresh: async () => true,
  })))
  const button = (label: string) => {
    const found = [...container.querySelectorAll('button')].find(item => item.textContent === label)
    if (!found) throw new Error(`Missing ${label}`)
    return found
  }
  return { container, button, close: async () => { await act(async () => root.unmount()); container.remove() } }
}

it('independent: actual resolved service history permits literal save-only UI submission without model request', async () => {
  sessionStorage.clear()
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const view = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (view.status !== 'existing') throw new Error('Missing resolved projection')
  const literal = ' \tGenuine owner notes 雪 e\u0301 😀\n@claude /run\n  '
  sessionStorage.setItem(`dl-editorial-continuation:ojfbot:${today}:42`, JSON.stringify({ version: 2, notes: [{ kind: 'root', content: literal }] }))
  const posts: unknown[] = []
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    const input = JSON.parse(String(options?.body))
    posts.push(input)
    return Response.json(await f.service.write(input, 'ojfbot'))
  })
  const ui = await renderRecovered(view)
  try {
    expect(ui.container.textContent).toContain('Owner-resolved prior editorial request')
    expect(ui.container.textContent).toContain('does not establish successful review, provider absence, or billing status')
    expect([...ui.container.querySelectorAll('button')].some(item => /resolve|recovery|clean acceptance/i.test(item.textContent ?? ''))).toBe(false)
    expect(ui.button('Save new feedback version').disabled).toBe(false)
    expect(ui.button('Request another article revision').disabled).toBe(true)
    await act(async () => ui.button('Save new feedback version').click())
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ intent: 'append_editorial_feedback', feedback: { notes: [{ content: literal }] } })
    expect(ui.container.textContent).toContain('Feedback version saved. No revision was requested.')
    const saved = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
    expect(saved).toMatchObject({ status: 'existing', outstanding: false, requestState: { kind: 'owner_resolved' },
      requests: [{ record: { intent: 'request_clean_acceptance' } }], versions: [{ record: { intent: 'append_editorial_feedback' } }] })
  } finally { await ui.close() }
})

it('independent: blocked execution readiness disables only the model request and explains its hold', async () => {
  sessionStorage.clear()
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const before = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (before.status !== 'existing') throw new Error('Missing resolved projection')
  const feedback = { schemaVersion: 1 as const, intent: 'append_editorial_feedback' as const, requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: before.pullRequest.headSha, visibleBlobSha: before.article.blobSha, supersedes: before.originalDigest,
    feedback: { version: 2 as const, notes: [{ kind: 'root' as const, content: 'Genuine saved follow-up.' }] } }
  await f.service.write(feedback, 'ojfbot')
  f.state.workflowRuns.set(102, { ...f.run, id: 102 })
  const view = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (view.status !== 'existing' || view.executionReadiness.kind !== 'blocked') throw new Error('Missing native execution hold')
  const reason = view.executionReadiness.reason
  sessionStorage.setItem(`dl-editorial-continuation:ojfbot:${today}:42`, JSON.stringify(feedback.feedback))
  const ui = await renderRecovered(view)
  try {
    expect(ui.button('Save new feedback version').disabled).toBe(false)
    const checkbox = ui.container.querySelector<HTMLInputElement>('input[type=checkbox]')
    if (!checkbox) throw new Error('Missing article review checkbox')
    await act(async () => checkbox.click())
    const requestEnabled = !ui.button('Request another article revision').disabled
    console.log(JSON.stringify({ control: 'native-owner-resolved-uncovered-old-run', requestEnabled,
      saveEnabled: !ui.button('Save new feedback version').disabled, reason,
      reasonVisible: ui.container.textContent?.includes(reason),
      genericReadyHelpVisible: ui.container.textContent?.includes('Request uses the saved version and reviewed PR article shown here.') }))
    expect(ui.button('Request another article revision').disabled).toBe(true)
    expect(ui.container.textContent).toContain(reason)
  } finally { await ui.close() }
})

it('independent: historical resolution remains attributed and save-only usable after later head/main movement', async () => {
  sessionStorage.clear()
  const f = await failedCleanAttempt()
  await f.service.write(await resolutionInput(f), 'ojfbot')
  const nextHead = 'e'.repeat(40)
  const pr = f.state.pullRequests.get(42)
  if (!pr) throw new Error('Missing PR')
  f.state.pullRequests.set(42, { ...pr, head: { ...pr.head, sha: nextHead } })
  f.state.refFiles.set(`${nextHead}:_articles/${today}.md`, f.article)
  f.state.refFiles.set(`${nextHead}:actions/articles/${today}.json`, f.registry)
  f.state.source = 'f'.repeat(40)
  const view = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (view.status !== 'existing') throw new Error('Missing later projection')
  sessionStorage.setItem(`dl-editorial-continuation:ojfbot:${today}:42`, JSON.stringify({ version: 2, notes: [{ kind: 'root', content: 'Unsaved notes survive branch movement.' }] }))
  const ui = await renderRecovered(view)
  try {
    expect(ui.container.textContent).toContain('Owner-resolved prior editorial request')
    expect(ui.container.textContent).toContain('Shared-account identity does not identify a person or agent.')
    expect(ui.container.textContent).toContain(nextHead)
    expect(ui.button('Save new feedback version').disabled).toBe(false)
    expect(ui.button('Request another article revision').disabled).toBe(true)
    expect(ui.container.querySelector('textarea')?.value).toBe('Unsaved notes survive branch movement.')
  } finally { await ui.close() }
})

