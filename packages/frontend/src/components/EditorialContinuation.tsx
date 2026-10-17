import { useEffect, useRef, useState } from 'react'
import { editorialFeedbackSchema, editorialInputSchema, editorialWriteReceiptSchema, type EditorialInput, type EditorialProjection } from '../../../../shared/article-review.ts'
import type { EditorialFeedback } from '../utils/stampDraft.ts'
import { EditorialInput as NoteInput } from './EditorialEditor.tsx'

interface LocalNote { id: number; feedback: EditorialFeedback['notes'][number] }

type Existing = Extract<EditorialProjection, { status: 'existing' }>
export function EditorialContinuation({ view, date, login, visibleBlobSha, refresh }: {
  view: Existing; date: string; login: string; visibleBlobSha?: string; refresh: () => Promise<void>
}) {
  const key = `dl-editorial-continuation:${login}:${date}:${view.pullRequest.number}`
  const [notes, setNotes] = useState<LocalNote[]>(() => {
    try { return editorialFeedbackSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? 'null')).notes.map((feedback, id) => ({ id, feedback })) } catch { return [{ id: 0, feedback: { kind: 'root', content: '' } }] }
  })
  const nextId = useRef(notes.length)
  const [pending, setPending] = useState<EditorialInput | null>(() => {
    try { return editorialInputSchema.parse(JSON.parse(sessionStorage.getItem(`${key}:pending`) ?? 'null')) } catch { return null }
  })
  const [busy, setBusy] = useState(false)
  const articleIdentity = `${view.pullRequest.headSha}:${view.article.blobSha}`
  const [reviewedIdentity, setReviewedIdentity] = useState<string | null>(null)
  const reviewed = reviewedIdentity === articleIdentity
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [retryReady, setRetryReady] = useState(() => { try { return !!sessionStorage.getItem(`${key}:pending`) } catch { return false } })
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify({ version: 2, notes: notes.map(note => note.feedback).filter(note => note.content.trim()) })) } catch { /* In-memory draft remains available. */ } }, [key, notes])
  useEffect(() => {
    try { if (pending) sessionStorage.setItem(`${key}:pending`, JSON.stringify(pending)); else sessionStorage.removeItem(`${key}:pending`) } catch { /* Keep the frozen pending input in memory. */ }
  }, [key, pending])
  async function submit(input: EditorialInput) {
    try { sessionStorage.setItem(`${key}:pending`, JSON.stringify(input)) } catch { /* Frozen input remains in memory. */ }
    setPending(input); setRetryReady(false); setBusy(true); setMessage(''); setReceipt(null)
    try {
      const response = await fetch('/api/article-reviews', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(input) })
      if (!response.ok) throw new Error(`Submission is not confirmed (${response.status}). Text and request identity are retained. Refresh history before retrying.`)
      const result = editorialWriteReceiptSchema.parse(await response.json())
      try { sessionStorage.removeItem(`${key}:pending`) } catch { /* A future retry still reconciles the same UUID. */ }
      setReceipt(result.url); setPending(null)
      setMessage(result.execution === 'requested' ? 'Revision requested for this saved feedback and PR head. Check execution receipts for its outcome.' : 'Feedback version saved. No revision was requested.')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Submission is not confirmed. Refresh history before retrying.') }
    finally { setBusy(false) }
  }
  const latest = view.versions.at(-1)
  const currentNotes = notes.map(note => note.feedback).filter(note => note.content.trim())
  const draftMatchesSaved = latest?.record.intent === 'append_editorial_feedback' && JSON.stringify(currentNotes) === JSON.stringify(latest.record.feedback.notes)
  const canEdit = view.eligible && !view.outstanding && !busy && !pending
  const editingReason = !view.eligible ? view.reason : view.outstanding ? 'A revision request is outstanding. Refresh its receipts before another save or request.' : busy ? 'Submission is in progress.' : pending ? 'Submission is unconfirmed. Refresh history before retrying the same submission.' : null
  const saveHelp = editingReason ? 'Saving is disabled. See the submission status below.' : (!visibleBlobSha ? 'Reload the main article before saving feedback.' : !currentNotes.length ? 'Enter feedback before saving a new version.' : 'Saving appends this complete version without starting a revision.')
  const requestHelp = editingReason ? 'Revision requests are disabled. See the submission status below.' : (!latest ? 'Save a feedback version before requesting another revision.' : !draftMatchesSaved ? 'Save the edited full version before requesting it.' : !reviewed ? 'Review the pinned PR-head article before requesting its revision.' : 'Request uses the saved version and reviewed PR article shown here.')
  const base: Pick<EditorialInput, 'schemaVersion' | 'date' | 'pullRequest' | 'headSha'> = { schemaVersion: 1, date, pullRequest: view.pullRequest.number, headSha: view.pullRequest.headSha }
  return <section className="editorial-sidebar editorial-continuation" aria-label="Continue editorial feedback">
    <div className="editorial-heading">EDITORIAL</div>
    <p><a href={view.pullRequest.url}>PR #{view.pullRequest.number}</a> · {view.pullRequest.merged ? 'merged' : view.pullRequest.state}</p>
    <p>{view.reason} Owner requests on GitHub are eligible independently of the web allowlist.</p>
    <p>Main-visible article: <code>{visibleBlobSha ?? 'unknown'}</code></p>
    <details><summary>Original submitted feedback and PR receipt</summary><pre className="review-correspondence-text">{view.originalBody}</pre></details>
    {view.versions.map(item => <details key={item.commentId}>
      <summary>Saved feedback version · {item.record.actor} · {item.createdAt}</summary>
      <a href={item.url}>Saved receipt</a>
      {item.duplicateUrls.map(url => <a key={url} href={url}>Duplicate delivery receipt</a>)}
      {item.record.intent === 'append_editorial_feedback' && item.record.feedback.notes.map((note, index) => <pre key={index} className="review-correspondence-text">{note.kind === 'section' ? `${note.section}\n` : ''}{note.content}</pre>)}
    </details>)}
    <details><summary>PR-head article preview</summary>
      <p>Head <code>{view.pullRequest.headSha}</code> · article blob <code>{view.article.blobSha}</code></p>
      <pre className="review-correspondence-text" tabIndex={0}>{view.article.text}</pre>
    </details>
    <label className="editorial-review-confirmation"><input type="checkbox" checked={reviewed} disabled={!canEdit} onChange={event => setReviewedIdentity(event.currentTarget.checked ? articleIdentity : null)} />I reviewed this pinned PR-head article</label>
    {notes.map((note, index) => <div className="editorial-note" key={note.id}>
      <label className="editorial-note-label" htmlFor={`continued-editorial-note-${note.id}`}>{note.feedback.kind === 'section' ? `Section: ${note.feedback.section}` : 'Edit suggestion'}</label>
      <div className="editorial-suggestion">
        <NoteInput id={`continued-editorial-note-${note.id}`} content={note.feedback.content} disabled={!canEdit} onChange={content => setNotes(previous => previous.map(item => item.id === note.id ? { ...item, feedback: { ...item.feedback, content } } : item))} />
        {notes.length > 1 && <button className="editorial-remove-btn" disabled={!canEdit} aria-label={`Remove continued suggestion ${index + 1}`} onClick={() => setNotes(previous => previous.filter(item => item.id !== note.id))}>Remove</button>}
      </div>
    </div>)}
    <button className="editorial-action" disabled={!canEdit} onClick={() => {
      const note: LocalNote = { id: nextId.current++, feedback: { kind: 'root', content: '' } }
      setNotes(previous => [...previous, note])
    }}>Add another edit suggestion</button>
    <p>This full version supersedes active feedback. Original text and every saved version remain history. Saving text starts no acceptance or model run.</p>
    <button className="editorial-action" disabled={!canEdit || !latest} onClick={() => {
      if (latest?.record.intent === 'append_editorial_feedback') setNotes(latest.record.feedback.notes.map(feedback => ({ id: nextId.current++, feedback })))
    }}>Copy prior version</button>
    <button className="editorial-action editorial-action-primary" aria-describedby={editingReason ? 'continued-save-help continued-status' : 'continued-save-help'} disabled={!canEdit || !currentNotes.length || !visibleBlobSha} onClick={() => {
      if (!visibleBlobSha) return
      void submit({ ...base, intent: 'append_editorial_feedback', requestId: crypto.randomUUID(), visibleBlobSha,
        supersedes: latest?.digest ?? view.originalDigest, feedback: { version: 2, notes: currentNotes } })
    }}>Save new feedback version</button>
    <p id="continued-save-help">{saveHelp}</p>
    {latest && <p>Selected saved version <code>{latest.record.requestId}</code> · digest <code>{latest.digest}</code> · <a href={latest.url}>Feedback receipt</a></p>}
    <p>Request another revision authorizes one model attempt for the selected saved version and this exact PR article. Human merge remains separate.</p>
    <button className="editorial-action editorial-action-primary" aria-describedby={editingReason ? 'continued-request-help continued-status' : 'continued-request-help'} disabled={!canEdit || !latest || !reviewed || !draftMatchesSaved} onClick={() => {
      if (!latest) return
      void submit({ ...base, intent: 'request_editorial_revision', requestId: crypto.randomUUID(), articleBlobSha: view.article.blobSha,
        feedbackId: latest.record.requestId, feedbackDigest: latest.digest })
    }}>Request another article revision</button>
    <p id="continued-request-help">{requestHelp}</p>
    {editingReason && <p id="continued-status" role="status">{editingReason}</p>}
    {pending && <button className="editorial-action" disabled={busy || !retryReady} onClick={() => void submit(pending)}>Retry same submission</button>}
    <button className="editorial-action" disabled={busy} onClick={() => void refresh()}>Refresh acceptance history</button>
    {view.requests.map(item => <p key={item.commentId}><a href={item.url}>Explicit revision request</a>{item.duplicateUrls.map(url => <a key={url} href={url}>Duplicate delivery receipt</a>)} · {item.record.actor} · {item.createdAt}</p>)}
    {message && <p role="status">{message} {receipt && <a href={receipt}>Read receipt</a>}</p>}
  </section>
}
