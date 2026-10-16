import { describe, expect, it } from 'vitest'
import { formatActions } from '../cleaner.js'
import type { ReviewedCanonicalAction } from '../action-model.js'

describe('cleaner reviewed action context', () => {
  it('preserves the invocation and states that the action is not dispatchable or settled', () => {
    const action: ReviewedCanonicalAction = {
      id: 'act-reviewed',
      command: '/orient',
      invocation: '/orient morning-cockpit inspector paths',
      description: 'Document the inspector paths.',
      repo: 'morning-cockpit',
      status: 'open',
      sourceDate: '2026-10-15',
      review: {
        source: {
          repository: 'ojfbot/daily-logger',
          articlePath: '_articles/2026-10-15.md',
          articleCommitSha: 'a'.repeat(40),
          articleBlobSha: 'b'.repeat(40),
          line: 98,
          suggestionLineSha256: 'c'.repeat(64),
          url: 'https://github.com/ojfbot/daily-logger/blob/a/_articles/2026-10-15.md#L98',
        },
        disposition: {
          kind: 'pending-receipt',
          owner: { threadId: 'task-1', title: 'Documentation task' },
          acceptanceCriteria: ['Accepted exact-head receipt.'],
          acceptedReceipt: null,
          nextSafeRetry: 'Read the assigned receipt.',
        },
        executionAuthority: 'none',
        settlementAuthority: 'none',
      },
    }

    const rendered = formatActions([action], 'morning-cockpit', 'open')
    expect(rendered).toContain(action.invocation)
    expect(rendered).toContain('reviewed context only; do not redispatch or treat as settled')
    expect(rendered).toContain('pending accepted receipt')
  })
})
