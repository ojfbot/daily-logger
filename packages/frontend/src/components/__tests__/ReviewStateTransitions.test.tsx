// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectionSchema } from '../../../../../shared/article-review.ts'
import { useArticlePopovers } from '../../hooks/useArticlePopovers.ts'
import { Popover } from '../Popover.tsx'
import { IndependentArticleReviews } from '../IndependentArticleReviews.tsx'

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('../../store/hooks.ts', () => ({ useAppDispatch: () => dispatch }))

let node: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})

afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

function PopoverHarness({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useArticlePopovers(ref, [], ['daily-logger'])
  return <><div ref={ref} dangerouslySetInnerHTML={{ __html: html }} /><Popover state={state} /></>
}

function articleLink(number: number) {
  return `<a id="pr-${number}" href="https://github.com/ojfbot/daily-logger/pull/${number}">PR ${number}</a>`
}

function pullRequest(number: number) {
  return { number, title: `Result ${number}`, state: 'open', merged: false, user: { login: 'ojfbot' }, created_at: '2026-10-16T12:00:00Z', additions: 1, deletions: 0, labels: [] }
}

function tooltip() {
  return document.querySelector('[role=tooltip]')?.textContent ?? ''
}

const reviewSha = 'a'.repeat(40)
const reviewedAt = '2026-10-16T17:00:00Z'

function reviewProjection({ accepted = false, includeEntry = true, includeSecondEntry = false, unavailable = [] }: {
  accepted?: boolean
  includeEntry?: boolean
  includeSecondEntry?: boolean
  unavailable?: string[]
} = {}) {
  function entry(reviewId: string, reviewer: string, recordCharacter: string) {
    return {
      lifecycle: 'published',
      freshness: 'current',
      recordRef: reviewSha,
      recordBlobSha: recordCharacter.repeat(40),
      recordUrl: `https://github.com/ojfbot/daily-logger/blob/main/reviews/registered/${reviewId}.json`,
      fullRecordUrl: `https://github.com/ojfbot/daily-logger/blob/main/reviews/articles/${reviewId}.md`,
      review: {
        schemaVersion: 1,
        id: reviewId,
        result: 'completed',
        article: { date: '2026-10-16', sourceCommitSha: reviewSha, blobSha: reviewSha },
        reviewer: { name: reviewer, sessionId: null },
        reviewedAt,
        scope: 'scope',
        fullRecordBlobSha: reviewSha,
        fullRecordPath: `reviews/articles/${reviewId}.md`,
        findings: ['C1', 'C2'].map((id) => ({
          id,
          classification: 'confirmed_error',
          title: `Finding ${id}`,
          location: 'article',
          explanation: 'explanation',
          evidenceUrls: ['https://github.com/ojfbot/daily-logger/pull/367'],
          correction: `Fix ${id}`,
          disposition: accepted && id === 'C1'
            ? { kind: 'accepted', actor: 'editor', evidenceUrl: 'https://github.com/ojfbot/daily-logger/pull/367' }
            : { kind: 'open' },
        })),
      },
    }
  }

  const entries = []
  if (includeEntry) entries.push(entry('review-a', 'Reviewer A', accepted ? 'c' : 'b'))
  if (includeSecondEntry) entries.push(entry('review-b', 'Reviewer B', 'd'))
  return projectionSchema.parse({
    schemaVersion: 1,
    date: '2026-10-16',
    observedAt: reviewedAt,
    sourceCommitSha: reviewSha,
    currentBlobSha: reviewSha,
    visibleBlobSha: reviewSha,
    discovery: 'registered_and_eligible_pull_requests',
    requestTarget: { kind: 'pilot_issue', issueNumber: 357, contextUrl: 'https://github.com/ojfbot/daily-logger/issues/357' },
    unavailable,
    requests: [],
    entries,
  })
}

function reviewerCheckbox(name: string): HTMLInputElement | null {
  const card = [...node.querySelectorAll('article')]
    .find((candidate) => candidate.querySelector('h4')?.textContent === name)
  return card?.querySelector<HTMLInputElement>('input[type=checkbox]') ?? null
}

describe('review UI state transitions', () => {
  it('discards a visible popover and its late response when article content is replaced', async () => {
    vi.useFakeTimers()
    let resolve: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done })))

    await act(async () => root.render(<PopoverHarness html={articleLink(1)} />))
    await act(async () => {
      document.querySelector('#pr-1')?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(210)
    })
    expect(tooltip()).toContain('#1')

    await act(async () => root.render(<PopoverHarness html={articleLink(2)} />))
    expect(document.querySelector('#pr-1')).toBeNull()
    expect(document.querySelector('[role=tooltip]')).toBeNull()

    await act(async () => resolve(Response.json(pullRequest(1))))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
    expect(document.querySelector('#pr-2')).not.toBeNull()
  })

  it('discards a pending detached timer without letting its late error replace the next target', async () => {
    vi.useFakeTimers()
    const responses = new Map<string, (response: Response) => void>()
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>((resolve) => responses.set(url, resolve))))

    await act(async () => root.render(<PopoverHarness html={articleLink(1)} />))
    await act(async () => document.querySelector('#pr-1')?.dispatchEvent(new MouseEvent('mouseenter')))
    await act(async () => root.render(<PopoverHarness html={articleLink(2)} />))
    await act(async () => vi.advanceTimersByTime(210))
    expect(document.querySelector('[role=tooltip]')).toBeNull()

    await act(async () => {
      document.querySelector('#pr-2')?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(210)
    })
    expect(tooltip()).toContain('#2')

    await act(async () => responses.get('https://api.github.com/repos/ojfbot/daily-logger/pulls/1')?.(Response.json({}, { status: 403 })))
    expect(tooltip()).toContain('#2')
    expect(tooltip()).not.toContain('Rate limited')

    await act(async () => responses.get('https://api.github.com/repos/ojfbot/daily-logger/pulls/2')?.(Response.json(pullRequest(2))))
    expect(tooltip()).toContain('Result 2')
  })

  it('prunes a selected finding when refreshed evidence marks it accepted', async () => {
    let current = reviewProjection()
    const onDiscussionAvailabilityChange = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(current))))
    await act(async () => root.render(<IndependentArticleReviews
      date="2026-10-16"
      visibleBlobSha={reviewSha}
      login="editor"
      onDiscussionAvailabilityChange={onDiscussionAvailabilityChange}
    />))

    const first = node.querySelector<HTMLInputElement>('input[type=checkbox]')
    await act(async () => first?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    expect([...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.disabled).toBe(false)
    const draftKey = `dl-review-request:editor:2026-10-16:${reviewSha}`
    const before = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }

    current = reviewProjection({ accepted: true })
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh reviews and request history')?.click())

    const boxes = node.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes[0]?.checked).toBe(false)
    expect(boxes[0]?.disabled).toBe(true)
    const after = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }
    expect(after.selected).toEqual([])
    expect(after.feedback).toBe(before.feedback)
    expect(after.requestId).not.toBe(before.requestId)

    await act(async () => boxes[1]?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    expect(node.querySelector<HTMLTextAreaElement>('#independent-review-feedback')?.value).toContain('Fix C1')
    expect(node.querySelector<HTMLTextAreaElement>('#independent-review-feedback')?.value).toContain('Fix C2')
    expect([...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.disabled).toBe(false)
  })

  it('preserves a missing-source selection and draft until complete evidence returns', async () => {
    let current = reviewProjection({ includeSecondEntry: true })
    const onDiscussionAvailabilityChange = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(current))))
    await act(async () => root.render(<IndependentArticleReviews
      date="2026-10-16"
      visibleBlobSha={reviewSha}
      login="editor"
      onDiscussionAvailabilityChange={onDiscussionAvailabilityChange}
    />))

    await act(async () => reviewerCheckbox('Reviewer A')?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    const draftKey = `dl-review-request:editor:2026-10-16:${reviewSha}`
    const before = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }

    current = reviewProjection({ includeEntry: false, includeSecondEntry: true, unavailable: ['One registered review source is temporarily unavailable'] })
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh reviews and request history')?.click())
    const during = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }
    expect(during).toEqual(before)
    expect(reviewerCheckbox('Reviewer B')?.checked).toBe(false)

    current = reviewProjection({ includeSecondEntry: true })
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh reviews and request history')?.click())
    expect(reviewerCheckbox('Reviewer A')?.checked).toBe(true)
    expect(reviewerCheckbox('Reviewer B')?.checked).toBe(false)

    current = reviewProjection({ includeEntry: false, includeSecondEntry: true })
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh reviews and request history')?.click())
    const afterCompleteRemoval = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }
    expect(afterCompleteRemoval.selected).toEqual([])
    expect(afterCompleteRemoval.feedback).toBe(before.feedback)
    expect(afterCompleteRemoval.requestId).not.toBe(before.requestId)
    expect(reviewerCheckbox('Reviewer B')?.checked).toBe(false)
  })

  it('does not rotate the request identity while a submission is in flight', async () => {
    let current = reviewProjection()
    let completePost: (response: Response) => void = () => undefined
    const onDiscussionAvailabilityChange = () => undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => init?.method === 'POST'
      ? new Promise<Response>((resolve) => { completePost = resolve })
      : Promise.resolve(Response.json(current))))
    await act(async () => root.render(<IndependentArticleReviews
      date="2026-10-16"
      visibleBlobSha={reviewSha}
      login="editor"
      onDiscussionAvailabilityChange={onDiscussionAvailabilityChange}
    />))

    await act(async () => node.querySelector<HTMLInputElement>('input[type=checkbox]')?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    const draftKey = `dl-review-request:editor:2026-10-16:${reviewSha}`
    const before = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }

    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.click())
    current = reviewProjection({ includeEntry: false, unavailable: ['The selected review source is temporarily unavailable'] })
    await act(async () => window.dispatchEvent(new Event('focus')))

    const during = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }
    expect(during).toEqual(before)

    await act(async () => completePost(Response.json({}, { status: 503 })))
    const afterFailure = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') as { selected: string[]; feedback: string; requestId: string }
    expect(afterFailure).toEqual(before)

    current = reviewProjection()
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(node.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(draftKey) ?? 'null')).toEqual(before)
    expect([...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.disabled).toBe(false)
  })
})
