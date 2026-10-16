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

  it('prunes a selected finding when refreshed evidence marks it accepted', async () => {
    const sha = 'a'.repeat(40)
    const time = '2026-10-16T17:00:00Z'
    function projection(accepted: boolean) {
      return projectionSchema.parse({
        schemaVersion: 1,
        date: '2026-10-16',
        observedAt: time,
        sourceCommitSha: sha,
        currentBlobSha: sha,
        visibleBlobSha: sha,
        discovery: 'registered_and_eligible_pull_requests',
        requestTarget: { kind: 'pilot_issue', issueNumber: 357, contextUrl: 'https://github.com/ojfbot/daily-logger/issues/357' },
        unavailable: [],
        requests: [],
        entries: [{
          lifecycle: 'published',
          freshness: 'current',
          recordRef: sha,
          recordBlobSha: (accepted ? 'c' : 'b').repeat(40),
          recordUrl: 'https://github.com/ojfbot/daily-logger/blob/main/reviews/registered/test.json',
          fullRecordUrl: 'https://github.com/ojfbot/daily-logger/blob/main/reviews/articles/test.md',
          review: {
            schemaVersion: 1,
            id: 'review-a',
            result: 'completed',
            article: { date: '2026-10-16', sourceCommitSha: sha, blobSha: sha },
            reviewer: { name: 'Reviewer A', sessionId: null },
            reviewedAt: time,
            scope: 'scope',
            fullRecordBlobSha: sha,
            fullRecordPath: 'reviews/articles/test.md',
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
        }],
      })
    }

    let current = projection(false)
    const onDiscussionAvailabilityChange = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(current))))
    await act(async () => root.render(<IndependentArticleReviews
      date="2026-10-16"
      visibleBlobSha={sha}
      login="editor"
      onDiscussionAvailabilityChange={onDiscussionAvailabilityChange}
    />))

    const first = node.querySelector<HTMLInputElement>('input[type=checkbox]')
    await act(async () => first?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    expect([...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.disabled).toBe(false)

    current = projection(true)
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Refresh reviews and request history')?.click())

    const boxes = node.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes[0]?.checked).toBe(false)
    expect(boxes[0]?.disabled).toBe(true)

    await act(async () => boxes[1]?.click())
    await act(async () => [...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add selected corrections to feedback')?.click())
    expect(node.querySelector<HTMLTextAreaElement>('#independent-review-feedback')?.value).toContain('Fix C2')
    expect([...node.querySelectorAll('button')]
      .find((button) => button.textContent === 'Request changes on #357')?.disabled).toBe(false)
  })
})
