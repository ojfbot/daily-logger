import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editorialFeedbackSchema, editorialInputSchema, editorialWriteReceiptSchema, editorialWriteFailureSchema, type EditorialInput, type EditorialProjection } from '../../../../shared/article-review.ts'
import type { EditorialFeedback } from '../utils/stampDraft.ts'
import { EditorialInput as NoteInput } from './EditorialInput.tsx'

interface LocalNote { id: number; feedback: EditorialFeedback['notes'][number] }

type Existing = Extract<EditorialProjection, { status: 'existing' }>
type Submission =
  | { kind: 'idle' }
  | { kind: 'unreadable'; reason: 'unreadable' | 'changed' }
  | { kind: 'uncertain'; input: EditorialInput }
  | { kind: 'posting'; input: EditorialInput; attempt: symbol; origin: 'first' | 'retry' }

function restoreSubmission(key: string): Submission {
  let raw: string | null
  try { raw = sessionStorage.getItem(key) } catch { return { kind: 'idle' } }
  if (!raw) return { kind: 'idle' }
  try {
    const parsed = editorialInputSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { kind: 'uncertain', input: parsed.data } : { kind: 'unreadable', reason: 'unreadable' }
  } catch { return { kind: 'unreadable', reason: 'unreadable' } }
}
function sameInput(left: EditorialInput, right: EditorialInput) {
  return JSON.stringify(left) === JSON.stringify(right)
}
export function EditorialContinuation({ view, date, login, visibleBlobSha, refresh, freshness = 'fresh', discoveryError = '' }: {
  view: Existing; date: string; login: string; visibleBlobSha?: string; refresh: () => Promise<boolean | void>; freshness?: 'loading' | 'fresh' | 'unavailable'; discoveryError?: string
}) {
  const key = `dl-editorial-continuation:${login}:${date}:${view.pullRequest.number}`
  const [notes, setNotes] = useState<LocalNote[]>(() => {
    try { return editorialFeedbackSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? 'null')).notes.map((feedback, id) => ({ id, feedback })) } catch { return [{ id: 0, feedback: { kind: 'root', content: '' } }] }
  })
  const nextId = useRef(notes.length)
  const [submission, setSubmission] = useState<Submission>(() => restoreSubmission(`${key}:pending`))
  const current = useRef(submission)
  const generation = useRef(0)
  const retryGeneration = useRef<number | null>(null)
  const lifetime = useRef(Symbol())
  useLayoutEffect(() => {
    lifetime.current = Symbol()
    return () => { lifetime.current = Symbol() }
  }, [])
  // This is the only owner of pending state and storage. Input is a parsed snapshot,
  // never a reference to the editable notes.
  function transition(next: Submission, expected: Submission) {
    if (current.current !== expected) return false
    const previous = current.current
    let retained = next
    try {
      if (next.kind === 'posting' && next.origin === 'first') {
        const raw = sessionStorage.getItem(`${key}:pending`)
        if (raw) retained = { kind: 'unreadable', reason: 'changed' }
        else sessionStorage.setItem(`${key}:pending`, JSON.stringify(next.input))
      } else if (next.kind === 'idle' && 'input' in previous) {
        const raw = sessionStorage.getItem(`${key}:pending`)
        if (raw) {
          let parsed: unknown
          try { parsed = JSON.parse(raw) } catch { /* The schema below blocks malformed evidence. */ }
          const stored = editorialInputSchema.safeParse(parsed)
          if (stored.success && sameInput(stored.data, previous.input)) sessionStorage.removeItem(`${key}:pending`)
          else retained = { kind: 'unreadable', reason: stored.success ? 'changed' : 'unreadable' }
        }
      }
    } catch { /* Storage denial leaves the in-memory submission authoritative. */ }
    current.current = retained
    generation.current++
    setSubmission(retained)
    retryGeneration.current = null
    setRetryReady(false)
    return retained === next
  }
  const pending = 'input' in submission ? submission.input : null
  const busy = submission.kind === 'posting'
  const articleIdentity = `${view.pullRequest.headSha}:${view.article.blobSha}`
  const [reviewedIdentity, setReviewedIdentity] = useState<string | null>(null)
  const reviewed = reviewedIdentity === articleIdentity
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [retryReady, setRetryReady] = useState(false)
  const [draftEdited, setDraftEdited] = useState(false)
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify({ version: 2, notes: notes.map(note => note.feedback).filter(note => note.content.trim()) })) } catch { /* In-memory draft remains available. */ } }, [key, notes])
  const latest = view.versions.at(-1)
  const pendingMatchesTarget = pending?.date === date && pending.pullRequest === view.pullRequest.number && pending.headSha === view.pullRequest.headSha && (() => {
    switch (pending.intent) {
      case 'append_editorial_feedback': return pending.visibleBlobSha === visibleBlobSha && pending.supersedes === (latest?.digest ?? view.originalDigest)
      case 'request_editorial_revision': return pending.articleBlobSha === view.article.blobSha && pending.feedbackId === latest?.record.requestId && pending.feedbackDigest === latest?.digest
      case 'request_clean_acceptance': return pending.articleBlobSha === view.article.blobSha && pending.registryBlobSha === view.registryBlobSha && pending.policySha === view.policySha
      case 'resolve_editorial_request': return false
    }
  })()
  useEffect(() => {
    if (!pending || freshness !== 'fresh') return
    const saved = [...view.versions, ...view.requests, ...view.resolutions].find(item => {
      const record = item.record
      if (record.requestId !== pending.requestId || record.intent !== pending.intent || record.date !== pending.date || record.pullRequest !== pending.pullRequest || record.headSha !== pending.headSha) return false
      if (record.intent === 'append_editorial_feedback' && pending.intent === 'append_editorial_feedback') return record.visibleBlobSha === pending.visibleBlobSha && record.supersedes === pending.supersedes && JSON.stringify(record.feedback) === JSON.stringify(pending.feedback)
      if (record.intent === 'request_editorial_revision' && pending.intent === 'request_editorial_revision') return record.articleBlobSha === pending.articleBlobSha && record.feedbackId === pending.feedbackId && record.feedbackDigest === pending.feedbackDigest
      if (record.intent === 'request_clean_acceptance' && pending.intent === 'request_clean_acceptance') return record.articleBlobSha === pending.articleBlobSha && record.registryBlobSha === pending.registryBlobSha && record.policySha === pending.policySha
      return record.intent === 'resolve_editorial_request' && pending.intent === 'resolve_editorial_request' &&
        record.priorRequestDigest === pending.priorRequestDigest && record.articleBlobSha === pending.articleBlobSha &&
        record.registryBlobSha === pending.registryBlobSha && record.policySha === pending.policySha &&
        JSON.stringify(record.prefix) === JSON.stringify(pending.prefix) && record.acknowledgment === pending.acknowledgment && record.reason === pending.reason
    })
    if (!saved) return
    if (!transition({ kind: 'idle' }, submission)) return
    setReceipt(saved.url)
    setMessage(saved.record.intent === 'append_editorial_feedback' ? 'Feedback version saved. Confirmed in refreshed history. No revision was requested.' : saved.record.intent === 'resolve_editorial_request' ? 'Owner resolution confirmed. The prior request remains historical and no model run was started.' : saved.record.intent === 'request_clean_acceptance' ? 'Clean acceptance request confirmed in refreshed history. Check execution receipts for its outcome.' : 'Revision request confirmed in refreshed history. Check execution receipts for its outcome.')
  }, [submission, freshness, view])
  async function refreshHistory() {
    retryGeneration.current = null
    setRetryReady(false)
    const started = generation.current, alive = lifetime.current, selected = current.current
    try {
      const refreshed = await refresh()
      if (refreshed === true && lifetime.current === alive && generation.current === started && current.current === selected && selected.kind === 'uncertain') {
        retryGeneration.current = started
        setRetryReady(true)
      }
    } catch { /* Discovery displays its own failure; a failed GET cannot authorize retry. */ }
  }
  async function submit(input?: EditorialInput) {
    const previous = current.current
    if (input ? previous.kind !== 'idle' : previous.kind !== 'uncertain' || retryGeneration.current !== generation.current) return
    const frozen = input ? editorialInputSchema.parse(input) : previous.kind === 'uncertain' ? previous.input : null
    if (!frozen) return
    const posting: Submission = { kind: 'posting', input: frozen, attempt: Symbol(), origin: input ? 'first' : 'retry' }
    if (!transition(posting, previous)) return
    const alive = lifetime.current
    const isCurrent = () => lifetime.current === alive && current.current.kind === 'posting' && current.current.attempt === posting.attempt && sameInput(current.current.input, frozen)
    setMessage(''); setReceipt(null)
    const uncertain = (detail: string) => {
      if (!isCurrent()) return
      transition({ kind: 'uncertain', input: frozen }, posting)
      setMessage(`${detail} Submission is not confirmed. Its exact text and request identity are retained. Refresh history before retrying.`)
    }
    try {
      const response = await fetch('/api/article-reviews', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(frozen) })
      const body: unknown = await response.json()
      if (!isCurrent()) return
      if (!response.ok) {
        const failure = editorialWriteFailureSchema.safeParse(body)
        if (failure.success && failure.data.requestId === frozen.requestId && failure.data.intent === frozen.intent) {
          if (failure.data.outcome === 'rejected_before_append' && posting.origin === 'first') {
            const released = transition({ kind: 'idle' }, posting)
            setMessage(`${failure.data.error} Submission was rejected before append.${released ? ' Correct the local draft and submit again.' : ' Other retained evidence still blocks new writes.'}`)
          } else uncertain(failure.data.error)
        } else uncertain(`Unrecognized submission response (${response.status}).`)
        return
      }
      const result = editorialWriteReceiptSchema.safeParse(body)
      if (!result.success || result.data.requestId !== frozen.requestId || result.data.execution !== (frozen.intent === 'request_editorial_revision' || frozen.intent === 'request_clean_acceptance' ? 'requested' : 'not_started')) {
        uncertain('The acknowledgment did not match this submission.')
        return
      }
      transition({ kind: 'idle' }, posting)
      setReceipt(result.data.url)
      setMessage(result.data.execution === 'requested' ? 'Revision requested for this saved feedback and PR head. Check execution receipts for its outcome.' : frozen.intent === 'resolve_editorial_request' ? 'Owner resolution recorded. It does not establish a successful review or start a model run.' : 'Feedback version saved. No revision was requested.')
      // No completion/finally callback may change a newer submission.
      void refresh().catch(() => { /* Discovery owns its status; the receipt remains confirmed. */ })
    } catch { uncertain('The submission response could not be confirmed.') }
  }
  const currentNotes = notes.map(note => note.feedback).filter(note => note.content.trim())
  const draftMatchesSaved = latest?.record.intent === 'append_editorial_feedback' && JSON.stringify(currentNotes) === JSON.stringify(latest.record.feedback.notes)
  const canEdit = freshness === 'fresh' && view.eligible && !view.outstanding && submission.kind === 'idle'
  const outstandingLabel = view.requests.at(-1)?.record.intent === 'request_clean_acceptance' ? 'A clean acceptance request' : 'A revision request'
  const editingReason = freshness === 'loading' ? 'Refreshing acceptance history. Displayed history may be stale; saves, requests and retries are disabled.' : freshness === 'unavailable' ? `${discoveryError || 'Acceptance history unavailable.'} Displayed history may be stale; saves, requests and retries are disabled.` : !view.eligible ? view.reason : view.outstanding ? `${outstandingLabel} is outstanding. Refresh its receipts before another save or request.` : submission.kind === 'unreadable' ? 'Retained submission evidence requires manual GitHub diagnosis; new writes are blocked.' : busy ? 'Submission is in progress. Local edits are separate from the frozen submission.' : pending ? (retryReady ? 'Submission is unconfirmed. Refreshed history has no matching receipt. Only the retained submission can be retried.' : 'Submission is unconfirmed. Refresh history before retrying the same submission.') : null
  const saveHelp = editingReason ? 'Saving is disabled. See the submission status below.' : (!visibleBlobSha ? 'Reload the main article before saving feedback.' : !currentNotes.length ? 'Enter feedback before saving a new version.' : 'Saving appends this complete version without starting a revision.')
  const executionHold = view.executionReadiness.kind === 'blocked' ? view.executionReadiness.reason : null
  const requestHelp = editingReason ? 'Revision requests are disabled. See the submission status below.' : executionHold ? `Revision requests are held: ${executionHold}` : (!latest ? 'Save a feedback version before requesting another revision.' : !draftMatchesSaved ? (!draftEdited && currentNotes.length === 0 ? 'Copy prior version to select the saved feedback before reviewing and requesting it.' : 'Save the edited full version before requesting it.') : !reviewed ? 'Review the pinned PR-head article before requesting its revision.' : 'Request uses the saved version and reviewed PR article shown here.')
  const base: Pick<EditorialInput, 'schemaVersion' | 'date' | 'pullRequest' | 'headSha'> = { schemaVersion: 1, date, pullRequest: view.pullRequest.number, headSha: view.pullRequest.headSha }
  return <section className="editorial-sidebar editorial-continuation" aria-label="Continue editorial feedback">
    {view.requestState.kind === 'artifact_verified' && view.requestState.actionReview?.state === 'pending' && <p role="status">Article accepted. Its suggestions still need independent review.</p>}
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
      <p>Head <code>{view.pullRequest.headSha}</code> · article blob <code>{view.article.blobSha}</code> · registry blob <code>{view.registryBlobSha}</code> · policy <code>{view.policySha}</code></p>
      <pre className="review-correspondence-text" tabIndex={0}>{view.article.text}</pre>
    </details>
    <label className="editorial-review-confirmation"><input type="checkbox" checked={reviewed} disabled={!canEdit} onChange={event => setReviewedIdentity(event.currentTarget.checked ? articleIdentity : null)} />I reviewed this pinned PR-head article</label>
    {notes.map((note, index) => <div className="editorial-note" key={note.id}>
      <label className="editorial-note-label" htmlFor={`continued-editorial-note-${note.id}`}>{note.feedback.kind === 'section' ? `Section: ${note.feedback.section}` : 'Edit suggestion'}</label>
      <div className="editorial-suggestion">
        <NoteInput id={`continued-editorial-note-${note.id}`} content={note.feedback.content} disabled={false} onChange={content => { setDraftEdited(true); setNotes(previous => previous.map(item => item.id === note.id ? { ...item, feedback: { ...item.feedback, content } } : item)) }} />
        {notes.length > 1 && <button className="editorial-remove-btn" aria-label={`Remove continued suggestion ${index + 1}`} onClick={() => setNotes(previous => previous.filter(item => item.id !== note.id))}>Remove</button>}
      </div>
    </div>)}
    <button className="editorial-action" onClick={() => {
      const note: LocalNote = { id: nextId.current++, feedback: { kind: 'root', content: '' } }
      setNotes(previous => [...previous, note])
    }}>Add another edit suggestion</button>
    <p>This full version supersedes active feedback. Original text and every saved version remain history. Saving text starts no acceptance or model run.</p>
    <button className="editorial-action" disabled={!latest} onClick={() => {
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
    <button className="editorial-action editorial-action-primary" aria-describedby={editingReason ? 'continued-request-help continued-status' : 'continued-request-help'} disabled={!canEdit || !!executionHold || !latest || !reviewed || !draftMatchesSaved} onClick={() => {
      if (!latest) return
      void submit({ ...base, intent: 'request_editorial_revision', requestId: crypto.randomUUID(), articleBlobSha: view.article.blobSha,
        feedbackId: latest.record.requestId, feedbackDigest: latest.digest })
    }}>Request another article revision</button>
    <p id="continued-request-help">{requestHelp}</p>
    {editingReason && <p id="continued-status" role="status">{editingReason}</p>}
    {submission.kind === 'unreadable' && <p role="status">{submission.reason === 'changed' ? 'Stored submission evidence changed while this editor was open.' : 'The retained submission cannot be read.'} Stored evidence is preserved. Diagnose the prior outcome on GitHub manually; a reload cannot establish that an earlier write stopped.</p>}
    {pending && <p role="status">Local edits do not change the retained submission. If history cannot confirm its outcome, manual GitHub diagnosis is required. A changed head or reload does not establish that the earlier write stopped.</p>}
    {pending && freshness === 'fresh' && !pendingMatchesTarget && <p role="status">The submission target changed. Its frozen identity is retained; retry is disabled until the original outcome is reconciled.</p>}
    {pending && <button className="editorial-action" disabled={busy || freshness !== 'fresh' || !retryReady || !pendingMatchesTarget || !view.eligible || view.outstanding} onClick={() => void submit()}>Retry same submission</button>}
    <button className="editorial-action" disabled={busy} onClick={() => void refreshHistory()}>Refresh acceptance history</button>
    {view.requests.map(item => <p key={item.commentId}><a href={item.url}>{item.record.intent === 'request_clean_acceptance' ? 'Explicit clean acceptance request' : 'Explicit revision request'}</a>{item.duplicateUrls.map(url => <a key={url} href={url}>Duplicate delivery receipt</a>)} · {item.record.actor} · {item.createdAt}</p>)}
    {view.resolutions.map(item => item.record.intent === 'resolve_editorial_request' && <details key={item.commentId}>
      <summary>Owner-resolved prior editorial request · {item.record.actor} · {item.createdAt}</summary>
      <p>This owner decision records how to proceed while preserving the failed attempt and uncertainty. It does not establish successful review, provider absence, or billing status.</p>
      <pre className="review-correspondence-text">{item.record.reason}</pre>
      <a href={item.url}>Owner resolution receipt</a>
    </details>)}
    {message && <p role="status">{message} {receipt && <a href={receipt}>Read receipt</a>}</p>}
  </section>
}
