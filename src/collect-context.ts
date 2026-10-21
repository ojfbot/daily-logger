import { createHash } from 'node:crypto'
import { execSync } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { AcceptedClosingContinuity, ADRRegistryEntry, BlogContext, CommitInfo, IssueInfo, OpenPRInfo, PRInfo, PRSkillUsage, PreviousArticleContext, RecentPRInfo } from './types.js'
import { collectTelemetry } from './collect-telemetry.js'
import { discoverRepos, reportSurfaceDrift } from './fleet.js'
import { SYSTEM_PROMPT } from './generate-article.js'
import { activityWindow, occurredInWindow, type ActivityWindow } from './activity-window.js'
import { boundedMergedPRBody, RECENT_PR_PREVIEW_CHARS } from './pr-body.js'
import { type CanonicalAction } from './action-model.js'
import { managedArticleDigest, readRegistryProjection } from './action-registry.js'
import { ACTION_FILE_LIMIT, ArticleActionFileSchema, type ArticleActionSnapshot } from './action-registry-schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')

// The swept repo set is DERIVED at run time (src/fleet.ts discoverRepos) —
// every non-archived, non-fork org repo minus EXCLUDED_REPOS. Hand-listing
// repos here is what let four founded repos go dark (2026-08-21 → 09-24).
// To add a repo's description for the drafter, edit REPO_NOTES in fleet.ts.

// ─── GitHub API helper ────────────────────────────────────────────────────────

// A single page only. `--paginate` used to walk EVERY page of the closed-PR /
// all-PR / closed-issue lists (core: 357 PRs ≈ 5.9 MB), overflowing execSync's
// default 1 MB maxBuffer and silently "skipping" the four busiest repos on
// every run — merged PRs, recent PRs and closed issues from shell, cv-builder,
// core and daily-logger never reached the article or the cleaner. The per_page
// values are "top N by updated" caps and are meant to be the whole answer.
const GH_MAX_BUFFER = 16 * 1024 * 1024

function ghApi<T>(endpoint: string): T | null {
  try {
    const raw = execSync(`gh api "${endpoint}" 2>/dev/null`, {
      encoding: 'utf-8',
      env: { ...process.env },
      timeout: 30_000,
      maxBuffer: GH_MAX_BUFFER,
    })
    return JSON.parse(raw) as T
  } catch {
    console.warn(`  ⚠ gh api ${endpoint} — skipped`)
    return null
  }
}

// ─── Per-repo collectors ──────────────────────────────────────────────────────

/**
 * Cross-repo ADR registry. Returns every `decisions/adr/NNNN-*.md` file in
 * `repo`'s default branch with parsed number, filename, and (best-effort)
 * title + status. Single API call per repo. Used by the drafter to verify
 * ADR existence claims; without this signal the drafter has hallucinated
 * ADRs (asset-foundry ADR-0011 on 2026-05-05) and missed ADRs that
 * landed late in the day (core ADR-0067 on the same article).
 */
function getADRRegistry(org: string, repo: string): ADRRegistryEntry[] {
  type GHContent = {
    name: string
    path: string
    type: 'file' | 'dir' | string
    /** Set when type=file; base64-encoded body. Not requested by listing call. */
    download_url: string | null
  }
  const listing = ghApi<GHContent[]>(
    `repos/${org}/${repo}/contents/decisions/adr`
  )
  if (!Array.isArray(listing)) return []

  const adrPattern = /^(\d{3,4})-[a-z0-9-]+\.md$/i
  const entries: ADRRegistryEntry[] = []
  for (const item of listing) {
    if (item.type !== 'file') continue
    const m = item.name.match(adrPattern)
    if (!m) continue
    entries.push({
      repo,
      path: item.path,
      number: parseInt(m[1], 10),
      name: item.name,
    })
  }

  // Best-effort title/status enrichment — fetch each ADR's first 30 lines
  // and parse. Capped at 5 enrichments per repo to bound API cost; the
  // important signal (existence) comes from the listing alone.
  const ENRICH_CAP = 5
  const recentByNumber = entries.slice().sort((a, b) => b.number - a.number)
  for (const e of recentByNumber.slice(0, ENRICH_CAP)) {
    type GHFile = { content?: string; encoding?: string }
    const file = ghApi<GHFile>(`repos/${org}/${repo}/contents/${e.path}`)
    if (!file?.content) continue
    let body: string
    try {
      body = Buffer.from(file.content, (file.encoding ?? 'base64') as BufferEncoding).toString('utf-8')
    } catch {
      continue
    }
    const head = body.split('\n').slice(0, 40).join('\n')
    const titleMatch = head.match(/^#\s+(.+)$/m)
    if (titleMatch) e.title = titleMatch[1].trim()
    const statusMatch = head.match(/^(?:status|\*\*Status\*\*):\s*([A-Za-z][\w\s-]+)/im)
    if (statusMatch) e.status = statusMatch[1].trim()
  }

  return entries
}

// ─── Commit-trailer parsing (S21 trace identity — SHADOW) ────────────────────
//
// The Claude Code harness appends `Claude-Session: <url>` and `Co-Authored-By:`
// trailers to every commit it makes; until now nothing parsed them. Extracting
// them here lets an article join commits → sessions. Shadow discipline: the
// fields are optional, absent trailers are a no-op, and downstream prose
// generation may ignore them for now.

export function parseCommitTrailers(message: string): Pick<CommitInfo, 'sessionUrl' | 'coAuthors'> {
  // Fresh regexes per call — module-level /g regexes carry lastIndex state.
  const sessionMatch = message.match(/^Claude-Session:\s*(\S+)\s*$/im)
  const coAuthors = [...message.matchAll(/^Co-Authored-By:\s*(.+?)\s*$/gim)].map((m) => m[1])
  return {
    ...(sessionMatch ? { sessionUrl: sessionMatch[1] } : {}),
    ...(coAuthors.length > 0 ? { coAuthors } : {}),
  }
}

function getCommits(org: string, repo: string, window: ActivityWindow): CommitInfo[] {
  type GHCommit = {
    sha: string
    commit: { message: string; author: { name: string; date: string }; committer?: { date: string } }
    html_url: string
  }
  const data = ghApi<GHCommit[]>(
    `repos/${org}/${repo}/commits?since=${encodeURIComponent(new Date(window.start).toISOString())}&until=${encodeURIComponent(new Date(window.end).toISOString())}&per_page=100`
  )
  if (!data) return []
  return data.filter((c) => occurredInWindow(c.commit.author.date, window)).map((c) => ({
    hash: c.sha.slice(0, 7),
    fullHash: c.sha,
    authoredAt: c.commit.author.date,
    committedAt: c.commit.committer?.date,
    // First line only; strip Claude co-author trailers
    message: c.commit.message
      .split('\n')[0]
      .replace(/\s*Co-Authored-By:.*/i, '')
      .trim(),
    author: c.commit.author.name,
    date: c.commit.author.date,
    repo,
    url: c.html_url,
    // Parsed from the FULL message before the first-line strip above (S21, shadow)
    ...parseCommitTrailers(c.commit.message),
  }))
}

function getMergedPRs(org: string, repo: string, window: ActivityWindow): PRInfo[] {
  type GHPR = {
    number: number
    title: string
    merged_at: string | null
    additions: number
    deletions: number
    html_url: string
    body: string | null
    user: { login: string } | null
  }
  const data = ghApi<GHPR[]>(
    `repos/${org}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`
  )
  if (!data) return []
  return data
    .filter((pr): pr is GHPR & { merged_at: string } => pr.merged_at !== null && occurredInWindow(pr.merged_at, window))
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      mergedAt: pr.merged_at,
      additions: pr.additions,
      deletions: pr.deletions,
      url: pr.html_url,
      repo,
      body: pr.body ? boundedMergedPRBody(pr.body) : undefined,
      author: pr.user?.login,
    }))
}

function getClosedIssues(org: string, repo: string, window: ActivityWindow, reportingWindow: ActivityWindow): IssueInfo[] {
  type GHIssue = {
    number: number
    title: string
    labels: Array<{ name: string }>
    created_at: string
    updated_at: string
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
    .filter((i): i is GHIssue & { closed_at: string } => !i.pull_request && i.closed_at !== null && occurredInWindow(i.closed_at, window))
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: 'closed' as const,
      labels: i.labels.map((l) => l.name),
      createdAt: i.created_at,
      createdInWindow: occurredInWindow(i.created_at, reportingWindow),
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
      url: i.html_url,
      repo,
      body: i.body ? i.body.slice(0, 300) : undefined,
    }))
}

function getOpenIssues(org: string, repo: string, window: ActivityWindow): IssueInfo[] {
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
      // The issue remains current queue context. Only these bounded events
      // qualify it as active in this article's reporting period.
      const isNew = occurredInWindow(i.created_at, window) || occurredInWindow(i.updated_at, window)
      return {
        number: i.number,
        title: i.title,
        state: 'open' as const,
        labels: i.labels.map((l) => l.name),
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        url: i.html_url,
        repo,
        // Active issues get full body up to 800 chars — stale ones stay at 200.
        body: i.body ? i.body.slice(0, isNew ? 800 : 200) : undefined,
        isNew,
        createdInWindow: occurredInWindow(i.created_at, window),
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

function getRecentPRs(org: string, repo: string, window: ActivityWindow): RecentPRInfo[] {
  type GHPullState = { merged?: boolean }
  type GHCommit = {
    commit?: {
      author?: { date?: string } | null
      committer?: { date?: string } | null
    }
  }
  type GHPR = {
    number: number
    title: string
    html_url: string
    body: string | null
    state: string
    created_at: string
    updated_at: string
    closed_at: string | null
    merged_at: string | null
    draft: boolean
    user: { login: string } | null
    head: { sha: string; ref: string }
  }
  // Fetch all PRs (open + closed) sorted by most recently updated
  const data = ghApi<GHPR[]>(
    `repos/${org}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`
  )
  if (!data) return []
  return data
    .filter((pr) => [pr.created_at, pr.updated_at, pr.closed_at, pr.merged_at].some((timestamp) => occurredInWindow(timestamp, window)))
    .map((pr) => {
      const lifecycleChanged =
        occurredInWindow(pr.created_at, window) ||
        occurredInWindow(pr.closed_at, window) ||
        occurredInWindow(pr.merged_at, window)
      let headCommitAt: string | undefined
      const currentState = pr.state === 'closed' && pr.merged_at === null
        ? ghApi<GHPullState>(`repos/${org}/${repo}/pulls/${pr.number}`)?.merged
        : undefined
      const merged = pr.merged_at !== null
        ? true
        : pr.state === 'open'
          ? false
          : currentState === true || currentState === false ? currentState : undefined

      // GitHub advances updated_at for comments, labels, reviews, checks, and
      // pushes. The head commit date is an approximation of push time for an
      // old PR; the lookup costs one extra API call per recently touched PR.
      if (!lifecycleChanged) {
        const headCommit = ghApi<GHCommit>(`repos/${org}/${repo}/commits/${pr.head.sha}`)
        headCommitAt = headCommit?.commit?.committer?.date ?? headCommit?.commit?.author?.date
        if (!headCommitAt) {
          console.warn(`::warning::Could not classify head commit for ${repo}#${pr.number} (${pr.head.sha}); treating this PR update as metadata-only.`)
        }
      }

      return {
        number: pr.number,
        title: pr.title,
        repo,
        url: pr.html_url,
        body: pr.body ? (pr.merged_at ? boundedMergedPRBody(pr.body) : pr.body.slice(0, RECENT_PR_PREVIEW_CHARS)) : undefined,
        state: (pr.state === 'open' ? 'open' : 'closed') as 'open' | 'closed',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at ?? undefined,
        mergedAt: pr.merged_at ?? undefined,
        merged,
        headRef: pr.head.ref,
        headCommitAt,
        draft: pr.draft,
        author: pr.user?.login,
      }
    })
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

const CLOSING_CONTINUITY_VERSION = 'accepted-closing-continuity-v1' as const
export const CLOSING_CONTINUITY_MAX_BYTES = 8 * 1024

function articleBlobSha(content: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex')
}

export function acceptedClosingContinuity(input: { date: string; content: string; snapshot?: ArticleActionSnapshot | null }): AcceptedClosingContinuity {
  const closing = input.snapshot?.closing
  const optionCount = closing?.kind === 'options' || closing?.kind === 'shortlist' ? closing.options.length : 0
  const unavailable = (reason: Extract<AcceptedClosingContinuity, { status: 'unavailable' }>['reason']): AcceptedClosingContinuity => ({
    status: 'unavailable', version: CLOSING_CONTINUITY_VERSION, reason, optionCount, omittedOptionCount: optionCount,
  })
  const articleStatus = input.content.match(/^status:\s*"?(\w+)/m)?.[1]
  if (input.snapshot === null) return unavailable('invalid-snapshot')
  const snapshot = input.snapshot
  if (optionCount > 5) return unavailable('invalid-snapshot')
  if (!snapshot || articleStatus !== 'accepted' || snapshot.status !== 'accepted' || snapshot.review.state !== 'verified' || (snapshot.closing?.kind !== 'options' && snapshot.closing?.kind !== 'shortlist')) return unavailable('missing-accepted-closing')
  if (snapshot.date !== input.date || snapshot.articleDigest !== managedArticleDigest(input.content)) return unavailable('binding-mismatch')
  const options = snapshot.closing.options.map((option, index) => {
    const review = snapshot.verification.verdicts.find(verdict => verdict.item === `closing:${index}`)
    if (!review) return null
    const evidencePointers = [...new Set([...option.factCitations, ...option.goalCitations].map(citation => citation.sourceId.replace(/@[a-f0-9]{64}$/, '')))].sort()
    const fields = { title: option.title, ...('benefit' in option ? { benefit: option.benefit, start: option.start } : {}), entryPoint: option.entryPoint, context: option.context, whyNow: 'rationale' in option ? option.rationale : option.whyNow, outcome: option.outcome, nextCheck: option.nextCheck, evidencePointers,
      review: { verdict: review.verdict, reason: review.reason } }
    return option.kind === 'action' ? { kind: option.kind, actionKey: option.actionKey, ...fields } : { kind: option.kind, target: option.target, ...fields }
  })
  if (options.some(option => option === null)) return unavailable('invalid-snapshot')
  const projection: AcceptedClosingContinuity = {
    status: 'available',
    version: CLOSING_CONTINUITY_VERSION,
    source: { articleBlobSha: articleBlobSha(input.content), articleDigest: snapshot.articleDigest, roundId: snapshot.roundId, promptVersion: snapshot.verification.promptVersion },
    optionCount,
    omittedOptionCount: 0,
    options: options.filter(option => option !== null),
  }
  return Buffer.byteLength(JSON.stringify(projection), 'utf8') <= CLOSING_CONTINUITY_MAX_BYTES ? projection : unavailable('oversize')
}

export function getPreviousArticles(repoRoot = REPO_ROOT, beforeDate?: string): PreviousArticleContext[] {
  const articlesDirectory = join(repoRoot, '_articles')
  if (!existsSync(articlesDirectory)) return []
  try {
    return readdirSync(articlesDirectory)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && (!beforeDate || f.slice(0, 10) < beforeDate))
      .sort()
      .reverse()
      .slice(0, 5)
      .map((f) => {
        const content = readFileSync(join(articlesDirectory, f), 'utf-8')
        const articleDate = f.replace('.md', '')
        // Strip YAML frontmatter (--- ... ---) before slicing so the excerpt
        // contains actual article prose, not just title/date/tags metadata.
        // A raw slice(0, 500) on a typical article wastes ~150 chars on frontmatter.
        const fmEnd = content.indexOf('\n---\n', 3)
        const body = fmEnd > -1 ? content.slice(fmEnd + 5).trim() : content
        const snapshotPath = join(repoRoot, 'actions/articles', `${articleDate}.json`)
        let snapshot: ArticleActionSnapshot | null | undefined
        if (existsSync(snapshotPath)) {
          try {
            const bytes = readFileSync(snapshotPath, 'utf8')
            const parsed = Buffer.byteLength(bytes) <= ACTION_FILE_LIMIT ? ArticleActionFileSchema.safeParse(JSON.parse(bytes)) : null
            snapshot = parsed?.success ? parsed.data.snapshot : null
          } catch {
            snapshot = null
          }
        }
        return { date: articleDate, excerpt: body.slice(0, 600), closingContinuity: acceptedClosingContinuity({ date: articleDate, content, snapshot }) }
      })
  } catch {
    return []
  }
}

export function acceptedClosingContinuityTargets(previousArticles: readonly PreviousArticleContext[]): string[] {
  const active = previousArticles.find(article => article.closingContinuity?.status === 'available')?.closingContinuity
  return active?.status === 'available'
    ? [...new Set(active.options.flatMap(option => {
      if (option.kind !== 'checkpoint') return []
      const target = new URL(option.target)
      target.hash = ''
      target.search = ''
      target.pathname = target.pathname.replace(/\/$/, '')
      return [target.toString()]
    }))]
    : []
}

// ─── Open actions from previous articles ─────────────────────────────────────

function getOpenActions(): CanonicalAction[] {
  return readRegistryProjection(REPO_ROOT).open
}

// ─── PR skill comment scraping ──────────────────────────────────────────���────

const SKILL_COMMENT_MARKER = '<!-- skill-usage-report -->'
const SKILL_UPDATE_MARKER = '<!-- skill-usage-update'

function getSkillUsageFromPRComments(org: string, repo: string, prNumber: number, window: ActivityWindow): PRSkillUsage | undefined {
  type GHComment = { body: string; created_at: string; updated_at: string }
  const comments = ghApi<GHComment[]>(`repos/${org}/${repo}/issues/${prNumber}/comments?per_page=100`)
  if (!comments) return undefined

  const skillComments = comments.filter(
    // A later edit replaces the body. Without comment-version history it
    // cannot establish what a report said during the closed interval.
    (c) => occurredInWindow(c.updated_at, window) && (c.body.includes(SKILL_COMMENT_MARKER) || c.body.includes(SKILL_UPDATE_MARKER))
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
  const window = activityWindow(date)
  if (window.end > Date.now()) throw new Error('Reporting interval has not closed at 03:30 America/Chicago; no collection')
  const week = activityWindow(date, 7)

  // Auth preflight: an expired/invalid token makes every ghApi call fail
  // "skipped", the sweep comes back empty, and shouldSkipRun retires the day
  // as no-activity — green runs, zero articles (2026-05-19 → 2026-06-09 lapse).
  // Abort instead so the workflow run goes red and the failure is visible.
  // rate_limit (not /user) — it authenticates fine-grained PATs AND the
  // Actions installation token, which 403s on /user even when healthy.
  try {
    execSync('gh api rate_limit 2>/dev/null', {
      encoding: 'utf-8',
      env: { ...process.env },
      timeout: 30_000,
    })
  } catch {
    throw new Error(
      'GitHub auth preflight failed: `gh api rate_limit` rejected the token. ' +
        'Check GH_PAT expiry in repo secrets before re-running the sweep.',
    )
  }

  // Calendar cutoffs stay at 03:30 Chicago even across 23/25-hour DST days.
  // Current queue metadata is separate from the bounded event evidence.

  const allCommits: CommitInfo[] = []
  const allPRs: PRInfo[] = []
  const allOpenPRs: OpenPRInfo[] = []
  const allRecentPRs: RecentPRInfo[] = []
  const allClosed: IssueInfo[] = []
  const allOpen: IssueInfo[] = []
  const allADRs: ADRRegistryEntry[] = []

  // Fleet discovery (surface 2 is derived; throws on failure — see fleet.ts).
  const repos = discoverRepos(org)
  console.log(`  → fleet: ${repos.length} repos discovered via gh repo list ${org}`)
  for (const w of reportSurfaceDrift(repos, SYSTEM_PROMPT)) {
    // ::warning:: renders as a GitHub Actions annotation; harmless locally.
    console.warn(`::warning::${w}`)
  }

  for (const repo of repos) {
    console.log(`  ${repo}...`)
    allCommits.push(...getCommits(org, repo, window))
    allPRs.push(...getMergedPRs(org, repo, week))
    allOpenPRs.push(...getOpenPRs(org, repo))
    const recentPRs = getRecentPRs(org, repo, window)
    // Scrape skill usage comments from recent PRs
    for (const pr of recentPRs) {
      pr.skillUsage = getSkillUsageFromPRComments(org, repo, pr.number, window)
    }
    allRecentPRs.push(...recentPRs)
    allClosed.push(...getClosedIssues(org, repo, week, window))
    allOpen.push(...getOpenIssues(org, repo, window))
    allADRs.push(...getADRRegistry(org, repo))
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
  const telemetry = collectTelemetry(window)
  if (telemetry) {
    console.log(
      `  → telemetry: ${telemetry.totalToolCalls} tool calls · ` +
        `${telemetry.skillsInvoked.length} skills · ${telemetry.totalSessions} sessions`
    )
  }

  const ctx: BlogContext = {
    date,
    repos,
    commits: dedup(allCommits).sort((a, b) => b.date.localeCompare(a.date)),
    mergedPRs: dedup(allPRs).sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)),
    openPRs: dedup(allOpenPRs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    recentPRs: dedup(allRecentPRs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    closedIssues: dedup(allClosed),
    openIssues: sortedOpen,
    openActions,
    projectVision: getProjectVision(),
    previousArticles: getPreviousArticles(REPO_ROOT, date),
    telemetry,
    adrRegistry: allADRs.sort((a, b) =>
      a.repo === b.repo ? a.number - b.number : a.repo.localeCompare(b.repo)
    ),
  }

  console.log(
    `  → ${ctx.commits.length} commits · ${ctx.mergedPRs.length} merged PRs · ` +
      `${ctx.openPRs.length} current open PRs · ${ctx.recentPRs.length} reporting-window PR snapshots · ` +
      `${ctx.closedIssues.length} closed issues · ${ctx.openIssues.length} open issues · ` +
      `${(ctx.adrRegistry ?? []).length} ADRs`
  )
  return ctx
}
