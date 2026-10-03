import type { BlogContext, CommitInfo, RecentPRInfo } from './types.js'
import { activityWindow } from './activity-window.js'

const SELF_GENERATED_BLOG_COMMIT = /^blog: \d{4}-\d{2}-\d{2} \[skip ci\]$/
type ActivityWindow = ReturnType<typeof activityWindow>

function occurredInWindow(timestamp: string | undefined, window: ActivityWindow): boolean {
  if (!timestamp) return false
  const time = Date.parse(timestamp)
  return Number.isFinite(time) && time >= window.start && time < window.end
}

function isSelfGeneratedBlogCommit(commit: CommitInfo): boolean {
  return commit.repo === 'daily-logger' && SELF_GENERATED_BLOG_COMMIT.test(commit.message)
}

function generatedPRKind(pr: RecentPRInfo): 'article' | 'clean' | null {
  if (pr.headRef) {
    if (pr.repo === 'daily-logger' && /^article\/\d{4}-\d{2}-\d{2}$/.test(pr.headRef)) return 'article'
    if (/^clean\/\d{4}-\d{2}-\d{2}$/.test(pr.headRef)) return 'clean'
    return null
  }
  if (pr.repo === 'daily-logger' && /^blog: \d{4}-\d{2}-\d{2}$/.test(pr.title)) return 'article'
  if (/^clean: .*\d{4}-\d{2}-\d{2}$/.test(pr.title)) return 'clean'
  return null
}

function pullRequestChanges(pr: RecentPRInfo, window: ActivityWindow): string[] {
  const kind = generatedPRKind(pr)
  if (kind === 'article') return []

  const changes: string[] = []
  if (kind !== 'clean' && occurredInWindow(pr.createdAt, window)) changes.push('created')
  if (kind !== 'clean' && occurredInWindow(pr.headCommitAt, window)) changes.push('head commit')
  if (occurredInWindow(pr.mergedAt, window)) changes.push('merged')
  if (kind !== 'clean' && !pr.mergedAt && occurredInWindow(pr.closedAt, window)) changes.push('closed')
  return changes
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
  const triggers = meaningfulCommits.map((commit) => `${commit.repo}@${commit.hash} commit`)
  for (const pr of ctx.recentPRs) {
    for (const change of pullRequestChanges(pr, window)) {
      triggers.push(`${pr.repo}#${pr.number} PR ${change}`)
    }
  }
  for (const issue of ctx.openIssues) {
    if (occurredInWindow(issue.createdAt, window)) triggers.push(`${issue.repo}#${issue.number} issue created`)
  }
  for (const issue of ctx.closedIssues) {
    if (occurredInWindow(issue.closedAt, window)) triggers.push(`${issue.repo}#${issue.number} issue closed`)
  }

  if (triggers.length > 0) return { skip: false, reason: triggers.join(', ') }

  const observedItems = ctx.commits.length + ctx.recentPRs.length
  if (observedItems === 0) {
    return { skip: true, reason: 'no activity in 24h window' }
  }

  return {
    skip: true,
    reason:
      `no meaningful activity in 24h window ` +
      `(${ctx.commits.length} commit(s), ${ctx.recentPRs.length} PR(s) observed)`,
  }
}
