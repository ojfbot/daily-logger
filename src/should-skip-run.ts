import type { BlogContext, CommitInfo, RecentPRInfo } from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const SELF_GENERATED_BLOG_COMMIT = /^blog: \d{4}-\d{2}-\d{2} \[skip ci\]$/

interface ActivityWindow {
  start: number
  end: number
}

function activityWindow(date: string): ActivityWindow {
  const end = new Date(`${date}T09:00:00Z`).getTime()
  return { start: end - DAY_MS, end }
}

function occurredInWindow(timestamp: string | undefined, window: ActivityWindow): boolean {
  if (!timestamp) return false
  const time = Date.parse(timestamp)
  return Number.isFinite(time) && time >= window.start && time < window.end
}

function isSelfGeneratedBlogCommit(commit: CommitInfo): boolean {
  return commit.repo === 'daily-logger' && SELF_GENERATED_BLOG_COMMIT.test(commit.message)
}

function pullRequestChanged(pr: RecentPRInfo, window: ActivityWindow): boolean {
  return (
    occurredInWindow(pr.createdAt, window) ||
    occurredInWindow(pr.headCommitAt, window) ||
    occurredInWindow(pr.mergedAt, window) ||
    occurredInWindow(pr.closedAt, window)
  )
}

export interface SkipDecision {
  skip: boolean
  reason: string
}

export function shouldSkipRun(ctx: BlogContext): SkipDecision {
  const window = activityWindow(ctx.date)
  const meaningfulCommits = ctx.commits.filter(
    (commit) => occurredInWindow(commit.date, window) && !isSelfGeneratedBlogCommit(commit),
  )
  const changedPullRequests = ctx.recentPRs.filter((pr) => pullRequestChanged(pr, window))
  const createdIssues = ctx.openIssues.filter((issue) => occurredInWindow(issue.createdAt, window))
  const closedIssues = ctx.closedIssues.filter((issue) => occurredInWindow(issue.closedAt, window))

  if (
    meaningfulCommits.length > 0 ||
    changedPullRequests.length > 0 ||
    createdIssues.length > 0 ||
    closedIssues.length > 0
  ) {
    return { skip: false, reason: '' }
  }

  const observedItems = ctx.commits.length + ctx.recentPRs.length
  if (observedItems === 0) {
    return { skip: true, reason: 'no activity in 24h window' }
  }

  return {
    skip: true,
    reason:
      `no meaningful activity in 24h window ` +
      `(${ctx.commits.length} generated commit(s), ${ctx.recentPRs.length} metadata-only PR update(s))`,
  }
}
