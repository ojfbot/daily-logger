import type { BlogContext } from './types.js'

// Bots whose activity should not, on its own, justify generating an article.
// The daily-logger writes its own PRs (ojfbot-blog[bot]) and the cleaner
// writes its own PRs (ojfbot-clean[bot]); generic GH workflow commits land
// as github-actions[bot]. None of these represent human design or product
// signal worth narrating. Dependabot/Renovate are intentionally absent —
// a CVE bump or framework upgrade is worth a paragraph.
const AUTOMATED_AUTHORS: ReadonlySet<string> = new Set([
  'ojfbot-blog[bot]',
  'ojfbot-clean[bot]',
  'github-actions[bot]',
])

function isAutomated(author: string | undefined): boolean {
  return !!author && AUTOMATED_AUTHORS.has(author)
}

export interface SkipDecision {
  skip: boolean
  reason: string
}

export function shouldSkipRun(ctx: BlogContext): SkipDecision {
  const humanCommits = ctx.commits.filter((c) => !isAutomated(c.author))
  const humanPRs = ctx.recentPRs.filter((pr) => !isAutomated(pr.author))

  if (humanCommits.length === 0 && humanPRs.length === 0) {
    const botCommits = ctx.commits.length
    const botPRs = ctx.recentPRs.length
    if (botCommits === 0 && botPRs === 0) {
      return { skip: true, reason: 'no activity in 24h window' }
    }
    return {
      skip: true,
      reason: `only automated activity (${botCommits} bot commit(s), ${botPRs} bot PR(s))`,
    }
  }
  return { skip: false, reason: '' }
}
