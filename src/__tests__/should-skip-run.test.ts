import { describe, it, expect } from 'vitest'
import { shouldSkipRun } from '../should-skip-run.js'
import type { BlogContext, CommitInfo, RecentPRInfo } from '../types.js'

function makeCommit(author: string, repo = 'core'): CommitInfo {
  return {
    hash: 'abc1234',
    message: `some change in ${repo}`,
    author,
    date: '2026-05-10T12:00:00Z',
    repo,
    url: `https://github.com/ojfbot/${repo}/commit/abc1234`,
  }
}

function makePR(author: string | undefined, number = 1, repo = 'core'): RecentPRInfo {
  return {
    number,
    title: `PR ${number}`,
    repo,
    url: `https://github.com/ojfbot/${repo}/pull/${number}`,
    state: 'closed',
    createdAt: '2026-05-10T12:00:00Z',
    updatedAt: '2026-05-10T12:00:00Z',
    mergedAt: '2026-05-10T12:00:00Z',
    draft: false,
    author,
  }
}

function makeCtx(overrides: Partial<BlogContext> = {}): BlogContext {
  return {
    date: '2026-05-11',
    repos: ['core'],
    commits: [],
    mergedPRs: [],
    openPRs: [],
    recentPRs: [],
    closedIssues: [],
    openIssues: [],
    openActions: [],
    projectVision: '',
    previousArticles: [],
    telemetry: null,
    ...overrides,
  }
}

describe('shouldSkipRun', () => {
  it('skips when there is no activity at all', () => {
    const decision = shouldSkipRun(makeCtx())
    expect(decision.skip).toBe(true)
    expect(decision.reason).toBe('no activity in 24h window')
  })

  it('skips when the only commit is from ojfbot-blog[bot]', () => {
    const ctx = makeCtx({ commits: [makeCommit('ojfbot-blog[bot]')] })
    const decision = shouldSkipRun(ctx)
    expect(decision.skip).toBe(true)
    expect(decision.reason).toMatch(/only automated activity/)
  })

  it('skips when commits and PRs are exclusively bot-authored', () => {
    const ctx = makeCtx({
      commits: [makeCommit('ojfbot-blog[bot]'), makeCommit('github-actions[bot]')],
      recentPRs: [makePR('ojfbot-clean[bot]', 42)],
    })
    const decision = shouldSkipRun(ctx)
    expect(decision.skip).toBe(true)
    expect(decision.reason).toContain('2 bot commit')
    expect(decision.reason).toContain('1 bot PR')
  })

  it('runs when at least one commit is human-authored', () => {
    const ctx = makeCtx({
      commits: [makeCommit('ojfbot-blog[bot]'), makeCommit('Jim Green')],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs when bots committed but a human opened a PR', () => {
    const ctx = makeCtx({
      commits: [makeCommit('ojfbot-blog[bot]')],
      recentPRs: [makePR('ojfbot', 7)],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs for dependabot PRs (not in the automated set)', () => {
    const ctx = makeCtx({
      recentPRs: [makePR('dependabot[bot]', 99)],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('treats undefined author as human (defensive — we never want to silently skip)', () => {
    const ctx = makeCtx({
      commits: [makeCommit('ojfbot-blog[bot]')],
      recentPRs: [makePR(undefined, 11)],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })
})
