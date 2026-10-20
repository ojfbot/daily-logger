// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { attachIssueTimes, issueTimeReference } from '../issueTimes.ts'
import type { IssueTime } from '../../../../../src/issue-times.ts'

const issue: IssueTime = { source: { repo: 'ojfbot/daily-logger', ref: '357', url: 'https://github.com/ojfbot/daily-logger/issues/357' }, event: 'created', at: '2026-10-13T15:53:55.000Z' }

describe('source-owned issue decorations', () => {
  it('attaches once beside an issue-comment link and preserves its event for the map', () => {
    const root = document.createElement('div')
    root.innerHTML = '<a href="https://github.com/ojfbot/daily-logger/issues/357#issuecomment-1">first mention</a> <a href="https://github.com/ojfbot/daily-logger/issues/357">second mention</a>'
    const applied = attachIssueTimes(root, [issue])
    expect(root.querySelectorAll('.issue-time-state')).toHaveLength(1)
    expect(root.querySelector('a')?.nextElementSibling?.textContent).toContain('Created 15:53Z')
    expect(issueTimeReference(issue).evidence).toMatchObject({ kind: 'github-issue', event: 'created', ref: '357' })
    applied.restore()
    expect(root.querySelector('.issue-time-state')).toBeNull()
  })
})
