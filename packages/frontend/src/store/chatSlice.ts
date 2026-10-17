import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { z } from 'zod'
import { commentSchema, writeReceiptSchema, type ArticleComment, type ReviewProjection } from '../../../../shared/article-review.ts'
import type { AuthUser } from './authSlice.ts'
import { readAssistantKey } from '../utils/assistantConfig.ts'

type SaveState = { kind: 'unsaved'; error: string | null } | { kind: 'saving' } | { kind: 'saved'; url: string; observation: 'current' | 'unavailable' }
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  articleBlobSha: string
  section: string
  actor: string
  speaker: ArticleComment['speaker']
  save: SaveState
  includeInRevision: boolean
}
export interface ChatThread {
  id: string
  section: string
  date: string
  messages: ChatMessage[]
  isCollapsed: boolean
  isHidden: boolean
  isStreaming: boolean
  assistantRequestId: string | null
  streamingContent: string
  error: string | null
}
interface ChatState { threads: Record<string, ChatThread>; threadOrder: string[]; generation: number }
export type ChatRoot = { chat: ChatState; auth: { user: AuthUser | null } }
const initialState: ChatState = { threads: {}, threadOrder: [], generation: 0 }
const activeRequests = new Set<AbortController>()
function sameContext(state: ChatRoot, actor: string, generation: number) {
  return state.chat.generation === generation && !!state.auth.user?.authorized && state.auth.user.login.toLowerCase() === actor.toLowerCase()
}
const pendingKey = (login: string, date: string) => `dl-unsaved-discussion:${login}:${date}`
const messageKey = (actor: string, id: string) => `${actor.toLowerCase()}:${id}`
const errorSchema = z.object({ error: z.string() })

function pendingMessages(login: string, date: string): ArticleComment[] {
  try { return z.array(commentSchema).parse(JSON.parse(sessionStorage.getItem(pendingKey(login, date)) ?? '[]')) }
  catch { return [] }
}
function keepPending(login: string, message: ArticleComment, saved: boolean) {
  try {
    const messages = pendingMessages(login, message.date).filter((item) => item.requestId !== message.requestId)
    if (!saved) messages.push(message)
    if (messages.length) sessionStorage.setItem(pendingKey(login, message.date), JSON.stringify(messages))
    else sessionStorage.removeItem(pendingKey(login, message.date))
  } catch { /* The visible unsaved message remains available if browser storage is blocked. */ }
}
function newThread(id: string, section: string, date: string): ChatThread {
  return { id, section, date, messages: [], isCollapsed: false, isHidden: false, isStreaming: false, assistantRequestId: null, streamingContent: '', error: null }
}
type SaveInput =
  | { kind: 'new'; messageId: string; threadId: string; visibleBlobSha: string; content: string; speaker: ArticleComment['speaker'] }
  | { kind: 'retry'; threadId: string; messageId: string }

export const saveMessage = createAsyncThunk<string, SaveInput, { state: ChatRoot }>(
  'chat/saveMessage', async (input, { getState, dispatch }) => {
    const { auth, chat } = getState()
    if (!auth.user?.authorized) throw new Error('Sign in with an authorized account to save discussion.')
    const generation = chat.generation
    const actor = auth.user.login
    const thread = chat.threads[input.threadId]
    if (!thread) throw new Error('Thread not found')
    const previous = input.kind === 'retry' ? thread.messages.find((message) => message.id === input.messageId && message.actor.toLowerCase() === auth.user?.login.toLowerCase()) : null
    if (input.kind === 'retry' && !previous) throw new Error('Unsaved message not found')
    if (previous?.save.kind === 'saved') return previous.id
    if (previous?.save.kind === 'saving') throw new Error('This message is already being saved.')
    if (previous && previous.actor !== auth.user.login) throw new Error('This unsaved message belongs to another account.')
    const message = commentSchema.parse(previous ? {
      schemaVersion: 1, intent: 'comment', requestId: previous.id, date: thread.date,
      visibleBlobSha: previous.articleBlobSha, threadId: thread.id, section: previous.section,
      content: previous.content, speaker: previous.speaker,
    } : {
      schemaVersion: 1, intent: 'comment', requestId: input.kind === 'new' ? input.messageId : '', date: thread.date,
      visibleBlobSha: input.kind === 'new' ? input.visibleBlobSha : '', threadId: thread.id, section: thread.section,
      content: input.kind === 'new' ? input.content : '', speaker: input.kind === 'new' ? input.speaker : { kind: 'human' },
    })
    if (!message.content.trim()) throw new Error('Enter a message before saving.')
    if (!previous) dispatch(chatSlice.actions.queueMessage({ threadId: thread.id, message: {
      id: message.requestId, role: message.speaker.kind === 'human' ? 'user' : 'assistant', content: message.content,
      articleBlobSha: message.visibleBlobSha, section: thread.section, actor: auth.user.login, speaker: message.speaker,
      save: { kind: 'unsaved', error: null }, includeInRevision: message.speaker.kind === 'human',
    } }))
    keepPending(auth.user.login, message, false)
    dispatch(chatSlice.actions.savingMessage({ threadId: thread.id, messageId: message.requestId, actor: auth.user.login }))
    const controller = new AbortController()
    activeRequests.add(controller)
    try {
      const response = await fetch('/api/article-reviews', {
        signal: controller.signal,
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(message),
      })
      const value: unknown = await response.json()
      if (!response.ok) throw new Error(errorSchema.safeParse(value).data?.error ?? 'Message save was not confirmed. Retry saving the same message.')
      const receipt = writeReceiptSchema.parse(value)
      if (receipt.requestId !== message.requestId) throw new Error('Unexpected save receipt. Refresh before retrying this message.')
      if (!sameContext(getState(), actor, generation)) throw new Error('Account context changed. Refresh correspondence for the original account to verify this save.')
      dispatch(chatSlice.actions.savedMessage({ threadId: thread.id, messageId: message.requestId, actor: auth.user.login, url: receipt.url }))
      keepPending(auth.user.login, message, true)
      return message.requestId
    } catch (error) {
      if (sameContext(getState(), actor, generation)) dispatch(chatSlice.actions.failedMessage({ threadId: thread.id, messageId: message.requestId, actor: auth.user.login,
        error: error instanceof Error ? error.message : 'Message save was not confirmed.' }))
      throw error
    } finally { activeRequests.delete(controller) }
  },
)

export const sendMessage = createAsyncThunk<void, {
  threadId: string; visibleBlobSha: string; sectionContent: string; articleTitle: string; codeReferences: string[]; message: string
}, { state: ChatRoot }>(
  'chat/sendMessage', async (payload, { dispatch, getState, requestId }) => {
    const initiating = getState()
    const actor = initiating.auth.user?.login
    const generation = initiating.chat.generation
    if (!actor || !initiating.auth.user?.authorized) throw new Error('Sign in with an authorized account before asking the assistant.')
    const assertContext = () => {
      if (!sameContext(getState(), actor, generation)) throw new Error('Account context changed. The assistant response will not be saved under another session.')
    }
    const configuration = readAssistantKey()
    if (configuration.kind === 'missing') throw new Error('No API key configured. Save a note without a key, or configure one before asking the assistant.')
    if (configuration.kind === 'storage_unavailable') throw new Error('Assistant settings are unavailable in this browser. You can still save notes.')
    await dispatch(saveMessage({ kind: 'new', messageId: requestId, threadId: payload.threadId, visibleBlobSha: payload.visibleBlobSha,
      content: payload.message, speaker: { kind: 'human' } })).unwrap()
    assertContext()
    const thread = getState().chat.threads[payload.threadId]
    if (!thread) throw new Error('Thread not found')
    const systemPrompt = [
      'You are a knowledgeable assistant helping a developer review a daily development article.', '',
      '## Current context', `- Article title: ${payload.articleTitle}`, `- Section: ${thread.section}`, '',
      '## Section content', payload.sectionContent,
      payload.codeReferences.length ? `\n## Code references in this section\n${payload.codeReferences.join(', ')}` : '', '',
      '## Instructions', 'Answer questions about this section specifically. Be concise and precise.',
      'If the user identifies an inaccuracy, acknowledge it clearly.',
      'If asked about something outside this section, note that and answer if you can.',
    ].join('\n')
    const controller = new AbortController()
    activeRequests.add(controller)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        signal: controller.signal,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': configuration.key, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, system: systemPrompt,
          messages: thread.messages.filter((message) => message.articleBlobSha === payload.visibleBlobSha && message.save.kind === 'saved')
            .map(({ role, content }) => ({ role, content })), stream: true }),
      })
      assertContext()
      if (!response.ok) throw new Error(`Assistant request failed (${response.status}). Your human message is saved; no response was saved.`)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No assistant response body. Your human message is saved.')
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      let completed = false
      const eventSchema = z.object({ type: z.string(), delta: z.object({ text: z.string() }).optional() })
      while (true) {
        const { done, value } = await reader.read()
        if (!sameContext(getState(), actor, generation)) { await reader.cancel(); assertContext() }
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') { completed = true; continue }
          let event: z.infer<typeof eventSchema>
          try { event = eventSchema.parse(JSON.parse(data)) } catch { continue }
          if (event.type === 'message_stop') completed = true
          if (event.type === 'error') throw new Error('Assistant stream failed. Partial text is unsaved; your human message is saved.')
          if (event.type === 'content_block_delta' && event.delta) {
            content += event.delta.text
            dispatch(chatSlice.actions.appendStreamChunk({ threadId: thread.id, text: event.delta.text }))
          }
        }
      }
      if (!completed) throw new Error('Assistant stream ended before completion. Partial text is unsaved; your human message is saved.')
      if (content) {
        assertContext()
        dispatch(chatSlice.actions.clearStream(thread.id))
        await dispatch(saveMessage({ kind: 'new', messageId: crypto.randomUUID(), threadId: thread.id, visibleBlobSha: payload.visibleBlobSha, content,
          speaker: { kind: 'assistant', reportedModel: 'claude-sonnet-4-6', reportedSessionId: null } })).unwrap()
      }
    } finally { activeRequests.delete(controller) }
  }, {
    idGenerator: () => crypto.randomUUID(),
    condition: (payload, { getState }) => {
      const thread = getState().chat.threads[payload.threadId]
      return !!thread && !thread.isStreaming && !thread.messages.some((message) => message.save.kind === 'saving')
    },
  },
)

const chatSlice = createSlice({
  name: 'chat', initialState,
  reducers: {
    createThread: {
      prepare(payload: { section: string; date: string; id?: string }) {
        return { payload: { ...payload, id: payload.id ?? crypto.randomUUID() } }
      },
      reducer(state, action: PayloadAction<{ section: string; date: string; id: string }>) {
        const { id, section, date } = action.payload
        if (state.threads[id]) return
        state.threads[id] = newThread(id, section, date)
        state.threadOrder.push(id)
      },
    },
    hydrateCorrespondence: {
      prepare(payload: { date: string; visibleBlobSha: string | null; items: ReviewProjection['correspondence']; login: string; complete?: boolean }) {
        const pending = pendingMessages(payload.login, payload.date).filter((message) => {
          const recorded = payload.items.some((item) => {
            if (item.kind !== 'thread_message' || item.author.toLowerCase() !== payload.login.toLowerCase()) return false
            const { actor: _actor, ...saved } = item.message
            return JSON.stringify(saved) === JSON.stringify(message)
          })
          if (recorded) keepPending(payload.login, message, true)
          return !recorded
        })
        return { payload: { ...payload, pending, complete: payload.complete ?? true } }
      },
      reducer(state, { payload }: PayloadAction<{ date: string; visibleBlobSha: string | null; items: ReviewProjection['correspondence']; login: string; pending: ArticleComment[]; complete: boolean }>) {
        const previous = new Map<string, { thread: ChatThread; message: ChatMessage }>()
        for (const thread of Object.values(state.threads)) {
          if (thread.date !== payload.date) continue
          for (const message of thread.messages) previous.set(messageKey(message.actor, message.id), { thread: { ...thread }, message: { ...message } })
          if (payload.complete) thread.messages = thread.messages.filter((message) => message.save.kind !== 'saved')
          else for (const message of thread.messages) if (message.save.kind === 'saved') message.save.observation = 'unavailable'
        }
        for (const item of payload.items) {
          if (item.kind !== 'thread_message' || item.message.date !== payload.date || !item.message.section) continue
          const message = item.message
          const key = messageKey(item.author, message.requestId)
          const prior = previous.get(key)
          const unchanged = !!prior && prior.thread.id === message.threadId && prior.message.section === message.section &&
            prior.message.content === message.content && prior.message.articleBlobSha === message.visibleBlobSha &&
            JSON.stringify(prior.message.speaker) === JSON.stringify(message.speaker)
          // One logical account/message ID can move to another thread after a GitHub edit.
          for (const thread of Object.values(state.threads)) if (thread.date === payload.date) {
            thread.messages = thread.messages.filter((stored) => messageKey(stored.actor, stored.id) !== key || stored.save.kind !== 'saved')
          }
          const thread = state.threads[message.threadId] ?? newThread(message.threadId, item.message.section, message.date)
          if (!state.threads[thread.id]) { state.threads[thread.id] = thread; state.threadOrder.push(thread.id) }
          thread.section = item.message.section
          const local = thread.messages.find((stored) => messageKey(stored.actor, stored.id) === key)
          if (local && !unchanged) {
            thread.error = 'A GitHub message now differs from this unsaved local copy. Its current text is in correspondence history; this local copy is retained.'
            continue
          }
          const restored: ChatMessage = {
            id: message.requestId, role: message.speaker.kind === 'human' ? 'user' : 'assistant', content: message.content,
            articleBlobSha: message.visibleBlobSha, section: thread.section, actor: item.author, speaker: message.speaker,
            save: { kind: 'saved', url: item.url, observation: 'current' },
            includeInRevision: unchanged && message.visibleBlobSha === payload.visibleBlobSha ? prior?.message.includeInRevision ?? false : false,
          }
          if (local) thread.messages.splice(thread.messages.indexOf(local), 1, restored)
          else thread.messages.push(restored)
        }
        for (const pending of payload.pending) {
          if (!pending.section || pending.date !== payload.date) continue
          const thread = state.threads[pending.threadId] ?? newThread(pending.threadId, pending.section, pending.date)
          if (!state.threads[thread.id]) { state.threads[thread.id] = thread; state.threadOrder.push(thread.id) }
          if (thread.messages.some((message) => messageKey(message.actor, message.id) === messageKey(payload.login, pending.requestId))) continue
          thread.messages.push({ id: pending.requestId, role: pending.speaker.kind === 'human' ? 'user' : 'assistant',
            content: pending.content, articleBlobSha: pending.visibleBlobSha, section: pending.section, actor: payload.login, speaker: pending.speaker,
            save: { kind: 'unsaved', error: 'Save was not confirmed. Retry saving this message; the assistant will not be called.' }, includeInRevision: false })
        }
      },
    },
    clearCorrespondence: {
      prepare() { for (const request of activeRequests) request.abort(); return { payload: null } },
      reducer(state) { return { ...initialState, generation: state.generation + 1 } },
    },
    collapseThread(state, action: PayloadAction<string>) { const thread = state.threads[action.payload]; if (thread) thread.isCollapsed = true },
    expandThread(state, action: PayloadAction<string>) { const thread = state.threads[action.payload]; if (thread) thread.isCollapsed = false },
    removeThread(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload]
      if (!thread) return
      thread.isHidden = true
    },
    restoreHiddenThreads(state, action: PayloadAction<string>) {
      for (const thread of Object.values(state.threads)) if (thread.date === action.payload) thread.isHidden = false
    },
    queueMessage(state, action: PayloadAction<{ threadId: string; message: ChatMessage }>) {
      state.threads[action.payload.threadId]?.messages.push(action.payload.message)
    },
    savingMessage(state, action: PayloadAction<{ threadId: string; messageId: string; actor: string }>) {
      const message = state.threads[action.payload.threadId]?.messages.find((item) => messageKey(item.actor, item.id) === messageKey(action.payload.actor, action.payload.messageId))
      if (message) message.save = { kind: 'saving' }
    },
    savedMessage(state, action: PayloadAction<{ threadId: string; messageId: string; actor: string; url: string }>) {
      const message = state.threads[action.payload.threadId]?.messages.find((item) => messageKey(item.actor, item.id) === messageKey(action.payload.actor, action.payload.messageId))
      if (message) message.save = { kind: 'saved', url: action.payload.url, observation: 'current' }
    },
    failedMessage(state, action: PayloadAction<{ threadId: string; messageId: string; actor: string; error: string }>) {
      const message = state.threads[action.payload.threadId]?.messages.find((item) => messageKey(item.actor, item.id) === messageKey(action.payload.actor, action.payload.messageId))
      if (message) message.save = { kind: 'unsaved', error: action.payload.error }
    },
    setRevisionInclusion(state, action: PayloadAction<{ threadId: string; messageId: string; actor: string; included: boolean }>) {
      const message = state.threads[action.payload.threadId]?.messages.find((item) => messageKey(item.actor, item.id) === messageKey(action.payload.actor, action.payload.messageId))
      if (message?.role === 'user') message.includeInRevision = action.payload.included
    },
    appendStreamChunk(state, action: PayloadAction<{ threadId: string; text: string }>) {
      const thread = state.threads[action.payload.threadId]
      if (thread) thread.streamingContent += action.payload.text
    },
    clearStream(state, action: PayloadAction<string>) { const thread = state.threads[action.payload]; if (thread) thread.streamingContent = '' },
  },
  extraReducers: (builder) => {
    builder.addCase(sendMessage.pending, (state, action) => {
      const thread = state.threads[action.meta.arg.threadId]
      if (thread) { thread.isStreaming = true; thread.assistantRequestId = action.meta.requestId; thread.streamingContent = ''; thread.error = null }
    }).addCase(sendMessage.fulfilled, (state, action) => {
      const thread = state.threads[action.meta.arg.threadId]
      if (thread?.assistantRequestId === action.meta.requestId) { thread.isStreaming = false; thread.assistantRequestId = null }
    }).addCase(sendMessage.rejected, (state, action) => {
      const thread = state.threads[action.meta.arg.threadId]
      if (thread?.assistantRequestId === action.meta.requestId) {
        thread.isStreaming = false
        thread.assistantRequestId = null
        const error = action.error.message ?? 'Assistant request failed.'
        const latest = thread.messages[thread.messages.length - 1]
        thread.error = latest?.save.kind === 'unsaved' && latest.save.error === error ? null : error
      }
    })
  },
})

export const { createThread, hydrateCorrespondence, clearCorrespondence, collapseThread, expandThread, removeThread, restoreHiddenThreads, setRevisionInclusion, clearStream } = chatSlice.actions
export default chatSlice.reducer
