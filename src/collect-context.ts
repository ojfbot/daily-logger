import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BlogContext, CommitInfo, IssueInfo, PRInfo } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const ARTICLES_DIR = join(REPO_ROOT, 'articles')

// All ojfbot repos swept on every run, ordered by activity weight
const REPOS = [
  'cv-builder',
  'BlogEngine',
  'TripPlanner',
  'node-template',
  'MrPlug',
  'purefoy',
]

// ─── GitHub API helper ────────────────────────────────────────────────────────

function ghApi<T>(endpoint: string): T | null {
  try {
    const raw = execSync(`gh api "${endpoint}" --paginate 2>/dev/null`, {
      encoding: 'utf-8',
      env: { ...process.env },
      timeout: 30_000,
    })
    return JSON.parse(raw) as T
  } catch {
    console.warn(`  ⚠ gh api ${endpoint} — skipped`)
    return null
  }
}

// ─── Per-repo collectors ──────────────────────────────────────────────────────

function getCommits(org: string, repo: string, since: string): CommitInfo[] {
  type GHCommit = {
    sha: string
    commit: { message: string; author: { name: string; date: string } }
    html_url: string
  }
  const data = ghApi<GHCommit[]>(
    `repos/${org}/${repo}/commits?since=${encodeURIComponent(since)}&per_page=100`
  )
  if (!data) return []
  return data.map((c) => ({
    hash: c.sha.slice(0, 7),
    // First line only; strip Claude co-author trailers
    message: c.commit.message
      .split('\n')[0]
      .replace(/\s*Co-Authored-By:.*/i, '')
      .trim(),
    author: c.commit.author.name,
    date: c.commit.author.date,
    repo,
    url: c.html_url,
  }))
}

function getMergedPRs(org: string, repo: string, since: string): PRInfo[] {
  type GHPR = {
    number: number
    title: string
    merged_at: string | null
    additions: number
    deletions: number
    html_url: string
    body: string | null
  }
  const data = ghApi<GHPR[]>(
    `repos/${org}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`
  )
  if (!data) return []
  return data
    .filter((pr): pr is GHPR & { merged_at: string } => !!pr.merged_at && pr.merged_at >= since)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      mergedAt: pr.merged_at,
      additions: pr.additions,
      deletions: pr.deletions,
      url: pr.html_url,
      repo,
      body: pr.body ? pr.body.slice(0, 400) : undefined,
    }))
}

function getClosedIssues(org: string, repo: string, since: string): IssueInfo[] {
  type GHIssue = {
    number: number
    title: string
    labels: Array<{ name: string }>
    closed_at: string | null
    html_url: string
    pull_request?: unknown
    body: string | null
  }
  const data = ghApi<GHIssue[]>(
    `repos/${org}/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=30`
  )
  if (!data) return []
  return data
    .filter((i) => !i.pull_request && !!i.closed_at && i.closed_at >= since)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: 'closed' as const,
      labels: i.labels.map((l) => l.name),
      closedAt: i.closed_at!,
      url: i.html_url,
      repo,
      body: i.body ? i.body.slice(0, 300) : undefined,
    }))
}

function getOpenIssues(org: string, repo: string): IssueInfo[] {
  type GHIssue = {
    number: number
    title: string
    labels: Array<{ name: string }>
    html_url: string
    pull_request?: unknown
    body: string | null
  }
  const data = ghApi<GHIssue[]>(
    `repos/${org}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=15`
  )
  if (!data) return []
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: 'open' as const,
      labels: i.labels.map((l) => l.name),
      url: i.html_url,
      repo,
      body: i.body ? i.body.slice(0, 200) : undefined,
    }))
}

// ─── Local context ────────────────────────────────────────────────────────────

function getProjectVision(): string {
  // Check for a hand-authored ROADMAP.md in this repo first
  const roadmapPath = join(REPO_ROOT, 'ROADMAP.md')
  if (existsSync(roadmapPath)) {
    return readFileSync(roadmapPath, 'utf-8').slice(0, 2500)
  }
  // Fall back to the vision block embedded in CLAUDE.md
  const claudePath = join(REPO_ROOT, 'CLAUDE.md')
  if (existsSync(claudePath)) {
    return readFileSync(claudePath, 'utf-8').slice(0, 2500)
  }
  return ''
}

function getPreviousArticles(): Array<{ date: string; excerpt: string }> {
  if (!existsSync(ARTICLES_DIR)) return []
  try {
    return readdirSync(ARTICLES_DIR)
      .filter((f) => f.endsWith('.md') && f !== '.gitkeep')
      .sort()
      .reverse()
      .slice(0, 5)
      .map((f) => {
        const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
        return { date: f.replace('.md', ''), excerpt: content.slice(0, 800) }
      })
  } catch {
    return []
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function collectContext(date: string): Promise<BlogContext> {
  const org = process.env.OJFBOT_ORG ?? 'ojfbot'

  // Commits: last 24 h.  PRs + issues: last 7 days so we capture things that
  // closed slightly before the cron fired without repeating across articles.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const allCommits: CommitInfo[] = []
  const allPRs: PRInfo[] = []
  const allClosed: IssueInfo[] = []
  const allOpen: IssueInfo[] = []

  for (const repo of REPOS) {
    console.log(`  ${repo}...`)
    allCommits.push(...getCommits(org, repo, since24h))
    allPRs.push(...getMergedPRs(org, repo, since7d))
    allClosed.push(...getClosedIssues(org, repo, since7d))
    allOpen.push(...getOpenIssues(org, repo))
  }

  // Deduplicate by URL (org-level pagination can surface duplicates)
  const dedup = <T extends { url: string }>(arr: T[]): T[] =>
    [...new Map(arr.map((x) => [x.url, x])).values()]

  const ctx: BlogContext = {
    date,
    repos: REPOS,
    commits: dedup(allCommits).sort((a, b) => b.date.localeCompare(a.date)),
    mergedPRs: dedup(allPRs).sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)),
    closedIssues: dedup(allClosed),
    openIssues: dedup(allOpen).slice(0, 25),
    projectVision: getProjectVision(),
    previousArticles: getPreviousArticles(),
  }

  console.log(
    `  → ${ctx.commits.length} commits · ${ctx.mergedPRs.length} PRs · ` +
      `${ctx.closedIssues.length} closed issues · ${ctx.openIssues.length} open issues`
  )
  return ctx
}
