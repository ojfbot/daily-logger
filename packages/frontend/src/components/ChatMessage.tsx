import { useMemo } from 'react'
import { renderChatMarkdown } from '../utils/renderChatMarkdown.ts'

interface Props {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: Props) {
  const html = useMemo(() => {
    if (role === 'user') return null
    return renderChatMarkdown(content)
  }, [role, content])

  return (
    <div className={`chat-message chat-message-${role}`}>
      <div className="chat-message-label">{role === 'user' ? 'You' : 'Claude'}</div>
      {role === 'user' ? (
        <div className="chat-message-content">{content}</div>
      ) : (
        <div
          className="chat-message-content"
          dangerouslySetInnerHTML={{ __html: html ?? '' }}
        />
      )}
      {isStreaming && <span className="chat-streaming-cursor" />}
    </div>
  )
}
