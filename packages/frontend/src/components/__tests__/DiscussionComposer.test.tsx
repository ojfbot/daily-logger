// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider } from 'react-redux'
import { configureStore, createAction } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SectionChatZone } from '../SectionChatZone.tsx'
import { AssistantSettings, AssistantSettingsButton } from '../AssistantSettings.tsx'
import { IndependentArticleReviews, type DiscussionAvailability } from '../IndependentArticleReviews.tsx'
import chat, { createThread, type ChatRoot } from '../../store/chatSlice.ts'
import type { AuthUser } from '../../store/authSlice.ts'
import { commentSchema, projectionSchema } from '../../../../../shared/article-review.ts'

const id = '00000000-0000-4000-8000-000000000041'
const blob = 'a'.repeat(40)
const account: AuthUser = { login: 'editor', authorized: true, avatarUrl: '', name: null }
const changeUser = createAction<AuthUser>('fixture/changeUser')
function makeStore() {
  const store = configureStore<ChatRoot>({ reducer: { chat, auth: (state = { user: account }, action) => changeUser.match(action) ? { user: action.payload } : state } })
  store.dispatch(createThread({ id, date: '2026-10-17', section: 'What shipped' }))
  return store
}
let node: HTMLDivElement, root: Root, store: ReturnType<typeof makeStore>
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new Error('Unexpected request blocked') }))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} })
  node = document.createElement('div'); document.body.append(node); root = createRoot(node); store = makeStore()
})
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function render(availability: DiscussionAvailability = 'ready', source: string | undefined = blob, sectionAvailable = true, date = '2026-10-17') {
  await act(async () => root.render(createElement(Provider, { store, children: createElement(AssistantSettings, { children: createElement(Fragment, null,
    createElement(AssistantSettingsButton), createElement(SectionChatZone, { date, section: 'What shipped', articleTitle: 'Fixture', visibleBlobSha: source,
      discussionAvailability: availability, extractSection: () => sectionAvailable ? { heading: 'What shipped', content: 'Claim', codeRefs: [] } : null })) }) })))
}
function button(text: string) {
  const result = Array.from(node.querySelectorAll('button')).find((element) => element.textContent === text)
  if (!result) throw new Error(`Missing button ${text}`)
  return result
}
function textarea() { const result = node.querySelector('textarea'); if (!result) throw new Error('Missing composer'); return result }
async function enter(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('Missing value setter')
  await act(async () => { setter.call(textarea(), value); textarea().dispatchEvent(new Event('input', { bubbles: true })) })
}
async function click(element: HTMLElement) { await act(async () => element.click()) }
function receipt(body: string) { const message = commentSchema.parse(JSON.parse(body)); return Response.json({ requestId: message.requestId, url: 'https://github.com/ojfbot/daily-logger/issues/357#fixture', reused: false }) }

describe('discussion composer and mounted local recovery', () => {
  it('labels the composer and leaves Enter and IME composition to normal multiline editing', async () => {
    await render(); await enter('First line')
    expect(textarea().labels?.[0]?.textContent).toBe('Note or question')
    for (const isComposing of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing })
      await act(async () => { textarea().dispatchEvent(event) })
      expect(event.defaultPrevented).toBe(false)
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(button('Save note').disabled).toBe(false)
    expect(button('Ask assistant').disabled).toBe(true)
  })

  it.each(['loading', 'stale', 'unavailable'] satisfies DiscussionAvailability[])('shows one truthful %s reason without discarding the draft', async (availability) => {
    await render(); await enter('Keep these bytes \n雪')
    await render(availability)
    const text = { loading: 'Loading correspondence…', stale: 'Article changed. Refresh before saving.', unavailable: 'Correspondence unavailable. Your draft is kept here.', ready: '' }
    expect(node.querySelectorAll('.discussion-action-reason')).toHaveLength(1)
    expect(node.querySelector('.discussion-action-reason')?.textContent).toBe(text[availability])
    expect(button('Save note').disabled).toBe(true)
    expect(button('Ask assistant').disabled).toBe(true)
    expect(textarea().value).toBe('Keep these bytes \n雪')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains missing section context while keeping key-free Save note available', async () => {
    await render('ready', blob, false); await enter('Note')
    expect(button('Save note').disabled).toBe(false)
    expect(button('Ask assistant').disabled).toBe(true)
    expect(node.querySelector('.discussion-action-reason')?.textContent).toBe('Section context unavailable. You can save a note.')
  })

  it('keeps the same toggle and panel across collapse and preserves literal draft text', async () => {
    await render(); const literal = ' \n雪\t@claude <!-- sample -->\n '; await enter(literal)
    const toggle = node.querySelector<HTMLButtonElement>('.discussion-toggle')
    if (!toggle) throw new Error('Missing toggle')
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    toggle.focus(); await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(panel?.hidden).toBe(true)
    expect(document.activeElement === toggle).toBe(true)
    await click(toggle)
    expect(node.querySelector('.discussion-toggle') === toggle).toBe(true)
    expect(panel?.hidden).toBe(false); expect(textarea().value).toBe(literal)
    expect(document.activeElement === toggle).toBe(true); expect(fetch).not.toHaveBeenCalled()
  })

  it('retains a no-message thread and mounted draft through Hide and Show hidden discussions with focus recovery', async () => {
    await render(); const literal = ' Unsent\n雪\t '; await enter(literal); const original = textarea()
    const hide = node.querySelector<HTMLButtonElement>('.discussion-hide')
    if (!hide) throw new Error('Missing hide')
    await click(hide)
    expect(store.getState().chat.threads[id]?.isHidden).toBe(true)
    expect(store.getState().chat.threads[id]?.isCollapsed).toBe(false)
    expect(document.activeElement === button('Show hidden discussions')).toBe(true)
    expect(textarea() === original).toBe(true)
    await click(button('Show hidden discussions'))
    expect(textarea() === original).toBe(true); expect(textarea().value).toBe(literal)
    expect(document.activeElement === node.querySelector('.discussion-toggle')).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not expose hidden unsent drafts to another account or source', async () => {
    await render(); await enter('Account A draft')
    await act(async () => { store.dispatch(changeUser({ ...account, login: 'another-editor' })) })
    expect(textarea().value).toBe('')
    await enter('Source A draft'); await render('ready', 'b'.repeat(40)); expect(textarea().value).toBe('')
    await enter('Date A draft'); await render('ready', blob, true, '2026-10-18'); expect(node.querySelector('textarea')).toBeNull()
    expect(sessionStorage.length).toBe(0); expect(fetch).not.toHaveBeenCalled()
  })

  it('shows each note failure once and removes its stale local error after same-ID retry succeeds', async () => {
    let fail = true
    const fetchMock = vi.fn<typeof fetch>(async (_url, options) => fail ? Response.json({ error: 'Synthetic uncertain save' }, { status: 503 }) : receipt(String(options?.body)))
    vi.stubGlobal('fetch', fetchMock)
    await render(); await enter('Exact unsaved question'); await click(button('Save note'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1)
    fail = false; await click(button('Retry saving note'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(fetchMock.mock.calls[1]?.[1]?.body)
  })

  it('keeps distinct message save failures visible rather than deduplicating by wording alone', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ error: 'Same failure, distinct notes' }, { status: 503 })))
    await render(); await enter('First'); await click(button('Save note')); await enter('Second'); await click(button('Save note'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(2)
  })

  it('collapses a pending save without hiding or duplicating its request', async () => {
    let release: (response: Response) => void = () => { throw new Error('No pending save') }
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.fn<typeof fetch>(async () => pending); vi.stubGlobal('fetch', fetchMock)
    await render(); await enter('Pending bytes'); await click(button('Save note'))
    const hide = node.querySelector<HTMLButtonElement>('.discussion-hide'), toggle = node.querySelector<HTMLButtonElement>('.discussion-toggle')
    if (!hide || !toggle) throw new Error('Missing header')
    expect(hide.disabled).toBe(true); await click(toggle); expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { release(receipt(String(fetchMock.mock.calls[0]?.[1]?.body))); await pending })
    await click(toggle); expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(node.textContent).toContain('Saved on GitHub')
  })

  it('does not resurrect a handled assistant save error after its response retry succeeds', async () => {
    localStorage.setItem('dl-anthropic-key', 'synthetic-test-only')
    let fail = true
    const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).startsWith('https://api.anthropic.com')) return new Response('data: {"type":"content_block_delta","delta":{"text":"Answer"}}\n\ndata: {"type":"message_stop"}\n\n')
      const message = commentSchema.parse(JSON.parse(String(options?.body)))
      return message.speaker.kind === 'assistant' && fail ? Response.json({ error: 'Response save failed' }, { status: 503 }) : receipt(String(options?.body))
    })
    vi.stubGlobal('fetch', fetchMock)
    await render(); await enter('Question'); await click(button('Ask assistant'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(1)
    fail = false; await click(button('Retry saving response'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://api.anthropic.com'))).toHaveLength(1)
  })

  it('keeps a later provider error distinct from an older note failure with identical wording', async () => {
    localStorage.setItem('dl-anthropic-key', 'synthetic-test-only')
    let failNote = true
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url, options) => {
      if (failNote || String(url).startsWith('https://api.anthropic.com')) throw new TypeError('Failed to fetch')
      return receipt(String(options?.body))
    }))
    await render(); await enter('Earlier unsaved note'); await click(button('Save note'))
    failNote = false; await enter('Later question'); await click(button('Ask assistant'))
    expect(node.querySelectorAll('[role="alert"]')).toHaveLength(2)
    expect(node.textContent).toContain('Earlier unsaved note')
    expect(node.textContent).toContain('Later question')
  })
})

describe('availability owner observations', () => {
  it.each(['ready', 'stale', 'unavailable'] satisfies DiscussionAvailability[])('reports loading then observed %s from the actual review boundary', async (expected) => {
    const projection = projectionSchema.parse({ schemaVersion: 1, date: '2026-10-17', observedAt: '2026-10-17T17:00:00Z', sourceCommitSha: blob,
      currentBlobSha: expected === 'stale' ? 'b'.repeat(40) : blob, visibleBlobSha: blob, discovery: 'registered_records_only',
      requestTarget: expected === 'unavailable' ? null : { kind: 'pilot_issue', issueNumber: 357, contextUrl: 'https://github.com/ojfbot/daily-logger/issues/357' }, entries: [], unavailable: [], requests: [] })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json(projection)))
    const observed: DiscussionAvailability[] = []
    await act(async () => root.render(createElement(Provider, { store, children: createElement(IndependentArticleReviews, {
      date: '2026-10-17', visibleBlobSha: blob, login: account.login, onDiscussionAvailabilityChange: (value) => { observed.push(value) },
    }) })))
    expect(observed).toEqual(['loading', expected])
  })
})
