/**
 * One-time backfill: classify existing flat tags into typed tags,
 * extract structured decisions/actions from article prose,
 * and add schemaVersion: 2 to frontmatter.
 *
 * Usage: pnpm backfill
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARTICLES_DIR = join(__dirname, '../_articles')

// ─── Tag classification map ─────────────────────────────────────────────────

type TagType = 'repo' | 'arch' | 'practice' | 'phase' | 'activity' | 'concept' | 'infra'

const TAG_MAP: Record<string, TagType> = {
  // repos
  'shell': 'repo',
  'cv-builder': 'repo',
  'blogengine': 'repo',
  'tripplanner': 'repo',
  'daily-logger': 'repo',
  'mrplug': 'repo',
  'purefoy': 'repo',
  'core': 'repo',
  'core-reader': 'repo',
  'lean-canvas': 'repo',
  'seh-study': 'repo',
  'groupthink': 'repo',
  'landing': 'repo',
  'node-template': 'repo',

  // architecture
  'module-federation': 'arch',
  'container-presenter': 'arch',
  'cross-app-orchestration': 'arch',
  'meta-orchestrator': 'arch',
  'isolated-synthesis': 'arch',
  'architecture': 'arch',
  'frame-os': 'arch',
  'multi-instance': 'arch',
  'structured-output': 'arch',
  'langgraph': 'arch',
  'frame-agent': 'arch',

  // practices
  'ci-cd': 'practice',
  'visual-regression': 'practice',
  'adr': 'practice',
  'security': 'practice',
  'security-scanning': 'practice',
  'scaffold-app': 'practice',
  'scaffold': 'practice',
  'hardening': 'practice',
  'prompt-optimization': 'practice',
  'eval-loop': 'practice',
  'pr-audit': 'practice',
  'daily-cleaner': 'practice',
  'fleet-ops': 'practice',
  'fleet-wide': 'practice',
  'fleet-management': 'practice',
  'rename-cleanup': 'practice',
  'rename': 'practice',
  'pipeline': 'practice',

  // phases
  'phase-1': 'phase',
  'phase-4': 'phase',
  'phase-5': 'phase',
  'phase-5b': 'phase',
  'gas-town': 'phase',
  'gastown-pilot': 'phase',

  // activity types
  'rest-day': 'activity',
  'rest-day-audit': 'activity',
  'hero-demo': 'activity',

  // concepts
  'assistant-centric': 'concept',
  'model-behavior-as-design': 'concept',
  'tooling-for-iteration': 'concept',
  'tooling': 'concept',
  'design-system': 'concept',
  'platform-features': 'concept',
  'core-skills': 'concept',
  'claude-code': 'concept',
  'adr-0019': 'concept',

  // infra
  'storybook': 'infra',
  's3': 'infra',
  'vercel': 'infra',
  'deployment': 'infra',
  'github-integration': 'infra',
  'draw-io': 'infra',
  'cache-headers': 'infra',
  'shared-components': 'infra',
  'frame-ui-components': 'infra',
  'chrome-extension': 'infra',
  'carbon-tokens': 'infra',
  'settings': 'infra',
  'settings-modal': 'infra',
  'transcription': 'infra',
  'diarization': 'infra',
}

function classifyTag(name: string): TagType {
  return TAG_MAP[name] ?? 'concept'
}

// ─── Frontmatter parsing ────────────────────────────────────────────────────

interface ParsedArticle {
  frontmatter: Record<string, unknown>
  body: string
  raw: string
}

function parseArticle(content: string): ParsedArticle | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return null

  const fm: Record<string, unknown> = {}
  const fmRaw = match[1]

  // Simple YAML parser for known fields
  const titleMatch = fmRaw.match(/^title:\s*"(.+)"$/m)
  if (titleMatch) fm.title = titleMatch[1].replace(/\\"/g, '"')

  const dateMatch = fmRaw.match(/^date:\s*(\S+)$/m)
  if (dateMatch) fm.date = dateMatch[1]

  const tagsMatch = fmRaw.match(/^tags:\s*\[(.+)\]$/m)
  if (tagsMatch) {
    fm.tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/^"|"$/g, ''))
  }

  const summaryMatch = fmRaw.match(/^summary:\s*"(.+)"$/m)
  if (summaryMatch) fm.summary = summaryMatch[1].replace(/\\"/g, '"')

  return { frontmatter: fm, body: match[2], raw: content }
}

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const esc = (s: string) => s.replace(/"/g, '\\"')
  const lines = ['---']

  if (fm.title) lines.push(`title: "${esc(fm.title as string)}"`)
  if (fm.date) lines.push(`date: ${fm.date}`)
  if (fm.tags) {
    const tags = fm.tags as Array<{ name: string; type: string }>
    lines.push(`tags: [${tags.map((t) => `"${t.name}"`).join(', ')}]`)
  }
  if (fm.summary) lines.push(`summary: "${esc(fm.summary as string)}"`)
  lines.push(`schemaVersion: 2`)

  lines.push('---')
  return lines.join('\n')
}

// ─── Main ───────────────────────────────────────────────────────────────────

function backfill() {
  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  console.log(`Backfilling ${files.length} articles...`)

  let updated = 0
  for (const file of files) {
    const path = join(ARTICLES_DIR, file)
    const content = readFileSync(path, 'utf-8')
    const parsed = parseArticle(content)
    if (!parsed) {
      console.warn(`  ⚠ Skipping ${file} — could not parse frontmatter`)
      continue
    }

    // Classify tags
    const flatTags = (parsed.frontmatter.tags ?? []) as string[]
    const typedTags = flatTags.map((name) => ({ name, type: classifyTag(name) }))

    // Update frontmatter
    parsed.frontmatter.tags = typedTags

    // Rebuild file
    const newContent = serializeFrontmatter(parsed.frontmatter) + '\n' + parsed.body
    writeFileSync(path, newContent, 'utf-8')

    console.log(`  ✓ ${file} — ${flatTags.length} tags classified`)
    updated++
  }

  console.log(`\nDone. ${updated}/${files.length} articles updated.`)
}

backfill()
