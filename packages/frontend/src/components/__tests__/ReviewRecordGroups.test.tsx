// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { projectionSchema, type ReviewProjection } from '../../../../../shared/article-review.ts'
import { ReviewRecordGroups } from '../IndependentArticleReviews.tsx'

const visibleBlob = 'a'.repeat(40)
const historicalBlob = 'b'.repeat(40)
const source = 'c'.repeat(40)
const time = '2026-10-16T17:00:00Z'

function reviewEntry(input: { id: string; reviewer: string; sessionId: string | null; articleBlobSha: string; recordBlobSha: string; freshness: 'current' | 'stale'; pullRequest: number }): ReviewProjection['entries'][number] {
  return {
    lifecycle: 'published',
    recordRef: 'd'.repeat(40), recordBlobSha: input.recordBlobSha,
    recordUrl: `https://github.com/ojfbot/daily-logger/blob/main/reviews/registered/${input.id}.json`,
    fullRecordUrl: `https://github.com/ojfbot/daily-logger/blob/main/reviews/articles/${input.id}.md`,
    freshness: input.freshness,
    pullRequest: { kind: 'review_pr', number: input.pullRequest, url: `https://github.com/ojfbot/daily-logger/pull/${input.pullRequest}`,
      state: 'closed', merged: true, headSha: 'e'.repeat(40), author: 'ojfbot' },
    review: { schemaVersion: 1, id: input.id, result: 'completed',
      article: { date: '2026-10-16', sourceCommitSha: source, blobSha: input.articleBlobSha },
      reviewer: { name: input.reviewer, sessionId: input.sessionId }, reviewedAt: time, scope: `Scope for ${input.reviewer}`,
      fullRecordBlobSha: 'f'.repeat(40), fullRecordPath: `reviews/articles/${input.id}.md`, findings: [] },
  }
}

describe('review contribution ledger', () => {
  it('keeps two reviewer identities on one revision and a later revision visibly separate', () => {
    const projection = projectionSchema.parse({ schemaVersion: 1, date: '2026-10-16', observedAt: time, sourceCommitSha: source,
      currentBlobSha: visibleBlob, visibleBlobSha: visibleBlob, discovery: 'registered_and_eligible_pull_requests', requestTarget: null,
      entries: [
        reviewEntry({ id: 'review-old', reviewer: 'Reviewer C', sessionId: 'session-c', articleBlobSha: historicalBlob, recordBlobSha: '3'.repeat(40), freshness: 'stale', pullRequest: 363 }),
        reviewEntry({ id: 'review-a', reviewer: 'Reviewer A', sessionId: 'session-a', articleBlobSha: visibleBlob, recordBlobSha: '1'.repeat(40), freshness: 'current', pullRequest: 367 }),
        reviewEntry({ id: 'review-b', reviewer: 'Reviewer B', sessionId: null, articleBlobSha: visibleBlob, recordBlobSha: '2'.repeat(40), freshness: 'current', pullRequest: 370 }),
      ], unavailable: [], requests: [], pullRequests: [], correspondence: [] })
    const html = renderToStaticMarkup(<ReviewRecordGroups projection={projection} selected={[]} sending={false} onToggle={() => undefined} />)
    expect(html.match(/Reviewed revision/g)).toHaveLength(2)
    expect(html).toContain(`Reviewed revision <code>${visibleBlob.slice(0, 12)}</code>`)
    expect(html).toContain(`Reviewed revision <code>${historicalBlob.slice(0, 12)}</code>`)
    expect(html).toContain('2 review records')
    expect(html).toContain('Reviewer A')
    expect(html).toContain('Reviewer B')
    expect(html).toContain('Reviewer C')
    expect(html).toContain('Recorded reviewer claim')
    expect(html).toContain('Recorded session claim')
    expect(html).toContain('Not recorded')
    expect(html).toContain('Submitted through GitHub by <strong>ojfbot</strong>')
    expect(html).toContain('GitHub authenticates the submitting account')
    expect(html).toContain('Historical article revision')
    expect(html.indexOf(visibleBlob.slice(0, 12))).toBeLessThan(html.indexOf(historicalBlob.slice(0, 12)))
    expect(html).toContain('1'.repeat(40))
    expect(html).toContain('2'.repeat(40))
    expect(html).toContain('3'.repeat(40))
  })
})
