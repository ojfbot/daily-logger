import { useMemo } from 'react'
import { useAppSelector } from '../store/hooks.ts'

export function SubmitAllFeedback() {
  const { threads, threadOrder } = useAppSelector((s) => s.chat)

  const activeThreads = useMemo(() =>
    threadOrder
      .map((id) => threads[id])
      .filter((t) => t && t.messages.length > 0),
  [threads, threadOrder])

  if (activeThreads.length === 0) return null

  const totalMessages = activeThreads.reduce((sum, t) => sum + t.messages.filter((m) => m.role === 'user').length, 0)
  const sections = [...new Set(activeThreads.map((t) => t.section))]

  return (
    <div className="submit-all-bar">
      <div className="submit-all-info">
        <span className="submit-all-count">
          {activeThreads.length} {activeThreads.length === 1 ? 'thread' : 'threads'} · {totalMessages} {totalMessages === 1 ? 'note' : 'notes'}
        </span>
        <span className="submit-all-sections">
          {sections.join(', ')}
        </span>
      </div>
      <button className="submit-all-btn" onClick={() => {
        // TODO: Phase 4 — save feedback via API endpoint
        alert(`Submit feedback: ${activeThreads.length} threads across ${sections.length} sections.\n\nThis will be wired to the feedback API in Phase 4.`)
      }}>
        Submit All Feedback
      </button>
    </div>
  )
}
