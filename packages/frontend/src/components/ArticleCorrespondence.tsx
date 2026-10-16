import type { Correspondence, ReviewProjection } from '../../../../shared/article-review.ts'

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
      {item.message.speaker.kind === 'assistant' && <p>Reported model: {item.message.speaker.reportedModel ?? 'unknown'}. Saved by {item.author}; model and session identity are not verified.</p>}
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
      <details><summary>Full PR description</summary><pre className="review-correspondence-text">{item.body}</pre></details>
    </>
    case 'comment':
    case 'review':
    case 'inline_comment': return <pre className="review-correspondence-text">{item.body}</pre>
  }
}

export function ArticleCorrespondence({ projection }: { projection: ReviewProjection }) {
  return <section className="article-correspondence" aria-label="Persistent article correspondence">
    <h3>Review and editorial correspondence</h3>
    <p>Loaded from GitHub for authorized readers. GitHub account attribution is verified; a shared account does not prove a distinct human or agent. Edited or deleted GitHub content changes this view.</p>
    {projection.pullRequests.map((pr) => <p key={pr.number}>
      <a href={pr.url}>PR #{pr.number}</a> · {pr.kind === 'review_pr' ? 'independent review' : 'editorial revision'} · {pr.merged ? 'merged' : pr.state}
    </p>)}
    {projection.correspondence.length === 0 && <p>No correspondence was returned from the available sources. Check any source warnings above.</p>}
    {projection.correspondence.map((item) => <details key={item.id} className="review-correspondence-item">
      <summary>{itemLabel(item)} · {item.author} · {new Date(item.createdAt).toLocaleString()}</summary>
      <p><a href={item.url}>Read on GitHub</a> · {item.sourceKind === 'pilot_issue' ? 'issue' : 'PR'} #{item.sourceNumber}{item.updatedAt !== item.createdAt ? ' · edited' : ''}</p>
      <MessageBody item={item} visibleBlobSha={projection.visibleBlobSha} />
    </details>)}
  </section>
}
