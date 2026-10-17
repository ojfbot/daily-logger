// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, useSelector } from 'react-redux'
import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantSettings, AssistantSettingsButton } from '../AssistantSettings.tsx'
import { InlineChatThread } from '../InlineChatThread.tsx'
import chat, { createThread, sendMessage, type ChatRoot } from '../../store/chatSlice.ts'
import { commentSchema } from '../../../../../shared/article-review.ts'
import { readAssistantKey, removeAssistantKey, saveAssistantKey } from '../../utils/assistantConfig.ts'
import type { AuthUser } from '../../store/authSlice.ts'
import { DiscussionDrafts, usePageDiscussionDrafts } from '../DiscussionDrafts.tsx'

const key = 'UIK04-SYNTHETIC-NOT-A-CREDENTIAL'
const ids = ['00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000042']
const blob = 'a'.repeat(40)
let container: HTMLDivElement
let root: Root
const actions: unknown[] = []
const recordActions: Middleware = () => (next) => (action) => { actions.push(action); return next(action) }
function makeStore() {
  return configureStore({ reducer: { chat, auth: (state: { user: AuthUser | null } = { user: { login: 'editor', authorized: true, avatarUrl: '', name: null } }) => state },
    middleware: (getDefault) => getDefault().concat(recordActions) })
}
function Threads() {
  const threads = useSelector((state: ChatRoot) => state.chat.threads)
  return createElement(Fragment, null, ids.map((id) => {
    const thread = threads[id]
    return thread && createElement('section', { key: id, 'data-thread': id }, createElement(InlineChatThread, { thread,
      articleTitle: 'Fixture', visibleBlobSha: blob, discussionAvailability: 'ready',
      extractSection: () => ({ heading: 'What shipped', content: 'Fixture context', codeRefs: [] }) }))
  }))
}
async function mount() {
  const store = makeStore()
  for (const id of ids) store.dispatch(createThread({ id, section: 'What shipped', date: '2026-10-17' }))
  await act(async () => root.render(createElement(Provider, { store, children: createElement(DraftSettingsPage) })))
  return store
}
function DraftSettingsPage() {
  const owner = usePageDiscussionDrafts('settings-fixture')
  return createElement(DiscussionDrafts, { owner, children: createElement(AssistantSettings, {
    children: createElement(Fragment, null, createElement(AssistantSettingsButton), createElement(Threads)),
  }) })
}
function section(index = 0) {
  const element = container.querySelector(`[data-thread="${ids[index]}"]`)
  if (!element) throw new Error('Missing thread')
  return element
}
function button(label: string, scope: ParentNode = container) {
  const element = Array.from(scope.querySelectorAll('button')).find((item) => item.textContent === label)
  if (!element) throw new Error(`Missing button: ${label}`)
  return element
}
function dialog() {
  const element = container.querySelector('dialog')
  if (!element) throw new Error('Missing dialog')
  return element
}
function field() {
  const element = container.querySelector<HTMLInputElement>('#assistant-api-key')
  if (!element) throw new Error('Missing password field')
  return element
}
function textarea(index = 0) {
  const element = section(index).querySelector('textarea')
  if (!element) throw new Error('Missing composer')
  return element
}
async function type(text: string, index = 0) {
  const element = textarea(index)
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('Missing value setter')
  await act(async () => { setter.call(element, text); element.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function click(label: string, scope?: ParentNode) { await act(async () => button(label, scope).click()) }
async function save(value = key) {
  field().value = value
  const form = dialog().querySelector('form')
  if (!form) throw new Error('Missing setup form')
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}
function receipt(body: string) {
  const message = commentSchema.parse(JSON.parse(body))
  return Response.json({ requestId: message.requestId, url: 'https://github.com/ojfbot/daily-logger/issues/357#fixture', reused: false })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  actions.length = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new Error('Unexpected request blocked') }))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('browser-local assistant settings', () => {
  it('shows setup before Ask and opens with an empty composer without a request', async () => {
    await mount()
    expect(container.querySelectorAll('.assistant-config-status')).toHaveLength(2)
    expect(section().textContent).toContain('Assistant setup needed')
    await click('Set up assistant', section())
    expect(dialog().open).toBe(true)
    expect(document.activeElement).toBe(field())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('saves across mounted threads, stays unverified, and never resumes Ask', async () => {
    await mount()
    await type('Question retained')
    const opener = button('Set up assistant', section())
    await act(async () => opener.click())
    await save()
    for (const index of [0, 1]) expect(section(index).textContent).toContain('Connection not verified')
    expect(dialog().open).toBe(false)
    expect(textarea().value).toBe('Question retained')
    expect(document.activeElement === opener).toBe(true)
    expect(field().value).toBe('')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('removes across mounted threads without a request', async () => {
    localStorage.setItem('dl-anthropic-key', key)
    await mount()
    await click('Assistant settings')
    expect(field().value).toBe('')
    await click('Remove saved key', dialog())
    expect(localStorage.getItem('dl-anthropic-key')).toBeNull()
    for (const index of [0, 1]) expect(section(index).textContent).toContain('Assistant setup needed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['storage', 'clear', 'focus'])('reconciles other-document changes on %s', async (change) => {
    await mount()
    await act(async () => {
      localStorage.setItem('dl-anthropic-key', key)
      window.dispatchEvent(change === 'focus' ? new Event('focus') : new StorageEvent('storage', { key: change === 'clear' ? null : 'dl-anthropic-key' }))
    })
    expect(section(1).textContent).toContain('Connection not verified')
    await act(async () => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })) })
    expect(section().textContent).toContain('Assistant setup needed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['Cancel', 'escape', 'close'])('retains literal text and settings on %s', async (action) => {
    localStorage.setItem('dl-anthropic-key', key)
    await mount()
    const literal = ' \n雪\t@claude <!-- sample -->\n '
    await type(literal)
    const opener = button('Assistant settings', section())
    await act(async () => opener.click())
    field().value = 'temporary secret'
    if (action === 'Cancel') await click('Cancel', dialog())
    else if (action === 'escape') await act(async () => { dialog().dispatchEvent(new Event('cancel', { cancelable: true })) })
    else await act(async () => { dialog().querySelector<HTMLButtonElement>('[aria-label="Close assistant settings"]')?.click() })
    expect(textarea().value).toBe(literal)
    expect(field().value).toBe('')
    expect(localStorage.getItem('dl-anthropic-key')).toBe(key)
    expect(document.activeElement).toBe(opener)
    expect(dialog().open).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['property', 'method'])('keeps key-free Save note usable when storage %s read throws', async (failure) => {
    if (failure === 'property') vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new Error(key) })
    else vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error(key) })
    await mount()
    expect(section().textContent).toContain('settings are unavailable')
    const fetchMock = vi.fn<typeof fetch>(async (_url, options) => receipt(String(options?.body)))
    vi.stubGlobal('fetch', fetchMock)
    await type('No key needed')
    await click('Save note', section())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/article-reviews')
    expect(container.textContent).not.toContain(key)
  })

  it.each(['save', 'remove'])('announces a safe error when %s fails and clears temporary secrets', async (operation) => {
    localStorage.setItem('dl-anthropic-key', key)
    await mount()
    await type('Preserve me')
    await click('Assistant settings')
    if (operation === 'save') {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error(key) })
      await save('replacement')
    } else {
      field().value = 'temporary secret'
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error(key) })
      await click('Remove saved key', dialog())
    }
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Browser storage did not confirm')
    expect(dialog().open).toBe(true)
    expect(field().value).toBe('')
    expect(textarea().value).toBe('Preserve me')
    expect(container.textContent).not.toContain(key)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not remove an existing key for blank input', async () => {
    localStorage.setItem('dl-anthropic-key', key)
    await mount()
    await click('Assistant settings')
    await save('   ')
    expect(dialog().open).toBe(true)
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Enter an API key')
    expect(localStorage.getItem('dl-anthropic-key')).toBe(key)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('disables Ask after key removal and retains the question through independent setup', async () => {
    localStorage.setItem('dl-anthropic-key', key)
    await mount()
    localStorage.removeItem('dl-anthropic-key')
    await type('Unsent question')
    await click('Ask assistant', section())
    expect(button('Ask assistant', section()).disabled).toBe(true)
    expect(dialog().open).toBe(false)
    await click('Set up assistant', section())
    expect(dialog().open).toBe(true)
    expect(textarea().value).toBe('Unsent question')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses a replaced key only on explicit Ask and prevents duplicate requests', async () => {
    localStorage.setItem('dl-anthropic-key', key)
    const store = await mount()
    let release: () => void = () => { throw new Error('No request') }
    const wait = new Promise<void>((resolve) => { release = resolve })
    const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      if (url === '/api/article-reviews') { await wait; return receipt(String(options?.body)) }
      return Response.json({}, { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(saveAssistantKey(key + '-replacement')).toBe('saved')
    expect(fetchMock).not.toHaveBeenCalled()
    await type('Explicit question')
    await act(async () => { button('Ask assistant', section()).click(); button('Ask assistant', section()).click() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { release(); await wait })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'x-api-key': key + '-replacement' })
    expect(section().textContent).toContain('Assistant request failed (401)')
    expect(section().textContent).toContain('Connection not verified')
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain(key)
    expect(JSON.stringify(store.getState())).not.toContain(key)
    expect(JSON.stringify(actions)).not.toContain(key)
  })

  it('rejects an unavailable key read at the thunk boundary without leaking the storage error', async () => {
    const store = await mount()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error(key) })
    expect(readAssistantKey()).toEqual({ kind: 'storage_unavailable' })
    await act(async () => {
      await expect(store.dispatch(sendMessage({ threadId: ids[0] ?? '', visibleBlobSha: blob, sectionContent: 'Claim', articleTitle: 'Today', codeReferences: [], message: 'Question' })).unwrap()).rejects.toThrow('Assistant settings are unavailable')
    })
    expect(JSON.stringify(actions)).not.toContain(key)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([401, 403, 429, 500, 'network'])('keeps configuration unverified after a simulated %s failure', async (failure) => {
    localStorage.setItem('dl-anthropic-key', key)
    const store = await mount()
    const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      if (url === '/api/article-reviews') return receipt(String(options?.body))
      if (failure === 'network') throw new TypeError('Synthetic network failure')
      if (typeof failure !== 'number') throw new Error('Unexpected test failure mode')
      return Response.json({}, { status: failure })
    })
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      await expect(store.dispatch(sendMessage({ threadId: ids[0] ?? '', visibleBlobSha: blob, sectionContent: 'Claim', articleTitle: 'Today', codeReferences: [], message: 'Question' })).unwrap())
        .rejects.toThrow(failure === 'network' ? 'Synthetic network failure' : `Assistant request failed (${failure})`)
    })
    expect(section().textContent).toContain('Connection not verified')
    expect(section().textContent).not.toContain('invalid key')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getState().chat.threads[ids[0] ?? '']?.messages[0]?.save.kind).toBe('saved')
    expect(JSON.stringify(actions)).not.toContain(key)
  })

  it('does not resend an in-flight Ask when setup removes and replaces its captured key', async () => {
    localStorage.setItem('dl-anthropic-key', key)
    const store = makeStore()
    const threadId = ids[0] ?? ''
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-17' }))
    let release: (response: Response) => void = () => { throw new Error('No request') }
    const waiting = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.fn<typeof fetch>(async (url) => url === '/api/article-reviews' ? waiting : Response.json({}, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = store.dispatch(sendMessage({ threadId, visibleBlobSha: blob, sectionContent: 'Claim', articleTitle: 'Today', codeReferences: [], message: 'Captured question' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(removeAssistantKey()).toBe('removed')
    expect(saveAssistantKey(key + '-replacement')).toBe('saved')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(receipt(String(fetchMock.mock.calls[0]?.[1]?.body)))
    await expect(pending.unwrap()).rejects.toThrow('Assistant request failed (401)')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'x-api-key': key })
    expect(JSON.stringify(actions)).not.toContain(key)
  })
})
