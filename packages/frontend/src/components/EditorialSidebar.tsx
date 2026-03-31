import { useState } from 'react'
import { useAppSelector } from '../store/hooks.ts'
import { stampDraft } from '../utils/stampDraft.ts'

interface Props {
  date: string
  articleTitle: string
}

type StampState = 'idle' | 'loading' | 'success' | 'error'

export function EditorialSidebar({ date, articleTitle }: Props) {
  const { user } = useAppSelector((s) => s.auth)
  const { threads, threadOrder } = useAppSelector((s) => s.chat)
  const [editSuggestion, setEditSuggestion] = useState('')
  const [state, setState] = useState<StampState>('idle')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [prNumber, setPrNumber] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!user?.authorized) return null

  // Collect section-level feedback from chat threads
  const articleThreads = threadOrder
    .map((id) => threads[id])
    .filter((t) => t && t.date === date && t.messages.length > 0)

  const hasFeedback = editSuggestion.trim().length > 0 || articleThreads.length > 0

  async function handleAccept() {
    setState('loading')
    setErrorMsg(null)

    // Build editorial feedback payload
    const feedback: string[] = []

    if (editSuggestion.trim()) {
      feedback.push(`## Root-level edit suggestion\n\n${editSuggestion.trim()}`)
    }

    for (const thread of articleThreads) {
      const userNotes = thread.messages
        .filter((m) => m.role === 'user')
        .map((m) => `- ${m.content}`)
        .join('\n')
      if (userNotes) {
        feedback.push(`## Section: ${thread.section}\n\n${userNotes}`)
      }
    }

    try {
      const result = await stampDraft(
        date,
        articleTitle,
        user!.login,
        feedback.length > 0 ? feedback.join('\n\n---\n\n') : undefined,
      )
      setPrUrl(result.prUrl)
      setPrNumber(result.prNumber)
      setState('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to stamp draft')
      setState('error')
    }
  }

  if (state === 'success' && prUrl) {
    return (
      <div className="editorial-sidebar">
        <div className="editorial-heading">EDITORIAL</div>
        <div className="stamp-draft-result stamp-success">
          <span className="stamp-check">&#10003;</span>
          PR #{prNumber} opened &mdash;{' '}
          <a href={prUrl} target="_blank" rel="noopener noreferrer">
            View in GitHub
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="editorial-sidebar">
      <div className="editorial-heading">EDITORIAL</div>

      <div className="editorial-suggestion">
        <textarea
          className="editorial-input"
          placeholder="Suggest an edit to this article..."
          value={editSuggestion}
          onChange={(e) => setEditSuggestion(e.target.value)}
          rows={3}
        />
        <button
          className="editorial-suggest-btn"
          title="Add edit suggestion"
          disabled={!editSuggestion.trim()}
          onClick={() => {/* suggestion is captured on accept */}}
        >
          +
        </button>
      </div>

      {hasFeedback && (
        <div className="editorial-feedback-summary">
          {editSuggestion.trim() && <span className="editorial-badge">1 suggestion</span>}
          {articleThreads.length > 0 && (
            <span className="editorial-badge">
              {articleThreads.length} {articleThreads.length === 1 ? 'thread' : 'threads'}
            </span>
          )}
        </div>
      )}

      <button
        className={`stamp-draft-btn${state === 'error' ? ' stamp-error' : ''}${hasFeedback ? ' has-feedback' : ''}`}
        onClick={handleAccept}
        disabled={state === 'loading'}
      >
        {state === 'loading'
          ? 'OPENING PR...'
          : hasFeedback
            ? 'ACCEPT WITH REVISIONS'
            : 'ACCEPT DRAFT'}
      </button>

      {state === 'error' && errorMsg && (
        <div className="stamp-error-msg">{errorMsg}</div>
      )}
    </div>
  )
}
