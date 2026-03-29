import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatState {
  activeSection: string | null
  activeDate: string | null
  conversations: Record<string, ChatMessage[]>
  isStreaming: boolean
  streamingContent: string
  error: string | null
}

const initialState: ChatState = {
  activeSection: null,
  activeDate: null,
  conversations: {},
  isStreaming: false,
  streamingContent: '',
  error: null,
}

function conversationKey(date: string, section: string): string {
  return `${date}:${section}`
}

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (
    payload: {
      date: string
      section: string
      sectionContent: string
      articleTitle: string
      codeReferences: string[]
      message: string
    },
    { dispatch, getState },
  ) => {
    const apiKey = localStorage.getItem('dl-anthropic-key')
    if (!apiKey) {
      throw new Error('No API key configured. Click the key icon in the chat sidebar to set one.')
    }

    const key = conversationKey(payload.date, payload.section)
    const state = getState() as { chat: ChatState }
    const history = state.chat.conversations[key] ?? []

    const systemPrompt = [
      `You are a knowledgeable assistant helping a developer review a daily development article.`,
      ``,
      `## Current context`,
      `- Article date: ${payload.date}`,
      `- Article title: ${payload.articleTitle}`,
      `- Section: ${payload.section}`,
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
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: payload.message },
    ]

    dispatch(chatSlice.actions.addUserMessage({ key, content: payload.message }))
    dispatch(chatSlice.actions.startStreaming())

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
            dispatch(chatSlice.actions.appendStreamChunk(event.delta.text))
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    dispatch(chatSlice.actions.finishStreaming({ key }))
  },
)

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    openChat(state, action: PayloadAction<{ section: string; date: string }>) {
      state.activeSection = action.payload.section
      state.activeDate = action.payload.date
      state.error = null
    },
    closeChat(state) {
      state.activeSection = null
      state.activeDate = null
    },
    addUserMessage(state, action: PayloadAction<{ key: string; content: string }>) {
      const { key, content } = action.payload
      if (!state.conversations[key]) state.conversations[key] = []
      state.conversations[key].push({ role: 'user', content })
    },
    startStreaming(state) {
      state.isStreaming = true
      state.streamingContent = ''
      state.error = null
    },
    appendStreamChunk(state, action: PayloadAction<string>) {
      state.streamingContent += action.payload
    },
    finishStreaming(state, action: PayloadAction<{ key: string }>) {
      const { key } = action.payload
      if (!state.conversations[key]) state.conversations[key] = []
      if (state.streamingContent) {
        state.conversations[key].push({ role: 'assistant', content: state.streamingContent })
      }
      state.isStreaming = false
      state.streamingContent = ''
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sendMessage.rejected, (state, action) => {
      state.isStreaming = false
      state.streamingContent = ''
      state.error = action.error.message ?? 'Failed to send message'
    })
  },
})

export const { openChat, closeChat } = chatSlice.actions
export default chatSlice.reducer
