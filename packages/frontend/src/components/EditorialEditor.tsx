import { useEffect, useRef, useState } from 'react'
import { useAppSelector } from '../store/hooks.ts'
import { editorialProjectionSchema, type EditorialProjection } from '../../../../shared/article-review.ts'
import { EditorialContinuation } from './EditorialContinuation.tsx'
import { EditorialInput } from './EditorialInput.tsx'
import { stampDraft, type EditorialFeedback } from '../utils/stampDraft.ts'

interface Props {
  date: string
  articleTitle: string
  visibleBlobSha?: string
}

type StampState = 'idle' | 'loading' | 'success' | 'error'

interface Note {
  id: number
  content: string
}

function readDraft(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return ['']
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((note) => typeof note === 'string')) {
      return parsed
    }
  } catch {
    // Storage may be unavailable. Editing and submission still work in memory.
  }
  return ['']
}

export function EditorialEditor({ date, articleTitle, visibleBlobSha, login }: Props & { login: string }) {
  const { threads, threadOrder } = useAppSelector((s) => s.chat)
  const storageKey = `dl-editorial:${login}:${date}`
  const [entries, setEntries] = useState<Note[]>(() => readDraft(storageKey).map((content, id) => ({ id, content })))
  const nextId = useRef(entries.length)
  const [state, setState] = useState<StampState>('idle')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [prNumber, setPrNumber] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const discoveryGeneration = useRef(0)
  const [discovery, setDiscovery] = useState<EditorialProjection | null>(null)
  const [discoveryError, setDiscoveryError] = useState('')
  const [discoveryFreshness, setDiscoveryFreshness] = useState<'loading' | 'fresh' | 'unavailable'>('loading')
  async function refreshAcceptance() {
    const generation = ++discoveryGeneration.current
    setDiscoveryFreshness('loading'); setDiscoveryError('')
    try {
      const response = await fetch(`/api/article-reviews?view=editorial&date=${date}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(`Acceptance discovery unavailable (${response.status}). Creation and continuation are disabled.`)
      const projection = editorialProjectionSchema.parse(await response.json())
      if (generation !== discoveryGeneration.current) return false
      setDiscovery(projection); setDiscoveryFreshness('fresh')
      return true
    } catch (error) {
      if (generation === discoveryGeneration.current) {
        setDiscoveryError(error instanceof Error ? error.message : 'Acceptance discovery unavailable.')
        setDiscoveryFreshness('unavailable')
      }
      return false
    }
  }
  useEffect(() => { void refreshAcceptance(); return () => { discoveryGeneration.current++ } }, [date, login])


  useEffect(() => {
    try {
      if (state === 'success' || entries.every((entry) => !entry.content.trim())) sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, JSON.stringify(entries.map((entry) => entry.content)))
    } catch {
      // Storage may be unavailable. A failed submission still retains the notes.
    }
  }, [entries, state, storageKey])

  // Collect section-level feedback from chat threads
  const articleThreads = threadOrder
    .map((id) => threads[id])
    .filter((t) => t && t.date === date && !t.isHidden && t.messages.some((message) =>
      message.role === 'user' && message.includeInRevision && !!visibleBlobSha && message.articleBlobSha === visibleBlobSha))

  const suggestions = entries.map((entry) => entry.content).filter((content) => content.trim())
  const hasFeedback = suggestions.length > 0 || articleThreads.length > 0

  async function handleAccept() {
    if (discoveryFreshness !== 'fresh' || discovery?.status !== 'none') return
    setState('loading')
    setErrorMsg(null)

    const notes: EditorialFeedback['notes'] = []

    for (const suggestion of suggestions) {
      notes.push({ kind: 'root', content: suggestion })
    }

    for (const thread of articleThreads) {
      const userNotes = thread.messages
        .filter((m) => m.role === 'user' && m.includeInRevision && !!visibleBlobSha && m.articleBlobSha === visibleBlobSha)
        .map((m) => m.content)
      for (const content of userNotes) {
        notes.push({ kind: 'section', section: thread.section, content })
      }
    }

    try {
      const result = await stampDraft(
        date,
        articleTitle,
        login,
        notes.length > 0 ? { version: 2, notes } : undefined,
      )
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        // Successful submission must not depend on browser storage availability.
      }
      setPrUrl(result.prUrl)
      setPrNumber(result.prNumber)
      setState('success')
      void refreshAcceptance()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to stamp draft')
      setState('error')
    }
  }

  if (discovery?.status === 'existing') return <EditorialContinuation key={`${login}:${date}:${discovery.pullRequest.number}`} view={discovery} date={date} login={login} visibleBlobSha={visibleBlobSha} refresh={refreshAcceptance} freshness={discoveryFreshness} discoveryError={discoveryError} />

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
        <p role="status">{discoveryError || 'Checking acceptance history for continuation...'}</p>
        <button onClick={() => void refreshAcceptance()}>Refresh acceptance history</button>
      </div>
    )
  }

  return (
    <div className="editorial-sidebar">
      <div className="editorial-heading">EDITORIAL</div>
      {!discovery && <p role="status">{discoveryError || 'Checking existing acceptance history...'}</p>}
      {discoveryError && <button onClick={() => void refreshAcceptance()}>Retry acceptance discovery</button>}

      {entries.map((entry, index) => (
        <div className="editorial-note" key={entry.id}>
          <label className="editorial-note-label" htmlFor={`editorial-note-${entry.id}`}>
            Edit suggestion
          </label>
          <div className="editorial-suggestion">
            <EditorialInput
              id={`editorial-note-${entry.id}`}
              content={entry.content}
              disabled={state === 'loading'}
              onChange={(content) => {
                setEntries((previous) => previous.map((note) => note.id === entry.id ? { ...note, content } : note))
              }}
            />
            {index === entries.length - 1 && (
              <button
                className="editorial-suggest-btn"
                title="Add another edit suggestion"
                aria-label="Add another edit suggestion"
                disabled={state === 'loading' || !entry.content.trim()}
                onClick={() => {
                  const note = { id: nextId.current++, content: '' }
                  setEntries((previous) => [...previous, note])
                }}
              >
                +
              </button>
            )}
            {entries.length > 1 && (
              <button
                className="editorial-remove-btn"
                aria-label={`Remove edit suggestion ${index + 1}`}
                disabled={state === 'loading'}
                onClick={() => setEntries((previous) => previous.filter((note) => note.id !== entry.id))}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      {hasFeedback && (
        <div className="editorial-feedback-summary">
          {suggestions.length > 0 && <span className="editorial-badge">{suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}</span>}
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
        disabled={state === 'loading' || discoveryFreshness !== 'fresh' || discovery?.status !== 'none'}
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
