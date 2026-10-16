import type { Correspondence, ReviewProjection } from '../../../../shared/article-review.ts'

type PullRequest = ReviewProjection['pullRequests'][number]

interface CorrespondenceSourceGroup {
  key: string
  sourceKind: Correspondence['sourceKind']
  sourceNumber: number
  pullRequest: PullRequest | null
  items: Correspondence[]
}

function sourceKey(sourceKind: Correspondence['sourceKind'], sourceNumber: number): string {
  return `${sourceKind}:${sourceNumber}`
}

export function groupCorrespondenceBySource(projection: ReviewProjection): CorrespondenceSourceGroup[] {
  const groups = new Map<string, CorrespondenceSourceGroup>()
  for (const pullRequest of projection.pullRequests) {
    const key = sourceKey(pullRequest.kind, pullRequest.number)
    groups.set(key, { key, sourceKind: pullRequest.kind, sourceNumber: pullRequest.number, pullRequest, items: [] })
  }
  for (const item of projection.correspondence) {
    const key = sourceKey(item.sourceKind, item.sourceNumber)
    const group = groups.get(key) ?? { key, sourceKind: item.sourceKind, sourceNumber: item.sourceNumber, pullRequest: null, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => {
    const leftTime = left.items[0]?.createdAt ?? '9999'
    const rightTime = right.items[0]?.createdAt ?? '9999'
    return leftTime.localeCompare(rightTime) || left.key.localeCompare(right.key)
  })
}

function itemLabel(item: Correspondence): string {
  switch (item.kind) {
    case 'pr_body': return 'PR description and editorial feedback'
    case 'comment': return 'GitHub comment'
    case 'review': return `PR review: ${item.state}`
    case 'inline_comment': return `Code discussion: ${item.path}${item.line === null ? '' : `:${item.line}`}`
    case 'revision_request': return 'Revision request'
    case 'thread_message': return item.message.speaker.kind === 'human' ? 'Section note' : 'Assistant transcript'
  }
}

function MessageBody({ item, visibleBlobSha }: { item: Correspondence; visibleBlobSha: string | null }) {
  switch (item.kind) {
    case 'thread_message': return <>
      <p>{item.message.section ?? 'Article discussion'} · {item.message.visibleBlobSha === visibleBlobSha ? 'visible article revision' : 'earlier or different article revision'}</p>
      {item.message.speaker.kind === 'assistant' && <p>Reported model: {item.message.speaker.reportedModel ?? 'unknown'}. Reported session: {item.message.speaker.reportedSessionId ?? 'unknown'}. Saved through GitHub by {item.author}; model and session identity are not verified.</p>}
      <pre className="review-correspondence-text">{item.message.content}</pre>
    </>
    case 'revision_request': return <>
      <p>{item.request.selections.map((selection) => `${selection.reviewId}/${selection.findingId}`).join(', ')}</p>
      <pre className="review-correspondence-text">{item.request.feedback}</pre>
    </>
    case 'pr_body': return <>
      {item.editorialFeedback && <div><h4>Submitted editorial feedback</h4>{item.editorialFeedback.notes.map((note, index) => <div key={index}>
        <p>{note.kind === 'section' ? note.section : 'Article note'}</p><pre className="review-correspondence-text">{note.content}</pre>
      </div>)}</div>}
      <details><summary>Full unstructured PR description</summary><p className="review-correspondence-trust">Model, session, identity, and commit claims in this text are not independently verified here.</p><pre className="review-correspondence-text">{item.body}</pre></details>
    </>
    case 'comment':
    case 'review':
    case 'inline_comment': return <><p className="review-correspondence-trust">Unstructured GitHub text. Model, session, identity, and commit claims in this body are not independently verified here.</p><pre className="review-correspondence-text">{item.body}</pre></>
  }
}

function sourceRole(kind: Correspondence['sourceKind']): string {
  switch (kind) {
    case 'review_pr': return 'independent review'
    case 'acceptance_pr': return 'editorial revision'
    case 'pilot_issue': return 'pilot history'
  }
}

export function ArticleCorrespondence({ projection }: { projection: ReviewProjection }) {
  const groups = groupCorrespondenceBySource(projection)
  return <section className="article-correspondence" aria-label="Persistent article correspondence">
    <h3>Review and editorial correspondence</h3>
    <p>Loaded from GitHub for authorized readers. GitHub account attribution is verified; a shared account does not prove a distinct human or agent. Edited or deleted GitHub content changes this view.</p>
    {projection.correspondence.length === 0 && <p>No correspondence was returned from the available sources. Check any source warnings above.</p>}
    {groups.map((group) => <section className="review-correspondence-source" key={group.key} aria-label={`${group.sourceKind === 'pilot_issue' ? 'Issue' : 'Pull request'} ${group.sourceNumber} correspondence`}>
      <header className="review-correspondence-source-header">
        <h4>{group.pullRequest ? <a href={group.pullRequest.url}>PR #{group.sourceNumber}</a> : `Issue #${group.sourceNumber}`} · {sourceRole(group.sourceKind)}</h4>
        {group.pullRequest
          ? <dl><div><dt>State</dt><dd>{group.pullRequest.merged ? 'Merged' : group.pullRequest.state}</dd></div><div><dt>Current head</dt><dd><code>{group.pullRequest.headSha}</code></dd></div><div><dt>GitHub author</dt><dd>{group.pullRequest.author}</dd></div></dl>
          : <p>Durable issue correspondence; no pull-request head applies.</p>}
      </header>
      {group.items.length === 0 && <p>No correspondence was returned for this source.</p>}
      {group.items.map((item) => <details key={item.id} className="review-correspondence-item">
        <summary>{itemLabel(item)} · GitHub account {item.author} · {new Date(item.createdAt).toLocaleString()}</summary>
        <p><a href={item.url}>Read on GitHub</a>{item.updatedAt !== item.createdAt ? ' · edited' : ''}</p>
        <MessageBody item={item} visibleBlobSha={projection.visibleBlobSha} />
      </details>)}
    </section>)}
  </section>
}
