import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { restoreHiddenThreads } from '../store/chatSlice.ts'
import { InlineChatThread } from './InlineChatThread.tsx'

interface Props {
  section: string
  date: string
  articleTitle: string
  visibleBlobSha?: string
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function SectionChatZone({ section, date, articleTitle, visibleBlobSha, extractSection }: Props) {
  const dispatch = useAppDispatch()
  const threads = useAppSelector((s) => {
    const all = s.chat.threadOrder
      .map((id) => s.chat.threads[id])
      .filter((t) => t && t.section === section && t.date === date)
    return all
  })

  if (threads.length === 0) return null
  const hidden = threads.some((thread) => thread.isHidden)

  return (
    <div className="section-chat-zone">
      <div className="section-chat-zone-heading">{section}</div>
      {hidden && <button onClick={() => dispatch(restoreHiddenThreads(date))}>Show hidden discussions</button>}
      {threads.filter((thread) => !thread.isHidden).map((thread) => (
        <InlineChatThread
          key={thread.id}
          thread={thread}
          articleTitle={articleTitle}
          visibleBlobSha={visibleBlobSha}
          extractSection={extractSection}
        />
      ))}
    </div>
  )
}
