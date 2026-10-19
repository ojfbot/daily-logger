// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ShipmentTime } from '../../../../../src/shipment-times.ts'
import { attachShipmentTimes } from '../shipmentTimes.ts'

const available = (ref: string, at: string): ShipmentTime => ({
  status: 'available', at,
  source: { repo: 'ojfbot/daily-logger', ref, url: `https://github.com/ojfbot/daily-logger/pull/${ref}` },
})

describe('code-supplied shipment controls', () => {
  it('attaches one control per covered source in What shipped, exposes unavailable, and restores exact HTML', () => {
    const root = document.createElement('article')
    root.innerHTML = '<h2>What shipped</h2>'
      + '<h3><a href="https://github.com/ojfbot/daily-logger/pull/388">#388</a>, <a href="https://github.com/ojfbot/daily-logger/pull/384">#384</a></h3>'
      + '<p>Duplicate <a href="https://github.com/ojfbot/daily-logger/pull/388">#388</a>; missing <a href="https://github.com/ojfbot/daily-logger/pull/386">#386</a>.</p>'
      + '<p>Normalized <a href="https://github.com/ojfbot/daily-logger/pull/388/../999">#999</a>.</p>'
      + '<ul><li><a href="https://github.com/ojfbot/daily-logger/pull/387/files">#387 files</a></li></ul>'
      + '<h2>The decisions</h2><p><a href="https://github.com/ojfbot/daily-logger/pull/999">#999</a></p>'
    const original = root.innerHTML
    const shipments: ShipmentTime[] = [
      available('388', '2026-10-18T21:44:50.000Z'),
      { status: 'unavailable', reason: 'missing-merge-time', source: { repo: 'ojfbot/daily-logger', ref: '386', url: 'https://github.com/ojfbot/daily-logger/pull/386' } },
      available('999', '2026-10-18T20:00:00.000Z'),
      available('387', '2026-10-18T21:41:34.000Z'),
    ]

    const { attached, unavailable, restore } = attachShipmentTimes(root, shipments)
    expect(attached.map(({ reference }) => [reference.evidence.kind === 'github-pull-request' ? reference.evidence.ref : '', reference.at])).toEqual([
      ['388', '2026-10-18T21:44:50.000Z'], ['999', '2026-10-18T20:00:00.000Z'], ['387', '2026-10-18T21:41:34.000Z'],
    ])
    expect(root.querySelectorAll('.shipment-time-ref')).toHaveLength(3)
    expect(root.querySelector('a[href$="/pull/388"] + .shipment-time-state')?.textContent).toContain('merged 21:44Z')
    expect(unavailable).toHaveLength(1)
    expect(root.querySelector('a[href$="/pull/386"] + .shipment-time-state')?.textContent).toContain('timestamp unavailable')
    expect(root.querySelector('a[href$="/pull/384"] + .shipment-time-state')).toBeNull()
    const normalized = [...root.querySelectorAll('a')].find((link) => link.href.endsWith('/pull/999'))
    expect(normalized?.nextElementSibling?.textContent).toContain('merged 20:00Z')
    expect(root.querySelector('h2 + p a[href$="/pull/999"] + .shipment-time-state')).toBeNull()
    expect(root.querySelectorAll('a[href$="/pull/388"] + .shipment-time-state')).toHaveLength(1)
    expect(root.querySelector('a[href$="/pull/387/files"] + .shipment-time-state')?.textContent).toContain('merged 21:41Z')

    restore()
    expect(root.innerHTML).toBe(original)
  })

  it('decorates every repeated What shipped section, including after an empty first section', () => {
    const root = document.createElement('article')
    root.innerHTML = '<h2>What shipped</h2><p>No linked pull request.</p>'
      + '<h2>The decisions</h2><p><a href="https://github.com/ojfbot/daily-logger/pull/700">#700</a></p>'
      + '<h2>What shipped</h2><p><a href="https://github.com/ojfbot/daily-logger/pull/701">#701</a> and <a href="https://github.com/ojfbot/daily-logger/pull/702">#702</a></p>'
      + '<h2>What\'s next</h2><p><a href="https://github.com/ojfbot/daily-logger/pull/703">#703</a></p>'

    const result = attachShipmentTimes(root, [
      available('700', '2026-10-18T20:00:00.000Z'),
      available('701', '2026-10-18T21:00:00.000Z'),
      { status: 'unavailable', reason: 'missing-merge-time', source: { repo: 'ojfbot/daily-logger', ref: '702', url: 'https://github.com/ojfbot/daily-logger/pull/702' } },
      available('703', '2026-10-18T23:00:00.000Z'),
    ])

    expect(result.attached.map(({ reference }) => reference.evidence.kind === 'github-pull-request' ? reference.evidence.ref : '')).toEqual(['701'])
    expect(result.unavailable).toHaveLength(1)
    expect(root.querySelector('a[href$="/pull/701"] + .shipment-time-state')).not.toBeNull()
    expect(root.querySelector('a[href$="/pull/702"] + .shipment-time-unavailable')).not.toBeNull()
    expect(root.querySelector('a[href$="/pull/700"] + .shipment-time-state')).toBeNull()
    expect(root.querySelector('a[href$="/pull/703"] + .shipment-time-state')).toBeNull()
  })
})
