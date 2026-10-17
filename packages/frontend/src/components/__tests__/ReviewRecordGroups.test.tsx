// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { projectionSchema, type ReviewProjection } from '../../../../../shared/article-review.ts'
import { IndependentArticleReviews, ReviewRecordGroups } from '../IndependentArticleReviews.tsx'

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('../../store/hooks.ts', () => ({ useAppDispatch: () => dispatch }))

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

  it('labels a review without a linked GitHub submission account as unknown', () => {
    const entry = reviewEntry({ id: 'review-unlinked', reviewer: 'Reviewer D', sessionId: null,
      articleBlobSha: visibleBlob, recordBlobSha: '4'.repeat(40), freshness: 'current', pullRequest: 371 })
    entry.pullRequest = null
    const projection = projectionSchema.parse({ schemaVersion: 1, date: '2026-10-16', observedAt: time, sourceCommitSha: source,
      currentBlobSha: visibleBlob, visibleBlobSha: visibleBlob, discovery: 'registered_and_eligible_pull_requests', requestTarget: null,
      entries: [entry], unavailable: [], requests: [], pullRequests: [], correspondence: [] })
    const html = renderToStaticMarkup(<ReviewRecordGroups projection={projection} selected={[]} sending={false} onToggle={() => undefined} />)
    expect(html).toContain('GitHub submission account not linked to this record.')
  })
})


type Entry = ReviewProjection['entries'][number]
type Finding = Extract<Entry['review'], { result: 'completed' }>['findings'][number]

function finding(id: string, classification: Finding['classification'], disposition: Finding['disposition'] = { kind: 'open' }): Finding {
  return { id, classification, title: `Finding ${id}`, location: 'article', explanation: 'Primary evidence disagrees',
    evidenceUrls: ['https://github.com/ojfbot/daily-logger/pull/377'], correction: 'Check primary evidence', disposition }
}
function completedEntry(id: string, findings: Finding[], historical = false): Entry {
  const entry = reviewEntry({ id, reviewer: `Reviewer ${id}`, sessionId: null, articleBlobSha: historical ? historicalBlob : visibleBlob,
    recordBlobSha: '1'.repeat(40), freshness: historical ? 'stale' : 'current', pullRequest: 377 })
  if (entry.review.result === 'completed') entry.review.findings = findings
  return entry
}
function projectionFor(entries: Entry[], unavailable: string[] = []): ReviewProjection {
  return projectionSchema.parse({ schemaVersion: 1, date: '2026-10-16', observedAt: time, sourceCommitSha: source,
    currentBlobSha: visibleBlob, visibleBlobSha: visibleBlob, discovery: 'registered_and_eligible_pull_requests', requestTarget: null,
    entries, unavailable, requests: [], pullRequests: [], correspondence: [] })
}
function records(entries: Entry[]): HTMLDivElement {
  const node = document.createElement('div')
  node.innerHTML = renderToStaticMarkup(<ReviewRecordGroups projection={projectionFor(entries)} selected={[]} sending={false} onToggle={() => undefined} />)
  return node
}

describe('reviewer-reported finding counts', () => {
  it('leads a completed empty record with explicit zero counts and hides both empty groups', () => {
    const node = records([completedEntry('empty', [])])
    const summary = node.querySelector('.review-finding-counts')
    expect(summary?.textContent).toBe('Reviewer reported: 0 confirmed errors · 0 unverified claims')
    expect(node.querySelector('h5')).toBeNull()
    expect(node.textContent).toContain('The reviewer reported no findings within the stated scope.')
    const identity = node.querySelector('.review-record-summary')
    if (!identity) throw new Error('Identity metadata is missing')
    expect(summary?.compareDocumentPosition(identity)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it.each([
    { classification: 'confirmed_error', summary: '1 confirmed error · 0 unverified claims', heading: 'Reviewer reports confirmed errors', absent: 'Claims the reviewer could not verify' },
    { classification: 'unverified_claim', summary: '0 confirmed errors · 1 unverified claim', heading: 'Claims the reviewer could not verify', absent: 'Reviewer reports confirmed errors' },
  ] satisfies Array<{ classification: Finding['classification']; summary: string; heading: string; absent: string }>)('renders only the nonempty $classification group', ({ classification, summary, heading, absent }) => {
    const node = records([completedEntry('one', [finding('F1', classification)])])
    expect(node.querySelector('.review-finding-counts')?.textContent).toBe(`Reviewer reported: ${summary}`)
    expect([...node.querySelectorAll('h5')].map((element) => element.textContent)).toEqual([heading])
    expect(node.textContent).not.toContain(absent)
    expect(node.textContent).not.toContain('reported no findings')
    expect(node.querySelector('details.independent-review-finding summary')?.textContent).toContain('F1: Finding F1')
  })

  it('counts all recorded classifications independently of human disposition and preserves controls', () => {
    const node = records([completedEntry('both', [finding('C1', 'confirmed_error'), finding('C2', 'confirmed_error',
      { kind: 'rejected', actor: 'editor', evidenceUrl: 'https://github.com/ojfbot/daily-logger/pull/377' }), finding('U1', 'unverified_claim')])])
    expect(node.querySelector('.review-finding-counts')?.textContent).toBe('Reviewer reported: 2 confirmed errors · 1 unverified claim')
    expect(node.querySelectorAll('h5')).toHaveLength(2)
    expect(node.querySelectorAll('input[type=checkbox]')).toHaveLength(3)
    expect(node.querySelectorAll('input:disabled')).toHaveLength(1)
    expect(node.textContent).toContain('Human disposition by editor')
  })

  it('keeps counts local to each reviewer and historical article revision', () => {
    const node = records([completedEntry('old', [finding('C1', 'confirmed_error'), finding('U1', 'unverified_claim')], true),
      completedEntry('current-empty', []), completedEntry('current-other', [finding('U2', 'unverified_claim')])])
    const cards = [...node.querySelectorAll('article')]
    expect(cards.map((card) => [card.querySelector('h4')?.textContent, card.querySelector('.review-finding-counts')?.textContent])).toEqual([
      ['Reviewer current-empty', 'Reviewer reported: 0 confirmed errors · 0 unverified claims'],
      ['Reviewer current-other', 'Reviewer reported: 0 confirmed errors · 1 unverified claim'],
      ['Reviewer old', 'Reviewer reported: 1 confirmed error · 1 unverified claim'],
    ])
    expect(node.querySelectorAll('.review-revision-group')).toHaveLength(2)
    expect(cards[2]?.textContent).toContain('Historical article revision; a fresh review is needed')
    expect(cards[2]?.querySelectorAll('input:disabled')).toHaveLength(2)
  })

  it('never renders completed counts for a failed review', () => {
    const entry = completedEntry('failed', [])
    const { findings: _findings, ...base } = entry.review.result === 'completed' ? entry.review : (() => { throw new Error('Expected completed fixture') })()
    entry.review = { ...base, result: 'failed', reason: 'Primary source could not be loaded' }
    const node = records([entry])
    expect(node.querySelector('.review-finding-counts')).toBeNull()
    expect(node.querySelector('h5')).toBeNull()
    expect(node.querySelector('[role=alert]')?.textContent).toContain('No clean-review claim is available.')
    expect(node.textContent).not.toContain('reported no findings')
  })

  it.each(['missing', 'unregistered', 'unavailable'] as const)('does not turn a %s review response into zero findings', async (state) => {
    const unavailable = state === 'unregistered' ? ['Local review sessions are not registered'] : []
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => state === 'unavailable'
      ? new Response('Unavailable', { status: 503 })
      : new Response(JSON.stringify(projectionFor([], unavailable)), { status: 200 })))
    const node = document.createElement('div')
    document.body.append(node)
    const root = createRoot(node)
    const onAvailability = vi.fn()
    try {
      await act(async () => root.render(<IndependentArticleReviews date="2026-10-16" visibleBlobSha={visibleBlob} login="ojfbot" onDiscussionAvailabilityChange={onAvailability} />))
      expect(node.querySelector('.review-finding-counts')).toBeNull()
      expect(node.querySelectorAll('article')).toHaveLength(0)
      expect(node.textContent).not.toContain('reported no findings')
      expect(node.textContent).toContain(state === 'unavailable' ? 'Nothing here establishes a clean review.' : 'This is not a clean-review verdict.')
      if (state === 'unregistered') expect(node.textContent).toContain('Local review sessions are not registered')
    } finally {
      await act(async () => root.unmount())
      node.remove()
      vi.unstubAllGlobals()
      sessionStorage.clear()
    }
  })
})
