import { useLayoutEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { restoreHiddenThreads } from '../store/chatSlice.ts'
import { InlineChatThread } from './InlineChatThread.tsx'
import type { DiscussionAvailability } from './IndependentArticleReviews.tsx'

interface Props {
  section: string
  date: string
  articleTitle: string
  visibleBlobSha?: string
  discussionAvailability: DiscussionAvailability
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function SectionChatZone({ section, date, articleTitle, visibleBlobSha, discussionAvailability, extractSection }: Props) {
  const dispatch = useAppDispatch()
  const login = useAppSelector((state) => state.auth.user?.login)
  const showHidden = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<{ kind: 'recovery' } | { kind: 'thread'; id: string } | null>(null)
  const chat = useAppSelector((state) => state.chat)
  const threads = useMemo(() => {
    const all = chat.threadOrder
      .map((id) => chat.threads[id])
      .filter((t) => t && t.section === section && t.date === date)
    return all
  }, [chat, section, date])

  useLayoutEffect(() => {
    if (pendingFocus.current?.kind === 'recovery') showHidden.current?.focus()
    else if (pendingFocus.current?.kind === 'thread') document.getElementById(`discussion-toggle-${pendingFocus.current.id}`)?.focus()
    pendingFocus.current = null
  }, [threads])

  if (threads.length === 0) return null
  const hidden = threads.some((thread) => thread.isHidden)

  return (
    <div className="section-chat-zone">
      <div className="section-chat-zone-heading">{section}</div>
      {hidden && <button ref={showHidden} type="button" onClick={() => {
        const first = threads.find((thread) => thread.isHidden)
        pendingFocus.current = first ? { kind: 'thread', id: first.id } : null
        dispatch(restoreHiddenThreads(date))
      }}>Show hidden discussions</button>}
      {threads.map((thread) => <div key={`${login}:${thread.id}:${visibleBlobSha ?? 'unknown'}`} hidden={thread.isHidden}>
        <InlineChatThread
          thread={thread}
          articleTitle={articleTitle}
          visibleBlobSha={visibleBlobSha}
          discussionAvailability={discussionAvailability}
          extractSection={extractSection}
          onHide={() => { pendingFocus.current = { kind: 'recovery' } }}
        />
      </div>)}
    </div>
  )
}
