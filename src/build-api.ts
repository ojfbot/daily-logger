/**
 * Static JSON API generator.
 *
 * Reads all _articles/*.md, parses frontmatter + body, and outputs:
 *   api/entries.json  — Array of article data objects (newest first)
 *   api/actions.json  — Aggregated action items across all articles
 *   api/tags.json     — Deduplicated tags with counts
 *   api/repos.json    — Per-repo stats
 *
 * Usage: pnpm build:api
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import type { CodeReference } from './schema.js'
import { fixCountMismatch } from './generate-article.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const ARTICLES_DIR = join(REPO_ROOT, '_articles')
const API_DIR = join(REPO_ROOT, 'api')

// ─── Types ──────────────────────────────────────────────────────────────────

interface TypedTag {
  name: string
  type: string
}

interface ActionItem {
  command: string
  description: string
  repo: string
  status: string
  sourceDate: string
}

interface EntryData {
  date: string
  title: string
  summary: string
  tags: TypedTag[]
  reposActive: string[]
  commitCount: number
  activityType: string
  schemaVersion: number
  status?: 'draft' | 'accepted' | 'rejected'
  // Body sections for detail pages (not included in index to keep payload small)
  decisions?: Array<{ title: string; summary: string; repo: string; pillar?: string; relatedTags: string[] }>
  actions?: ActionItem[]
  codeReferences?: CodeReference[]
}

interface TagCount {
  name: string
  type: string
  count: number
}

interface RepoStats {
  name: string
  articleCount: number
  totalCommits: number
  relatedTags: string[]
}

// ─── Frontmatter parser ─────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const fm: Record<string, unknown> = {}
  const raw = match[1]

  const titleMatch = raw.match(/^title:\s*"(.+)"$/m)
  if (titleMatch) fm.title = titleMatch[1].replace(/\\"/g, '"')

  const dateMatch = raw.match(/^date:\s*(\S+)$/m)
  if (dateMatch) fm.date = dateMatch[1]

  const tagsMatch = raw.match(/^tags:\s*\[(.+)\]$/m)
  if (tagsMatch) {
    fm.tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/^"|"$/g, ''))
  }

  const summaryMatch = raw.match(/^summary:\s*"(.+)"$/m)
  if (summaryMatch) fm.summary = summaryMatch[1].replace(/\\"/g, '"')

  const svMatch = raw.match(/^schemaVersion:\s*(\d+)$/m)
  if (svMatch) fm.schemaVersion = parseInt(svMatch[1], 10)

  const statusMatch = raw.match(/^status:\s*"?(\w+)"?$/m)
  if (statusMatch) fm.status = statusMatch[1]

  return fm
}

// ─── Body extraction helpers ────────────────────────────────────────────────

function extractReposFromBody(body: string): string[] {
  // Match [repo] patterns and ### repo headings
  const bracketMatches = body.match(/\[([a-zA-Z][\w-]*)\]/g) ?? []
  const headingMatches = body.match(/^### ([a-zA-Z][\w-]*)/gm) ?? []

  const repos = new Set<string>()
  for (const m of bracketMatches) {
    const name = m.slice(1, -1)
    if (KNOWN_REPOS.has(name)) repos.add(name)
  }
  for (const m of headingMatches) {
    const name = m.replace('### ', '')
    if (KNOWN_REPOS.has(name)) repos.add(name)
  }
  return [...repos]
}

function countCommitsInBody(body: string): number {
  // Count 7-char hex SHAs and commit-like references
  const shas = body.match(/`[a-f0-9]{7}`/g) ?? []
  return shas.length
}

function extractActionsFromBody(body: string, date: string): ActionItem[] {
  const actions: ActionItem[] = []
  // Match lines like: > - `/command` — description
  const actionLines = body.match(/^> - `(\/\w[\w-]*)` — (.+)$/gm) ?? []
  for (const line of actionLines) {
    const m = line.match(/^> - `(\/\w[\w-]*)` — (.+?)(?:\s*\((\w[\w-]*)\))?$/)
    if (m) {
      actions.push({
        command: m[1],
        description: m[2].trim(),
        repo: m[3] ?? 'daily-logger',
        status: 'open',
        sourceDate: date,
      })
    }
  }
  return actions
}

function extractDecisionsFromBody(body: string): Array<{ title: string; summary: string; repo: string; relatedTags: string[] }> {
  const decisions: Array<{ title: string; summary: string; repo: string; relatedTags: string[] }> = []

  // Find "## The decisions" section
  const decMatch = body.match(/## The decisions\n\n([\s\S]*?)(?=\n## |$)/)
  if (!decMatch) return decisions

  const decSection = decMatch[1]
  // Split on ### headings or **bold** decision titles
  const headings = decSection.match(/^###\s+(.+?)(?:\s+—\s+.+)?$/gm) ?? []

  for (const h of headings) {
    const title = h.replace(/^###\s+/, '').replace(/\s+—\s+\*.+\*$/, '').trim()
    decisions.push({
      title,
      summary: '',
      repo: 'daily-logger',
      relatedTags: [],
    })
  }

  return decisions
}

const KNOWN_REPOS = new Set([
  'shell', 'cv-builder', 'BlogEngine', 'TripPlanner', 'core', 'core-reader',
  'MrPlug', 'purefoy', 'daily-logger', 'lean-canvas', 'seh-study', 'GroupThink', 'landing',
])

// ─── Tag type inference for v1 articles ─────────────────────────────────────

const TAG_TYPE_MAP: Record<string, string> = {
  'shell': 'repo', 'cv-builder': 'repo', 'blogengine': 'repo', 'tripplanner': 'repo',
  'daily-logger': 'repo', 'mrplug': 'repo', 'purefoy': 'repo', 'core': 'repo',
  'core-reader': 'repo', 'lean-canvas': 'repo', 'seh-study': 'repo', 'groupthink': 'repo',
  'landing': 'repo', 'node-template': 'repo',
  'module-federation': 'arch', 'container-presenter': 'arch', 'frame-agent': 'arch',
  'frame-os': 'arch', 'architecture': 'arch',
  'ci-cd': 'practice', 'visual-regression': 'practice', 'adr': 'practice',
  'security': 'practice', 'security-scanning': 'practice', 'scaffold-app': 'practice',
  'hardening': 'practice',
  'phase-1': 'phase', 'phase-4': 'phase', 'phase-5': 'phase', 'phase-5b': 'phase',
  'gas-town': 'phase',
  'rest-day': 'activity', 'rest-day-audit': 'activity', 'hero-demo': 'activity',
  'storybook': 'infra', 's3': 'infra', 'vercel': 'infra', 'deployment': 'infra',
  'shared-components': 'infra', 'frame-ui-components': 'infra', 'chrome-extension': 'infra',
}

function classifyTag(name: string): TypedTag {
  return { name, type: TAG_TYPE_MAP[name] ?? 'concept' }
}

// ─── Main build ─────────────────────────────────────────────────────────────

export function buildApi() {
  if (!existsSync(API_DIR)) mkdirSync(API_DIR, { recursive: true })

  // Load backfilled code references if available
  const codeRefsPath = join(API_DIR, 'code-refs.json')
  let codeRefsByDate: Record<string, CodeReference[]> = {}
  if (existsSync(codeRefsPath)) {
    try {
      codeRefsByDate = JSON.parse(readFileSync(codeRefsPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse() // newest first

  const entries: EntryData[] = []
  const allActions: ActionItem[] = []
  const tagCounts = new Map<string, { type: string; count: number }>()
  const repoStats = new Map<string, { articleCount: number; totalCommits: number; tags: Set<string> }>()

  for (const file of files) {
    const content = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
    const fm = parseFrontmatter(content)
    const body = content.replace(/^---[\s\S]*?---\n/, '')
    const date = (fm.date as string) ?? file.replace('.md', '')

    // Tags
    let tags: TypedTag[]
    if (fm.schemaVersion === 2 && Array.isArray(fm.tags)) {
      // v2 articles have flat tag names in frontmatter; classify them
      tags = (fm.tags as string[]).map(classifyTag)
    } else if (Array.isArray(fm.tags)) {
      tags = (fm.tags as string[]).map(classifyTag)
    } else {
      tags = []
    }

    // Repos and commits — prefer frontmatter (structured tool output) over body regex recount
    const reposActive = Array.isArray(fm.reposActive) && (fm.reposActive as string[]).length > 0
      ? fm.reposActive as string[]
      : extractReposFromBody(body)
    const commitCount = typeof fm.commitCount === 'number' && fm.commitCount > 0
      ? fm.commitCount as number
      : countCommitsInBody(body)

    // Actions
    const actions = extractActionsFromBody(body, date)
    allActions.push(...actions)

    // Decisions
    const decisions = extractDecisionsFromBody(body)

    // Activity type heuristic
    let activityType = 'build'
    if (commitCount === 0) activityType = 'rest'
    else if (tags.some((t) => t.name === 'hardening')) activityType = 'hardening'
    else if (tags.some((t) => t.name.includes('audit'))) activityType = 'audit'
    else if (commitCount > 40) activityType = 'sprint'

    const status = (fm.status as string) ?? 'accepted' // older articles without status are implicitly accepted
    // Fix hallucinated commit/repo counts in summary text to match structured data
    const rawSummary = (fm.summary as string) ?? ''
    const summary = fixCountMismatch(rawSummary, commitCount, reposActive.length)
    const entry: EntryData = {
      date,
      title: (fm.title as string) ?? `Dev log — ${date}`,
      summary,
      tags,
      reposActive,
      commitCount,
      activityType,
      schemaVersion: (fm.schemaVersion as number) ?? 1,
      status: status as EntryData['status'],
      decisions,
      actions,
      codeReferences: codeRefsByDate[date],
    }
    entries.push(entry)

    // Aggregate tag counts
    for (const tag of tags) {
      const existing = tagCounts.get(tag.name)
      if (existing) {
        existing.count++
      } else {
        tagCounts.set(tag.name, { type: tag.type, count: 1 })
      }
    }

    // Aggregate repo stats
    for (const repo of reposActive) {
      const existing = repoStats.get(repo)
      if (existing) {
        existing.articleCount++
        existing.totalCommits += commitCount
        tags.forEach((t) => existing.tags.add(t.name))
      } else {
        repoStats.set(repo, {
          articleCount: 1,
          totalCommits: commitCount,
          tags: new Set(tags.map((t) => t.name)),
        })
      }
    }
  }

  // Write per-article JSON files with rendered HTML body
  const articlesApiDir = join(API_DIR, 'articles')
  if (!existsSync(articlesApiDir)) mkdirSync(articlesApiDir, { recursive: true })

  for (const file of files) {
    const content = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
    const body = content.replace(/^---[\s\S]*?---\n/, '')
    const date = file.replace('.md', '')
    const entry = entries.find((e) => e.date === date)
    if (!entry) continue

    const bodyHtml = marked.parse(body) as string
    writeFileSync(
      join(articlesApiDir, `${date}.json`),
      JSON.stringify({ ...entry, bodyHtml }, null, 2),
    )
  }
  console.log(`  articles/    — ${files.length} per-article JSON files`)

  // Write entries.json
  writeFileSync(join(API_DIR, 'entries.json'), JSON.stringify(entries, null, 2))

  // Write actions.json — filter out actions already marked done
  const donePath = join(API_DIR, 'done-actions.json')
  const doneItems: Array<{ command: string; sourceDate: string; description: string }> = existsSync(donePath)
    ? JSON.parse(readFileSync(donePath, 'utf-8'))
    : []
  const doneKeys = new Set(
    doneItems.map((d) => `${d.command}|${d.sourceDate}|${d.description.slice(0, 50)}`),
  )
  const openActions = allActions.filter(
    (a) => !doneKeys.has(`${a.command}|${a.sourceDate}|${a.description.slice(0, 50)}`),
  )
  writeFileSync(join(API_DIR, 'actions.json'), JSON.stringify(openActions, null, 2))

  // Write tags.json
  const tagsArr: TagCount[] = [...tagCounts.entries()]
    .map(([name, { type, count }]) => ({ name, type, count }))
    .sort((a, b) => b.count - a.count)
  writeFileSync(join(API_DIR, 'tags.json'), JSON.stringify(tagsArr, null, 2))

  // Write repos.json
  const reposArr: RepoStats[] = [...repoStats.entries()]
    .map(([name, stats]) => ({
      name,
      articleCount: stats.articleCount,
      totalCommits: stats.totalCommits,
      relatedTags: [...stats.tags],
    }))
    .sort((a, b) => b.articleCount - a.articleCount)
  writeFileSync(join(API_DIR, 'repos.json'), JSON.stringify(reposArr, null, 2))

  console.log(`API built:`)
  console.log(`  entries.json — ${entries.length} articles`)
  console.log(`  actions.json — ${openActions.length} open actions (${allActions.length - openActions.length} filtered as done)`)
  console.log(`  tags.json    — ${tagsArr.length} unique tags`)
  console.log(`  repos.json   — ${reposArr.length} repos`)
}

// Run directly
buildApi()
