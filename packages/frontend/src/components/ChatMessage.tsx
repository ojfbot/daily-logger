import { useMemo } from 'react'
import { marked } from 'marked'

interface Props {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: Props) {
  const html = useMemo(() => {
    if (role === 'user') return null
    return marked.parse(content) as string
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
