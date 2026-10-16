import { describe, expect, it } from 'vitest'
import {
  assertNoReviewedActionClosures,
  type ReviewedCanonicalAction,
} from '../action-model.js'

const reviewed: ReviewedCanonicalAction = {
  id: 'act-2026-10-15-investigate-66e04675dca0',
  command: '/investigate',
  invocation: '/investigate morning-cockpit#57',
  description: 'Review the source boundary.',
  repo: 'morning-cockpit',
  status: 'open',
  sourceDate: '2026-10-15',
  review: {
    source: {
      repository: 'ojfbot/daily-logger',
      articlePath: '_articles/2026-10-15.md',
      articleCommitSha: 'a'.repeat(40),
      articleBlobSha: 'b'.repeat(40),
      line: 1,
      suggestionLineSha256: 'c'.repeat(64),
      url: 'https://github.com/ojfbot/daily-logger/blob/a/_articles/2026-10-15.md#L1',
    },
    disposition: {
      kind: 'deferred',
      owner: { threadId: 'task-1', title: 'Parked task' },
      reason: 'No authority.',
      nextSafeRetry: 'Wait for explicit reactivation.',
    },
    executionAuthority: 'none',
    settlementAuthority: 'none',
  },
}

describe('reviewed action settlement guard', () => {
  it('rejects an exact reviewed ID', () => {
    expect(() => assertNoReviewedActionClosures([{ ...reviewed }], [reviewed])).toThrow(/separately accepted exact-ID settlement receipt/)
  })

  it('rejects a legacy-key closure even when the candidate ID differs or is absent', () => {
    expect(() => assertNoReviewedActionClosures([{ ...reviewed, id: 'wrong-id' }], [reviewed])).toThrow()
    expect(() => assertNoReviewedActionClosures([{
      command: reviewed.command,
      sourceDate: reviewed.sourceDate,
      description: reviewed.description,
    }], [reviewed])).toThrow()
  })

  it('allows an unrelated ordinary closure', () => {
    expect(() => assertNoReviewedActionClosures([{
      id: 'act-other',
      command: '/validate',
      sourceDate: '2026-10-16',
      description: 'Unrelated action.',
    }], [reviewed])).not.toThrow()
  })
})
