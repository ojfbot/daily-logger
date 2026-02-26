/**
 * ojfbot daily-logger
 *
 * Collects 24 h of GitHub activity across all ojfbot repos, feeds it to
 * Claude, and writes a markdown article to articles/YYYY-MM-DD.md.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY    required
 *   GITHUB_TOKEN         required (set automatically in GitHub Actions)
 *   OJFBOT_ORG           default: "ojfbot"
 *   DATE_OVERRIDE        ISO date string, default: today UTC
 *   DRY_RUN              "true" → print article, skip all writes
 *   BLOGENGINE_API_URL   optional: POST to BlogEngine on completion
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { collectContext } from './collect-context.js'
import { generateArticle, toMarkdown } from './generate-article.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const ARTICLES_DIR = join(REPO_ROOT, 'articles')

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
  console.log('1/3  Collecting GitHub context...')
  const ctx = await collectContext(date)
  console.log()

  // ── 2. Generate ────────────────────────────────────────────────────────────
  console.log('2/3  Generating article...')
  const article = await generateArticle(ctx)
  const markdown = toMarkdown(article)
  console.log(`     Title : "${article.title}"`)
  console.log(`     Tags  : ${article.tags.join(', ')}`)
  console.log(`     Words : ~${article.body.split(/\s+/).length}`)
  console.log()

  if (isDryRun) {
    console.log('3/3  DRY RUN — article preview:\n')
    console.log('─'.repeat(72))
    console.log(markdown)
    console.log('─'.repeat(72))
    console.log('\n✓ Dry run complete — no files written.')
    return
  }

  // ── 3. Write ───────────────────────────────────────────────────────────────
  console.log('3/3  Writing article...')

  if (!existsSync(ARTICLES_DIR)) {
    mkdirSync(ARTICLES_DIR, { recursive: true })
  }

  const outPath = join(ARTICLES_DIR, `${date}.md`)
  writeFileSync(outPath, markdown, 'utf-8')
  console.log(`     Written: articles/${date}.md`)

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
