import { describe, expect, it } from 'vitest'
import { resolveTimeReferences, type TimeRecord } from '../time-references.js'

const known: TimeRecord = {
  at: '2026-10-14T09:10:41.000Z',
  evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359' },
}
const first = '[#359](https://github.com/ojfbot/daily-logger/pull/359)'
const missing = '[#360](https://github.com/ojfbot/daily-logger/pull/360)'

describe('source binding with incomplete evidence', () => {
  it.each([
    ['unqualified PR', `PR ${first} was opened, while PR #360 merged at 09:10Z.`, 'missing-evidence'],
    ['linked PR', `PR ${first} was opened, while PR ${missing} merged at 09:10Z.`, 'missing-evidence'],
    ['qualified other repository', 'daily-logger #359 was opened, while core #360 merged at 09:10Z.', 'missing-evidence'],
    ['same number in another repository', '### daily-logger\n\ndaily-logger #359 was opened, while core #359 merged at 09:10Z.', 'missing-evidence'],
    ['linked issue', `PR ${first} was opened, while [#359](https://github.com/ojfbot/daily-logger/issues/359) closed at 09:10Z.`, 'mutable-event'],
  ])('leaves the nearest %s unresolved instead of borrowing an earlier source', (_label, body, reason) => {
    const result = resolveTimeReferences(body, [known])
    expect(result.references).toEqual([])
    expect(result.unresolved).toEqual([{ text: '09:10Z', occurrence: 0, reason }])
  })

  it('preserves the first occurrence when evidence for the later mentioned source is unavailable', () => {
    const result = resolveTimeReferences(`PR ${first} merged at 09:10Z, while PR #360 merged at 09:10Z.`, [known])
    expect(result.references).toHaveLength(1)
    expect(result.references[0]).toMatchObject({ occurrence: 0, at: known.at, evidence: known.evidence })
    expect(result.unresolved).toEqual([{ text: '09:10Z', occurrence: 1, reason: 'missing-evidence' }])
  })

  it('binds the nearest source when its own evidence becomes available', () => {
    const target: TimeRecord = {
      at: '2026-10-15T09:10:13.000Z',
      evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '360', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/360' },
    }
    const result = resolveTimeReferences(`PR ${first} was opened, while PR ${missing} merged at 09:10Z.`, [known, target])
    expect(result.unresolved).toEqual([])
    expect(result.references).toEqual([{ text: '09:10Z', occurrence: 0, precision: 'minute', ...target }])
  })

  it('leaves an unknown commit unresolved instead of substituting the earlier commit', () => {
    const commit: TimeRecord = {
      at: known.at,
      evidence: { kind: 'github-commit', repo: 'ojfbot/core', ref: 'a'.repeat(40), event: 'committed', url: `https://github.com/ojfbot/core/commit/${'a'.repeat(40)}` },
    }
    const result = resolveTimeReferences('core commit aaaaaaa was authored, while commit bbbbbbb committed at 09:10Z.', [commit])
    expect(result.references).toEqual([])
    expect(result.unresolved).toEqual([{ text: '09:10Z', occurrence: 0, reason: 'missing-evidence' }])
  })
})
