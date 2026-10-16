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
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
