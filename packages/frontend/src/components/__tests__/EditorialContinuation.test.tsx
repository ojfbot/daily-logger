/// <reference types="node" />
// @vitest-environment jsdom
import { emptyActionFile } from '../../../../../src/__tests__/action-store-fixture.js'
import { act, createElement, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EditorialContinuation } from '../EditorialContinuation.tsx'
import { EditorialSidebar } from '../EditorialSidebar.tsx'
const today = '2000-01-01', blob = 'b'.repeat(40)
import { createEditorialService } from '../../../../../api/_lib/editorial-continuation.js'
import { editorialProjectionSchema, editorialInputSchema, type EditorialProjection } from '../../../../../shared/article-review.js'
vi.mock('../../store/hooks.ts', () => ({ useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { user: { login: 'ojfbot', authorized: true } }, chat: { threads: {}, threadOrder: [] } }) }))
let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function fixture() {
  const pr = { number: 42, html_url: 'https://github.com/ojfbot/daily-logger/pull/42', state: 'open', merged_at: null,
    body: 'Original preserved 雪\n  ', user: { login: 'ojfbot' }, author_association: 'OWNER',
    created_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z',
    head: { sha: 'a'.repeat(40), ref: `accept/${today}`, repo: { full_name: 'ojfbot/daily-logger' } },
    base: { ref: 'main', repo: { full_name: 'ojfbot/daily-logger' } } }
  const comments: Array<{ id: number; body: string; user: { login: string }; author_association: string; created_at: string; updated_at: string; html_url: string }> = []
  const calls: string[] = []
  const f = { state: { calls }, github: async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'; calls.push(`${method} ${path}`)
    if (path.includes('/issues/42/comments')) {
      if (method === 'POST') {
        const comment = { id: comments.length + 1, body: JSON.parse(String(options?.body)).body, user: { login: 'ojfbot' }, author_association: 'OWNER', created_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z', html_url: `https://github.com/ojfbot/daily-logger/pull/42#issuecomment-${comments.length + 1}` }
        comments.push(comment); return Response.json(comment)
      }
      return Response.json(comments)
    }
    if (path.includes('/pulls/42/files')) return Response.json([{ filename: `_articles/${today}.md`, status: 'modified' }])
    if (path.includes('/pulls/42')) return Response.json(pr)
    if (path.includes('/pulls?')) return Response.json([pr])
    if (path.includes('/git/ref/heads/main')) return Response.json({ object: { sha: 'c'.repeat(40) } })
    if (path.includes('/git/commits/')) return Response.json({ tree: { sha: 'f'.repeat(40) } })
    if (path.includes('/git/trees/')) return Response.json({ truncated: false, tree: path.endsWith('f'.repeat(40)) ? [{ path: '_articles', mode: '040000', sha: '0'.repeat(40) }, { path: 'actions', mode: '040000', sha: '1'.repeat(40) }] : path.endsWith('0'.repeat(40)) ? [{ path: `${today}.md`, mode: '100644', sha: 'd'.repeat(40) }] : path.endsWith('1'.repeat(40)) ? [{ path: 'articles', mode: '040000', sha: '2'.repeat(40) }] : [{ path: `${today}.json`, mode: '100644', sha: 'e'.repeat(40) }] })
    if (path.includes('/contents/actions/articles/')) return Response.json({ type: 'file', encoding: 'base64', sha: 'e'.repeat(40), content: Buffer.from(JSON.stringify(emptyActionFile(today))).toString('base64') })
    if (path.includes('/contents/')) return Response.json({ type: 'file', encoding: 'base64', sha: path.endsWith('c'.repeat(40)) ? blob : 'd'.repeat(40), content: Buffer.from('---\nstatus: accepted\n---\nPinned revised article, different from main').toString('base64') })
    throw new Error(`Unexpected ${path}`)
  } }
  const service = createEditorialService(f.github)
  const posts: unknown[] = []
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const input = editorialInputSchema.parse(JSON.parse(String(options.body))); posts.push(input)
      return Response.json(await service.write(input, 'ojfbot'))
    }
    return Response.json(await service.load(today, 'ojfbot'))
  })
  await act(async () => root.render(createElement(EditorialSidebar, { date: today, articleTitle: 'Fixture', visibleBlobSha: blob })))
  return { ...f, posts, service }
}
function button(label: string) { const found = [...container.querySelectorAll('button')].find(item => item.textContent === label); if (!found) throw new Error(`Missing ${label}`); return found }
it('recovers an existing acceptance PR and keeps main and pinned article distinct', async () => {
  const f = await fixture()
  expect(container.textContent).toContain('PR #42')
  expect(container.textContent).toContain('Pinned revised article, different from main')
  expect(container.textContent).toContain(blob)
  expect(container.textContent).toContain('Original preserved 雪\n  ')
  expect(container.textContent).not.toContain('ACCEPT DRAFT')
  expect(button('Request another article revision').disabled).toBe(true)
  expect(f.posts).toEqual([])
})
it('literal Save and a separately reviewed Request traverse the real service as different operations', async () => {
  const f = await fixture()
  const input = container.querySelector('textarea'); if (!input) throw new Error('No textarea')
  const literal = ' \t雪 e\u0301 😀\n@claude /run\n<!-- EDITORIAL_CONTINUATION_V1_START -->\n '
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('No setter')
  await act(async () => { setter.call(input, literal); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => button('Save new feedback version').click())
  expect(f.posts).toHaveLength(1)
  expect(f.posts[0]).toMatchObject({ intent: 'append_editorial_feedback', feedback: { notes: [{ content: literal }] } })
  expect(button('Request another article revision').disabled).toBe(true)
  const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]'); if (!checkbox) throw new Error('No preview acknowledgment')
  await act(async () => checkbox.click())
  expect(button('Request another article revision').disabled).toBe(false)
  await act(async () => button('Request another article revision').click())
  expect(f.posts).toHaveLength(2)
  expect(f.posts[1]).toMatchObject({ intent: 'request_editorial_revision', pullRequest: 42 })
  expect(container.textContent).toContain('outstanding')
  expect(f.state.calls.filter(call => !call.startsWith('GET '))).toEqual(Array(2).fill('POST /repos/ojfbot/daily-logger/issues/42/comments'))
})
it('discovery failure never enables another acceptance attempt', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: 'Incomplete' }, { status: 503 }))
  await act(async () => root.render(createElement(EditorialSidebar, { date: today, articleTitle: 'Fixture', visibleBlobSha: blob })))
  expect(button('ACCEPT DRAFT').disabled).toBe(true)
  expect(container.textContent).toContain('discovery unavailable')
})

it('ignores an older refresh response after a newer response has applied', async () => {
  const f = await fixture()
  const oldView = editorialProjectionSchema.parse(await f.service.load(today, 'ojfbot'))
  if (oldView.status !== 'existing') throw new Error('Missing existing PR')
  const newView = { ...oldView, pullRequest: { ...oldView.pullRequest, headSha: 'e'.repeat(40) }, article: { ...oldView.article, blobSha: 'f'.repeat(40), text: 'New pinned preview' } }
  function deferred() {
    let finish: (value: Response) => void = () => { throw new Error('Uninitialized response') }
    const promise = new Promise<Response>(resolve => { finish = resolve })
    return { promise, finish: (value: Response) => finish(value) }
  }
  const first = deferred(), second = deferred()
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
  const refresh = button('Refresh acceptance history')
  await act(async () => { refresh.click(); refresh.click() })
  await act(async () => second.finish(Response.json(newView)))
  expect(container.textContent).toContain('New pinned preview')
  await act(async () => first.finish(Response.json(oldView)))
  expect(container.textContent).toContain('New pinned preview')
  expect(container.textContent).toContain('e'.repeat(40))
})
it('a new head/blob cannot inherit the previous acknowledgment even before passive effects', async () => {
  const f = await fixture()
  const initial = await f.service.load(today, 'ojfbot')
  if (initial.status !== 'existing') throw new Error('Missing PR')
  await f.service.write({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: initial.pullRequest.headSha, visibleBlobSha: blob, supersedes: initial.originalDigest,
    feedback: { version: 2, notes: [{ kind: 'root', content: 'Saved note' }] } }, 'ojfbot')
  const saved = await f.service.load(today, 'ojfbot')
  if (saved.status !== 'existing') throw new Error('Missing PR')
  sessionStorage.setItem(`dl-editorial-continuation:ojfbot:${today}:42`, JSON.stringify({ version: 2, notes: [{ kind: 'root', content: 'Saved note' }] }))
  const observed: boolean[] = []
  function Probe({ view }: { view: Extract<EditorialProjection, { status: 'existing' }> }) {
    useLayoutEffect(() => { observed.push(button('Request another article revision').disabled) })
    return createElement(EditorialContinuation, { view, date: today, login: 'ojfbot', visibleBlobSha: blob, refresh: async () => {} })
  }
  await act(async () => root.render(createElement(Probe, { view: saved })))
  const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]'); if (!checkbox) throw new Error('Missing acknowledgment')
  await act(async () => checkbox.click())
  expect(button('Request another article revision').disabled).toBe(false)
  const changed = { ...saved, pullRequest: { ...saved.pullRequest, headSha: 'e'.repeat(40) }, article: { ...saved.article, blobSha: 'f'.repeat(40) } }
  await act(async () => root.render(createElement(Probe, { view: changed })))
  expect(observed.at(-1)).toBe(true)
  expect(button('Request another article revision').disabled).toBe(true)
})
it('removing an earlier continued note preserves the surviving DOM, focus, caret and literal payload', async () => {
  const literal = ' \t雪 e\u0301 😀\n---\n@claude /run\n '
  sessionStorage.setItem(`dl-editorial-continuation:ojfbot:${today}:42`, JSON.stringify({ version: 2, notes: [
    { kind: 'root', content: 'Remove A' }, { kind: 'root', content: 'Keep B' }, { kind: 'root', content: literal },
  ] }))
  const f = await fixture()
  const inputs = [...container.querySelectorAll('textarea')]
  const survivor = inputs[2]; if (!survivor) throw new Error('Missing third input')
  const originalId = survivor.id
  survivor.focus(); survivor.setSelectionRange(3, 8)
  const remove = container.querySelector<HTMLButtonElement>('[aria-label="Remove continued suggestion 1"]'); if (!remove) throw new Error('Missing first remove control')
  await act(async () => remove.click())
  expect(survivor.isConnected).toBe(true)
  expect([...container.querySelectorAll('textarea')][1]).toBe(survivor)
  expect(survivor.id).toBe(originalId)
  expect(document.activeElement).toBe(survivor)
  expect([survivor.selectionStart, survivor.selectionEnd]).toEqual([3, 8])
  expect(survivor.value).toBe(literal)
  await act(async () => button('Save new feedback version').click())
  expect(f.posts).toHaveLength(1)
  expect(f.posts[0]).toMatchObject({ feedback: { version: 2, notes: [{ kind: 'root', content: 'Keep B' }, { kind: 'root', content: literal }] } })
  const posted = editorialInputSchema.parse(f.posts[0])
  if (posted.intent !== 'append_editorial_feedback') throw new Error('Wrong operation')
  expect(posted.feedback.notes).toEqual([{ kind: 'root', content: 'Keep B' }, { kind: 'root', content: literal }])
})

it('keeps visible save confirmation and receipt after discovery refresh without storage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied') })
  const f = await fixture()
  const input = container.querySelector('textarea'); if (!input) throw new Error('Missing editor')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('No setter')
  await act(async () => { setter.call(input, 'literal 雪'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  let finishRefresh: (value: Response) => void = () => { throw new Error('Missing refresh') }
  const refreshed = new Promise<Response>(resolve => { finishRefresh = resolve })
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const posted = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(posted)
      return Response.json(await f.service.write(posted, 'ojfbot'))
    }
    return refreshed
  })
  await act(async () => button('Save new feedback version').click())
  await act(async () => finishRefresh(Response.json(await f.service.load(today, 'ojfbot'))))
  expect(container.textContent).toContain('Feedback version saved. No revision was requested.')
  expect([...container.querySelectorAll('a')].some(link => link.textContent === 'Read receipt')).toBe(true)
  expect(container.querySelector('textarea')).toBe(input)
  expect(input.value).toBe('literal 雪')
  expect(f.posts).toHaveLength(1)
  vi.restoreAllMocks()
})

function denyStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied') })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Denied') })
}
async function editFirst(content: string) {
  const input = container.querySelector('textarea'); if (!input) throw new Error('Missing editor')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('Missing setter')
  await act(async () => { setter.call(input, content); input.dispatchEvent(new Event('input', { bubbles: true })) })
  return input
}
it('requires successful explicit refresh before exact same-ID retry without storage, and preserves its confirmation', async () => {
  denyStorage()
  const f = await fixture()
  const input = await editFirst(' \t雪 e\u0301 😀\n  ')
  let failRefresh = true, attempts = 0
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const posted = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(posted)
      if (++attempts === 1) return Response.json({}, { status: 503 })
      return Response.json(await f.service.write(posted, 'ojfbot'))
    }
    return failRefresh ? Response.json({}, { status: 503 }) : Response.json(await f.service.load(today, 'ojfbot'))
  })
  await act(async () => button('Save new feedback version').click())
  expect(button('Retry same submission').disabled).toBe(true)
  await act(async () => button('Refresh acceptance history').click())
  expect(button('Retry same submission').disabled).toBe(true)
  expect(container.querySelector('textarea')).toBe(input)
  expect(container.textContent).toContain('discovery unavailable')
  failRefresh = false
  await act(async () => button('Refresh acceptance history').click())
  expect(button('Retry same submission').disabled).toBe(false)
  expect(f.posts).toHaveLength(1)
  await act(async () => button('Retry same submission').click())
  expect(f.posts).toHaveLength(2)
  expect(f.posts[1]).toEqual(f.posts[0])
  expect(container.textContent).toContain('Feedback version saved.')
  expect(container.querySelector('textarea')).toBe(input)
  expect(f.state.calls.filter(call => call.startsWith('POST '))).toHaveLength(1)
})
it('reconciles persisted but lost acknowledgment through GET only without storage or a replay', async () => {
  denyStorage()
  const f = await fixture()
  await editFirst('Keep the persisted original 雪')
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const posted = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(posted)
      await f.service.write(posted, 'ojfbot')
      throw new Error('Acknowledgment lost')
    }
    return Response.json(await f.service.load(today, 'ojfbot'))
  })
  await act(async () => button('Save new feedback version').click())
  expect(button('Retry same submission').disabled).toBe(true)
  await act(async () => button('Refresh acceptance history').click())
  expect(container.textContent).toContain('Confirmed in refreshed history.')
  expect(container.querySelectorAll('a')).toSatisfy((links: NodeListOf<HTMLAnchorElement>) => [...links].some(link => link.textContent === 'Read receipt'))
  expect(f.posts).toHaveLength(1)
  expect([...container.querySelectorAll('button')].some(item => item.textContent === 'Retry same submission')).toBe(false)
})
it('retains DOM, draft and selection while refresh loads or fails; new writes stay disabled', async () => {
  denyStorage()
  const f = await fixture()
  const input = await editFirst('Unsent literal 雪')
  input.focus(); input.setSelectionRange(2, 6)
  let finish: (response: Response) => void = () => { throw new Error('No deferred request') }
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { finish = resolve }))
  await act(async () => button('Refresh acceptance history').click())
  expect(container.querySelector('textarea')).toBe(input)
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6])
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(button('Request another article revision').disabled).toBe(true)
  expect(container.textContent).toContain('Displayed history may be stale')
  await act(async () => finish(Response.json({}, { status: 503 })))
  expect(container.querySelector('textarea')).toBe(input)
  expect(input.value).toBe('Unsent literal 雪')
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(f.posts).toEqual([])
})
it('blocks frozen retries against a changed head and clears memory at the real date context boundary', async () => {
  denyStorage()
  const f = await fixture()
  await editFirst('Old-context note')
  const oldView = await f.service.load(today, 'ojfbot')
  if (oldView.status !== 'existing') throw new Error('Missing PR')
  const changed = { ...oldView, pullRequest: { ...oldView.pullRequest, headSha: 'e'.repeat(40) }, article: { ...oldView.article, blobSha: 'f'.repeat(40) } }
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => options?.method === 'POST' ? Response.json({}, { status: 503 }) : Response.json(changed))
  await act(async () => button('Save new feedback version').click())
  await act(async () => button('Refresh acceptance history').click())
  expect(button('Retry same submission').disabled).toBe(true)
  expect(container.textContent).toContain('submission target changed')
  await act(async () => root.render(createElement(EditorialSidebar, { date: '2000-01-02', articleTitle: 'Other date', visibleBlobSha: blob })))
  expect(container.querySelector('textarea')?.value).toBe('')
  expect([...container.querySelectorAll('button')].some(item => item.textContent === 'Retry same submission')).toBe(false)
})
it('tells an untouched fresh tab to copy the saved version rather than claiming it was edited', async () => {
  denyStorage()
  const f = await fixture()
  const initial = await f.service.load(today, 'ojfbot')
  if (initial.status !== 'existing') throw new Error('Missing PR')
  await f.service.write({ schemaVersion: 1, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), date: today,
    pullRequest: 42, headSha: initial.pullRequest.headSha, visibleBlobSha: blob, supersedes: initial.originalDigest,
    feedback: { version: 2, notes: [{ kind: 'root', content: 'Saved version' }] } }, 'ojfbot')
  await act(async () => button('Refresh acceptance history').click())
  expect(container.textContent).toContain('Copy prior version to select the saved feedback')
  expect(container.textContent).not.toContain('Save the edited full version')
  await act(async () => button('Copy prior version').click())
  expect(container.textContent).toContain('Review the pinned PR-head article before requesting its revision.')
})

it('a late old-date submission and its refresh cannot replace the current-date editor or receipt', async () => {
  denyStorage()
  const f = await fixture()
  await editFirst('Old date pending text')
  let finishPost: (value: Response) => void = () => { throw new Error('Missing post') }
  const post = new Promise<Response>(resolve => { finishPost = resolve })
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => options?.method === 'POST' ? post : Response.json(await f.service.load(today, 'ojfbot')))
  await act(async () => button('Save new feedback version').click())
  await act(async () => root.render(createElement(EditorialSidebar, { date: '2000-01-02', articleTitle: 'Next date', visibleBlobSha: blob })))
  const current = await editFirst('Current date draft')
  await act(async () => finishPost(Response.json({ requestId: crypto.randomUUID(), url: 'https://github.com/ojfbot/daily-logger/pull/42#issuecomment-999', reused: false, execution: 'not_started' })))
  expect(container.querySelector('textarea')).toBe(current)
  expect(current.value).toBe('Current date draft')
  expect(container.textContent).not.toContain('Feedback version saved.')
  expect([...container.querySelectorAll('a')].some(link => link.textContent === 'Read receipt')).toBe(false)
})

it('reconciles a persisted revision request with lost acknowledgment without a second model authorization', async () => {
  denyStorage()
  const f = await fixture()
  await editFirst('Feedback for one explicit revision')
  await act(async () => button('Save new feedback version').click())
  const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]'); if (!checkbox) throw new Error('Missing preview')
  await act(async () => checkbox.click())
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const posted = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(posted)
      await f.service.write(posted, 'ojfbot')
      return Response.json({}, { status: 503 })
    }
    return Response.json(await f.service.load(today, 'ojfbot'))
  })
  await act(async () => button('Request another article revision').click())
  expect(button('Retry same submission').disabled).toBe(true)
  await act(async () => button('Refresh acceptance history').click())
  expect(container.textContent).toContain('Revision request confirmed in refreshed history.')
  expect(container.textContent).toContain('outstanding')
  expect(f.posts).toHaveLength(2)
  expect(f.posts.filter(item => editorialInputSchema.parse(item).intent === 'request_editorial_revision')).toHaveLength(1)
  expect(button('Request another article revision').disabled).toBe(true)
})

const pendingKey = `dl-editorial-continuation:ojfbot:${today}:42:pending`
type Intent = 'append_editorial_feedback' | 'request_editorial_revision'
async function prepareIntent(intent: Intent) {
  const f = await fixture()
  await editFirst('Frozen original 雪')
  if (intent === 'request_editorial_revision') {
    await act(async () => button('Save new feedback version').click())
    const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]')
    if (!checkbox) throw new Error('Missing preview')
    await act(async () => checkbox.click())
    f.posts.length = 0
  }
  return { ...f, label: intent === 'append_editorial_feedback' ? 'Save new feedback version' : 'Request another article revision' }
}
function rejection(input: ReturnType<typeof editorialInputSchema.parse>, extra: object = {}) {
  return Response.json({ error: 'Encoded feedback exceeds the limit', outcome: 'rejected_before_append', requestId: input.requestId, intent: input.intent, ...extra }, { status: 400 })
}
for (const intent of ['append_editorial_feedback', 'request_editorial_revision'] satisfies Intent[]) {
  it(`${intent}: releases only the live first bound rejection and uses a new UUID`, async () => {
    const f = await prepareIntent(intent)
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      const input = editorialInputSchema.parse(JSON.parse(String(options?.body))); f.posts.push(input)
      return rejection(input)
    })
    await act(async () => button(f.label).click())
    expect(sessionStorage.getItem(pendingKey)).toBeNull()
    expect(container.textContent).toContain('Encoded feedback exceeds the limit')
    expect(container.querySelector('textarea')?.disabled).toBe(false)
    expect(button(f.label).disabled).toBe(false)
    await act(async () => button(f.label).click())
    expect(f.posts).toHaveLength(2)
    expect(editorialInputSchema.parse(f.posts[0]).requestId).not.toBe(editorialInputSchema.parse(f.posts[1]).requestId)
  })
  for (const remount of [false, true]) {
    it(`${intent}: unknown then rejected retry retains frozen input and edits${remount ? ' across remount' : ''}`, async () => {
      const f = await prepareIntent(intent)
      let attempts = 0
      vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'POST') return Response.json(await f.service.load(today, 'ojfbot'))
        const input = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(input)
        return ++attempts === 1 ? Response.json({}, { status: 503 }) : rejection(input)
      })
      await act(async () => button(f.label).click())
      const frozen = sessionStorage.getItem(pendingKey)
      await editFirst('Independent new local text')
      await act(async () => button('Add another edit suggestion').click())
      expect(container.querySelectorAll('textarea')).toHaveLength(2)
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove continued suggestion 2"]')?.click())
      if (remount) {
        await act(async () => root.render(null))
        await act(async () => root.render(createElement(EditorialSidebar, { date: today, articleTitle: 'Remount', visibleBlobSha: blob })))
      }
      expect(f.posts).toHaveLength(1)
      expect(button('Retry same submission').disabled).toBe(true)
      await act(async () => button('Refresh acceptance history').click())
      await act(async () => button('Retry same submission').click())
      expect(f.posts[1]).toEqual(f.posts[0])
      expect(sessionStorage.getItem(pendingKey)).toBe(frozen)
      expect(button('Save new feedback version').disabled).toBe(true)
      expect(button('Request another article revision').disabled).toBe(true)
      expect(container.querySelector('textarea')?.value).toBe('Independent new local text')
      expect(container.querySelector('textarea')?.disabled).toBe(false)
      expect(container.textContent).toContain('manual GitHub diagnosis')
      if (intent === 'request_editorial_revision') {
        await act(async () => button('Copy prior version').click())
        expect(container.querySelector('textarea')?.value).toBe('Frozen original 雪')
        expect(sessionStorage.getItem(pendingKey)).toBe(frozen)
      }
    })
  }
}
it.each(['not-json', '{"requestId":"broken"}', '  '])('preserves unreadable pending evidence %s and allows only local operations', async raw => {
  sessionStorage.setItem(pendingKey, raw)
  await fixture()
  expect(sessionStorage.getItem(pendingKey)).toBe(raw)
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(button('Request another article revision').disabled).toBe(true)
  await editFirst('Still editable')
  await act(async () => button('Add another edit suggestion').click())
  expect(container.querySelectorAll('textarea')).toHaveLength(2)
  expect(container.textContent).toContain('retained submission cannot be read')
  expect(sessionStorage.getItem(pendingKey)).toBe(raw)
})
for (const intent of ['append_editorial_feedback', 'request_editorial_revision'] satisfies Intent[]) {
it.each(['unbound', 'uuid', 'intent', 'extra', 'invalid-json', 'receipt-uuid', 'receipt-execution'])(`${intent}: keeps %s response uncertain`, async mode => {
  const f = await prepareIntent(intent)
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    const input = editorialInputSchema.parse(JSON.parse(String(options?.body))); f.posts.push(input)
    if (mode === 'unbound') return Response.json({ error: 'No binding' }, { status: 400 })
    if (mode === 'uuid') return rejection(input, { requestId: crypto.randomUUID() })
    if (mode === 'intent') return rejection(input, { intent: intent === 'append_editorial_feedback' ? 'request_editorial_revision' : 'append_editorial_feedback' })
    if (mode === 'extra') return rejection(input, { unexpected: true })
    if (mode === 'invalid-json') return new Response('Not JSON', { status: 400 })
    return Response.json({ requestId: mode === 'receipt-uuid' ? crypto.randomUUID() : input.requestId, url: 'https://github.com/ojfbot/daily-logger/pull/42#issuecomment-1', reused: false, execution: mode === 'receipt-execution' ? (intent === 'append_editorial_feedback' ? 'requested' : 'not_started') : (intent === 'append_editorial_feedback' ? 'not_started' : 'requested') })
  })
  await act(async () => button(f.label).click())
  expect(sessionStorage.getItem(pendingKey)).not.toBeNull()
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(button('Retry same submission').disabled).toBe(true)
})
}
function deferred<T>() {
  let finish: (value: T) => void = () => { throw new Error('Uninitialized') }
  const promise = new Promise<T>(resolve => { finish = resolve })
  return { promise, finish: (value: T) => finish(value) }
}
it('an old POST cannot clear a newer pending submission after history reconciles it', async () => {
  const f = await prepareIntent('append_editorial_feedback')
  const initial = await f.service.load(today, 'ojfbot')
  if (initial.status !== 'existing') throw new Error('Missing view')
  await act(async () => root.render(createElement(EditorialContinuation, { view: initial, date: today, login: 'ojfbot', visibleBlobSha: blob, refresh: async () => true })))
  const first = deferred<Response>(), second = deferred<Response>()
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method !== 'POST') return Response.json(await f.service.load(today, 'ojfbot'))
    const input = editorialInputSchema.parse(JSON.parse(String(options.body))); f.posts.push(input)
    if (f.posts.length === 1) { await f.service.write(input, 'ojfbot'); return first.promise }
    return second.promise
  })
  await act(async () => button(f.label).click())
  const firstInput = editorialInputSchema.parse(f.posts[0])
  const history = await f.service.load(today, 'ojfbot')
  if (history.status !== 'existing') throw new Error('Missing history')
  // A fresh full projection may arrive independently of this outstanding POST.
  await act(async () => root.render(createElement(EditorialContinuation, { view: history, date: today, login: 'ojfbot', visibleBlobSha: blob, refresh: async () => true })))
  await editFirst('New pending draft')
  await act(async () => button(f.label).click())
  const newer = sessionStorage.getItem(pendingKey)
  await act(async () => first.finish(Response.json({ requestId: firstInput.requestId, url: 'https://github.com/ojfbot/daily-logger/pull/42#issuecomment-1', reused: false, execution: 'not_started' })))
  expect(sessionStorage.getItem(pendingKey)).toBe(newer)
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(container.textContent).toContain('Submission is in progress')
  await act(async () => second.finish(Response.json({}, { status: 503 })))
})
it('a GET started before a retry cannot authorize a later retry of the same input', async () => {
  const f = await prepareIntent('append_editorial_feedback')
  vi.stubGlobal('fetch', async () => Response.json({}, { status: 503 }))
  await act(async () => button(f.label).click())
  const view = await f.service.load(today, 'ojfbot')
  if (view.status !== 'existing') throw new Error('Missing view')
  const oldGet = deferred<boolean>(), newGet = deferred<boolean>()
  let count = 0
  const refresh = () => ++count === 1 ? oldGet.promise : newGet.promise
  await act(async () => root.render(createElement(EditorialContinuation, { view, date: today, login: 'ojfbot', visibleBlobSha: blob, refresh })))
  await act(async () => { button('Refresh acceptance history').click(); button('Refresh acceptance history').click() })
  await act(async () => newGet.finish(true))
  await act(async () => button('Retry same submission').click())
  expect(button('Retry same submission').disabled).toBe(true)
  await act(async () => oldGet.finish(true))
  expect(button('Retry same submission').disabled).toBe(true)
})
for (const intent of ['append_editorial_feedback', 'request_editorial_revision'] satisfies Intent[]) {
  it(`${intent}: edits while posting remain local and success preserves the edited draft`, async () => {
    const f = await prepareIntent(intent), response = deferred<Response>()
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      if (options?.method !== 'POST') return Response.json(await f.service.load(today, 'ojfbot'))
      f.posts.push(editorialInputSchema.parse(JSON.parse(String(options.body))))
      return response.promise
    })
    await act(async () => { button(f.label).click(); button(f.label).click() })
    expect(f.posts).toHaveLength(1)
    const posted = editorialInputSchema.parse(f.posts[0])
    await editFirst('Edited while first POST is in flight')
    await act(async () => button('Add another edit suggestion').click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove continued suggestion 2"]')?.click())
    expect(container.querySelector('textarea')?.disabled).toBe(false)
    expect(button('Save new feedback version').disabled).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null')).toEqual(posted)
    await act(async () => response.finish(Response.json(await f.service.write(posted, 'ojfbot'))))
    expect(container.querySelector('textarea')?.value).toBe('Edited while first POST is in flight')
    expect(sessionStorage.getItem(pendingKey)).toBeNull()
  })
  it(`${intent}: reconciles a full historical match after the head moved with no replay`, async () => {
    const f = await prepareIntent(intent)
    let pending: ReturnType<typeof editorialInputSchema.parse> | undefined
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      pending = editorialInputSchema.parse(JSON.parse(String(options?.body)))
      return Response.json({}, { status: 503 })
    })
    await act(async () => button(f.label).click())
    if (!pending) throw new Error('Missing submitted input')
    await f.service.write(pending, 'ojfbot')
    const history = await f.service.load(today, 'ojfbot')
    if (history.status !== 'existing') throw new Error('Missing history')
    const changed = { ...history, pullRequest: { ...history.pullRequest, headSha: 'e'.repeat(40) }, article: { ...history.article, blobSha: 'f'.repeat(40) } }
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await act(async () => root.render(createElement(EditorialContinuation, { view: changed, date: today, login: 'ojfbot', visibleBlobSha: blob, refresh: async () => true })))
    expect(sessionStorage.getItem(pendingKey)).toBeNull()
    expect(container.textContent).toContain('confirmed in refreshed history'.replace('confirmed', intent === 'append_editorial_feedback' ? 'Confirmed' : 'confirmed'))
    expect(fetch).not.toHaveBeenCalled()
  })
}
it.each(['success', 'rejected'])('%s settlement blocks new writes and preserves same-UUID different stored payload', async outcome => {
  const f = await prepareIntent('append_editorial_feedback'), response = deferred<Response>()
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    const posted = editorialInputSchema.parse(JSON.parse(String(options?.body))); f.posts.push(posted)
    return response.promise
  })
  await act(async () => button(f.label).click())
  const input = editorialInputSchema.parse(f.posts[0])
  if (input.intent !== 'append_editorial_feedback') throw new Error('Wrong intent')
  const different = { ...input, feedback: { version: 2, notes: [{ kind: 'root', content: 'Different stored evidence' }] } }
  sessionStorage.setItem(pendingKey, JSON.stringify(different))
  await act(async () => response.finish(outcome === 'rejected' ? rejection(input) : Response.json({ requestId: input.requestId, url: 'https://github.com/ojfbot/daily-logger/pull/42#issuecomment-1', reused: false, execution: 'not_started' })))
  expect(sessionStorage.getItem(pendingKey)).toBe(JSON.stringify(different))
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(button('Request another article revision').disabled).toBe(true)
  expect(container.textContent).toContain('Stored submission evidence changed')
})
it('local note controls remain enabled with stale history and an outstanding request', async () => {
  const f = await prepareIntent('request_editorial_revision')
  await act(async () => button(f.label).click())
  const view = await f.service.load(today, 'ojfbot')
  if (view.status !== 'existing') throw new Error('Missing history')
  await act(async () => root.render(createElement(EditorialContinuation, { view, date: today, login: 'ojfbot', visibleBlobSha: blob, freshness: 'unavailable', refresh: async () => false })))
  await editFirst('Useful unsent edits')
  await act(async () => button('Add another edit suggestion').click())
  expect(container.querySelectorAll('textarea')).toHaveLength(2)
  expect(button('Copy prior version').disabled).toBe(false)
  await act(async () => button('Copy prior version').click())
  expect(container.querySelector('textarea')?.value).toBe('Frozen original 雪')
  expect(button('Save new feedback version').disabled).toBe(true)
  expect(button('Request another article revision').disabled).toBe(true)
})
