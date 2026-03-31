import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { sendMessage, collapseThread, expandThread, removeThread } from '../store/chatSlice.ts'
import type { ChatThread } from '../store/chatSlice.ts'
import { ChatMessage } from './ChatMessage.tsx'

interface Props {
  thread: ChatThread
  articleTitle: string
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function InlineChatThread({ thread, articleTitle, extractSection }: Props) {
  const dispatch = useAppDispatch()
  const [input, setInput] = useState('')
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { user } = useAppSelector((s) => s.auth)
  const canEdit = !!user?.authorized
  const hasApiKey = !!localStorage.getItem('dl-anthropic-key')
  const threadNum = thread.messages.filter((m) => m.role === 'user').length

  useEffect(() => {
    if (!thread.isCollapsed) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread.messages.length, thread.streamingContent, thread.isCollapsed])

  useEffect(() => {
    if (!thread.isCollapsed) inputRef.current?.focus()
  }, [thread.isCollapsed])

  const handleSend = useCallback(() => {
    if (!input.trim() || thread.isStreaming) return

    if (!hasApiKey) {
      setShowKeyPrompt(true)
      return
    }

    const section = extractSection(thread.section)
    if (!section) return

    dispatch(
      sendMessage({
        threadId: thread.id,
        sectionContent: section.content,
        articleTitle,
        codeReferences: section.codeRefs,
        message: input.trim(),
      }),
    )
    setInput('')
  }, [input, thread, hasApiKey, extractSection, articleTitle, dispatch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleSaveKey = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const keyInput = new FormData(e.currentTarget).get('apiKey') as string
    if (keyInput?.trim()) {
      localStorage.setItem('dl-anthropic-key', keyInput.trim())
      setShowKeyPrompt(false)
    }
  }, [])

  if (thread.isCollapsed) {
    return (
      <div className="chat-thread chat-thread-collapsed" onClick={() => dispatch(expandThread(thread.id))}>
        <div className="chat-thread-collapsed-bar">
          <span className="chat-thread-collapsed-label">
            Thread · {threadNum} {threadNum === 1 ? 'message' : 'messages'}
          </span>
          <button
            className="chat-thread-remove"
            onClick={(e) => { e.stopPropagation(); dispatch(removeThread(thread.id)) }}
            title="Remove thread"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-thread">
      <div className="chat-thread-header">
        <span className="chat-thread-label">Thread</span>
        <div className="chat-thread-actions">
          <button onClick={() => dispatch(collapseThread(thread.id))} title="Collapse">—</button>
          <button onClick={() => dispatch(removeThread(thread.id))} title="Remove">×</button>
        </div>
      </div>

      <div className="chat-thread-messages">
        {thread.messages.length === 0 && !thread.isStreaming && (
          <div className="chat-empty">
            {canEdit
              ? 'Ask about this section or discuss changes — feedback here feeds into editorial revisions.'
              : 'Ask about this section — Claude has the full content as context.'}
          </div>
        )}

        {thread.messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}

        {thread.isStreaming && thread.streamingContent && (
          <ChatMessage role="assistant" content={thread.streamingContent} isStreaming />
        )}

        <div ref={messagesEndRef} />
      </div>

      {showKeyPrompt ? (
        <form className="chat-key-prompt" onSubmit={handleSaveKey}>
          <label>Anthropic API Key</label>
          <input type="password" name="apiKey" placeholder="sk-ant-..." autoFocus />
          <div className="chat-key-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={() => setShowKeyPrompt(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey
              ? (canEdit ? 'Ask or suggest changes...' : 'Ask about this section...')
              : 'Set API key first →'}
            disabled={thread.isStreaming}
            rows={2}
          />
          <div className="chat-input-actions">
            {!hasApiKey && (
              <button className="chat-key-btn" onClick={() => setShowKeyPrompt(true)} title="Set API key">
                🔑
              </button>
            )}
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={thread.isStreaming || !input.trim()}
            >
              {thread.isStreaming ? '...' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
