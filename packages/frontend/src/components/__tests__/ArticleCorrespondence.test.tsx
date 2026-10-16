// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArticleCorrespondence } from '../ArticleCorrespondence.tsx'
import { projectionSchema } from '../../../../../shared/article-review.ts'

const source = 'a'.repeat(40)
const time = '2026-10-16T17:00:00Z'
const base = { id: 'body:367', sourceKind: 'acceptance_pr', sourceNumber: 367,
  url: 'https://github.com/ojfbot/daily-logger/pull/367', author: 'editor', createdAt: time, updatedAt: time, body: '<script>bad()</script>' }

describe('durable correspondence display', () => {
  it('shows decoded literal human feedback and actual GitHub attribution without executing raw PR markup', () => {
    const projection = projectionSchema.parse({ schemaVersion: 1, date: '2026-10-16', observedAt: time, sourceCommitSha: source,
      currentBlobSha: source, visibleBlobSha: source, discovery: 'registered_and_eligible_pull_requests', requestTarget: null,
      entries: [], unavailable: [], requests: [], pullRequests: [], correspondence: [{ ...base, kind: 'pr_body',
        editorialFeedback: { version: 2, notes: [{ kind: 'section', section: 'What shipped', content: '  雪\n---\n@agent  ' }] } }] })
    const html = renderToStaticMarkup(<ArticleCorrespondence projection={projection} />)
    expect(html).toContain('editor')
    expect(html).toContain('Submitted editorial feedback')
    expect(html).toContain('  雪\n---\n@agent  ')
    expect(html).toContain('Full unstructured PR description')
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('groups repeated cycles by durable source and separates structured heads from body claims', () => {
    const reviewHead = 'b'.repeat(40)
    const revisionHead = 'd'.repeat(40)
    const projection = projectionSchema.parse({ schemaVersion: 1, date: '2026-10-16', observedAt: time, sourceCommitSha: source,
      currentBlobSha: source, visibleBlobSha: source, discovery: 'registered_and_eligible_pull_requests', requestTarget: null,
      entries: [], unavailable: [], requests: [], pullRequests: [
        { kind: 'review_pr', number: 367, url: 'https://github.com/ojfbot/daily-logger/pull/367', state: 'closed', merged: true, headSha: reviewHead, author: 'ojfbot' },
        { kind: 'acceptance_pr', number: 369, url: 'https://github.com/ojfbot/daily-logger/pull/369', state: 'open', merged: false, headSha: revisionHead, author: 'ojfbot' },
      ], correspondence: [
        { ...base, sourceKind: 'review_pr', sourceNumber: 367, kind: 'review', state: 'COMMENTED', body: 'Independent review' },
        { ...base, id: 'comment:369', sourceKind: 'acceptance_pr', sourceNumber: 369, url: 'https://github.com/ojfbot/daily-logger/pull/369#issuecomment-1', author: 'github-actions[bot]', kind: 'comment', body: 'Model: claude-sonnet-4-6\nCommit: 738f8dd' },
      ] })
    const html = renderToStaticMarkup(<ArticleCorrespondence projection={projection} />)
    expect(html).toContain('PR #367')
    expect(html).toContain('independent review')
    expect(html).toContain(reviewHead)
    expect(html).toContain('PR #369')
    expect(html).toContain('editorial revision')
    expect(html).toContain(revisionHead)
    expect(html).toContain('GitHub account github-actions[bot]')
    expect(html).toContain('Unstructured GitHub text')
    expect(html).toContain('Model: claude-sonnet-4-6')
    expect(html).toContain('Commit: 738f8dd')
    expect(html).toContain('not independently verified here')
  })
})
