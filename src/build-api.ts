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

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { ARTICLE_OUTCOMES, type CodeReference } from './schema.js'
import { parseArticleProvenance, type ArticleProvenance } from './run-provenance.js'
import { readArticleTime } from './article-time-metadata.js'
import { assertShipmentCoverage, type ShipmentTime } from './shipment-times.js'
import { requiresShipmentTimeCoverage } from './shipment-time-coverage.js'
import type { TimeReference } from './time-references.js'
import { type CanonicalAction } from './action-model.js'
import { verifyRecordedAdmissions } from './action-intake.js'
import { readActionRegistry, projectRegistry, renderArticleActions, articleActionRecords, articleActionCard, renderArticleActionHtml, stripManagedActions } from './action-registry.js'

import { KNOWN_REPOS } from './fleet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

// ─── Types ──────────────────────────────────────────────────────────────────

interface TypedTag {
  name: string
  type: string
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
  // S18 (audit I2): human editorial verdict — stamped by the accept/revise paths, absent until then
  outcome?: 'accepted' | 'edited' | 'rejected' | 'abandoned'
  // Body sections for detail pages (not included in index to keep payload small)
  decisions?: Array<{ title: string; summary: string; repo: string; pillar?: string; relatedTags: string[] }>
  actions?: CanonicalAction[]
  codeReferences?: CodeReference[]
  timeReferences?: TimeReference[]
  shipmentTimes?: ShipmentTime[]
  provenance?: ArticleProvenance
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

  // S18 (audit I2): only the closed enum passes — a junk value is dropped, not emitted
  const outcomeMatch = raw.match(/^outcome:\s*"?(\w+)"?$/m)
  if (outcomeMatch && (ARTICLE_OUTCOMES as readonly string[]).includes(outcomeMatch[1])) {
    fm.outcome = outcomeMatch[1]
  }

  const ccMatch = raw.match(/^commitCount:\s*(\d+)$/m)
  if (ccMatch) fm.commitCount = parseInt(ccMatch[1], 10)

  const raMatch = raw.match(/^reposActive:\s*\[(.+)\]$/m)
  if (raMatch) {
    fm.reposActive = raMatch[1].split(',').map((r) => r.trim().replace(/^"|"$/g, ''))
  }

  const provenanceMatch = raw.match(/^provenance:\s*(\{.+\})$/m)
  if (provenanceMatch) {
    fm.provenance = parseArticleProvenance(provenanceMatch[1])
  }

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

// KNOWN_REPOS lives in src/fleet.ts (derived from REPO_NOTES) so the sweep,
// the API builder and the tag classifier share one registration. Fleet-onboard
// surface 3 is now "add a REPO_NOTES entry".

// ─── Tag type inference for v1 articles ─────────────────────────────────────

// Repo tags are derived from KNOWN_REPOS in both casings (article tag arrays
// preserve original case, e.g. 'beaverGame'). Explicit entries below override —
// 'frame-ui-components' is intentionally 'infra', not 'repo': although a fleet
// repo exists, article tag arrays use it as an infra/topic tag (alongside
// shared-components, module-federation, ci-cd). See TS1117 fix 2026-07-23.
const REPO_TAG_TYPES: Record<string, string> = Object.fromEntries(
  [...KNOWN_REPOS].flatMap((r) => [[r, 'repo'], [r.toLowerCase(), 'repo']]),
)

const TAG_TYPE_MAP: Record<string, string> = {
  ...REPO_TAG_TYPES,
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

export interface BuildApiResult {
  openActions: readonly CanonicalAction[]
  proposedActions: ReturnType<typeof projectRegistry>['proposed']
  intake: { reviewedActions: readonly CanonicalAction[]; historicalHeldCount: number }
}

export function buildApi(repoRoot = REPO_ROOT): BuildApiResult {
  const articlesDir = join(repoRoot, '_articles')
  const apiDir = join(repoRoot, 'api')

  // Load backfilled code references if available
  const codeRefsPath = join(apiDir, 'code-refs.json')
  let codeRefsByDate: Record<string, CodeReference[]> = {}
  if (existsSync(codeRefsPath)) {
    try {
      codeRefsByDate = JSON.parse(readFileSync(codeRefsPath, 'utf-8'))
    } catch { /* ignore corrupt file */ }
  }

  const files = readdirSync(articlesDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse() // newest first

  const entries: EntryData[] = []
  const articleSources = files.map((file) => {
    const content = readFileSync(join(articlesDir, file), 'utf-8')
    const fm = parseFrontmatter(content)
    return {
      path: `_articles/${file}`,
      date: (fm.date as string) ?? file.replace('.md', ''),
      content,
    }
  })
  const registry = readActionRegistry(repoRoot)
  verifyRecordedAdmissions(repoRoot, registry.records.map(record => record.original))
  const statuses = new Map(articleSources.map(source => [source.date, String(parseFrontmatter(source.content).status ?? 'draft')]))
  const projection = projectRegistry(registry, statuses)
  const openActions = projection.open
  const intake = { reviewedActions: registry.records.filter(record => 'review' in record.original && record.original.review).map(record => record.original), historicalHeldCount: registry.baseline.heldSuggestions.length }
  const tagCounts = new Map<string, { type: string; count: number }>()
  const repoStats = new Map<string, { articleCount: number; totalCommits: number; tags: Set<string> }>()

  for (const file of files) {
    const source = articleSources.find((article) => article.path === `_articles/${file}`)
    if (!source) throw new Error(`Article source disappeared during API build: ${file}`)
    const content = source.content
    const fm = parseFrontmatter(content)
    const narrative = stripManagedActions(content)
    const body = narrative.replace(/^---[\s\S]*?---\n/, '')
    const date = (fm.date as string) ?? file.replace('.md', '')

    const datedFilename = file.replace(/\.md$/, '')
    const timeMetadata = readArticleTime({ repoRoot, date: datedFilename, markdown: narrative, bindingMarkdown: content })
    if (requiresShipmentTimeCoverage(datedFilename, narrative) && timeMetadata.shipmentCoverage.status !== 'complete') throw new Error(`${datedFilename}: required immutable shipment-time coverage is unavailable`)
    if (timeMetadata.shipmentCoverage.status === 'complete') assertShipmentCoverage(narrative, timeMetadata.shipmentCoverage)
    for (const warning of timeMetadata.warnings) console.warn(`::warning::${date}: ${warning}`)
    for (const missing of timeMetadata.unresolved) console.warn(`::warning::${date}: time ${missing.text} occurrence ${missing.occurrence}: ${missing.reason}`)

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

    // Repos and commits — prefer frontmatter (LLM-provided) over body heuristic
    const reposActive = Array.isArray(fm.reposActive)
      ? fm.reposActive as string[]
      : extractReposFromBody(body)
    const commitCount = typeof fm.commitCount === 'number'
      ? fm.commitCount as number
      : countCommitsInBody(body)

    // Actions
    const snapshot = registry.articles.find(snapshot => snapshot.date === date)
    const actions = snapshot ? registry.records.filter(record => snapshot.actionKeys.includes(record.key)).map(record => record.original) : registry.baseline.articleActions[date] ?? []

    // Decisions
    const decisions = extractDecisionsFromBody(body)

    // Activity type heuristic
    let activityType = 'build'
    if (commitCount === 0) activityType = 'rest'
    else if (tags.some((t) => t.name === 'hardening')) activityType = 'hardening'
    else if (tags.some((t) => t.name.includes('audit'))) activityType = 'audit'
    else if (commitCount > 40) activityType = 'sprint'

    // A missing status means the article never passed editorial review — treat
    // it as a draft, never publish by silent default. (Pre-2026-07 articles
    // that were already displayed carry an explicit backfilled status.)
    const status = (fm.status as string) ?? 'draft'
    const entry: EntryData = {
      date,
      title: (fm.title as string) ?? `Dev log — ${date}`,
      summary: (fm.summary as string) ?? '',
      tags,
      reposActive,
      commitCount,
      activityType,
      schemaVersion: (fm.schemaVersion as number) ?? 1,
      status: status as EntryData['status'],
      outcome: fm.outcome as EntryData['outcome'],
      decisions,
      actions,
      codeReferences: codeRefsByDate[date],
      ...(timeMetadata.references.length > 0 ? { timeReferences: timeMetadata.references } : {}),
      ...(timeMetadata.shipmentCoverage.status === 'complete' && timeMetadata.shipmentCoverage.times.length > 0 ? { shipmentTimes: timeMetadata.shipmentCoverage.times } : {}),
      provenance: fm.provenance as ArticleProvenance | undefined,
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

  // Validate every action binding before writing any projection.
  for (const source of articleSources) renderArticleActions(source.content, registry, source.date, statuses)

  // No output changes occur until all admissions, source proofs, evidence and
  // closure guards have passed.
  if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true })
  const articlesApiDir = join(apiDir, 'articles')
  if (!existsSync(articlesApiDir)) mkdirSync(articlesApiDir, { recursive: true })

  for (const file of files) {
    const source = articleSources.find((article) => article.path === `_articles/${file}`)
    if (!source) throw new Error(`Article source disappeared during API write: ${file}`)
    const content = source.content
    const date = file.replace('.md', '')
    const entry = entries.find((e) => e.date === date)
    if (!entry) continue

    const bodyHtml = renderArticleActionHtml(content, registry, date, statuses)
    writeFileSync(
      join(articlesApiDir, `${date}.json`),
      JSON.stringify({ ...entry, actionSuggestions: articleActionRecords(registry, date, statuses), suggestedActionsCard: articleActionCard(registry, date, statuses), sourceBlobSha: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex'), bodyHtml }, null, 2),
    )
  }
  console.log(`  articles/    — ${files.length} per-article JSON files`)

  // Write entries.json
  writeFileSync(join(apiDir, 'entries.json'), JSON.stringify(entries, null, 2))
  writeFileSync(join(apiDir, 'actions.json'), JSON.stringify(openActions, null, 2))
  writeFileSync(join(apiDir, 'done-actions.json'), JSON.stringify(projection.done, null, 2))
  writeFileSync(join(apiDir, 'proposed-actions.json'), JSON.stringify(projection.proposed, null, 2))
  writeFileSync(join(apiDir, 'action-dispositions.json'), JSON.stringify(projection.dispositions, null, 2))

  // Write tags.json
  const tagsArr: TagCount[] = [...tagCounts.entries()]
    .map(([name, { type, count }]) => ({ name, type, count }))
    .sort((a, b) => b.count - a.count)
  writeFileSync(join(apiDir, 'tags.json'), JSON.stringify(tagsArr, null, 2))

  // Write repos.json
  const reposArr: RepoStats[] = [...repoStats.entries()]
    .map(([name, stats]) => ({
      name,
      articleCount: stats.articleCount,
      totalCommits: stats.totalCommits,
      relatedTags: [...stats.tags],
    }))
    .sort((a, b) => b.articleCount - a.articleCount)
  writeFileSync(join(apiDir, 'repos.json'), JSON.stringify(reposArr, null, 2))

  console.log(`API built:`)
  console.log(`  entries.json — ${entries.length} articles`)
  console.log(`  actions.json — ${openActions.length} open; ${projection.done.length} completed; ${projection.proposed.length} proposed`)
  console.log(`    reviewed — ${intake.reviewedActions.length} admitted; ${intake.historicalHeldCount} historical held`)
  console.log(`  tags.json    — ${tagsArr.length} unique tags`)
  console.log(`  repos.json   — ${reposArr.length} repos`)
  return { openActions, proposedActions: projection.proposed, intake }
}

// Run directly
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildApi()
}
