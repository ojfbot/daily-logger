// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, useSelector } from 'react-redux'
import { InlineChatThread } from '../InlineChatThread.tsx'
import { configureStore, createAction } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import chatReducer, { createThread, hydrateCorrespondence, clearCorrespondence, setRevisionInclusion, saveMessage, sendMessage, type ChatRoot } from '../../store/chatSlice.ts'
import type { AuthUser } from '../../store/authSlice.ts'
import { commentSchema, type Correspondence } from '../../../../../shared/article-review.ts'

const blob = 'a'.repeat(40)
const threadId = '00000000-0000-4000-8000-000000000001'
const switchUser = createAction<AuthUser | null>('test/switchUser')
const account = { login: 'editor', authorized: true, avatarUrl: '', name: null }
function makeStore(user: AuthUser | null = account) {
  return configureStore<ChatRoot>({ reducer: { chat: chatReducer, auth: (state = { user }, action) => switchUser.match(action) ? { user: action.payload } : state } })
}
function receipt(body: unknown) {
  const message = commentSchema.parse(body)
  return Response.json({ requestId: message.requestId, url: `https://github.com/ojfbot/daily-logger/issues/357#issuecomment-${message.requestId}`, reused: false })
}
const stream = () => new Response('data: {"type":"content_block_delta","delta":{"text":"Answer \\n雪"}}\n\ndata: {"type":"message_stop"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('durable section conversation', () => {
  it.each(['too long', 'invalid source'])('retains the input when %s fails before a retry copy can be queued', async (failure) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    const store = makeStore()
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    function Thread() {
      const thread = useSelector((state: ChatRoot) => state.chat.threads[threadId])
      if (!thread) return null
      return createElement(InlineChatThread, { thread, articleTitle: 'Today', visibleBlobSha: failure === 'invalid source' ? 'invalid' : blob,
        discussionAvailability: 'ready',
        extractSection: () => ({ heading: 'What shipped', content: 'Claim', codeRefs: [] }) })
    }
    const prior = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    try {
      await act(async () => root.render(createElement(Provider, { store, children: createElement(Thread) })))
      const textarea = container.querySelector('textarea')
      if (!textarea) throw new Error('Missing discussion input')
      const content = failure === 'too long' ? 'x'.repeat(30001) : 'Retain these exact bytes \n '
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (!setter) throw new Error('Missing input setter')
      await act(async () => { setter.call(textarea, content); textarea.dispatchEvent(new Event('input', { bubbles: true })) })
      const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Save note')
      if (!button) throw new Error('Missing Save note')
      await act(async () => button.click())
      expect(textarea.value).toBe(content)
      expect(container.querySelector('[role="alert"]')).not.toBeNull()
      expect(store.getState().chat.threads[threadId]?.messages).toEqual([])
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      if (prior) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', prior)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it.each(['question save', 'provider response'])('cannot complete an old %s after account A → B → A', async (pauseAt) => {
    let release: (response: Response) => void = () => { throw new Error('No pending request') }
    let savedQuestion: unknown
    let signal: AbortSignal | null | undefined
    const fetch = vi.fn<typeof globalThis.fetch>(async (path, options) => {
      if (String(path).startsWith('https://api.anthropic.com')) {
        signal = options?.signal
        return new Promise<Response>((resolve) => { release = resolve })
      }
      savedQuestion = JSON.parse(String(options?.body))
      if (pauseAt === 'question save') {
        signal = options?.signal
        return new Promise<Response>((resolve) => { release = resolve })
      }
      return receipt(savedQuestion)
    })
    vi.stubGlobal('fetch', fetch)
    localStorage.setItem('dl-anthropic-key', 'dummy-test-key')
    const store = makeStore()
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    const pending = store.dispatch(sendMessage({ threadId, visibleBlobSha: blob, sectionContent: 'Claim', articleTitle: 'Today', codeReferences: [], message: 'Question' }))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(pauseAt === 'question save' ? 1 : 2))
    store.dispatch(switchUser({ ...account, login: 'other-editor' }))
    store.dispatch(clearCorrespondence())
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    store.dispatch(switchUser(account))
    store.dispatch(clearCorrespondence())
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    release(pauseAt === 'question save' ? receipt(savedQuestion) : stream())
    const result = await pending
    expect(result.meta.requestStatus).toBe('rejected')
    expect(signal?.aborted).toBe(true)
    expect(store.getState().chat.threads[threadId]).toMatchObject({ messages: [], isStreaming: false, error: null })
    expect(fetch).toHaveBeenCalledTimes(pauseAt === 'question save' ? 1 : 2)
  })

  it('saves a human note verbatim without an API key and records its source and receipt', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_path, options) => receipt(JSON.parse(String(options?.body))))
    vi.stubGlobal('fetch', fetch)
    const store = makeStore()
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    const literal = ' \n雪\t@claude <!-- example -->\n '
    await store.dispatch(saveMessage({ kind: 'new', messageId: crypto.randomUUID(), threadId, visibleBlobSha: blob, content: literal, speaker: { kind: 'human' } })).unwrap()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/article-reviews')
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ content: literal, visibleBlobSha: blob, threadId })
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    expect(store.getState().chat.threads[threadId]?.messages[0]).toMatchObject({ content: literal, actor: 'editor', save: { kind: 'saved' }, includeInRevision: true })
    expect(sessionStorage.getItem('dl-unsaved-discussion:editor:2026-10-16')).toBeNull()
  })

  it('saves the question before calling the assistant; a failed answer save retries without another model call', async () => {
    const calls: string[] = []
    let failAnswer = true
    const fetch = vi.fn<typeof globalThis.fetch>(async (path, options) => {
      calls.push(String(path))
      if (String(path).startsWith('https://api.anthropic.com')) return stream()
      const message = commentSchema.parse(JSON.parse(String(options?.body)))
      if (message.speaker.kind === 'assistant' && failAnswer) return Response.json({ error: 'Storage unavailable' }, { status: 503 })
      return receipt(message)
    })
    vi.stubGlobal('fetch', fetch)
    localStorage.setItem('dl-anthropic-key', 'dummy-test-key')
    const store = makeStore()
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    await expect(store.dispatch(sendMessage({ threadId, visibleBlobSha: blob, sectionContent: 'Claim', articleTitle: 'Today', codeReferences: [], message: 'Question' })).unwrap()).rejects.toThrow('Storage unavailable')
    expect(calls).toEqual(['/api/article-reviews', 'https://api.anthropic.com/v1/messages', '/api/article-reviews'])
    const messages = store.getState().chat.threads[threadId]?.messages
    expect(messages?.[0]?.save.kind).toBe('saved')
    expect(messages?.[1]).toMatchObject({ role: 'assistant', content: 'Answer \n雪', save: { kind: 'unsaved' }, includeInRevision: false })
    const answer = messages?.[1]
    if (!answer) throw new Error('Expected retained answer')
    const restored = makeStore()
    restored.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [] }))
    expect(restored.getState().chat.threads[threadId]?.messages[0]).toMatchObject({ id: answer.id, content: answer.content, save: { kind: 'unsaved' } })
    failAnswer = false
    await restored.dispatch(saveMessage({ kind: 'retry', threadId, messageId: answer.id })).unwrap()
    expect(calls.filter((url) => url.startsWith('https://api.anthropic.com'))).toHaveLength(1)
    expect(commentSchema.parse(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).requestId).toBe(answer.id)
    expect(restored.getState().chat.threads[threadId]?.messages[0]?.save.kind).toBe('saved')
  })

  it('retains an immutable unsaved source on conflict and does not call a provider', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ error: 'The article changed.' }, { status: 409 }))
    vi.stubGlobal('fetch', fetch)
    const store = makeStore()
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    await expect(store.dispatch(saveMessage({ kind: 'new', messageId: crypto.randomUUID(), threadId, visibleBlobSha: blob, content: 'Original bytes \n', speaker: { kind: 'human' } })).unwrap()).rejects.toThrow('The article changed.')
    const message = store.getState().chat.threads[threadId]?.messages[0]
    if (!message) throw new Error('Expected retained note')
    await store.dispatch(saveMessage({ kind: 'retry', threadId, messageId: message.id }))
    const attempts = fetch.mock.calls.map(([, options]) => commentSchema.parse(JSON.parse(String(options?.body))))
    expect(attempts[1]).toEqual(attempts[0])
    expect(message.articleBlobSha).toBe(blob)
    expect(message.content).toBe('Original bytes \n')
  })

  it('hydrates other accounts and historical notes without automatically selecting them for acceptance', () => {
    const message = commentSchema.parse({ schemaVersion: 1, intent: 'comment', requestId: '00000000-0000-4000-8000-000000000002', date: '2026-10-16', visibleBlobSha: blob, threadId, section: 'Old heading', content: 'Earlier discussion', speaker: { kind: 'human' } })
    const item: Correspondence = { kind: 'thread_message', id: 'comment:12', sourceKind: 'review_pr', sourceNumber: 367,
      url: 'https://github.com/ojfbot/daily-logger/pull/367#issuecomment-12', author: 'another-editor', createdAt: '2026-10-16T12:00:00Z', updatedAt: '2026-10-16T12:00:00Z', body: 'Stored envelope', duplicateUrls: [], message: { ...message, actor: 'another-editor' } }
    const store = makeStore()
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: 'b'.repeat(40), login: 'editor', items: [item] }))
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: 'b'.repeat(40), login: 'editor', items: [item] }))
    expect(store.getState().chat.threads[threadId]?.messages).toHaveLength(1)
    expect(store.getState().chat.threads[threadId]?.messages[0]).toMatchObject({ actor: 'another-editor', articleBlobSha: blob, includeInRevision: false, save: { kind: 'saved', url: item.url } })
    const second: Correspondence = { ...item, id: 'comment:13', author: 'editor', message: { ...item.message, actor: 'editor', content: 'Distinct account, same UUID' } }
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [item, second] }))
    expect(store.getState().chat.threads[threadId]?.messages).toHaveLength(2)
    store.dispatch(setRevisionInclusion({ threadId, messageId: message.requestId, actor: 'another-editor', included: true }))
    const edited: Correspondence = { ...item, message: { ...item.message, content: 'Edited on GitHub' } }
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [edited], complete: false }))
    expect(store.getState().chat.threads[threadId]?.messages).toHaveLength(2)
    expect(store.getState().chat.threads[threadId]?.messages.find((stored) => stored.actor === 'editor')?.save).toMatchObject({ observation: 'unavailable' })
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [edited], complete: true }))
    expect(store.getState().chat.threads[threadId]?.messages).toHaveLength(1)
    expect(store.getState().chat.threads[threadId]?.messages[0]?.content).toBe('Edited on GitHub')
    expect(store.getState().chat.threads[threadId]?.messages[0]?.includeInRevision).toBe(false)
    store.dispatch(setRevisionInclusion({ threadId, messageId: message.requestId, actor: 'another-editor', included: true }))
    const movedThreadId = '00000000-0000-4000-8000-000000000004'
    const moved: Correspondence = { ...edited, message: { ...edited.message, threadId: movedThreadId, section: 'Different section' } }
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [moved] }))
    expect(store.getState().chat.threads[threadId]?.messages).toEqual([])
    expect(store.getState().chat.threads[movedThreadId]?.messages[0]?.includeInRevision).toBe(false)
    store.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [], complete: true }))
    expect(store.getState().chat.threads[threadId]?.messages).toEqual([])
  })

  it('denies logged-out saves and isolates account-scoped unsaved messages', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    const store = makeStore(null)
    store.dispatch(createThread({ id: threadId, section: 'What shipped', date: '2026-10-16' }))
    await expect(store.dispatch(saveMessage({ kind: 'new', messageId: crypto.randomUUID(), threadId, visibleBlobSha: blob, content: 'Denied', speaker: { kind: 'human' } })).unwrap()).rejects.toThrow('authorized account')
    expect(fetch).not.toHaveBeenCalled()
    sessionStorage.setItem('dl-unsaved-discussion:other:2026-10-16', JSON.stringify([commentSchema.parse({ schemaVersion: 1, intent: 'comment', requestId: '00000000-0000-4000-8000-000000000003', date: '2026-10-16', visibleBlobSha: blob, threadId, section: 'What shipped', content: 'Private unsaved', speaker: { kind: 'human' } })]))
    const authorized = makeStore()
    authorized.dispatch(hydrateCorrespondence({ date: '2026-10-16', visibleBlobSha: blob, login: 'editor', items: [] }))
    expect(authorized.getState().chat.threadOrder).toEqual([])
  })
})
