import { describe, it, expect } from 'vitest'
import { shouldSkipRun } from '../should-skip-run.js'
import type { BlogContext, CommitInfo, IssueInfo, RecentPRInfo } from '../types.js'

function makeCommit(author: string, repo = 'core', message = `some change in ${repo}`): CommitInfo {
  return {
    hash: 'abc1234',
    message,
    author,
    date: '2026-05-10T12:00:00Z',
    repo,
    url: `https://github.com/ojfbot/${repo}/commit/abc1234`,
  }
}

function makeBlogCommit(): CommitInfo {
  return makeCommit('ojfbot-blog[bot]', 'daily-logger', 'blog: 2026-05-10 [skip ci]')
}

function makeIssue(overrides: Partial<IssueInfo> = {}): IssueInfo {
  return {
    number: 12,
    title: 'Automated watch result',
    state: 'open',
    labels: [],
    createdAt: '2026-05-10T12:00:00Z',
    url: 'https://github.com/ojfbot/core/issues/12',
    repo: 'core',
    ...overrides,
  }
}

function makePR(
  author: string | undefined,
  number = 1,
  repo = 'core',
  overrides: Partial<RecentPRInfo> = {},
): RecentPRInfo {
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
    ...overrides,
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
    const ctx = makeCtx({ commits: [makeBlogCommit()] })
    const decision = shouldSkipRun(ctx)
    expect(decision.skip).toBe(true)
    expect(decision.reason).toContain('no meaningful activity')
  })

  it('runs when an automation creates a PR with real changes', () => {
    const ctx = makeCtx({
      commits: [makeBlogCommit()],
      recentPRs: [makePR('ojfbot-clean[bot]', 42)],
    })
    const decision = shouldSkipRun(ctx)
    expect(decision.skip).toBe(false)
  })

  it('runs when an automation commits real changes to a default branch', () => {
    const ctx = makeCtx({ commits: [makeCommit('github-actions[bot]')] })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs when at least one commit is human-authored', () => {
    const ctx = makeCtx({
      commits: [makeCommit('ojfbot-blog[bot]'), makeCommit('Jim Green')],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs when bots committed but a human opened a PR', () => {
    const ctx = makeCtx({
      commits: [makeBlogCommit()],
      recentPRs: [makePR('ojfbot', 7)],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('ignores metadata-only updates to an old PR', () => {
    const ctx = makeCtx({
      commits: [makeBlogCommit()],
      recentPRs: [
        makePR('ojfbot', 88, 'core', {
          state: 'open',
          createdAt: '2026-05-01T12:00:00Z',
          updatedAt: '2026-05-10T12:00:00Z',
          mergedAt: undefined,
          headCommitAt: '2026-05-01T12:00:00Z',
        }),
      ],
    })
    const decision = shouldSkipRun(ctx)
    expect(decision.skip).toBe(true)
    expect(decision.reason).toContain('no meaningful activity')
  })

  it('runs when an existing PR receives a new commit', () => {
    const ctx = makeCtx({
      commits: [makeBlogCommit()],
      recentPRs: [
        makePR('ojfbot', 88, 'core', {
          state: 'open',
          createdAt: '2026-05-01T12:00:00Z',
          updatedAt: '2026-05-10T12:00:00Z',
          mergedAt: undefined,
          headCommitAt: '2026-05-10T11:30:00Z',
        }),
      ],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs when an automation creates an issue', () => {
    const ctx = makeCtx({ commits: [makeBlogCommit()], openIssues: [makeIssue()] })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs when an issue closes', () => {
    const ctx = makeCtx({
      commits: [makeBlogCommit()],
      closedIssues: [
        makeIssue({
          state: 'closed',
          createdAt: '2026-05-01T12:00:00Z',
          closedAt: '2026-05-10T12:00:00Z',
        }),
      ],
    })
    expect(shouldSkipRun(ctx).skip).toBe(false)
  })

  it('runs for a newly created dependabot PR', () => {
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
