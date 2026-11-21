import { activityWindow, occurredInWindow } from './activity-window.js'

/** Only observed fields consumed by the eligibility gate; no collection or payload validation. */
export interface EligibilityCommit {
  readonly hash: string
  readonly message: string
  readonly date: string
  readonly repo: string
}

export interface EligibilityPullRequest {
  readonly repo: string
  readonly number: number
  readonly title: string
  readonly headRef?: string
  readonly createdAt: string
  readonly headCommitAt?: string
  readonly mergedAt?: string
  readonly closedAt?: string
}

export interface EligibilityOpenIssue {
  readonly repo: string
  readonly number: number
  readonly createdAt?: string
}

export interface EligibilityClosedIssue {
  readonly repo: string
  readonly number: number
  readonly closedAt?: string
}

export interface EligibilityContext {
  readonly date: string
  readonly commits: readonly EligibilityCommit[]
  readonly recentPRs: readonly EligibilityPullRequest[]
  readonly openIssues: readonly EligibilityOpenIssue[]
  readonly closedIssues: readonly EligibilityClosedIssue[]
}

const ARTICLE_EDITORIAL_COMMIT = /^(?:blog: \d{4}-\d{2}-\d{2}|editorial: (?:accept \d{4}-\d{2}-\d{2} draft|revise \d{4}-\d{2}-\d{2} per feedback|stamp outcome accepted))(?: \[skip ci\])?(?: \(#\d+\))?$/
const ARTICLE_EDITORIAL_MERGE = /^Merge pull request #\d+ from [^/]+\/(?:article|accept)\/\d{4}-\d{2}-\d{2}$/
type ActivityWindow = ReturnType<typeof activityWindow>

function isArticleEditorialCommit(commit: EligibilityCommit): boolean {
  return commit.repo === 'daily-logger' &&
    (ARTICLE_EDITORIAL_COMMIT.test(commit.message) || ARTICLE_EDITORIAL_MERGE.test(commit.message) || /^editorial: (?:include|exclude) action act-\d{4}-\d{2}-\d{2}-[a-f0-9]{16}(?: \(#\d+\))?$/.test(commit.message))
}

function generatedPRKind(pr: EligibilityPullRequest): 'article' | 'clean' | null {
  if (pr.headRef) {
    if (pr.repo === 'daily-logger' && /^(?:article|accept)\/\d{4}-\d{2}-\d{2}$/.test(pr.headRef)) return 'article'
    if (/^clean\/\d{4}-\d{2}-\d{2}$/.test(pr.headRef)) return 'clean'
    return null
  }
  if (pr.repo === 'daily-logger' &&
    /^(?:blog: \d{4}-\d{2}-\d{2}|editorial: (?:accept \d{4}-\d{2}-\d{2} draft|revise \d{4}-\d{2}-\d{2} per feedback))$/.test(pr.title)) return 'article'
  if (/^clean: .*\d{4}-\d{2}-\d{2}$/.test(pr.title)) return 'clean'
  return null
}

function pullRequestChanges(pr: EligibilityPullRequest, window: ActivityWindow): string[] {
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

export function shouldSkipRun(ctx: EligibilityContext): SkipDecision {
  const window = activityWindow(ctx.date)
  const meaningfulCommits = ctx.commits.filter(
    (commit) => occurredInWindow(commit.date, window) && !isArticleEditorialCommit(commit),
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
    return { skip: true, reason: 'no activity in reporting window' }
  }

  return {
    skip: true,
    reason:
      `no meaningful activity in reporting window ` +
      `(${ctx.commits.length} commit(s), ${ctx.recentPRs.length} PR(s) observed)`,
  }
}
