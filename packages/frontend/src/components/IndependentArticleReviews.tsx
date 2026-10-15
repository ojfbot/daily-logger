import { useEffect, useState } from 'react'
import { z } from 'zod'
import { projectionSchema, type ReviewProjection } from '../../../../shared/article-review.ts'

interface Props { date: string; visibleBlobSha: string | undefined; login: string }
type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; projection: ReviewProjection }
const responseSchema = z.object({ url: z.url(), requestId: z.uuid(), reused: z.boolean() })

export function IndependentArticleReviews({ date, visibleBlobSha, login }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID())
  const [receipt, setReceipt] = useState<string | null>(null)
  const draftKey = `dl-review-request:${login}:${date}:${visibleBlobSha ?? 'unknown'}`

  useEffect(() => {
    try {
      const draft = z.object({ selected: z.array(z.string()), feedback: z.string(), requestId: z.uuid() }).parse(JSON.parse(sessionStorage.getItem(draftKey) ?? 'null'))
      setSelected(draft.selected); setFeedback(draft.feedback); setRequestId(draft.requestId)
    } catch { /* A missing or malformed saved draft leaves the editor usable. */ }
  }, [draftKey])
  useEffect(() => {
    try {
      if (feedback || selected.length) sessionStorage.setItem(draftKey, JSON.stringify({ selected, feedback, requestId }))
    } catch { /* In-memory feedback survives a failed network request. */ }
  }, [draftKey, feedback, selected, requestId])
  useEffect(() => {
    const controller = new AbortController()
    setLoad({ kind: 'loading' })
    fetch(`/api/article-reviews?date=${date}${visibleBlobSha ? `&visibleBlobSha=${visibleBlobSha}` : ''}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Review data unavailable (${response.status}). Nothing here establishes a clean review.`)
        return projectionSchema.parse(await response.json())
      })
      .then((projection) => { if (!controller.signal.aborted) setLoad({ kind: 'ready', projection }) })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoad({ kind: 'error', message: error instanceof Error ? error.message : 'Review data unavailable' }) })
    return () => controller.abort()
  }, [date, visibleBlobSha, refresh])

  const projection = load.kind === 'ready' ? load.projection : null
  const choices = projection?.entries.flatMap((entry) => entry.review.result === 'completed'
    ? entry.review.findings.map((finding) => ({ entry, finding, key: `${entry.review.id}:${finding.id}` })) : []) ?? []
  const picked = choices.filter((choice) => selected.includes(choice.key))
  const canSubmit = !!projection?.requestTarget && !!visibleBlobSha && projection.currentBlobSha === visibleBlobSha &&
    selected.length > 0 && picked.length === selected.length && picked.every(({ entry, finding }) => entry.freshness === 'current' && finding.disposition.kind === 'open') && !!feedback.trim()

  function changed() { setRequestId(crypto.randomUUID()); setReceipt(null); setMessage('') }
  async function requestChanges() {
    if (!canSubmit || sending || !visibleBlobSha) return
    setSending(true); setMessage('')
    try {
      const response = await fetch('/api/article-reviews', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ schemaVersion: 1, intent: 'request_changes', requestId, date, visibleBlobSha,
          selections: picked.map(({ entry, finding }) => ({ reviewId: entry.review.id, recordBlobSha: entry.recordBlobSha, findingId: finding.id })), feedback }),
      })
      if (!response.ok) throw new Error(`Request was not confirmed (${response.status}). Your feedback is retained. Refresh history before retrying.`)
      const result = responseSchema.parse(await response.json())
      setReceipt(result.url)
      setMessage('Revision request recorded. Article acceptance is unchanged. A correction PR remains a separate action.')
      try { sessionStorage.removeItem(draftKey) } catch { /* Submission does not depend on browser storage. */ }
      setRefresh((previous) => previous + 1)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request not confirmed; feedback retained.') }
    finally { setSending(false) }
  }

  return <section className="independent-reviews" aria-labelledby="independent-review-heading">
    <h2 id="independent-review-heading">Independent review</h2>
    <p>Check the evidence, then request a correction. Review findings are advisory.</p>
    <button type="button" disabled={sending} onClick={() => setRefresh((previous) => previous + 1)}>Refresh reviews and request history</button>
    {load.kind === 'loading' && <p role="status">Loading registered reviews...</p>}
    {load.kind === 'error' && <p role="alert">{load.message}</p>}
    {projection && <>
      <p className="review-scope">Only explicitly registered, editor-visible records are listed. Unregistered local sessions are unknown.</p>
      {!visibleBlobSha && <p role="alert">The visible article has no source fingerprint. Reload after the API is rebuilt. Requests are disabled.</p>}
      {visibleBlobSha && projection.currentBlobSha !== visibleBlobSha && <p role="alert">The visible article differs from current main. Reload the article before requesting changes.</p>}
      {projection.unavailable.map((reason) => <p role="alert" key={reason}>Review unavailable: {reason}</p>)}
      {projection.entries.length === 0 && <p>No eligible registered review was found. This is not a clean-review verdict.</p>}
      {projection.entries.map((entry) => <div className="independent-review-record" key={entry.review.id}>
        <h3>{entry.lifecycle === 'published' ? 'Published review record' : 'Proposed, unmerged review record'}</h3>
        <p>{entry.freshness === 'current' ? 'Matches visible article' : entry.freshness === 'stale' ? 'Stale: article changed; a fresh review is needed' : 'Visible revision unknown'}</p>
        <details><summary>Review identity and scope</summary>
          <dl><dt>Reviewer</dt><dd>{entry.review.reviewer.name}</dd><dt>Session</dt><dd>{entry.review.reviewer.sessionId ?? 'Unknown'}</dd><dt>Review timestamp</dt><dd>{entry.review.reviewedAt}</dd><dt>Reviewed source commit</dt><dd><code>{entry.review.article.sourceCommitSha}</code></dd><dt>Article blob</dt><dd><code>{entry.review.article.blobSha}</code></dd></dl>
          <p>{entry.review.scope}</p><a href={entry.fullRecordUrl}>Read the full pinned review</a>{' | '}<a href={entry.recordUrl}>Read the structured record</a>
        </details>
        {entry.review.result === 'failed' ? <p role="alert">Review failed: {entry.review.reason}. No clean-review claim is available.</p> : <>
          {entry.review.findings.length === 0 && <p>The reviewer reported no findings within the stated scope.</p>}
          {(['confirmed_error', 'unverified_claim'] satisfies Array<'confirmed_error' | 'unverified_claim'>).map((classification) => <div key={classification}>
            <h4>{classification === 'confirmed_error' ? 'Reviewer reports confirmed errors' : 'Claims the reviewer could not verify'}</h4>
            {entry.review.result === 'completed' && entry.review.findings.filter((finding) => finding.classification === classification).map((finding) => {
              const key = `${entry.review.id}:${finding.id}`
              return <details key={finding.id} className="independent-review-finding"><summary>{finding.id}: {finding.title} ({finding.disposition.kind})</summary>
                <p>{finding.location}</p><p>{finding.explanation}</p>
                <ul>{finding.evidenceUrls.map((url, index) => <li key={url}><a href={url}>Primary evidence {index + 1}</a></li>)}</ul>
                <p><strong>Proposed correction:</strong> {finding.correction}</p>
                {finding.disposition.kind !== 'open' && <p>Human disposition by {finding.disposition.actor}: <a href={finding.disposition.evidenceUrl}>Read the decision</a></p>}
                <label><input type="checkbox" disabled={sending || entry.freshness !== 'current' || finding.disposition.kind !== 'open'} checked={selected.includes(key)} onChange={(event) => { const checked = event.currentTarget.checked; changed(); setSelected((previous) => checked ? [...previous, key] : previous.filter((value) => value !== key)) }} /> Select {finding.id} for revision feedback</label>
              </details>
            })}
          </div>)}
        </>}
      </div>)}
      <button type="button" disabled={sending || picked.length === 0} onClick={() => { changed(); setFeedback((previous) => [previous, ...picked.map(({ finding }) => finding.correction)].filter(Boolean).join('\n\n')) }}>Add selected corrections to feedback</button>
      <label htmlFor="independent-review-feedback">Revision feedback</label>
      <textarea id="independent-review-feedback" value={feedback} maxLength={30000} disabled={sending} onChange={(event) => { changed(); setFeedback(event.currentTarget.value) }} rows={6} />
      <p>Only the selected finding references and this editable text are submitted. Existing editorial notes and section feedback stay separate.</p>
      {projection.requestTarget ? <p>This pilot records correspondence on <a href={projection.requestTarget.contextUrl}>issue #{projection.requestTarget.issueNumber}</a>. It creates no acceptance branch, PR, or model run.</p> : <p>No correspondence target is registered for this article. Requests are disabled.</p>}
      <button type="button" disabled={sending || !canSubmit} onClick={requestChanges}>{sending ? 'Recording revision request...' : `Request changes${projection.requestTarget ? ` on #${projection.requestTarget.issueNumber}` : ''}`}</button>
      {projection.requests.length > 0 && <details><summary>Recorded revision requests ({projection.requests.length})</summary><ul>{projection.requests.map((request) => <li key={request.url}><a href={request.url}>{request.findingIds.join(', ')} requested by {request.actor}</a></li>)}</ul></details>}
    </>}
    {message && <p role="status">{message}{receipt && <> <a href={receipt}>Read recorded request</a></>}</p>}
  </section>
}
