/**
 * ojfbot daily-cleaner entry point
 *
 * Runs after daily-logger (typically 11:00 UTC). Three phases:
 *   1. Sweep  — find candidates (TODOs in changed files + full doc files for active repos)
 *   2. Validate — Claude Opus validates each candidate rigorously (slow — overnight safe)
 *   3. PR     — one PR per affected repo with specific line edits
 *
 * Env vars:
 *   ANTHROPIC_API_KEY    required
 *   GITHUB_TOKEN / GH_TOKEN  required (auto in CI via GH_PAT)
 *   OJFBOT_ORG           default: "ojfbot"
 *   DATE_OVERRIDE        ISO date string, default: today UTC
 *   DRY_RUN              "true" → print proposals, no PRs
 *   TARGET_REPO          Only sweep this repo slug (e.g. "shell"). Default: all active.
 */

import { collectContext } from './collect-context.js'
import {
  loadStructuredContext,
  sweepForCandidates,
  validateCandidates,
  openCleanPRs,
} from './cleaner.js'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const date = process.env.DATE_OVERRIDE?.trim().slice(0, 10) || todayUTC()
  const isDryRun = process.env.DRY_RUN === 'true'
  const targetRepo = process.env.TARGET_REPO?.trim() || undefined
  const org = process.env.OJFBOT_ORG ?? 'ojfbot'

  console.log(`\n🧹 ojfbot daily-cleaner — ${date}`)
  console.log(`   Mode: ${isDryRun ? 'dry run' : 'live'}`)
  if (targetRepo) console.log(`   Target: ${targetRepo}`)

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set')
    process.exit(1)
  }
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    console.warn('⚠  No GitHub token — sweep will fail for private repos')
  }
  console.log()

  // ── 1. Collect context ────────────────────────────────────────────────────────
  console.log('1/3  Collecting GitHub activity context...')
  let ctx = await collectContext(date)

  // If TARGET_REPO is set, narrow the context so only that repo is swept
  if (targetRepo) {
    ctx = {
      ...ctx,
      commits: ctx.commits.filter((c) => c.repo === targetRepo),
    }
  }

  if (ctx.commits.length === 0) {
    console.log('     No recent commits found — nothing to sweep.')
    console.log('\n✓ Done (no activity).')
    return
  }

  // Load structured context from api/ files (entries, actions, done-actions).
  // Falls back to raw article via GitHub API if structured data is unavailable.
  const cleanCtx = loadStructuredContext(date, org)
  if (cleanCtx.recentEntries.length > 0) {
    console.log(`     Structured context: ${cleanCtx.recentEntries.length} entries, ${cleanCtx.openActions.length} open actions, ${cleanCtx.doneActions.length} done actions`)
  } else if (cleanCtx.rawArticleFallback) {
    console.log(`     Fallback: raw article loaded (${cleanCtx.rawArticleFallback.length} chars)`)
  } else {
    console.log('     No structured context or article found — validation will rely on commits only')
  }
  console.log()

  // ── 2. Sweep ──────────────────────────────────────────────────────────────────
  console.log('2/3  Sweeping for candidates...')
  const candidates = await sweepForCandidates(ctx)
  console.log()

  if (candidates.length === 0) {
    console.log('     No candidates found.')
    console.log('\n✓ Done (no candidates).')
    return
  }

  // ── 3. Validate ───────────────────────────────────────────────────────────────
  console.log(`3/3  Validating ${candidates.length} candidate(s) with Claude Opus...`)
  console.log('     (This is the slow phase — each call is rigorous.)')
  const proposals = await validateCandidates(candidates, cleanCtx)
  console.log()

  if (proposals.length === 0) {
    console.log('     No stale items confirmed — no PRs needed.')
    console.log('\n✓ Done (nothing stale).')
    return
  }

  // ── 4. Open PRs ───────────────────────────────────────────────────────────────
  await openCleanPRs(proposals, date, org, isDryRun)

  if (isDryRun) {
    console.log('\n✓ Dry run complete — no PRs opened.')
  } else {
    console.log('\n✓ Done.')
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err)
  process.exit(1)
})
