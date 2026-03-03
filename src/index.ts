/**
 * ojfbot daily-logger
 *
 * Four-phase pipeline:
 *   1. Collect  — 24 h of GitHub activity across all ojfbot repos
 *   2. Draft    — Claude generates an initial article
 *   3. Council  — each persona in personas/*.md critiques the draft independently
 *   4. Synthesize + Write — Claude incorporates the council feedback into a final article
 *
 * The council phase adds 1 Claude call per persona plus 1 synthesis call.
 * It is designed for overnight runs. Set SKIP_COUNCIL=true to bypass it.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY    required
 *   GITHUB_TOKEN         required (set automatically in GitHub Actions)
 *   OJFBOT_ORG           default: "ojfbot"
 *   DATE_OVERRIDE        ISO date string, default: today UTC
 *   DRY_RUN              "true" → print article, skip all writes
 *   SKIP_COUNCIL         "true" → skip council review (faster, lower quality)
 *   BLOGENGINE_API_URL   optional: POST to BlogEngine on completion
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { collectContext } from './collect-context.js'
import { generateArticle, toMarkdown } from './generate-article.js'
import { loadPersonas, reviewDraft, synthesizeWithCouncil } from './council.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const ARTICLES_DIR = join(REPO_ROOT, '_articles')

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

async function postToBlogEngine(markdown: string, apiUrl: string): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/v2/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, source: 'daily-logger' }),
    })
    if (!res.ok) {
      console.warn(`  ⚠ BlogEngine POST ${res.status} ${res.statusText}`)
    } else {
      console.log('  ✓ Posted to BlogEngine')
    }
  } catch (err) {
    console.warn(`  ⚠ BlogEngine POST failed: ${(err as Error).message}`)
  }
}

async function main() {
  const date = process.env.DATE_OVERRIDE?.trim().slice(0, 10) || todayUTC()
  const isDryRun = process.env.DRY_RUN === 'true'
  const skipCouncil = process.env.SKIP_COUNCIL === 'true'
  const blogEngineUrl = process.env.BLOGENGINE_API_URL

  console.log(`\n📝 ojfbot daily-logger — ${date}`)
  console.log(`   Mode: ${isDryRun ? 'dry run' : 'live'}`)

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set')
    process.exit(1)
  }
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠  GITHUB_TOKEN not set — private repo data will be skipped')
  }
  console.log()

  // ── 1. Collect ─────────────────────────────────────────────────────────────
  console.log('1/4  Collecting GitHub context...')
  const ctx = await collectContext(date)
  console.log()

  // ── 2. Draft ───────────────────────────────────────────────────────────────
  console.log('2/4  Generating draft article...')
  let article = await generateArticle(ctx)
  console.log(`     Title : "${article.title}"`)
  console.log(`     Words : ~${article.body.split(/\s+/).length}`)
  console.log()

  // ── 3. Council review ──────────────────────────────────────────────────────
  const personas = loadPersonas()

  if (skipCouncil || personas.length === 0) {
    if (skipCouncil) {
      console.log('3/4  Council review skipped (SKIP_COUNCIL=true)')
    } else {
      console.log('3/4  Council review skipped — no personas found in personas/')
    }
    console.log()
  } else {
    console.log(`3/4  Council review — ${personas.length} persona(s) in parallel...`)
    console.log(`     → ${personas.map((p) => p.slug).join(', ')}`)

    // Run all persona reviews concurrently — each reads the draft independently,
    // so there's no dependency between them. With 4 personas, parallel execution
    // takes roughly the same wall-clock time as a single review call.
    const notes = await Promise.all(personas.map((p) => reviewDraft(article, p)))
    console.log()

    // ── 4a. Synthesize ───────────────────────────────────────────────────────
    console.log('4/4  Synthesizing final article with council input...')
    article = await synthesizeWithCouncil(article, notes, ctx)
    console.log(`     Title : "${article.title}"`)
    console.log(`     Words : ~${article.body.split(/\s+/).length}`)
    console.log()
  }

  const markdown = toMarkdown(article)

  if (isDryRun) {
    if (personas.length > 0 && !skipCouncil) {
      console.log('     (Council-reviewed draft)')
    }
    console.log('─'.repeat(72))
    console.log(markdown)
    console.log('─'.repeat(72))
    console.log('\n✓ Dry run complete — no files written.')
    return
  }

  // ── 4b. Write ──────────────────────────────────────────────────────────────
  if (!existsSync(ARTICLES_DIR)) {
    mkdirSync(ARTICLES_DIR, { recursive: true })
  }

  const outPath = join(ARTICLES_DIR, `${date}.md`)
  writeFileSync(outPath, markdown, 'utf-8')
  console.log(`     Written: _articles/${date}.md`)

  if (blogEngineUrl) {
    console.log('     Posting to BlogEngine...')
    await postToBlogEngine(markdown, blogEngineUrl)
  }

  console.log('\n✓ Done.')
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err)
  process.exit(1)
})
