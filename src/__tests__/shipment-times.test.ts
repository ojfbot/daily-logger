import { describe, expect, it } from 'vitest'
import { assertShipmentCoverage, resolveShipmentTimes, shipmentStatesFromContext, ShipmentTimeSchema } from '../shipment-times.js'
import type { BlogContext } from '../types.js'
import { requiresShipmentTimeCoverage } from '../shipment-time-coverage.js'
import { shipmentSources, type TimeRecord } from '../time-references.js'

const article = [
  '## What shipped',
  '',
  '### daily-logger ([#388](https://github.com/ojfbot/daily-logger/pull/388))',
  '',
  '### Acceptance ([#387](https://github.com/ojfbot/daily-logger/pull/387), [#384](https://github.com/ojfbot/daily-logger/pull/384))',
  '',
  'Paragraph shipment [#381](https://github.com/ojfbot/daily-logger/pull/381).',
  '',
  '- Bullet shipment [#383](https://github.com/ojfbot/daily-logger/pull/383)',
  '- [#382](https://github.com/ojfbot/daily-logger/pull/382)',
  '',
  '## The decisions',
  '',
  'Outside the section [#999](https://github.com/ojfbot/daily-logger/pull/999).',
].join('\n')

function record(ref: string, event: 'merged' | 'closed' | 'opened' | 'closed-unmerged', at = `2026-10-18T${String(Number(ref) % 24).padStart(2, '0')}:00:00.000Z`): TimeRecord {
  return { at, evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref, event, url: `https://github.com/ojfbot/daily-logger/pull/${ref}` } }
}

describe('shipment merge-time coverage', () => {
  it('keeps open PRs, closed-unmerged PRs, and issues free of merge placeholders', () => {
    const mixed = [
      '## What shipped',
      '',
      'Merged [#389](https://github.com/ojfbot/daily-logger/pull/389).',
      'Open [#385](https://github.com/ojfbot/daily-logger/pull/385) remains in flight.',
      'Issue [#386](https://github.com/ojfbot/daily-logger/issues/386) tracks the budget.',
      'Closed without merge [#392](https://github.com/ojfbot/daily-logger/pull/392).',
    ].join('\n')
    const sources = shipmentSources(mixed)
    const states = [
      { source: sources.find(source => source.ref === '385')!, state: 'open' as const },
      { source: sources.find(source => source.ref === '392')!, state: 'closed-unmerged' as const },
    ]
    const coverage = resolveShipmentTimes(mixed, [record('389', 'merged'), record('385', 'opened'), record('392', 'closed-unmerged')], 'complete', states)
    expect(coverage.times.map(time => time.source.ref)).toEqual(['389'])
    expect(coverage.exclusions.map(exclusion => [exclusion.source.ref, exclusion.reason])).toEqual([['385', 'open'], ['392', 'closed-unmerged']])
    expect(() => assertShipmentCoverage(mixed, coverage)).not.toThrow()
    expect(() => resolveShipmentTimes(mixed, [record('385', 'merged')], 'complete', states)).toThrow(/conflicting merge and current PR state/i)
    expect(() => resolveShipmentTimes(mixed, [], 'complete', [{ source: { repo: 'ojfbot/daily-logger', ref: '999', url: 'https://github.com/ojfbot/daily-logger/pull/999' }, state: 'open' }])).toThrow(/no shipment link/i)
    const ctx: BlogContext = {
      date: '2026-10-20', repos: ['daily-logger'], commits: [],
      mergedPRs: [{ number: 389, repo: 'daily-logger', title: 'Merged', mergedAt: record('389', 'merged').at, additions: 1, deletions: 0, url: 'https://github.com/ojfbot/daily-logger/pull/389' }],
      openPRs: [{ number: 385, repo: 'daily-logger', title: 'Open', url: 'https://github.com/ojfbot/daily-logger/pull/385', createdAt: record('385', 'opened').at, draft: false }],
      recentPRs: [{ number: 392, repo: 'daily-logger', title: 'Closed', url: 'https://github.com/ojfbot/daily-logger/pull/392', state: 'closed', merged: false, draft: false, createdAt: record('392', 'opened').at, updatedAt: record('392', 'closed-unmerged').at }],
      openIssues: [{ number: 386, repo: 'daily-logger', title: 'Issue', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/386' }],
      closedIssues: [], openActions: [], projectVision: '', previousArticles: [],
    }
    expect(shipmentStatesFromContext(ctx, mixed)).toEqual(states)
  })
  it('covers every linked PR formatting variant inside What shipped and rejects closed-unmerged or outside links', () => {
    const records = ['381', '382', '383', '387', '388'].map((ref) => record(ref, 'merged'))
    records.push(record('384', 'closed-unmerged'))
    records.push(record('999', 'merged'))

    expect(shipmentSources(article).map(({ ref }) => ref)).toEqual(['388', '387', '384', '381', '383', '382'])
    const coverage = resolveShipmentTimes(article, records, 'complete')
    expect(coverage.times.map((time) => [time.source.ref, time.status])).toEqual([
      ['388', 'available'], ['387', 'available'], ['381', 'available'], ['383', 'available'], ['382', 'available'],
    ])
    expect(coverage.exclusions).toEqual([{ source: shipmentSources(article)[2], reason: 'closed-unmerged' }])
    expect(() => assertShipmentCoverage(article, coverage)).not.toThrow()
    for (const time of coverage.times) expect(ShipmentTimeSchema.safeParse(time).success).toBe(true)
  })

  it('uses explicit unavailable states for missing, conflicting, or exhausted source facts', () => {
    const missing = resolveShipmentTimes(article, [record('384', 'closed-unmerged')], 'complete')
    expect(missing.times.find((time) => time.source.ref === '388')).toMatchObject({ status: 'unavailable', reason: 'missing-merge-time' })

    const conflicting = resolveShipmentTimes(article, [record('388', 'merged'), record('388', 'merged', '2026-10-19T01:00:00.000Z')], 'complete')
    expect(conflicting.times[0]).toMatchObject({ source: { ref: '388' }, status: 'unavailable', reason: 'conflicting-merge-times' })

    const exhausted = resolveShipmentTimes(article, [], 'exhausted')
    expect(exhausted.times.every((time) => time.status === 'unavailable' && time.reason === 'capture-exhausted')).toBe(true)
  })

  it('does not mistake historical lifecycle events for current unmerged state', () => {
    const coverage = resolveShipmentTimes(article, [record('388', 'opened'), record('384', 'closed')], 'complete')
    expect(coverage.exclusions).toEqual([])
    expect(coverage.times.find((time) => time.source.ref === '388')).toMatchObject({ status: 'unavailable', reason: 'missing-merge-time' })
    expect(coverage.times.find((time) => time.source.ref === '384')).toMatchObject({ status: 'unavailable', reason: 'missing-merge-time' })

    const explicit = resolveShipmentTimes(article, [record('384', 'closed-unmerged')], 'complete')
    expect(explicit.exclusions).toEqual([{ source: shipmentSources(article)[2], reason: 'closed-unmerged' }])
  })

  it('fails the gate when a control is omitted, bound to the wrong PR, or used for closed-unmerged evidence', () => {
    const coverage = resolveShipmentTimes(article, [...['381', '382', '383', '387', '388'].map((ref) => record(ref, 'merged')), record('384', 'closed-unmerged')], 'complete')
    expect(() => assertShipmentCoverage(article, { ...coverage, times: coverage.times.slice(1) })).toThrow(/missing shipment time state.*#388/i)
    expect(() => assertShipmentCoverage(article, { ...coverage, times: [...coverage.times, { ...coverage.times[0], source: shipmentSources(article)[2] }] })).toThrow(/unmerged.*#384/i)
    expect(() => assertShipmentCoverage(article, { ...coverage, times: [{ ...coverage.times[0], source: { repo: 'ojfbot/daily-logger', ref: '999', url: 'https://github.com/ojfbot/daily-logger/pull/999' } }, ...coverage.times.slice(1)] })).toThrow(/unexpected shipment time state.*#999/i)
  })

  it('covers every repeated What shipped section while excluding links in other sections', () => {
    const repeated = [
      '## What shipped',
      '',
      'No pull request in this section.',
      '',
      '## The decisions',
      '',
      '[Outside](https://github.com/ojfbot/daily-logger/pull/999).',
      '',
      '## What shipped',
      '',
      '[Merged](https://github.com/ojfbot/daily-logger/pull/600) and [unknown](https://github.com/ojfbot/daily-logger/pull/601).',
      '',
      '## What\'s next',
    ].join('\n')
    expect(shipmentSources(repeated).map(({ ref }) => ref)).toEqual(['600', '601'])
    expect(requiresShipmentTimeCoverage('2026-10-19', repeated)).toBe(true)
    const coverage = resolveShipmentTimes(repeated, [record('600', 'merged'), record('999', 'merged')], 'complete')
    expect(coverage.times).toEqual([
      { status: 'available', source: shipmentSources(repeated)[0], at: record('600', 'merged').at },
      { status: 'unavailable', source: shipmentSources(repeated)[1], reason: 'missing-merge-time' },
    ])
    expect(() => assertShipmentCoverage(repeated, coverage)).not.toThrow()
  })
})
