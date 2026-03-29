/**
 * Backfill script for ADR-0031: Universal Code Reference Popovers.
 *
 * Scans all _articles/*.md, regex-classifies every backtick-wrapped token,
 * and writes api/code-refs.json keyed by date.
 *
 * Usage: pnpm backfill:refs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { CodeReference } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const ARTICLES_DIR = join(REPO_ROOT, '_articles')
const API_DIR = join(REPO_ROOT, 'api')

const ORG = 'ojfbot'

const KNOWN_REPOS = new Set([
  'shell', 'cv-builder', 'BlogEngine', 'TripPlanner', 'core', 'core-reader',
  'MrPlug', 'purefoy', 'daily-logger', 'lean-canvas', 'seh-study', 'GroupThink', 'landing',
])

// ─── Classification rules (priority order) ─────────────────────────────────

function classifyToken(text: string, nearestRepo: string | null): CodeReference {
  const ref: CodeReference = { text, type: 'config' }

  // Commit hash: 7-40 char hex
  if (/^[a-f0-9]{7,40}$/.test(text)) {
    ref.type = 'commit'
    if (nearestRepo) {
      ref.repo = nearestRepo
      ref.url = `https://github.com/${ORG}/${nearestRepo}/commit/${text}`
    }
    return ref
  }

  // HTTP endpoint: starts with method
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(text)) {
    ref.type = 'endpoint'
    if (nearestRepo) ref.repo = nearestRepo
    return ref
  }

  // Environment variable: ALL_CAPS with underscores, min 2 chars
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(text)) {
    ref.type = 'env'
    if (nearestRepo) ref.repo = nearestRepo
    return ref
  }

  // Package: @scope/name or known package patterns
  if (/^@[\w-]+\/[\w.-]+$/.test(text)) {
    ref.type = 'package'
    const ojfMatch = text.match(/^@ojfbot\/(.+)$/)
    if (ojfMatch) {
      ref.url = `https://github.com/${ORG}/${ojfMatch[1]}`
      ref.repo = ojfMatch[1]
    } else {
      ref.url = `https://www.npmjs.com/package/${text}`
    }
    return ref
  }

  // CLI command: starts with /
  if (/^\/[\w-]+/.test(text) && !text.includes('.') && !text.includes(' ')) {
    ref.type = 'command'
    return ref
  }

  // Directory: ends with /
  if (/\/$/.test(text) && !text.includes(' ')) {
    ref.type = 'directory'
    if (nearestRepo) {
      ref.repo = nearestRepo
      ref.path = text
      ref.url = `https://github.com/${ORG}/${nearestRepo}/tree/main/${text}`
    }
    return ref
  }

  // File path: contains . with extension or contains /
  if (/\.\w{1,10}$/.test(text) || (text.includes('/') && !text.startsWith('/'))) {
    ref.type = 'file'
    if (nearestRepo) {
      ref.repo = nearestRepo
      ref.path = text
      ref.url = `https://github.com/${ORG}/${nearestRepo}/blob/main/${text}`
    }
    return ref
  }

  // Component: PascalCase with 2+ capital letters
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/.test(text)) {
    ref.type = 'component'
    if (nearestRepo) ref.repo = nearestRepo
    return ref
  }

  // Package: hyphenated lowercase name (e.g. "redux-toolkit", "frame-agent")
  if (/^[a-z][\w]*-[\w-]+$/.test(text) && !KNOWN_REPOS.has(text)) {
    ref.type = 'package'
    // Check if it's a known ojfbot repo name (e.g. "frame-ui-components")
    ref.url = `https://github.com/${ORG}/${text}`
    return ref
  }

  // Config: camelCase identifier
  if (/^[a-z][a-zA-Z0-9]+$/.test(text) && /[A-Z]/.test(text)) {
    ref.type = 'config'
    if (nearestRepo) ref.repo = nearestRepo
    return ref
  }

  // Fallback: if it's a known repo name, tag as repo reference
  if (KNOWN_REPOS.has(text)) {
    ref.type = 'directory'
    ref.repo = text
    ref.url = `https://github.com/${ORG}/${text}`
    return ref
  }

  // Default: config (most generic type for unclassified identifiers)
  if (nearestRepo) ref.repo = nearestRepo
  return ref
}

// ─── Article scanning ──────────────────────────────────────────────────────

function findNearestRepo(body: string, position: number): string | null {
  // Walk backward from position to find nearest ### heading with a repo name
  const before = body.slice(0, position)
  const headings = [...before.matchAll(/^###\s+(\S+)/gm)]
  if (headings.length === 0) return null

  const lastHeading = headings[headings.length - 1]
  const repoCandidate = lastHeading[1].replace(/[^a-zA-Z0-9-]/g, '')
  if (KNOWN_REPOS.has(repoCandidate)) return repoCandidate

  // Try h2 sections like "### GroupThink — ..."
  for (let i = headings.length - 1; i >= 0; i--) {
    const full = headings[i][0]
    for (const repo of KNOWN_REPOS) {
      if (full.includes(repo)) return repo
    }
  }

  return null
}

function extractCodeRefs(body: string): CodeReference[] {
  const refs: CodeReference[] = []
  const seen = new Set<string>()

  // Match all backtick-wrapped tokens (not inside code blocks)
  const codeBlockRanges: Array<[number, number]> = []
  for (const m of body.matchAll(/```[\s\S]*?```/g)) {
    codeBlockRanges.push([m.index!, m.index! + m[0].length])
  }

  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const text = match[1].trim()
    const pos = match.index!

    // Skip tokens inside code blocks
    if (codeBlockRanges.some(([start, end]) => pos >= start && pos <= end)) continue

    // Skip empty or very short tokens
    if (text.length < 2) continue

    // Skip duplicates within same article
    if (seen.has(text)) continue
    seen.add(text)

    const nearestRepo = findNearestRepo(body, pos)
    refs.push(classifyToken(text, nearestRepo))
  }

  return refs
}

// ─── Main ──────────────────────────────────────────────────────────────────

function backfill(): void {
  if (!existsSync(API_DIR)) mkdirSync(API_DIR, { recursive: true })

  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  const codeRefs: Record<string, CodeReference[]> = {}
  let totalRefs = 0
  const typeCounts: Record<string, number> = {}

  for (const file of files) {
    const content = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
    const body = content.replace(/^---[\s\S]*?---\n/, '')
    const date = file.replace('.md', '')

    const refs = extractCodeRefs(body)
    if (refs.length > 0) {
      codeRefs[date] = refs
      totalRefs += refs.length
      for (const ref of refs) {
        typeCounts[ref.type] = (typeCounts[ref.type] ?? 0) + 1
      }
    }
  }

  writeFileSync(join(API_DIR, 'code-refs.json'), JSON.stringify(codeRefs, null, 2))

  console.log(`Code references backfilled:`)
  console.log(`  ${Object.keys(codeRefs).length} articles with references`)
  console.log(`  ${totalRefs} total references`)
  console.log(`  By type:`)
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`)
  }
}

backfill()
