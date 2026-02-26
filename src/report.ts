/**
 * ojfbot on-demand persona report
 *
 * Generates a standalone progress report targeted at a specific advisor persona.
 * Persona definitions live in personas/*.md — add a new file to add a council member.
 *
 * This is separate from the daily pipeline. The daily pipeline runs council review
 * as an internal phase that improves the public article. This script produces a
 * separate, persona-addressed memo — run it explicitly when you want one.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY    required
 *   GITHUB_TOKEN         required (set automatically in GitHub Actions)
 *   DATE_OVERRIDE        ISO date string, default: today UTC
 *   DRY_RUN              "true" → print reports, skip all writes
 *   PERSONA_SLUG         run only the persona with this slug (default: all)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { collectContext } from './collect-context.js'
import { generateReport, reportToMarkdown } from './generate-report.js'
import { loadPersonas } from './council.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const REPORTS_DIR = join(REPO_ROOT, '_reports')

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const date = process.env.DATE_OVERRIDE?.trim().slice(0, 10) || todayUTC()
  const isDryRun = process.env.DRY_RUN === 'true'
  const personaSlug = process.env.PERSONA_SLUG?.trim() || undefined

  console.log(`\n📊 ojfbot persona report — ${date}`)
  console.log(`   Mode: ${isDryRun ? 'dry run' : 'live'}`)
  if (personaSlug) console.log(`   Persona: ${personaSlug}`)

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set')
    process.exit(1)
  }
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠  GITHUB_TOKEN not set — private repo data will be skipped')
  }
  console.log()

  // ── 1. Load personas ───────────────────────────────────────────────────────
  const personas = loadPersonas(personaSlug)
  if (personas.length === 0) {
    const msg = personaSlug
      ? `No persona found for slug "${personaSlug}" in personas/`
      : 'No persona .md files found in personas/'
    console.error(`❌ ${msg}`)
    process.exit(1)
  }
  console.log(`Personas (${personas.length}): ${personas.map((p) => p.slug).join(', ')}`)
  console.log()

  // ── 2. Collect GitHub context ──────────────────────────────────────────────
  console.log('Collecting GitHub context...')
  const ctx = await collectContext(date)
  console.log()

  // ── 3. Generate + write reports ────────────────────────────────────────────
  if (!isDryRun && !existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true })
  }

  for (const persona of personas) {
    console.log(`Generating report for: ${persona.slug}`)
    const report = await generateReport(ctx, persona)
    const markdown = reportToMarkdown(report)

    if (isDryRun) {
      console.log(`\n${'─'.repeat(72)}`)
      console.log(`Report → ${persona.role}`)
      console.log('─'.repeat(72))
      console.log(markdown)
      console.log('─'.repeat(72) + '\n')
    } else {
      const outPath = join(REPORTS_DIR, `${date}-${persona.slug}.md`)
      writeFileSync(outPath, markdown, 'utf-8')
      console.log(`  Written: _reports/${date}-${persona.slug}.md`)
    }
  }

  console.log(`\n✓ ${isDryRun ? 'Dry run complete — no files written.' : 'Done.'}`)
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err)
  process.exit(1)
})
