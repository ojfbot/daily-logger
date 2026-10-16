import { describe, expect, it } from 'vitest'
import {
  assertCanonicalActionHistoryConserved,
  type LegacyCanonicalAction,
} from '../action-model.js'

function action(overrides: Partial<LegacyCanonicalAction> = {}): LegacyCanonicalAction {
  return {
    id: 'act-baseline',
    command: '/validate',
    description: 'Verify the bounded behavior.',
    repo: 'daily-logger',
    status: 'open',
    sourceDate: '2026-10-15',
    ...overrides,
  }
}

describe('canonical action history conservation', () => {
  it('accepts the release boundary unchanged and allows a new ordinary action', () => {
    const baseline = action()
    const added = action({ id: 'act-next-day', sourceDate: '2026-10-16' })
    expect(assertCanonicalActionHistoryConserved({
      baselineOpen: [baseline],
      baselineDone: [],
      currentOpen: [baseline, added],
      currentDone: [],
    })).toEqual({
      baselineOpenStillOpen: 1,
      baselineOpenSettled: 0,
      baselineDonePreserved: 0,
    })
  })

  it('accepts an ordinary settlement while preserving prior completions', () => {
    const baselineOpen = action()
    const baselineDone = action({
      id: 'act-already-done',
      status: 'done',
      closedDate: '2026-10-15',
      resolution: 'Already verified.',
    })
    const settled = action({ status: 'done', closedDate: '2026-10-16', resolution: 'Verified.' })
    expect(assertCanonicalActionHistoryConserved({
      baselineOpen: [baselineOpen],
      baselineDone: [baselineDone],
      currentOpen: [],
      currentDone: [baselineDone, settled],
    })).toEqual({
      baselineOpenStillOpen: 0,
      baselineOpenSettled: 1,
      baselineDonePreserved: 1,
    })
  })

  it('rejects removal or mutation of baseline history', () => {
    const baselineOpen = action()
    const baselineDone = action({ id: 'act-already-done', status: 'done' })

    expect(() => assertCanonicalActionHistoryConserved({
      baselineOpen: [baselineOpen],
      baselineDone: [],
      currentOpen: [],
      currentDone: [],
    })).toThrow(/missing from both/)

    expect(() => assertCanonicalActionHistoryConserved({
      baselineOpen: [baselineOpen],
      baselineDone: [],
      currentOpen: [action({ description: 'Mutated history.' })],
      currentDone: [],
    })).toThrow(/changed immutable field description/)

    expect(() => assertCanonicalActionHistoryConserved({
      baselineOpen: [],
      baselineDone: [baselineDone],
      currentOpen: [],
      currentDone: [],
    })).toThrow(/missing from the completion ledger/)
  })

  it('preserves every field of a baseline completion without migrating legacy omissions', () => {
    const historical = action({
      id: 'act-historical',
      status: 'done',
      closedDate: '2026-10-15',
      resolution: 'Original evidence.',
    })
    const legacyWithoutResolution = action({
      id: 'act-legacy-no-resolution',
      status: 'done',
      closedDate: '2026-04-01',
    })

    expect(() => assertCanonicalActionHistoryConserved({
      baselineOpen: [],
      baselineDone: [historical, legacyWithoutResolution],
      currentOpen: [],
      currentDone: [historical, legacyWithoutResolution],
    })).not.toThrow()

    for (const changed of [
      action({ ...historical, resolution: 'Replacement evidence.' }),
      action({ ...historical, resolution: undefined }),
      action({ ...historical, closedDate: '2099-01-01' }),
      action({ ...historical, status: 'open' }),
    ]) {
      expect(() => assertCanonicalActionHistoryConserved({
        baselineOpen: [],
        baselineDone: [historical],
        currentOpen: [],
        currentDone: [changed],
      })).toThrow(/Baseline completed action .* changed field/)
    }
  })

  it('requires a newly settled baseline action to carry a real completion record', () => {
    const baseline = action()
    const valid = action({ status: 'done', closedDate: '2026-10-16', resolution: 'Verified.' })
    expect(() => assertCanonicalActionHistoryConserved({
      baselineOpen: [baseline],
      baselineDone: [],
      currentOpen: [],
      currentDone: [valid],
    })).not.toThrow()

    for (const invalid of [
      baseline,
      action({ status: 'done', resolution: 'Verified.' }),
      action({ status: 'done', closedDate: 'not-a-date', resolution: 'Verified.' }),
      action({ status: 'done', closedDate: '2026-10-16' }),
      action({ status: 'done', closedDate: '2026-10-16', resolution: '   ' }),
    ]) {
      expect(() => assertCanonicalActionHistoryConserved({
        baselineOpen: [baseline],
        baselineDone: [],
        currentOpen: [],
        currentDone: [invalid],
      })).toThrow(/is not a valid completed action/)
    }
  })
})
