/**
 * Daily cleaner
 *
 * Three phases:
 *   1. Sweep   — find candidates: TODOs/FIXMEs in changed source files,
 *                plus full doc files (CLAUDE.md, README.md, ROADMAP.md)
 *                from repos with any activity today.
 *   2. Validate — Claude Opus call per candidate. Slow, rigorous, overnight-safe.
 *                For TODOs: did recent commits resolve this? For docs: what sections
 *                are now inaccurate? Returns specific line edits with confidence.
 *   3. PR       — group proposals by repo, clone, apply edits, push branch, open PR.
 *                Each PR contains only high/medium-confidence, Claude-validated edits.
 *
 * Only high/medium confidence proposals become PR content.
 * PRs are opened in the target repos using GH_PAT (needs write access).
 */

import Anthropic from '@anthropic-ai/sdk'
import { execSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type {
  BlogContext,
  CleanCandidate,
  CleanDoneAction,
  CleanEntryData,
  CleanOpenAction,
  CleanProposal,
  StructuredCleanContext,
} from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const API_DIR = join(REPO_ROOT, 'api')

const MODEL = 'claude-opus-4-6'  // rigorous — overnight run, quality over speed

// Doc files swept in every active repo (regardless of whether they changed)
const DOC_FILES = ['CLAUDE.md', 'README.md', 'ROADMAP.md']

// Source file extensions eligible for TODO scanning
const SOURCE_EXT = /\.(ts|tsx|js|jsx|py|yml|yaml)$/

// TODO/FIXME pattern — line must contain one of these tags with ≥10 chars of context
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\s*[:\-]?\s*(.{10,})/i

// ─── Shell helpers ─────────────────────────────────────────────────────────────

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    env: { ...process.env },
    timeout: 60_000,
    cwd,
  })
}

function tryRun(cmd: string, cwd?: string): string | null {
  try {
    return run(cmd, cwd)
  } catch {
    return null
  }
}

function ghApi<T>(endpoint: string): T | null {
  const raw = tryRun(`gh api "${endpoint}" --paginate 2>/dev/null`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ─── Remote file reader ───────────────────────────────────────────────────────

function readRemoteFile(org: string, repo: string, path: string, ref?: string): string | null {
  type GHContent = { content: string; encoding: string }
  const refSuffix = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const data = ghApi<GHContent>(
    `repos/${org}/${repo}/contents/${encodeURIComponent(path)}${refSuffix}`,
  )
  if (!data || data.encoding !== 'base64') return null
  try {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
  } catch {
    return null
  }
}

// Reads today's daily-logger article.
// The article lands in branch article/YYYY-MM-DD (draft PR) before it merges to main.
// Tries the draft branch first, falls back to main.
export function readTodayArticle(org: string, date: string): string {
  const path = `_articles/${date}.md`
  const fromBranch = readRemoteFile(org, 'daily-logger', path, `article/${date}`)
  if (fromBranch) return fromBranch
  const fromMain = readRemoteFile(org, 'daily-logger', path)
  return fromMain ?? ''
}

// ─── Structured context loader ────────────────────────────────────────────────

export function loadStructuredContext(date: string, org: string): StructuredCleanContext {
  const empty: StructuredCleanContext = {
    todaySummary: '',
    recentEntries: [],
    openActions: [],
    doneActions: [],
    rawArticleFallback: '',
  }

  // Read entries.json — last 3 days of article data
  const entriesPath = join(API_DIR, 'entries.json')
  let entries: CleanEntryData[] = []
  if (existsSync(entriesPath)) {
    try {
      const all = JSON.parse(readFileSync(entriesPath, 'utf-8')) as CleanEntryData[]
      entries = all.slice(0, 3) // newest first, take last 3 days
    } catch { /* ignore corrupt file */ }
  }

  // Read open actions
  const actionsPath = join(API_DIR, 'actions.json')
  let openActions: CleanOpenAction[] = []
  if (existsSync(actionsPath)) {
    try {
      openActions = JSON.parse(readFileSync(actionsPath, 'utf-8'))
    } catch { /* ignore */ }
  }

  // Read done actions
  const donePath = join(API_DIR, 'done-actions.json')
  let doneActions: CleanDoneAction[] = []
  if (existsSync(donePath)) {
    try {
      doneActions = JSON.parse(readFileSync(donePath, 'utf-8'))
    } catch { /* ignore */ }
  }

  const todayEntry = entries.find((e) => e.date === date)
  if (!todayEntry && entries.length === 0) {
    // No structured data available — fall back to raw article via GitHub API
    console.log('     Structured API data not available — falling back to raw article')
    return { ...empty, rawArticleFallback: readTodayArticle(org, date) }
  }

  return {
    todaySummary: todayEntry?.summary ?? entries[0]?.summary ?? '',
    recentEntries: entries,
    openActions,
    doneActions,
    rawArticleFallback: '',
  }
}

// ─── Prompt formatting helpers ───────────────────────────────────────────────

function formatDecisions(entries: CleanEntryData[], repo?: string): string {
  const decisions = entries.flatMap((e) =>
    (e.decisions ?? [])
      .filter((d) => !repo || d.repo === repo || e.reposActive?.includes(repo))
      .map((d) => {
        const pillar = d.pillar ? ` — pillar: ${d.pillar}` : ''
        return `- "${d.title}" (${d.repo})${pillar}`
      }),
  )
  return decisions.length > 0 ? decisions.join('\n') : '(none)'
}

function formatActions(
  actions: Array<CleanOpenAction | CleanDoneAction>,
  repo: string,
  kind: 'open' | 'done',
): string {
  const filtered = actions.filter((a) => a.repo === repo)
  if (filtered.length === 0) return '(none for this repo)'

  return filtered
    .map((a) => {
      if (kind === 'done' && 'resolution' in a && a.resolution) {
        return `- ${a.command} — "${a.description.slice(0, 80)}" — resolved ${a.closedDate}: "${a.resolution}"`
      }
      return `- ${a.command} — "${a.description.slice(0, 100)}"`
    })
    .join('\n')
}

function formatShipments(entries: CleanEntryData[], repo: string): string {
  const relevant = entries.filter((e) => e.reposActive?.includes(repo))
  if (relevant.length === 0) return '(no recent activity in this repo)'

  return relevant
    .map((e) => `**${e.date}:** ${e.summary}`)
    .join('\n\n')
}

// ─── Phase 1: Sweep ───────────────────────────────────────────────────────────

function getChangedSourceFiles(org: string, repo: string, since: string): string[] {
  type GHCommit = { sha: string }
  const commits = ghApi<GHCommit[]>(
    `repos/${org}/${repo}/commits?since=${encodeURIComponent(since)}&per_page=20`,
  )
  if (!commits?.length) return []

  const files = new Set<string>()
  for (const c of commits.slice(0, 8)) {
    type GHDetail = { files: Array<{ filename: string; status: string }> }
    const detail = ghApi<GHDetail>(`repos/${org}/${repo}/commits/${c.sha}`)
    detail?.files
      .filter((f) => f.status !== 'removed' && SOURCE_EXT.test(f.filename))
      .forEach((f) => files.add(f.filename))
  }
  return [...files]
}

function extractTodos(
  repo: string,
  filePath: string,
  content: string,
  recentCommits: string,
): CleanCandidate[] {
  const candidates: CleanCandidate[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!TODO_RE.test(lines[i])) continue

    const ctxStart = Math.max(0, i - 8)
    const ctxEnd = Math.min(lines.length - 1, i + 8)
    const context = lines
      .slice(ctxStart, ctxEnd + 1)
      .map((l, offset) => `${ctxStart + offset + 1}: ${l}`)
      .join('\n')

    candidates.push({
      repo,
      filePath,
      startLine: i + 1,
      endLine: i + 1,
      original: lines[i],
      context,
      kind: /fixme/i.test(lines[i]) ? 'fixme' : 'todo',
      recentCommits,
    })
  }
  return candidates
}

export async function sweepForCandidates(ctx: BlogContext): Promise<CleanCandidate[]> {
  const org = process.env.OJFBOT_ORG ?? 'ojfbot'
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const candidates: CleanCandidate[] = []

  // Only sweep repos with activity in the last 24h
  const activeRepos = [...new Set(ctx.commits.map((c) => c.repo))]

  for (const repo of activeRepos) {
    console.log(`  Sweeping ${repo}...`)

    const recentCommits = ctx.commits
      .filter((c) => c.repo === repo)
      .slice(0, 12)
      .map((c) => `${c.hash}: ${c.message}`)
      .join('\n')

    // 1. Doc files — read full content, one candidate per file
    for (const docFile of DOC_FILES) {
      const content = readRemoteFile(org, repo, docFile)
      if (!content || content.length < 50) continue

      const numbered = content
        .split('\n')
        .map((l, i) => `${i + 1}: ${l}`)
        .join('\n')

      candidates.push({
        repo,
        filePath: docFile,
        startLine: 1,
        endLine: content.split('\n').length,
        original: content,
        context: numbered,
        kind: 'doc-file',
        recentCommits,
      })
    }

    // 2. Changed source files — extract TODOs only
    const changedFiles = getChangedSourceFiles(org, repo, since48h)
    for (const filePath of changedFiles.slice(0, 15)) {
      const content = readRemoteFile(org, repo, filePath)
      if (!content) continue
      candidates.push(...extractTodos(repo, filePath, content, recentCommits))
    }
  }

  console.log(`  → ${candidates.length} raw candidates`)
  return candidates
}

// ─── Phase 2: Validate ────────────────────────────────────────────────────────

// Doc validation: Claude reads the full file + recent commits + today's article,
// returns an array of specific edits (each with line range, original, replacement,
// rationale, confidence). Returns [] if nothing is stale.

async function validateDocCandidate(
  candidate: CleanCandidate,
  ctx: StructuredCleanContext,
): Promise<CleanProposal[]> {
  const client = new Anthropic()

  const system = `You are a rigorous technical writer auditing documentation for staleness.

You will receive:
- The full content of a documentation file (with line numbers)
- Structured context from the daily-logger pipeline: recent summaries, decisions,
  completed actions with resolutions, and open actions still pending
- Recent git commits from the repo

Use this evidence to identify sections that have become inaccurate or outdated.
For each stale section, produce an exact edit — either a replacement or a deletion.

Return a JSON array. Each element describes one edit:
{
  "startLine": <number>,
  "endLine": <number>,
  "original": "<exact text of the stale line(s)>",
  "replacement": "<corrected text, or empty string to delete>",
  "rationale": "<one sentence: what shipped that made this stale>",
  "confidence": "high" | "medium"
}

Rules:
- "high" = the doc directly contradicts what commits, decisions, or completed actions show shipped.
- "medium" = the doc is likely outdated but you can't be 100% certain from the evidence.
- If a section references work described in an open action, it may be forward-looking
  and correct — do not flag it as stale.
- If nothing is stale, return [].
- Raw JSON array only — no fences, no commentary.`

  const repo = candidate.repo
  const userPrompt = [
    `**Repo:** ojfbot/${repo}`,
    `**File:** ${candidate.filePath}`,
    '',
    '## What shipped recently (last 3 days)',
    formatShipments(ctx.recentEntries, repo),
    '',
    '## Decisions',
    formatDecisions(ctx.recentEntries),
    '',
    `## Completed actions (${repo})`,
    formatActions(ctx.doneActions, repo, 'done'),
    '',
    `## Open actions (${repo}) — NOT yet resolved, referenced work is still pending`,
    formatActions(ctx.openActions, repo, 'open'),
    '',
    '## Recent commits (last 48h)',
    candidate.recentCommits || '(none)',
    '',
    '## File content (line numbers shown)',
    candidate.context,
  ].join('\n')

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const edits = JSON.parse(jsonText) as Array<{
      startLine: number
      endLine: number
      original: string
      replacement: string
      rationale: string
      confidence: 'high' | 'medium'
    }>

    return edits
      .filter((e) => e.confidence === 'high' || e.confidence === 'medium')
      .map((e) => ({
        repo: candidate.repo,
        filePath: candidate.filePath,
        startLine: e.startLine,
        endLine: e.endLine,
        original: e.original,
        replacement: e.replacement,
        rationale: e.rationale,
        confidence: e.confidence,
      }))
  } catch {
    console.warn(`    ⚠ Doc validation failed for ${candidate.repo}/${candidate.filePath}`)
    return []
  }
}

// TODO validation: was this resolved by a recent commit or the shipped work described
// in today's article? Returns one proposal (delete or update) or null.

async function validateTodoCandidate(
  candidate: CleanCandidate,
  ctx: StructuredCleanContext,
): Promise<CleanProposal | null> {
  const client = new Anthropic()

  const system = `You are a rigorous code auditor checking whether a TODO/FIXME comment has been resolved.

You will receive:
- The comment in its surrounding code context
- Structured context: recent article summaries, completed actions with resolutions,
  and open actions still pending for this repo
- Recent git commits from the repo

Determine if the thing the TODO/FIXME asked for has been shipped or is no longer relevant.

Return a JSON object:
{
  "resolved": true | false,
  "evidence": "<one sentence: what shipped that resolved it, citing a decision, action resolution, or commit>",
  "replacement": "<updated comment if partially addressed, or empty string to delete>",
  "confidence": "high" | "medium" | "low"
}

Rules:
- resolved=true only with clear evidence from commits, completed actions, or decisions.
- If the TODO matches an open action (same repo, related description), this is evidence
  the TODO is still relevant — do NOT mark it as resolved.
- If resolved=true and replacement is empty, the line will be deleted.
- If resolved=true and replacement is non-empty, the line is updated.
- "low" confidence findings are ignored.
- Raw JSON only — no fences.`

  const repo = candidate.repo
  const userPrompt = [
    `**Repo:** ojfbot/${repo}`,
    `**File:** ${candidate.filePath}:${candidate.startLine}`,
    `**Kind:** ${candidate.kind.toUpperCase()}`,
    '',
    '## What shipped recently (last 3 days)',
    formatShipments(ctx.recentEntries, repo),
    '',
    `## Completed actions (${repo})`,
    formatActions(ctx.doneActions, repo, 'done'),
    '',
    `## Open actions (${repo}) — work still pending, NOT yet resolved`,
    formatActions(ctx.openActions, repo, 'open'),
    '',
    '## Recent commits to this repo',
    candidate.recentCommits || '(none)',
    '',
    '## Comment in context (line numbers shown)',
    candidate.context,
  ].join('\n')

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const result = JSON.parse(jsonText) as {
      resolved: boolean
      evidence: string
      replacement: string
      confidence: 'high' | 'medium' | 'low'
    }

    if (!result.resolved || result.confidence === 'low') return null

    return {
      repo: candidate.repo,
      filePath: candidate.filePath,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      original: candidate.original,
      replacement: result.replacement ?? '',
      rationale: result.evidence,
      confidence: result.confidence,
    }
  } catch {
    console.warn(`    ⚠ TODO validation failed: ${candidate.repo}/${candidate.filePath}:${candidate.startLine}`)
    return null
  }
}

export async function validateCandidates(
  candidates: CleanCandidate[],
  ctx: StructuredCleanContext,
): Promise<CleanProposal[]> {
  const proposals: CleanProposal[] = []

  for (const candidate of candidates) {
    const tag =
      candidate.kind === 'doc-file'
        ? `${candidate.repo}/${candidate.filePath}`
        : `${candidate.repo}/${candidate.filePath}:${candidate.startLine}`
    console.log(`  Validating ${tag}...`)

    if (candidate.kind === 'doc-file') {
      const edits = await validateDocCandidate(candidate, ctx)
      proposals.push(...edits)
    } else {
      const proposal = await validateTodoCandidate(candidate, ctx)
      if (proposal) proposals.push(proposal)
    }
  }

  const high = proposals.filter((p) => p.confidence === 'high').length
  const medium = proposals.filter((p) => p.confidence === 'medium').length
  console.log(`  → ${proposals.length} validated proposals (${high} high, ${medium} medium)`)
  return proposals
}

// ─── Phase 3: PR creation ─────────────────────────────────────────────────────

function applyProposal(repoDir: string, proposal: CleanProposal): void {
  const filePath = join(repoDir, proposal.filePath)
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  const before = lines.slice(0, proposal.startLine - 1)
  const after = lines.slice(proposal.endLine)
  const middle = proposal.replacement ? [proposal.replacement] : []

  writeFileSync(filePath, [...before, ...middle, ...after].join('\n'), 'utf-8')
}

function buildPRBody(proposals: CleanProposal[], date: string): string {
  const high = proposals.filter((p) => p.confidence === 'high')
  const medium = proposals.filter((p) => p.confidence === 'medium')

  const formatProposal = (p: CleanProposal): string => {
    const action = p.replacement ? 'Updated' : 'Removed'
    return [
      `### \`${p.filePath}\` line ${p.startLine}${p.endLine > p.startLine ? `–${p.endLine}` : ''}`,
      `**${action}** · _${p.rationale}_`,
      '',
      '```diff',
      p.original
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n'),
      ...(p.replacement
        ? p.replacement
            .split('\n')
            .map((l) => `+ ${l}`)
        : []),
      '```',
    ].join('\n')
  }

  const sections: string[] = [
    `## Stale documentation/comments — ${date}`,
    '',
    `Validated by Claude Opus. Only high and medium confidence edits are included.`,
    `Generated by [daily-cleaner](https://github.com/ojfbot/daily-logger) — runs nightly after the daily-logger.`,
    '',
  ]

  if (high.length) {
    sections.push(`## High confidence (${high.length})`)
    sections.push('')
    high.forEach((p) => sections.push(formatProposal(p), ''))
  }

  if (medium.length) {
    sections.push(`## Medium confidence (${medium.length})`)
    sections.push('')
    medium.forEach((p) => sections.push(formatProposal(p), ''))
  }

  sections.push('---', '*🤖 Claude Code*')
  return sections.join('\n')
}

export async function openCleanPRs(
  proposals: CleanProposal[],
  date: string,
  org: string,
  isDryRun: boolean,
): Promise<void> {
  // Group by repo
  const byRepo = new Map<string, CleanProposal[]>()
  for (const p of proposals) {
    const list = byRepo.get(p.repo) ?? []
    list.push(p)
    byRepo.set(p.repo, list)
  }

  if (byRepo.size === 0) {
    console.log('  No validated proposals — nothing to PR.')
    return
  }

  for (const [repo, repoProposals] of byRepo) {
    const branch = `clean/${date}`
    console.log(`\n  ${repo}: ${repoProposals.length} proposal(s)`)

    if (isDryRun) {
      console.log(`  [dry] Would open PR on ${org}/${repo} branch ${branch}:`)
      for (const p of repoProposals) {
        const action = p.replacement ? 'update' : 'delete'
        console.log(`    ${action} ${p.filePath}:${p.startLine} [${p.confidence}] — ${p.rationale}`)
      }
      continue
    }

    try {
      // Check if branch already exists
      const branchExists = tryRun(`gh api repos/${org}/${repo}/git/ref/heads/${branch} 2>/dev/null`)
      if (branchExists) {
        console.log(`  ⚠ Branch ${branch} already exists in ${repo} — skipping`)
        continue
      }

      // Clone into temp dir
      const tmpDir = mkdtempSync(join(tmpdir(), `ojf-clean-${repo}-`))
      run(`gh repo clone ${org}/${repo} ${tmpDir}`)

      // Apply proposals (descending line order to avoid offset drift)
      const sorted = [...repoProposals].sort((a, b) => b.startLine - a.startLine)
      for (const p of sorted) {
        applyProposal(tmpDir, p)
      }

      // Commit
      run(`git -C ${tmpDir} config user.name "ojfbot-clean[bot]"`)
      run(
        `git -C ${tmpDir} config user.email "41898282+github-actions[bot]@users.noreply.github.com"`,
      )
      run(`git -C ${tmpDir} checkout -b ${branch}`)
      run(`git -C ${tmpDir} add -A`)
      run(`git -C ${tmpDir} commit -m "clean: remove stale comments/docs ${date} [skip ci]"`)
      run(`git -C ${tmpDir} push -u origin ${branch}`)

      // Open PR
      const prBody = buildPRBody(repoProposals, date)
      const bodyFile = join(tmpDir, '.pr-body.md')
      writeFileSync(bodyFile, prBody, 'utf-8')

      const prUrl = tryRun(
        `gh pr create --title "clean: stale docs/comments ${date}" --body-file ${bodyFile} --base main --head ${branch} --repo ${org}/${repo}`,
        tmpDir,
      )
      console.log(`  ✓ PR opened: ${prUrl?.trim()}`)
    } catch (err) {
      console.warn(`  ⚠ Failed to open PR for ${repo}: ${(err as Error).message}`)
    }
  }
}
