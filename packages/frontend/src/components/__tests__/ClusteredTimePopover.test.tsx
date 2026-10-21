// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { attachTimeReferences } from '../../utils/timeReferences.ts'
import { Popover } from '../Popover.tsx'
import type { TimeExpression } from '../../../../../src/time-reference-schema.ts'

const clustered: TimeExpression = {
  kind: 'list', text: '06:30 and 07:30Z', occurrence: 0,
  members: [
    { text: '06:30', precision: 'minute', certainty: 'exact', resolution: { kind: 'supported', at: '2026-11-01T06:30:00.000Z', evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '369', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/369' } } },
    { text: '07:30Z', precision: 'minute', certainty: 'exact', resolution: { kind: 'supported', at: '2026-11-01T07:30:00.000Z', evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '371', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/371' } } },
  ],
}

it('uses the existing single-time tooltip for each clustered PR event, with its own clock and map', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const original = Intl.DateTimeFormat
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) { return new original(locales, { ...options, timeZone: 'America/Chicago' }) })
  const article = document.createElement('article'), host = document.createElement('div')
  article.innerHTML = '<p>PRs #369 and #371 merged at 06:30 and 07:30Z.</p>'
  document.body.append(article, host)
  const { attached, restore } = attachTimeReferences(article, [clustered])
  const root = createRoot(host)
  try {
    expect(attached).toHaveLength(2)
    for (const [index, clock] of ['06:30', '07:30Z'].entries()) {
      const target = attached.find(({ element }) => element.textContent === clock)
      if (!target) throw new Error(`Missing timestamp ${clock}`)
      await act(async () => root.render(<Popover state={{ visible: true, anchor: target.element, variant: { kind: 'time', reference: target.reference, tooltipId: 'clustered-clock' } }} />))
      const panel = document.getElementById('clustered-clock')
      expect(target.reference.reference.evidence).toMatchObject({ kind: 'github-pull-request', ref: index === 0 ? '369' : '371' })
      expect(panel?.getAttribute('role')).toBe('tooltip')
      expect(panel?.querySelector('.time-popover-heading')?.textContent).toBe('The same moment, two clocks')
      expect(panel?.querySelector('.time-clock-viewer')?.textContent).toContain(index === 0 ? 'UTC−05:00' : 'UTC−06:00')
      expect(panel?.querySelector('.time-clock-utc time')?.textContent).toBe(index === 0 ? '06:30' : '07:30')
      expect(panel?.querySelector('.time-map-viewer')?.getAttribute('x1')).toBe(index === 0 ? '105' : '90')
      expect(panel?.querySelectorAll('svg')).toHaveLength(1)
      expect(panel?.querySelectorAll('time')).toHaveLength(2)
      expect(panel?.textContent).not.toMatch(/Related event times|Elapsed time|Show map for/)
      expect(panel?.querySelector('button')).toBeNull()
    }
  } finally { await act(async () => root.unmount()); restore(); article.remove(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() }
})

it('leaves unknown clustered timestamps plain rather than inventing a separate review panel', () => {
  const article = document.createElement('article')
  article.textContent = '06:30 and 07:30Z'
  const unknown: TimeExpression = { ...clustered, members: [clustered.members[0], { ...clustered.members[1], resolution: { kind: 'unresolved', reason: 'missing-date' } }] }
  const { attached, restore } = attachTimeReferences(article, [unknown])
  expect(attached.map(({ element }) => element.textContent)).toEqual(['06:30'])
  expect(article.textContent).toBe('06:30 and 07:30Z')
  restore()
})

it('retains approximation in the existing clock/map rather than introducing an alternate panel', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const article = document.createElement('article'), host = document.createElement('div')
  article.textContent = '~06:30–07:30Z'
  document.body.append(article, host)
  const expression: TimeExpression = { kind: 'interval', text: '~06:30–07:30Z', occurrence: 0, relation: 'event-span', start: { ...clustered.members[0], text: '~06:30', certainty: 'approximate' }, end: { ...clustered.members[1], certainty: 'approximate' } }
  const { attached, restore } = attachTimeReferences(article, [expression])
  const root = createRoot(host)
  try {
    const target = attached.find(({ element }) => element.textContent === '07:30Z')
    if (!target) throw new Error('Missing approximate clock')
    await act(async () => root.render(<Popover state={{ visible: true, anchor: target.element, variant: { kind: 'time', reference: target.reference, tooltipId: 'approximate-clock' } }} />))
    const panel = document.getElementById('approximate-clock')
    expect(panel?.querySelector('.time-clock-utc time')?.textContent).toBe('~07:30')
    expect(panel?.textContent).toContain('The article states this time approximately.')
    expect(panel?.querySelectorAll('svg')).toHaveLength(1)
    expect(panel?.textContent).not.toMatch(/Related|Elapsed|Duration|Show map/)
  } finally { await act(async () => root.unmount()); restore(); article.remove(); host.remove(); vi.unstubAllGlobals() }
})
