import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BlogContext, CommitInfo, IssueInfo, OpenPRInfo, PRInfo, PRSkillUsage, RecentPRInfo } from './types.js'
import { collectTelemetry } from './collect-telemetry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const ARTICLES_DIR = join(REPO_ROOT, '_articles')

// All ojfbot repos swept on every run, ordered by activity weight.
// To add a repo: append its name here. Run `gh repo list ojfbot` to audit.
const REPOS = [
  'shell',            // Frame OS — Vite Module Federation host + frame-agent LLM gateway + K8s
  'cv-builder',
  'BlogEngine',
  'TripPlanner',
  'core',           // core (formerly node-template) — slash commands + TypeScript engine
  'core-reader',    // CoreReader — metadata dashboard for core commands, ADRs, roadmap
  'MrPlug',
  'purefoy',
  'daily-logger',     // this repo — captures logger's own commits and improvements
  'lean-canvas',      // Lean Canvas — Frame OS sub-app, AI-assisted business model design
  'seh-study',        // SEH Study — NASA SE Handbook study client, Frame OS sub-app
  'GroupThink',       // GroupThink — LLM-powered tab grouping Chrome extension
  'landing',           // jim.software — personal landing page
  'gcgcca',            // GCGCCA — USGS Earth Explorer orthoimagery query tool, Python+TS hybrid (purefoy pattern)
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

function getOpenIssues(org: string, repo: string, since24h: string): IssueInfo[] {
  type GHIssue = {
    number: number
    title: string
    labels: Array<{ name: string }>
    created_at: string
    updated_at: string
    html_url: string
    pull_request?: unknown
    body: string | null
  }
  // Sort by updated so both newly created AND recently commented/labelled issues
  // appear first. Fetch 30 so active issues aren't pushed off by the cap.
  const data = ghApi<GHIssue[]>(
    `repos/${org}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=30`
  )
  if (!data) return []
  return data
    .filter((i) => !i.pull_request)
    .map((i) => {
      // Active = created OR updated in the last 24h (catches both new issues
      // and existing issues that received comments, labels, or edits today).
      const isNew = i.created_at >= since24h || i.updated_at >= since24h
      return {
        number: i.number,
        title: i.title,
        state: 'open' as const,
        labels: i.labels.map((l) => l.name),
        createdAt: i.created_at,
        url: i.html_url,
        repo,
        // Active issues get full body up to 800 chars — stale ones stay at 200.
        body: i.body ? i.body.slice(0, isNew ? 800 : 200) : undefined,
        isNew,
      }
    })
    // Active issues first so they're never bumped off by the global cap
    .sort((a, b) => (a.isNew === b.isNew ? 0 : a.isNew ? -1 : 1))
}

function getOpenPRs(org: string, repo: string): OpenPRInfo[] {
  type GHPR = {
    number: number
    title: string
    html_url: string
    body: string | null
    created_at: string
    draft: boolean
  }
  const data = ghApi<GHPR[]>(
    `repos/${org}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=15`
  )
  if (!data) return []
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    repo,
    url: pr.html_url,
    body: pr.body ? pr.body.slice(0, 300) : undefined,
    createdAt: pr.created_at,
    draft: pr.draft,
  }))
}

function getRecentPRs(org: string, repo: string, since24h: string): RecentPRInfo[] {
  type GHPR = {
    number: number
    title: string
    html_url: string
    body: string | null
    state: string
    created_at: string
    updated_at: string
    merged_at: string | null
    draft: boolean
  }
  // Fetch all PRs (open + closed) sorted by most recently updated
  const data = ghApi<GHPR[]>(
    `repos/${org}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`
  )
  if (!data) return []
  return data
    .filter((pr) => pr.created_at >= since24h || pr.updated_at >= since24h || (pr.merged_at && pr.merged_at >= since24h))
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      repo,
      url: pr.html_url,
      body: pr.body ? pr.body.slice(0, 400) : undefined,
      state: (pr.state === 'open' ? 'open' : 'closed') as 'open' | 'closed',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at ?? undefined,
      draft: pr.draft,
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
        // Strip YAML frontmatter (--- ... ---) before slicing so the excerpt
        // contains actual article prose, not just title/date/tags metadata.
        // A raw slice(0, 500) on a typical article wastes ~150 chars on frontmatter.
        const fmEnd = content.indexOf('\n---\n', 3)
        const body = fmEnd > -1 ? content.slice(fmEnd + 5).trim() : content
        return { date: f.replace('.md', ''), excerpt: body.slice(0, 600) }
      })
  } catch {
    return []
  }
}

// ─── Open actions from previous articles ─────────────────────────────────────

interface RawAction {
  command: string
  description: string
  repo: string
  status: 'open' | 'done'
  sourceDate: string
}

function getOpenActions(): RawAction[] {
  const actionsPath = join(REPO_ROOT, 'api/actions.json')
  const donePath = join(REPO_ROOT, 'api/done-actions.json')
  if (!existsSync(actionsPath)) return []
  try {
    const all: RawAction[] = JSON.parse(readFileSync(actionsPath, 'utf-8'))
    const done: RawAction[] = existsSync(donePath)
      ? JSON.parse(readFileSync(donePath, 'utf-8'))
      : []
    const doneKeys = new Set(
      done.map((d) => `${d.command}|${d.sourceDate}|${d.description.slice(0, 50)}`),
    )
    return all.filter(
      (a) =>
        a.status === 'open' &&
        !doneKeys.has(`${a.command}|${a.sourceDate}|${a.description.slice(0, 50)}`),
    )
  } catch {
    return []
  }
}

// ─── PR skill comment scraping ──────────────────────────────────────────���────

const SKILL_COMMENT_MARKER = '<!-- skill-usage-report -->'
const SKILL_UPDATE_MARKER = '<!-- skill-usage-update'

function getSkillUsageFromPRComments(org: string, repo: string, prNumber: number): PRSkillUsage | undefined {
  type GHComment = { body: string }
  const comments = ghApi<GHComment[]>(`repos/${org}/${repo}/issues/${prNumber}/comments`)
  if (!comments) return undefined

  const skillComments = comments.filter(
    (c) => c.body.includes(SKILL_COMMENT_MARKER) || c.body.includes(SKILL_UPDATE_MARKER)
  )
  if (skillComments.length === 0) return undefined

  // Parse skill names from all skill usage comments
  const skills = new Set<string>()
  const qualityGates = new Set<string>()
  let suggestionsGiven = 0
  let suggestionsFollowed = 0

  for (const comment of skillComments) {
    // Extract skills from lines like: - `/validate` (2x)
    const skillMatches = comment.body.matchAll(/`\/([a-z-]+)`/g)
    for (const m of skillMatches) {
      skills.add(m[1])
    }

    // Extract quality gate status from lines like: `/validate` ran
    const gateRan = comment.body.matchAll(/`\/([a-z-]+)` ran/g)
    for (const m of gateRan) {
      qualityGates.add(m[1])
    }

    // Extract suggestion funnel from: N offered, M followed
    const funnelMatch = comment.body.match(/(\d+) offered, (\d+) followed/)
    if (funnelMatch) {
      suggestionsGiven += parseInt(funnelMatch[1], 10)
      suggestionsFollowed += parseInt(funnelMatch[2], 10)
    }
  }

  return {
    skills: [...skills],
    qualityGates: [...qualityGates],
    suggestionsGiven,
    suggestionsFollowed,
    commentCount: skillComments.length,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function collectContext(date: string): Promise<BlogContext> {
  const org = process.env.OJFBOT_ORG ?? 'ojfbot'

  // Anchor sweep windows to the article date at 09:00 UTC (cron fire time)
  // rather than Date.now(). This gives stable, predictable windows for both
  // cron runs and DATE_OVERRIDE re-generations, and makes tests deterministic
  // (fixture dates don't expire as calendar time advances).
  const anchor = new Date(`${date}T09:00:00Z`).getTime()
  const since24h = new Date(anchor - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(anchor - 7 * 24 * 60 * 60 * 1000).toISOString()

  const allCommits: CommitInfo[] = []
  const allPRs: PRInfo[] = []
  const allOpenPRs: OpenPRInfo[] = []
  const allRecentPRs: RecentPRInfo[] = []
  const allClosed: IssueInfo[] = []
  const allOpen: IssueInfo[] = []

  for (const repo of REPOS) {
    console.log(`  ${repo}...`)
    allCommits.push(...getCommits(org, repo, since24h))
    allPRs.push(...getMergedPRs(org, repo, since7d))
    allOpenPRs.push(...getOpenPRs(org, repo))
    const recentPRs = getRecentPRs(org, repo, since24h)
    // Scrape skill usage comments from recent PRs
    for (const pr of recentPRs) {
      pr.skillUsage = getSkillUsageFromPRComments(org, repo, pr.number)
    }
    allRecentPRs.push(...recentPRs)
    allClosed.push(...getClosedIssues(org, repo, since7d))
    allOpen.push(...getOpenIssues(org, repo, since24h))
  }

  // Deduplicate by URL (org-level pagination can surface duplicates)
  const dedup = <T extends { url: string }>(arr: T[]): T[] =>
    [...new Map(arr.map((x) => [x.url, x])).values()]

  // Global sort: isNew issues first across ALL repos, then by createdAt desc.
  // Without this, new issues from repos late in the REPOS array could be
  // pushed past the cap by stale issues from earlier repos.
  const sortedOpen = dedup(allOpen)
    .sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })
    .slice(0, 40)

  const openActions = getOpenActions()

  // ── Claude Code telemetry (optional) ──────────────────────────────────────
  const telemetry = collectTelemetry(since24h)
  if (telemetry) {
    console.log(
      `  → telemetry: ${telemetry.totalToolCalls} tool calls · ` +
        `${telemetry.skillsInvoked.length} skills · ${telemetry.totalSessions} sessions`
    )
  }

  const ctx: BlogContext = {
    date,
    repos: REPOS,
    commits: dedup(allCommits).sort((a, b) => b.date.localeCompare(a.date)),
    mergedPRs: dedup(allPRs).sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)),
    openPRs: dedup(allOpenPRs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    recentPRs: dedup(allRecentPRs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    closedIssues: dedup(allClosed),
    openIssues: sortedOpen,
    openActions,
    projectVision: getProjectVision(),
    previousArticles: getPreviousArticles(),
    telemetry,
  }

  console.log(
    `  → ${ctx.commits.length} commits · ${ctx.mergedPRs.length} merged PRs · ` +
      `${ctx.openPRs.length} open PRs · ${ctx.recentPRs.length} recent PRs (24h) · ` +
      `${ctx.closedIssues.length} closed issues · ${ctx.openIssues.length} open issues`
  )
  return ctx
}
