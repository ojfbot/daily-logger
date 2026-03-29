import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { closeChat, sendMessage } from '../store/chatSlice.ts'
import { ChatMessage } from './ChatMessage.tsx'

interface Props {
  articleTitle: string
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function ChatSidebar({ articleTitle, extractSection }: Props) {
  const dispatch = useAppDispatch()
  const { activeSection, activeDate, conversations, isStreaming, streamingContent, error } =
    useAppSelector((s) => s.chat)

  const [input, setInput] = useState('')
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const key = activeDate && activeSection ? `${activeDate}:${activeSection}` : ''
  const messages = key ? conversations[key] ?? [] : []

  const hasApiKey = !!localStorage.getItem('dl-anthropic-key')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingContent])

  useEffect(() => {
    if (activeSection) inputRef.current?.focus()
  }, [activeSection])

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming || !activeSection || !activeDate) return

    if (!hasApiKey) {
      setShowKeyPrompt(true)
      return
    }

    const section = extractSection(activeSection)
    if (!section) return

    dispatch(
      sendMessage({
        date: activeDate,
        section: activeSection,
        sectionContent: section.content,
        articleTitle,
        codeReferences: section.codeRefs,
        message: input.trim(),
      }),
    )
    setInput('')
  }, [input, isStreaming, activeSection, activeDate, hasApiKey, extractSection, articleTitle, dispatch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape') {
        dispatch(closeChat())
      }
    },
    [handleSend, dispatch],
  )

  const handleSaveKey = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const keyInput = new FormData(form).get('apiKey') as string
    if (keyInput?.trim()) {
      localStorage.setItem('dl-anthropic-key', keyInput.trim())
      setShowKeyPrompt(false)
    }
  }, [])

  if (!activeSection) return null

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-title">{activeSection}</div>
        <button className="chat-sidebar-close" onClick={() => dispatch(closeChat())} aria-label="Close chat">
          ×
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !isStreaming && (
          <div className="chat-empty">
            Ask a question about this section. Claude has the full section content as context.
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}

        {isStreaming && streamingContent && (
          <ChatMessage role="assistant" content={streamingContent} isStreaming />
        )}

        {error && (
          <div className="chat-error">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showKeyPrompt ? (
        <form className="chat-key-prompt" onSubmit={handleSaveKey}>
          <label>Anthropic API Key</label>
          <input
            type="password"
            name="apiKey"
            placeholder="sk-ant-..."
            autoFocus
          />
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
            placeholder={hasApiKey ? 'Ask about this section...' : 'Set API key first →'}
            disabled={isStreaming}
            rows={2}
          />
          <div className="chat-input-actions">
            {!hasApiKey && (
              <button
                className="chat-key-btn"
                onClick={() => setShowKeyPrompt(true)}
                title="Set API key"
              >
                🔑
              </button>
            )}
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming ? '...' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
