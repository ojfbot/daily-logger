import { createSlice, createAsyncThunk, nanoid } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatThread {
  id: string
  section: string
  date: string
  messages: ChatMessage[]
  isCollapsed: boolean
  isStreaming: boolean
  streamingContent: string
}

interface ChatState {
  threads: Record<string, ChatThread>
  threadOrder: string[] // insertion order
  error: string | null
}

const initialState: ChatState = {
  threads: {},
  threadOrder: [],
  error: null,
}

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (
    payload: {
      threadId: string
      sectionContent: string
      articleTitle: string
      codeReferences: string[]
      message: string
    },
    { dispatch, getState },
  ) => {
    const apiKey = localStorage.getItem('dl-anthropic-key')
    if (!apiKey) {
      throw new Error('No API key configured. Click the key icon to set one.')
    }

    const state = getState() as { chat: ChatState }
    const thread = state.chat.threads[payload.threadId]
    if (!thread) throw new Error('Thread not found')

    const systemPrompt = [
      `You are a knowledgeable assistant helping a developer review a daily development article.`,
      ``,
      `## Current context`,
      `- Article title: ${payload.articleTitle}`,
      `- Section: ${thread.section}`,
      ``,
      `## Section content`,
      payload.sectionContent,
      payload.codeReferences.length > 0
        ? `\n## Code references in this section\n${payload.codeReferences.join(', ')}`
        : '',
      ``,
      `## Instructions`,
      `Answer questions about this section specifically. Be concise and precise.`,
      `If the user identifies an inaccuracy, acknowledge it clearly.`,
      `If asked about something outside this section, note that and answer if you can.`,
    ].join('\n')

    const messages = [
      ...thread.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: payload.message },
    ]

    dispatch(chatSlice.actions.addUserMessage({ threadId: payload.threadId, content: payload.message }))
    dispatch(chatSlice.actions.startStreaming(payload.threadId))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            dispatch(chatSlice.actions.appendStreamChunk({ threadId: payload.threadId, text: event.delta.text }))
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    dispatch(chatSlice.actions.finishStreaming(payload.threadId))
  },
)

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    createThread(state, action: PayloadAction<{ section: string; date: string }>) {
      const id = nanoid()
      state.threads[id] = {
        id,
        section: action.payload.section,
        date: action.payload.date,
        messages: [],
        isCollapsed: false,
        isStreaming: false,
        streamingContent: '',
      }
      state.threadOrder.push(id)
    },
    collapseThread(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload]
      if (thread) thread.isCollapsed = true
    },
    expandThread(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload]
      if (thread) thread.isCollapsed = false
    },
    removeThread(state, action: PayloadAction<string>) {
      delete state.threads[action.payload]
      state.threadOrder = state.threadOrder.filter((id) => id !== action.payload)
    },
    addUserMessage(state, action: PayloadAction<{ threadId: string; content: string }>) {
      const thread = state.threads[action.payload.threadId]
      if (thread) thread.messages.push({ role: 'user', content: action.payload.content })
    },
    startStreaming(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload]
      if (thread) {
        thread.isStreaming = true
        thread.streamingContent = ''
        state.error = null
      }
    },
    appendStreamChunk(state, action: PayloadAction<{ threadId: string; text: string }>) {
      const thread = state.threads[action.payload.threadId]
      if (thread) thread.streamingContent += action.payload.text
    },
    finishStreaming(state, action: PayloadAction<string>) {
      const thread = state.threads[action.payload]
      if (thread) {
        if (thread.streamingContent) {
          thread.messages.push({ role: 'assistant', content: thread.streamingContent })
        }
        thread.isStreaming = false
        thread.streamingContent = ''
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sendMessage.rejected, (state, action) => {
      state.error = action.error.message ?? 'Failed to send message'
      // Find the thread that was streaming and stop it
      for (const thread of Object.values(state.threads)) {
        if (thread.isStreaming) {
          thread.isStreaming = false
          thread.streamingContent = ''
        }
      }
    })
  },
})

export const { createThread, collapseThread, expandThread, removeThread } = chatSlice.actions
export default chatSlice.reducer
