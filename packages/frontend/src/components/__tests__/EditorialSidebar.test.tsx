// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorialSidebar } from '../EditorialSidebar.tsx'
import { stampDraft } from '../../utils/stampDraft.ts'
const identity = vi.hoisted(() => ({ login: 'editor', includeInRevision: true, blob: 'a'.repeat(40) }))

vi.mock('../../utils/stampDraft.ts', () => ({ stampDraft: vi.fn() }))
vi.mock('../../store/hooks.ts', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({
    auth: { user: { login: identity.login, authorized: true } },
    chat: {
      threads: { section: { date: '2026-10-10', section: 'What shipped', messages: [{ role: 'user', content: 'Section note', articleBlobSha: identity.blob, includeInRevision: identity.includeInRevision }] } },
      threadOrder: ['section'],
    },
  }),
}))

let container: HTMLDivElement
let root: Root

function textarea(index: number) {
  const result = container.querySelectorAll('textarea')[index]
  if (!result) throw new Error(`Missing note ${index}`)
  return result
}

async function enter(index: number, content: string) {
  const element = textarea(index)
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('Missing textarea value setter')
  await act(async () => {
    setter.call(element, content)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((element) =>
    element.getAttribute('aria-label') === label || element.textContent?.trim() === label)
  if (!button) throw new Error(`Missing button ${label}`)
  await act(async () => button.click())
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(stampDraft).mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'none' })))
  identity.login = 'editor'
  identity.includeInRevision = true
  identity.blob = 'a'.repeat(40)
  sessionStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-10', articleTitle: 'Friday', visibleBlobSha: 'a'.repeat(40) })))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('editorial revision notes', () => {
  it.each(['restored', 'historical'])('does not automatically resubmit %s section correspondence', async (kind) => {
    identity.includeInRevision = kind !== 'restored'
    if (kind === 'historical') identity.blob = 'b'.repeat(40)
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-10', articleTitle: 'Friday', visibleBlobSha: 'a'.repeat(40) })))
    vi.mocked(stampDraft).mockResolvedValue({ prNumber: 42, prUrl: 'https://github.com/ojfbot/daily-logger/pull/42' })
    await click('ACCEPT DRAFT')
    expect(stampDraft).toHaveBeenCalledExactlyOnceWith('2026-10-10', 'Friday', 'editor', undefined)
  })

  it('adds, edits and removes notes, then sends each remaining note and section feedback once', async () => {
    vi.mocked(stampDraft).mockResolvedValue({ prNumber: 42, prUrl: 'https://github.com/ojfbot/daily-logger/pull/42' })
    await enter(0, 'First note')
    await click('Add another edit suggestion')
    await enter(1, 'Second note')
    await click('Add another edit suggestion')
    await enter(2, 'Third note')
    await enter(0, 'Edited first note')
    await click('Remove edit suggestion 2')
    expect(container.textContent).toContain('2 suggestions')
    await click('ACCEPT WITH REVISIONS')
    expect(stampDraft).toHaveBeenCalledExactlyOnceWith('2026-10-10', 'Friday', 'editor',
      { version: 2, notes: [
        { kind: 'root', content: 'Edited first note' },
        { kind: 'root', content: 'Third note' },
        { kind: 'section', section: 'What shipped', content: 'Section note' },
      ] })
    expect(sessionStorage.getItem('dl-editorial:editor:2026-10-10')).toBeNull()
    expect(container.textContent).toContain('PR #42 opened')
  })

  it('keeps all notes after failure and restores them after a remount', async () => {
    vi.mocked(stampDraft).mockRejectedValue(new Error('Network unavailable'))
    await enter(0, 'Keep first')
    await click('Add another edit suggestion')
    await enter(1, 'Keep second')
    await click('ACCEPT WITH REVISIONS')
    expect(textarea(0).value).toBe('Keep first')
    expect(textarea(1).value).toBe('Keep second')
    expect(container.textContent).toContain('Network unavailable')
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-10', articleTitle: 'Friday', visibleBlobSha: 'a'.repeat(40) })))
    expect(textarea(0).value).toBe('Keep first')
    expect(textarea(1).value).toBe('Keep second')
  })

  it('prevents empty additions and disables editing while opening the PR', async () => {
    vi.mocked(stampDraft).mockImplementation(() => new Promise(() => {}))
    const add = container.querySelector('button[aria-label="Add another edit suggestion"]')
    expect(add?.getAttribute('disabled')).not.toBeNull()
    await enter(0, 'Only note')
    await click('ACCEPT WITH REVISIONS')
    expect(textarea(0).disabled).toBe(true)
    expect(container.querySelectorAll('button:not(:disabled)')).toHaveLength(0)
  })

  it('clears the submitted article draft when success arrives after switching articles', async () => {
    let finish: (result: Awaited<ReturnType<typeof stampDraft>>) => void = () => { throw new Error('Submission not started') }
    vi.mocked(stampDraft).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await enter(0, 'Submitted Friday note')
    await click('ACCEPT WITH REVISIONS')
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-11', articleTitle: 'Saturday', visibleBlobSha: 'a'.repeat(40) })))
    await enter(0, 'Keep Saturday note')
    await act(async () => finish({ prNumber: 42, prUrl: 'https://github.com/ojfbot/daily-logger/pull/42' }))
    expect(sessionStorage.getItem('dl-editorial:editor:2026-10-10')).toBeNull()
    expect(sessionStorage.getItem('dl-editorial:editor:2026-10-11')).toBe('["Keep Saturday note"]')
  })

  it('does not persist an untouched empty draft or allow whitespace-only additions', async () => {
    expect(container.querySelector('label')?.textContent?.trim()).toBe('Edit suggestion')
    expect(sessionStorage.getItem('dl-editorial:editor:2026-10-10')).toBeNull()
    await enter(0, '   \n  ')
    expect(container.querySelector('button[aria-label="Add another edit suggestion"]')?.hasAttribute('disabled')).toBe(true)
    expect(container.querySelectorAll('textarea')).toHaveLength(1)
  })

  it.each(['{broken', '{}', '[1]', '[]'])('recovers from invalid stored draft %s', async (stored) => {
    sessionStorage.setItem('dl-editorial:editor:2026-10-11', stored)
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-11', articleTitle: 'Saturday', visibleBlobSha: 'a'.repeat(40) })))
    expect(textarea(0).value).toBe('')
    expect(container.querySelectorAll('textarea')).toHaveLength(1)
  })

  it('preserves nonblank root-note whitespace through the real HTTP PR body and omits blank notes', async () => {
    const actual = await vi.importActual<typeof import('../../utils/stampDraft.ts')>('../../utils/stampDraft.ts')
    vi.mocked(stampDraft).mockImplementation(actual.stampDraft)
    const request = vi.fn<typeof fetch>(async (input, options) => {
      const path = String(input), method = options?.method ?? 'GET'
      if (path.includes('/api/article-reviews')) return Response.json({ status: 'none' })
      if (path.includes('/git/refs/heads/accept/') && method === 'GET') return new Response('{}', { status: 404 })
      if (path.includes('/contents/')) return Response.json({ content: btoa('---\nstatus: "draft"\n---\nFriday'), sha: 'article-sha' })
      if (path.includes('/git/refs/heads/main')) return Response.json({ object: { sha: 'main-sha' } })
      if (path.includes('/git/commits/') && method === 'GET') return Response.json({ tree: { sha: 'tree-sha' } })
      if (path.endsWith('/git/trees') || path.endsWith('/git/commits')) return Response.json({ sha: 'prepared-sha' })
      if (path.endsWith('/pulls')) return Response.json({ number: 42, html_url: 'https://github.com/ojfbot/daily-logger/pull/42' })
      return Response.json({})
    })
    vi.stubGlobal('fetch', request)
    const literal = ' \t\nHTTP first\n---\n## Section: Not a section\n<!-- EDITORIAL_FEEDBACK_END -->\n雪\n \t '
    await enter(0, literal)
    await click('Add another edit suggestion')
    await enter(1, 'HTTP second')
    await click('Add another edit suggestion')
    await enter(2, ' \t\n  ')
    expect(container.querySelector('button[aria-label="Add another edit suggestion"]')?.hasAttribute('disabled')).toBe(true)
    await click('ACCEPT WITH REVISIONS')
    const prRequest = request.mock.calls.find(([path, options]) => String(path).endsWith('/pulls') && options?.method === 'POST')
    if (typeof prRequest?.[1]?.body !== 'string') throw new Error('Missing HTTP PR body')
    const payload: { body: string } = JSON.parse(prRequest[1].body)
    const encoded = payload.body.match(/<!-- EDITORIAL_FEEDBACK_V2_START -->\n([^\n]+)\n<!-- EDITORIAL_FEEDBACK_V2_END -->/)?.[1]
    if (!encoded) throw new Error('Missing encoded feedback')
    const feedback = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))))
    expect(feedback).toEqual({ version: 2, notes: [
      { kind: 'root', content: literal },
      { kind: 'root', content: 'HTTP second' },
      { kind: 'section', section: 'What shipped', content: 'Section note' },
    ] })
    expect(prRequest[1].headers).toMatchObject({ 'X-Requested-With': 'XMLHttpRequest' })
    expect(prRequest[1].credentials).toBe('same-origin')
    expect(container.textContent).toContain('PR #42 opened')
  })

  it('allows successful submission even when draft storage throws', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked') })
    try {
      vi.mocked(stampDraft).mockResolvedValue({ prNumber: 42, prUrl: 'https://github.com/ojfbot/daily-logger/pull/42' })
      await enter(0, 'In-memory note')
      await click('ACCEPT WITH REVISIONS')
      expect(container.textContent).toContain('PR #42 opened')
    } finally {
      write.mockRestore()
      remove.mockRestore()
    }
  })

  it('isolates user drafts and labels every input', async () => {
    await enter(0, 'Editor private draft')
    identity.login = 'other-editor'
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-10', articleTitle: 'Friday', visibleBlobSha: 'a'.repeat(40) })))
    expect(textarea(0).value).toBe('')
    await enter(0, 'Other private draft')
    expect(container.querySelector('label')?.htmlFor).toBe(textarea(0).id)
    identity.login = 'editor'
  identity.includeInRevision = true
  identity.blob = 'a'.repeat(40)
    await act(async () => root.render(createElement(EditorialSidebar, { date: '2026-10-10', articleTitle: 'Friday', visibleBlobSha: 'a'.repeat(40) })))
    expect(textarea(0).value).toBe('Editor private draft')
    expect(sessionStorage.getItem('dl-editorial:other-editor:2026-10-10')).toBe('["Other private draft"]')
  })
})
