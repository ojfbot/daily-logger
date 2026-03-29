import { useAppSelector } from '../store/hooks.ts'
import { InlineChatThread } from './InlineChatThread.tsx'

interface Props {
  section: string
  date: string
  articleTitle: string
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function SectionChatZone({ section, date, articleTitle, extractSection }: Props) {
  const threads = useAppSelector((s) => {
    const all = s.chat.threadOrder
      .map((id) => s.chat.threads[id])
      .filter((t) => t && t.section === section && t.date === date)
    return all
  })

  if (threads.length === 0) return null

  return (
    <div className="section-chat-zone">
      <div className="section-chat-zone-heading">{section}</div>
      {threads.map((thread) => (
        <InlineChatThread
          key={thread.id}
          thread={thread}
          articleTitle={articleTitle}
          extractSection={extractSection}
        />
      ))}
    </div>
  )
}
