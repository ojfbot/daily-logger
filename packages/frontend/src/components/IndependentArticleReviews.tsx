import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { projectionSchema, type ReviewProjection } from '../../../../shared/article-review.ts'
import { useAppDispatch } from '../store/hooks.ts'
import { hydrateCorrespondence } from '../store/chatSlice.ts'
import { ArticleCorrespondence } from './ArticleCorrespondence.tsx'

export type DiscussionAvailability = 'loading' | 'ready' | 'stale' | 'unavailable'
interface Props { date: string; visibleBlobSha: string | undefined; login: string; onDiscussionAvailabilityChange: (availability: DiscussionAvailability) => void }
type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; projection: ReviewProjection }
const responseSchema = z.object({ url: z.url(), requestId: z.uuid(), reused: z.boolean() })

type ReviewEntry = ReviewProjection['entries'][number]

interface ReviewRevisionGroup {
  articleBlobSha: string
  entries: ReviewEntry[]
}

export function groupReviewsByArticle(entries: ReviewProjection['entries']): ReviewRevisionGroup[] {
  const groups = new Map<string, ReviewRevisionGroup>()
  for (const entry of entries) {
    const articleBlobSha = entry.review.article.blobSha
    const group = groups.get(articleBlobSha) ?? { articleBlobSha, entries: [] }
    group.entries.push(entry)
    groups.set(articleBlobSha, group)
  }
  const ordered = [...groups.values()]
  for (const group of ordered) {
    group.entries.sort((left, right) => right.review.reviewedAt.localeCompare(left.review.reviewedAt) || left.review.id.localeCompare(right.review.id))
  }
  function priority(group: ReviewRevisionGroup): number {
    if (group.entries.some((entry) => entry.freshness === 'current')) return 0
    if (group.entries.some((entry) => entry.freshness === 'visible_revision_unknown')) return 1
    return 2
  }
  return ordered.sort((left, right) => priority(left) - priority(right)
    || (right.entries[0]?.review.reviewedAt ?? '').localeCompare(left.entries[0]?.review.reviewedAt ?? '')
    || left.articleBlobSha.localeCompare(right.articleBlobSha))
}

function freshnessLabel(freshness: ReviewEntry['freshness']): string {
  switch (freshness) {
    case 'current': return 'Matches visible article'
    case 'stale': return 'Historical article revision; a fresh review is needed'
    case 'visible_revision_unknown': return 'Visible article revision unknown'
  }
}

interface ReviewRecordGroupsProps {
  projection: ReviewProjection
  selected: string[]
  sending: boolean
  onToggle: (key: string, checked: boolean) => void
}

interface CompletedReviewFindingsProps {
  review: Extract<ReviewEntry['review'], { result: 'completed' }>
  freshness: ReviewEntry['freshness']
  selected: string[]
  sending: boolean
  onToggle: (key: string, checked: boolean) => void
}

function CompletedReviewFindings({ review, freshness, selected, sending, onToggle }: CompletedReviewFindingsProps) {
  return <>
    {review.findings.length === 0 && <p>The reviewer reported no findings within the stated scope.</p>}
    {(['confirmed_error', 'unverified_claim'] satisfies Array<'confirmed_error' | 'unverified_claim'>).map((classification) => <div key={classification}>
      <h5>{classification === 'confirmed_error' ? 'Reviewer reports confirmed errors' : 'Claims the reviewer could not verify'}</h5>
      {review.findings.filter((finding) => finding.classification === classification).map((finding) => {
        const key = `${review.id}:${finding.id}`
        return <details key={finding.id} className="independent-review-finding"><summary>{finding.id}: {finding.title} ({finding.disposition.kind})</summary>
          <p>{finding.location}</p><p>{finding.explanation}</p>
          <ul>{finding.evidenceUrls.map((url, index) => <li key={url}><a href={url}>Primary evidence {index + 1}</a></li>)}</ul>
          <p><strong>Proposed correction:</strong> {finding.correction}</p>
          {finding.disposition.kind !== 'open' && <p>Human disposition by {finding.disposition.actor}: <a href={finding.disposition.evidenceUrl}>Read the decision</a></p>}
          <label><input type="checkbox" disabled={sending || freshness !== 'current' || finding.disposition.kind !== 'open'} checked={selected.includes(key)} onChange={(event) => onToggle(key, event.currentTarget.checked)} /> Select {finding.id} for revision feedback</label>
        </details>
      })}
    </div>)}
  </>
}

export function ReviewRecordGroups({ projection, selected, sending, onToggle }: ReviewRecordGroupsProps) {
  return groupReviewsByArticle(projection.entries).map((group) => {
    const groupFreshness = group.entries.every((entry) => entry.freshness === 'current')
      ? 'Visible article revision'
      : group.entries.every((entry) => entry.freshness === 'stale')
        ? 'Historical article revision'
        : 'Visible revision unknown or mixed'
    return <section className="review-revision-group" key={group.articleBlobSha} aria-label={`Reviews of article blob ${group.articleBlobSha}`}>
      <header className="review-revision-header">
        <div><h3>Reviewed revision <code>{group.articleBlobSha.slice(0, 12)}</code></h3><p>{groupFreshness} · {group.entries.length} review {group.entries.length === 1 ? 'record' : 'records'}</p></div>
        <code className="review-revision-blob">{group.articleBlobSha}</code>
      </header>
      {group.entries.map((entry) => <article className="independent-review-record" key={entry.review.id}>
        <h4>{entry.review.reviewer.name}</h4>
        <p className="review-record-state">{entry.review.result === 'completed' ? 'Completed review' : 'Failed review'} · {entry.lifecycle === 'published' ? 'published' : 'proposed'} · {freshnessLabel(entry.freshness)}</p>
        <dl className="review-record-summary">
          <div><dt>Recorded reviewer claim</dt><dd>{entry.review.reviewer.name}</dd></div>
          <div><dt>Recorded session claim</dt><dd>{entry.review.reviewer.sessionId ?? 'Not recorded'}</dd></div>
          <div><dt>Review ID</dt><dd><code>{entry.review.id}</code></dd></div>
          <div><dt>Reviewed at</dt><dd>{entry.review.reviewedAt}</dd></div>
        </dl>
        {entry.pullRequest
          ? <p>Submitted through GitHub by <strong>{entry.pullRequest.author}</strong> in <a href={entry.pullRequest.url}>PR #{entry.pullRequest.number}</a> · {entry.pullRequest.merged ? 'merged' : entry.pullRequest.state}</p>
          : <p>GitHub submission account not linked to this record.</p>}
        <p className="review-identity-note">The repository records the reviewer and session claims above. GitHub authenticates the submitting account, not a separate person, model, or local session.</p>
        <details><summary>Technical pins and scope</summary>
          <dl><dt>Reviewed source commit</dt><dd><code>{entry.review.article.sourceCommitSha}</code></dd><dt>Article blob</dt><dd><code>{entry.review.article.blobSha}</code></dd><dt>Structured record blob</dt><dd><code>{entry.recordBlobSha}</code></dd><dt>Record ref</dt><dd><code>{entry.recordRef}</code></dd></dl>
          <p>{entry.review.scope}</p><a href={entry.fullRecordUrl}>Read the full pinned review</a>{' | '}<a href={entry.recordUrl}>Read the structured record</a>
        </details>
        {entry.review.result === 'failed'
          ? <p role="alert">Review failed: {entry.review.reason}. No clean-review claim is available.</p>
          : <CompletedReviewFindings review={entry.review} freshness={entry.freshness} selected={selected} sending={sending} onToggle={onToggle} />}
      </article>)}
    </section>
  })
}

export function IndependentArticleReviews({ date, visibleBlobSha, login, onDiscussionAvailabilityChange }: Props) {
  const dispatch = useAppDispatch()
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
    if (load.kind === 'ready') dispatch(hydrateCorrespondence({ date, visibleBlobSha: visibleBlobSha ?? null, login, items: load.projection.correspondence, complete: load.projection.unavailable.length === 0 }))
  }, [load, date, visibleBlobSha, login, dispatch])

  useEffect(() => {
    const reload = () => setRefresh((previous) => previous + 1)
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [])

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
    onDiscussionAvailabilityChange('loading')
    dispatch(hydrateCorrespondence({ date, visibleBlobSha: visibleBlobSha ?? null, login, items: [], complete: false }))
    fetch(`/api/article-reviews?date=${date}${visibleBlobSha ? `&visibleBlobSha=${visibleBlobSha}` : ''}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Review data unavailable (${response.status}). Nothing here establishes a clean review.`)
        return projectionSchema.parse(await response.json())
      })
      .then((projection) => { if (!controller.signal.aborted) {
        setLoad({ kind: 'ready', projection })
        onDiscussionAvailabilityChange(visibleBlobSha && projection.currentBlobSha && projection.currentBlobSha !== visibleBlobSha
          ? 'stale' : visibleBlobSha && projection.currentBlobSha === visibleBlobSha && projection.requestTarget ? 'ready' : 'unavailable')
      } })
      .catch((error: unknown) => { if (!controller.signal.aborted) {
        onDiscussionAvailabilityChange('unavailable')
        dispatch(hydrateCorrespondence({ date, visibleBlobSha: visibleBlobSha ?? null, login, items: [], complete: false }))
        setLoad({ kind: 'error', message: error instanceof Error ? error.message : 'Review data unavailable' })
      } })
    return () => controller.abort()
  }, [date, visibleBlobSha, refresh, login, dispatch, onDiscussionAvailabilityChange])

  const projection = load.kind === 'ready' ? load.projection : null
  const choices = useMemo(() => projection?.entries.flatMap((entry) => entry.review.result === 'completed'
    ? entry.review.findings.map((finding) => ({ entry, finding, key: `${entry.review.id}:${finding.id}` })) : []) ?? [], [projection])
  const choicesByKey = useMemo(() => new Map(choices.map((choice) => [choice.key, choice])), [choices])

  useEffect(() => {
    if (!projection || sending) return
    const retained = selected.filter((key) => {
      const choice = choicesByKey.get(key)
      if (!choice) return true
      return choice.entry.freshness === 'current' && choice.finding.disposition.kind === 'open'
    })
    const removed = selected.length - retained.length
    if (removed === 0) return
    setSelected(retained)
    setRequestId(crypto.randomUUID())
    setReceipt(null)
    setMessage(`Review status changed; ${removed} ${removed === 1 ? 'selection is' : 'selections are'} no longer current and open, so ${removed === 1 ? 'it was' : 'they were'} removed.`)
  }, [projection, choicesByKey, selected, sending])

  const picked = choices.filter((choice) => selected.includes(choice.key))
  const missingSelectedCount = selected.filter((key) => !choicesByKey.has(key)).length
  const canSubmit = !!projection?.requestTarget && !!visibleBlobSha && projection.currentBlobSha === visibleBlobSha &&
    selected.length > 0 && picked.length === selected.length && picked.every(({ entry, finding }) => entry.freshness === 'current' && finding.disposition.kind === 'open') && !!feedback.trim()

  function changed() {
    const nextRequestId = crypto.randomUUID()
    setRequestId(nextRequestId); setReceipt(null); setMessage('')
    return nextRequestId
  }
  function clearSelections() {
    if (sending || selected.length === 0) return
    const nextRequestId = changed()
    setSelected([])
    try {
      if (feedback) sessionStorage.setItem(draftKey, JSON.stringify({ selected: [], feedback, requestId: nextRequestId }))
      else sessionStorage.removeItem(draftKey)
    } catch { /* The in-memory clear remains authoritative for this mount. */ }
  }
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
      <p className="review-scope">Published records and eligible same-repository review PRs are listed. Open PR findings are proposed; local sessions remain unknown.</p>
      {!visibleBlobSha && <p role="alert">The visible article has no source fingerprint. Reload after the API is rebuilt. Requests are disabled.</p>}
      {visibleBlobSha && projection.currentBlobSha !== visibleBlobSha && <p role="alert">The visible article differs from current main. Reload the article before requesting changes.</p>}
      {projection.unavailable.map((reason) => <p role="alert" key={reason}>Review unavailable: {reason}</p>)}
      {projection.entries.length === 0 && <p>No eligible registered review was found. This is not a clean-review verdict.</p>}
      <ReviewRecordGroups projection={projection} selected={selected} sending={sending} onToggle={(key, checked) => { changed(); setSelected((previous) => checked ? [...previous, key] : previous.filter((value) => value !== key)) }} />
      {missingSelectedCount > 0 && <p role="status">{missingSelectedCount} retained {missingSelectedCount === 1 ? 'selection is' : 'selections are'} unavailable and cannot be submitted. Clear selections to continue with visible findings; feedback is preserved.</p>}
      <button type="button" disabled={sending || selected.length === 0} onClick={clearSelections}>Clear selections</button>
      <button type="button" disabled={sending || picked.length === 0} onClick={() => { changed(); setFeedback((previous) => [previous, ...picked.map(({ finding }) => finding.correction)].filter(Boolean).join('\n\n')) }}>Add selected corrections to feedback</button>
      <label htmlFor="independent-review-feedback">Revision feedback</label>
      <textarea id="independent-review-feedback" value={feedback} maxLength={30000} disabled={sending} onChange={(event) => { changed(); setFeedback(event.currentTarget.value) }} rows={6} />
      <p>Only the selected finding references and this editable text are submitted. Existing editorial notes and section feedback stay separate.</p>
      {projection.requestTarget ? <p>Corrections and saved discussion go to <a href={projection.requestTarget.contextUrl}>{projection.requestTarget.kind === 'pilot_issue' ? 'issue' : 'PR'} #{projection.requestTarget.issueNumber}</a> and share its GitHub visibility. Saving creates no acceptance branch or model run. Stored text stays unchanged.</p> : <p>No eligible correspondence target is available for this article. Requests and new discussion saves are disabled.</p>}
      <button type="button" disabled={sending || !canSubmit} onClick={requestChanges}>{sending ? 'Recording revision request...' : `Request changes${projection.requestTarget ? ` on #${projection.requestTarget.issueNumber}` : ''}`}</button>
      {projection.requests.length > 0 && <details><summary>Recorded revision requests ({projection.requests.length})</summary><ul>{projection.requests.map((request) => <li key={request.url}><a href={request.url}>{request.findingIds.join(', ')} requested by {request.actor}</a></li>)}</ul></details>}
      <ArticleCorrespondence projection={projection} />
    </>}
    {message && <p role="status">{message}{receipt && <> <a href={receipt}>Read recorded request</a></>}</p>}
  </section>
}
