// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArticlePopovers } from '../../hooks/useArticlePopovers.ts'
import { Popover } from '../Popover.tsx'
import type { TimeReference } from '../../../../../src/time-reference-schema.ts'

const codeReferences: [] = []
const repos = ['daily-logger']
const times: TimeReference[] = [{ text: '09:10Z', occurrence: 0, at: '2026-10-14T09:10:41.000Z', precision: 'minute', evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359' } }]
let node: HTMLDivElement, root: Root
let responses: Map<string, (response: Response) => void>
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  responses = new Map()
  vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(resolve => responses.set(url, resolve))))
  node = document.createElement('div'); document.body.append(node); root = createRoot(node)
})
afterEach(async () => { await act(async () => root.unmount()); node.remove(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })
function Harness({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const popover = useArticlePopovers(ref, codeReferences, repos, times, html)
  return <><div ref={ref} dangerouslySetInnerHTML={{ __html: html }} /><Popover state={popover.state} onMouseEnter={popover.keepOpen} onMouseLeave={popover.scheduleHide} /></>
}
const html = (number: number) => `<a id="pr-${number}" href="https://github.com/ojfbot/daily-logger/pull/${number}">PR ${number}</a>`
function enter(number: number) { document.querySelector(`#pr-${number}`)?.dispatchEvent(new MouseEvent('mouseenter')) }
function leave(number: number) { document.querySelector(`#pr-${number}`)?.dispatchEvent(new MouseEvent('mouseleave')) }
function tooltip() { return document.querySelector('[role=tooltip]')?.textContent ?? '' }
const pr = (number: number) => ({ number, title: `Resolved target ${number}`, state: 'open', user: { login: 'ojfbot' }, labels: [] })
const url = (number: number) => `https://api.github.com/repos/ojfbot/daily-logger/pulls/${number}`
const commitHtml = (hash: string) => `<code id="commit-${hash}">${hash}</code>`
const commitUrl = (hash: string) => `https://api.github.com/repos/ojfbot/daily-logger/commits/${hash}`
const commit = (hash: string) => ({ sha: hash.padEnd(40, '0'), commit: { message: `Resolved commit ${hash}`, author: { name: 'Author', date: '2026-10-14T09:10:00Z' } } })
function enterCommit(hash: string) { document.querySelector(`#commit-${hash}`)?.dispatchEvent(new MouseEvent('mouseenter')) }
function leaveCommit(hash: string) { document.querySelector(`#commit-${hash}`)?.dispatchEvent(new MouseEvent('mouseleave')) }

describe('combined article popover lifecycle', () => {
  it('must render stationary-pointer PR success after the cache completes', async () => {
    await act(async () => root.render(<Harness html={html(1)} />))
    await act(async () => { enter(1); vi.advanceTimersByTime(210) })
    expect(tooltip()).toContain('Loading...')
    await act(async () => responses.get(url(1))?.(Response.json(pr(1))))
    expect(tooltip()).toContain('Resolved target 1')
    expect(tooltip()).not.toContain('Loading...')
  })
  it('must render stationary-pointer PR error after the cache completes', async () => {
    await act(async () => root.render(<Harness html={html(1)} />))
    await act(async () => { enter(1); vi.advanceTimersByTime(210) })
    await act(async () => responses.get(url(1))?.(Response.json({}, { status: 403 })))
    expect(tooltip()).toContain('Rate limited — try again later')
    expect(tooltip()).not.toContain('Loading...')
  })
  it('does not replace active target B with a late result for A', async () => {
    await act(async () => root.render(<Harness html={html(1) + html(2)} />))
    await act(async () => { enter(1); vi.advanceTimersByTime(210); leave(1); enter(2); vi.advanceTimersByTime(210) })
    await act(async () => responses.get(url(1))?.(Response.json(pr(1))))
    expect(tooltip()).toContain('#2')
    expect(tooltip()).not.toContain('Resolved target 1')
  })
  it.each([false, true])('clears an article-replacement anchor when visible=%s, including a late result', async visible => {
    await act(async () => root.render(<Harness html={html(1)} />))
    await act(async () => { enter(1); if (visible) vi.advanceTimersByTime(210) })
    await act(async () => root.render(<Harness html={html(2)} />))
    await act(async () => vi.advanceTimersByTime(210))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
    await act(async () => responses.get(url(1))?.(Response.json(pr(1))))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
    expect(document.querySelector('#pr-2')).not.toBeNull()
  })

  it('clears the time trigger accessibility state when a PR preview replaces it', async () => {
    await act(async () => root.render(<Harness html={`<p>09:10Z</p>${html(1)}`} />))
    const clock = document.querySelector('.time-ref')
    expect(clock).not.toBeNull()
    await act(async () => clock?.dispatchEvent(new MouseEvent('click')))
    expect(clock?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => { enter(1); vi.advanceTimersByTime(210) })
    expect(tooltip()).toContain('#1')
    expect(clock?.getAttribute('aria-expanded')).toBe('false')
    expect(clock?.hasAttribute('aria-describedby')).toBe(false)
    await act(async () => responses.get(url(1))?.(Response.json(pr(1))))
    expect(tooltip()).toContain('Resolved target 1')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('keeps the time popover when an earlier PR request finishes late', async () => {
    await act(async () => root.render(<Harness html={`${html(1)}<p>09:10Z</p>`} />))
    await act(async () => { enter(1); vi.advanceTimersByTime(210) })
    await act(async () => document.querySelector('.time-ref')?.dispatchEvent(new MouseEvent('click')))
    expect(document.querySelector('.time-popover')).not.toBeNull()
    await act(async () => responses.get(url(1))?.(Response.json(pr(1))))
    expect(document.querySelector('.time-popover')).not.toBeNull()
    expect(tooltip()).not.toContain('Resolved target 1')
  })

  it.each([false, true])('discards a replaced time anchor when visible=%s', async visible => {
    await act(async () => root.render(<Harness html='<p>09:10Z</p>' />))
    await act(async () => {
      document.querySelector('.time-ref')?.dispatchEvent(new MouseEvent('mouseenter'))
      if (visible) vi.advanceTimersByTime(210)
    })
    await act(async () => root.render(<Harness html='<p>Replacement without a clock.</p>' />))
    await act(async () => vi.advanceTimersByTime(500))
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('restarts its show delay after a rapid leave and reentry', async () => {
    await act(async () => root.render(<Harness html='<p>09:10Z</p>' />))
    const clock = document.querySelector('.time-ref')
    await act(async () => {
      clock?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(80)
      clock?.dispatchEvent(new MouseEvent('mouseleave'))
      vi.advanceTimersByTime(80)
      clock?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(250)
    })
    expect(document.querySelector('.time-popover')).not.toBeNull()
    expect(clock?.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps visible content open while crossing onto the tooltip and hides after leaving', async () => {
    await act(async () => root.render(<Harness html='<p>09:10Z</p>' />))
    const clock = document.querySelector('.time-ref')
    await act(async () => {
      clock?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(210)
    })
    const popover = document.querySelector('.time-popover')
    expect(popover).not.toBeNull()
    await act(async () => {
      clock?.dispatchEvent(new MouseEvent('mouseleave'))
      vi.advanceTimersByTime(80)
      popover?.dispatchEvent(new MouseEvent('mouseenter'))
      vi.advanceTimersByTime(250)
    })
    expect(document.querySelector('.time-popover')).not.toBeNull()
    await act(async () => {
      popover?.dispatchEvent(new MouseEvent('mouseleave'))
      vi.advanceTimersByTime(190)
    })
    expect(document.querySelector('.time-popover')).toBeNull()
    expect(clock?.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps pinned content usable after its trigger loses focus to a map click', async () => {
    await act(async () => root.render(<Harness html='<p>09:10Z</p>' />))
    const clock = document.querySelector<HTMLButtonElement>('.time-ref')
    await act(async () => { clock?.focus(); clock?.click() })
    const map = document.querySelector('.time-world-map')
    expect(map).not.toBeNull()
    await act(async () => {
      map?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      clock?.blur()
      map?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      vi.advanceTimersByTime(250)
    })
    expect(document.querySelector('.time-popover')).not.toBeNull()
    expect(clock?.getAttribute('aria-expanded')).toBe('true')
    expect(clock?.hasAttribute('aria-describedby')).toBe(true)

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })))
    expect(document.querySelector('.time-popover')).toBeNull()
    expect(clock?.getAttribute('aria-expanded')).toBe('false')
    expect(clock?.hasAttribute('aria-describedby')).toBe(false)
  })

  it.each(['Escape', 'outside pointer', 'trigger toggle', 'outside focus'])('dismisses pinned time with %s', async action => {
    await act(async () => root.render(<Harness html='<p>09:10Z</p><button id="outside-time">Next control</button>' />))
    const clock = document.querySelector<HTMLButtonElement>('.time-ref')
    await act(async () => { clock?.focus(); clock?.click() })
    expect(document.querySelector('.time-popover')).not.toBeNull()
    await act(async () => {
      if (action === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (action === 'outside pointer') document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      if (action === 'trigger toggle') clock?.click()
      if (action === 'outside focus') document.querySelector<HTMLButtonElement>('#outside-time')?.focus()
    })
    expect(document.querySelector('.time-popover')).toBeNull()
    expect(clock?.getAttribute('aria-expanded')).toBe('false')
    expect(clock?.hasAttribute('aria-describedby')).toBe(false)
  })

  it.each(['PR', 'commit'])('does not replace a %s target with a late result for the previous commit', async target => {
    const first = 'a1b2c3d'
    const second = 'b2c3d4e'
    await act(async () => root.render(<Harness html={commitHtml(first) + (target === 'PR' ? html(2) : commitHtml(second))} />))
    await act(async () => { enterCommit(first); vi.advanceTimersByTime(210) })
    expect(tooltip()).toContain(first)
    await act(async () => {
      leaveCommit(first)
      if (target === 'PR') enter(2)
      else enterCommit(second)
      vi.advanceTimersByTime(210)
    })
    await act(async () => responses.get(commitUrl(first))?.(Response.json(commit(first))))
    expect(tooltip()).toContain(target === 'PR' ? '#2' : second)
    expect(tooltip()).not.toContain(`Resolved commit ${first}`)
    await act(async () => {
      if (target === 'PR') responses.get(url(2))?.(Response.json(pr(2)))
      else responses.get(commitUrl(second))?.(Response.json(commit(second)))
    })
    expect(tooltip()).toContain(target === 'PR' ? 'Resolved target 2' : `Resolved commit ${second}`)
  })

  it('keeps pinned time when an earlier commit request finishes late', async () => {
    const hash = 'a1b2c3d'
    await act(async () => root.render(<Harness html={`${commitHtml(hash)}<p>09:10Z</p>`} />))
    await act(async () => { enterCommit(hash); vi.advanceTimersByTime(210) })
    await act(async () => document.querySelector<HTMLButtonElement>('.time-ref')?.click())
    await act(async () => responses.get(commitUrl(hash))?.(Response.json(commit(hash))))
    expect(document.querySelector('.time-popover')).not.toBeNull()
    expect(tooltip()).not.toContain(`Resolved commit ${hash}`)
  })
})
