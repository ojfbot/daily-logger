// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { attachTimeReferences } from '../timeReferences.ts'
import { nightPath, offsetLabel, offsetLongitude, solarAltitude, solarPosition, utcClock, viewerClock } from '../timeDisplay.ts'
import type { TimeReference } from '../../../../../src/time-reference-schema.ts'

describe('event-specific browser clock conversion', () => {
  it.each([
    ['2026-03-08T07:59:00Z', 'America/Chicago', '2026-03-08', '01:59', -360],
    ['2026-03-08T08:00:00Z', 'America/Chicago', '2026-03-08', '03:00', -300],
    ['2026-11-01T06:30:00Z', 'America/Chicago', '2026-11-01', '01:30', -300],
    ['2026-11-01T07:30:00Z', 'America/Chicago', '2026-11-01', '01:30', -360],
    ['2026-10-14T23:40:00Z', 'Asia/Kathmandu', '2026-10-15', '05:25', 345],
    ['2026-10-14T23:40:00Z', 'Pacific/Chatham', '2026-10-15', '13:25', 825],
    ['2026-10-14T23:40:00Z', 'Pacific/Kiritimati', '2026-10-15', '13:40', 840],
    ['2026-10-14T00:10:00Z', 'America/St_Johns', '2026-10-13', '21:40', -150],
    ['2026-07-01T12:00:00Z', 'Europe/London', '2026-07-01', '13:00', 60],
    ['2026-01-01T12:00:00Z', 'Europe/London', '2026-01-01', '12:00', 0],
  ])('converts %s in %s using that instant’s rules', (at, zone, date, clock, offsetMinutes) => {
    expect(viewerClock(new Date(at), 'minute', zone)).toMatchObject({ date, clock, offsetMinutes, source: 'iana' })
  })

  it('keeps seconds, UTC date, and numeric offset unambiguous', () => {
    expect(utcClock(new Date('2026-10-14T09:10:23.111Z'), 'second')).toMatchObject({ date: '2026-10-14', clock: '09:10:23', offsetMinutes: 0 })
    expect(offsetLabel(345)).toBe('UTC+05:45')
    expect(offsetLabel(-150)).toBe('UTC−02:30')
    expect(offsetLongitude(0)).toBe(0)
    expect(offsetLongitude(840)).toBe(-150)
  })

  it('falls back to the device offset at the event if the IANA zone is unavailable', () => {
    const at = new Date('2026-10-14T09:10:00Z')
    const result = viewerClock(at, 'minute', 'Invalid/Unavailable')
    expect(result).toMatchObject({ source: 'device-offset', zone: 'Device time zone', offsetMinutes: -at.getTimezoneOffset() })
    expect(result.date + 'T' + result.clock).toBe(new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16))
  })

  it('explicitly falls back to UTC when neither IANA rules nor a finite device offset is available', () => {
    const at = new Date('2026-10-14T09:10:00Z')
    const offset = vi.spyOn(at, 'getTimezoneOffset').mockReturnValue(Number.NaN)
    try {
      expect(viewerClock(at, 'minute', 'Invalid/Unavailable')).toMatchObject({ source: 'utc', zone: 'UTC', clock: '09:10', offsetMinutes: 0 })
    } finally { offset.mockRestore() }
  })
})

describe('date-specific geometric night illustration', () => {
  it('places the June and December subsolar latitudes near the tropics and handles polar day/night', () => {
    const june = solarPosition(new Date('2026-06-21T12:00:00Z'))
    const december = solarPosition(new Date('2026-12-21T12:00:00Z'))
    expect(june.declination * 180 / Math.PI).toBeCloseTo(23.44, 0)
    expect(december.declination * 180 / Math.PI).toBeCloseTo(-23.44, 0)
    expect(Math.abs(june.longitude)).toBeLessThan(1)
    expect(solarAltitude(90, 0, june)).toBeGreaterThan(23)
    expect(solarAltitude(-90, 0, june)).toBeLessThan(-23)
    expect(solarAltitude(90, 0, december)).toBeLessThan(-23)
    expect(solarAltitude(-90, 0, december)).toBeGreaterThan(23)
  })

  it('follows UTC midnight, leap year and equinox instead of the viewer clock', () => {
    const midnight = solarPosition(new Date('2024-03-20T00:00:00Z'))
    expect(Math.abs(midnight.declination * 180 / Math.PI)).toBeLessThan(1)
    expect(Math.abs(midnight.longitude)).toBeGreaterThan(175)
    expect(solarAltitude(0, 0, midnight)).toBeLessThan(-85)
    expect(solarAltitude(0, 180, midnight)).toBeGreaterThan(85)
    expect(nightPath(midnight)).not.toMatch(/NaN|Infinity/)
    const exactEquinox = { declination: 0, longitude: 0 }
    const path = nightPath(exactEquinox)
    expect(path).toContain('M0,0h1v180h-1Z')
    expect(path).not.toContain('M180,0h1v180h-1Z')
    expect(path).toContain('M359,0h1v180h-1Z')
  })

  it.each(['2026-06-21T09:10:00Z', '2026-12-21T23:10:00Z', '2024-03-20T00:00:00Z'])('fills the night side across the seam at %s', at => {
    const sun = solarPosition(new Date(at))
    const points = nightPath(sun).slice(1, -1).split('L').map(point => point.split(',').map(Number))
    const inside = (x: number, y: number) => {
      let contained = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]
        const [xj, yj] = points[j]
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) contained = !contained
      }
      return contained
    }
    for (const latitude of [-80, -45, -15, 15, 45, 80]) for (let longitude = -179; longitude < 180; longitude += 23) {
      const altitude = solarAltitude(latitude, longitude, sun)
      if (Math.abs(altitude) < 2) continue
      expect(inside(longitude + 180, 90 - latitude), `${latitude}°, ${longitude}°`).toBe(altitude < 0)
    }
  })
})

function reference(occurrence: number, at = '2026-10-14T09:10:00.000Z'): TimeReference {
  return { text: '09:10Z', occurrence, at, precision: 'minute', evidence: {
    kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359',
  } }
}

describe('evidence-resolved inline time decoration', () => {
  it('uses the exact occurrence, counts visible link labels, skips code blocks, and restores prose', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p><a href="https://example.com/09:10Z">09:10Z</a>; first 09:10Z, second <code>09:10Z</code>.</p><pre>09:10Z</pre><p>09:10Z</p>'
    const original = root.innerHTML
    const { attached, restore } = attachTimeReferences(root, [reference(2)])
    expect(attached).toHaveLength(1)
    expect(root.querySelector('code button time')?.getAttribute('datetime')).toBe('2026-10-14T09:10:00.000Z')
    expect(root.querySelector('pre button')).toBeNull()
    expect(root.querySelector('a button')).toBeNull()
    restore()
    expect(root.innerHTML).toBe(original)
  })

  it('leaves ambiguous clocks and malformed instants plain, including embedded partial timestamps', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>09:10Z 09:10Z 2026-10-14T09:10Z</p>'
    const { attached } = attachTimeReferences(root, [reference(1), reference(0, '2026-02-30T09:10:00.000Z')])
    expect(attached).toHaveLength(1)
    expect(root.textContent).toBe('09:10Z 09:10Z 2026-10-14T09:10Z')
    expect(root.querySelectorAll('button')).toHaveLength(1)
  })

  it('inventories complete dated tokens before bare clocks and ignores hidden text', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>2026-10-14 09:10Z; <span hidden>09:10Z</span><span aria-hidden="true">09:10Z</span>09:10Z</p>'
    const { attached } = attachTimeReferences(root, [reference(0)])
    expect(attached).toHaveLength(1)
    expect(root.querySelector('p')?.lastElementChild).toBe(attached[0].element)
    expect(root.querySelector('[hidden] button')).toBeNull()
    expect(root.querySelector('[aria-hidden] button')).toBeNull()
  })
})
