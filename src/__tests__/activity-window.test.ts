import { describe, expect, it } from 'vitest'
import { activityWindow, currentArticleDate, occurredInWindow } from '../activity-window.js'

describe('default article date', () => {
  it.each([
    ['2026-10-20T00:30:00Z', '2026-10-19'],
    ['2027-01-20T00:30:00Z', '2027-01-19'],
    ['2026-10-20T05:00:00Z', '2026-10-20'],
    ['2027-01-20T06:00:00Z', '2027-01-20'],
  ])('uses the Chicago calendar date at %s', (now, expected) => {
    expect(currentArticleDate(new Date(now))).toBe(expected)
  })
})

describe('consecutive 03:30 America/Chicago reporting cutoffs', () => {
  it.each([
    ['2026-10-19', '2026-10-18T08:30:00Z', '2026-10-19T08:30:00Z', 24],
    ['2026-12-19', '2026-12-18T09:30:00Z', '2026-12-19T09:30:00Z', 24],
    ['2026-03-08', '2026-03-07T09:30:00Z', '2026-03-08T08:30:00Z', 23],
    ['2026-11-01', '2026-10-31T08:30:00Z', '2026-11-01T09:30:00Z', 25],
    ['2027-01-01', '2026-12-31T09:30:00Z', '2027-01-01T09:30:00Z', 24],
    ['2028-03-01', '2028-02-29T09:30:00Z', '2028-03-01T09:30:00Z', 24],
  ])('%s has the actual local-calendar interval', (date, start, end, hours) => {
    const window = activityWindow(date)
    expect(window).toEqual({ start: Date.parse(start), end: Date.parse(end) })
    expect((window.end - window.start) / 3_600_000).toBe(hours)
  })

  it('assigns a boundary event to exactly one consecutive day', () => {
    const event = '2026-11-01T09:30:00Z'
    expect(occurredInWindow(event, activityWindow('2026-11-01'))).toBe(false)
    expect(occurredInWindow(event, activityWindow('2026-11-02'))).toBe(true)
    expect(occurredInWindow('2026-10-31T08:30:00Z', activityWindow('2026-11-01'))).toBe(true)
  })

  it('keeps seven-period context on local cutoffs across DST', () => {
    expect(activityWindow('2026-11-02', 7)).toEqual({
      start: Date.parse('2026-10-26T08:30:00Z'), end: Date.parse('2026-11-02T09:30:00Z'),
    })
  })

  it.each(['2026-02-30', '2026-13-01', 'not-a-date', '2026-1-01'])('rejects invalid date %s', (date) => {
    expect(() => activityWindow(date)).toThrow('valid YYYY-MM-DD')
  })

  it('does not treat missing or invalid timestamps as activity', () => {
    const window = activityWindow('2026-10-19')
    for (const timestamp of [null, undefined, 'not-a-date', '']) expect(occurredInWindow(timestamp, window)).toBe(false)
  })

  it('compares offset timestamps as instants and rejects invalid period lengths', () => {
    expect(occurredInWindow('2026-10-18T03:30:00-05:00', activityWindow('2026-10-19'))).toBe(true)
    expect(occurredInWindow('2026-10-19T03:30:00-05:00', activityWindow('2026-10-19'))).toBe(false)
    for (const days of [0, -1, 1.5]) expect(() => activityWindow('2026-10-19', days)).toThrow('positive integer')
  })
})
