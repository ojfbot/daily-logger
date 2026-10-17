/// <reference types="node" />
// @vitest-environment jsdom
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
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
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
    if (path.includes('/contents/')) return Response.json({ type: 'file', encoding: 'base64', sha: path.endsWith('c'.repeat(40)) ? blob : 'd'.repeat(40), content: Buffer.from('Pinned revised article, different from main').toString('base64') })
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
    let finish: (value: Response) => void = (_value) => { throw new Error('Uninitialized response') }
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
