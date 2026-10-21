import { generationActionCycle } from './action-review-cycle.js'
/**
 * ojfbot daily-logger
 *
 * Four-phase pipeline:
 *   1. Collect  — one Chicago reporting interval of GitHub activity across all ojfbot repos
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
 *   DATE_OVERRIDE        ISO date string, default: today in America/Chicago
 *   DRY_RUN              "true" → print article, skip all writes
 *   SKIP_COUNCIL         "true" → skip council review (faster, lower quality)
 *   BLOGENGINE_API_URL   optional: POST to BlogEngine on completion
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { acceptedClosingContinuityTargets, collectContext } from './collect-context.js'
import { currentArticleDate } from './activity-window.js'
import { readActionRegistry, registryRevision, writeActionRegistry, readArticleStatuses, renderArticleActionHtml } from './action-registry.js'
import { collectActionSources, createActionAgents, mockActionAgents, reviewDraftActions } from './review-actions.js'
import {
  ARTICLE_MODEL,
  ARTICLE_PROMPT_VERSION,
  articleSystemPrompt,
  generateArticle,
  toMarkdown,
  buildUserPrompt,
} from './generate-article.js'
import {
  COUNCIL_MODEL,
  COUNCIL_SYNTHESIS_PROMPT_VERSION,
  COUNCIL_SYNTHESIS_SYSTEM_PROMPT,
  loadPersonas,
  reviewDraft,
  synthesizeWithCouncil,
} from './council.js'
import { shouldSkipRun } from './should-skip-run.js'
import { verifyFileExistenceClaims } from './verify-claims.js'
import { checkAnthropicCredits } from './check-anthropic-credits.js'
import { recordsFromContext } from './time-references.js'
import { prepareGeneratedTime, persistGeneratedTime } from './article-time-metadata.js'
import { githubReferenceKinds } from './article-references.js'
import { shipmentStatesFromContext } from './shipment-times.js'
import { issueEventsFromContext } from './issue-times.js'
import {
  buildArticleProvenance,
  captureRunEvidence,
  promptSha256,
  reportArticleProvenance,
  reportRunEvidence,
  type AuthoringStage,
} from './run-provenance.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')

function packageVersion(): string | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'))
    return manifest && typeof manifest === 'object' &&
      'version' in manifest && typeof manifest.version === 'string' &&
      manifest.version.length > 0
      ? manifest.version
      : undefined
  } catch {
    return undefined
  }
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

export async function main() {
  const date = process.env.DATE_OVERRIDE?.trim().slice(0, 10) || currentArticleDate()
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

  // Capture the source run before any network-heavy pipeline work. Even if the
  // context sweep later fails, schedule diagnostics remain in the Actions log.
  const runEvidence = await captureRunEvidence(date)
  reportRunEvidence(runEvidence)
  console.log()

  // ── 1. Collect ─────────────────────────────────────────────────────────────
  console.log('1/4  Collecting GitHub context...')
  const ctx = await collectContext(date)
  const timeCapture = { observedAt: new Date().toISOString(), window: null }
  console.log()

  // ── Skip gate ──────────────────────────────────────────────────────────────
  // Generate only when the window contains a real repository change. The
  // previous article commit and PR, unmerged cleaner PRs, and metadata-only
  // PR updates do not qualify.
  // Bypassed when DRY_RUN or FORCE_RUN is set.
  const forceRun = process.env.FORCE_RUN === 'true'
  if (!forceRun && !isDryRun) {
    const decision = shouldSkipRun(ctx)
    if (decision.skip) {
      console.log(`⏭  Skipping run — ${decision.reason}.`)
      console.log('   Set FORCE_RUN=true to override.')
      return
    }
    console.log(`▶  Generating because: ${decision.reason}`)
  }

  if (process.env.MOCK_LLM !== 'true') {
    await checkAnthropicCredits(process.env.ANTHROPIC_API_KEY)
  }

  // ── 2. Draft ───────────────────────────────────────────────────────────────
  console.log('2/4  Generating draft article...')
  let article = await generateArticle(ctx)
  let synthesisApplied = false
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
    const draft = article
    article = await synthesizeWithCouncil(draft, notes, ctx)
    synthesisApplied = article !== draft
    article.generationMode ??= draft.generationMode
    console.log(`     Title : "${article.title}"`)
    console.log(`     Words : ~${article.body.split(/\s+/).length}`)
    console.log()
  }

  // ── Deterministic fact-check (TD-001, shadow-stage: record, never gate) ────
  // Every concrete claim in the final body (file paths, PR refs, commit SHAs)
  // must appear in the raw collected context. Unverified claims keep the
  // article in "draft" (toMarkdown always emits status: "draft"), add a
  // "verification-flagged" tag, and leave an HTML-comment audit trail in the
  // body — they never block the run.
  const verification = verifyFileExistenceClaims(article.body, buildUserPrompt(ctx))
  if (verification.unverified.length > 0) {
    console.warn(
      `     ⚠ ${verification.unverified.length} unverified claim(s) in article body:\n` +
        verification.unverified.map((c) => `       - ${c}`).join('\n'),
    )
    if (!article.tags.includes('verification-flagged')) {
      article.tags.push('verification-flagged')
    }
    article.body +=
      `\n\n<!-- verification: ${verification.unverified.length} unverified claims: ` +
      `${verification.unverified.join(', ')} -->`
  }

  const generationMode = article.generationMode ?? 'model'
  const draftAttribution = generationMode === 'model'
    ? {
        model: ARTICLE_MODEL,
        promptVersion: ARTICLE_PROMPT_VERSION,
        prompt: articleSystemPrompt(!!ctx.telemetry),
      }
    : generationMode === 'mock'
      ? {
          model: 'mock-llm',
          promptVersion: 'mock-article-v2',
          prompt: 'daily-logger mock article fixture v2',
        }
      : {
          model: 'daily-logger',
          promptVersion: 'generation-failure-stub-v1',
          prompt: 'daily-logger deterministic generation failure stub v1',
        }
  const authoringStages: AuthoringStage[] = [{
    role: 'draft',
    model: draftAttribution.model,
    promptVersion: draftAttribution.promptVersion,
    promptSha256: promptSha256(draftAttribution.prompt),
  }]
  if (synthesisApplied) {
    authoringStages.push({
      role: 'synthesis',
      model: COUNCIL_MODEL,
      promptVersion: COUNCIL_SYNTHESIS_PROMPT_VERSION,
      promptSha256: promptSha256(COUNCIL_SYNTHESIS_SYSTEM_PROMPT),
    })
  }
  const provenance = buildArticleProvenance({
    run: runEvidence,
    stages: authoringStages,
    nodeVersion: process.version,
    packageVersion: packageVersion(),
    runnerOs: process.env.RUNNER_OS,
    runnerArch: process.env.RUNNER_ARCH,
    job: process.env.GITHUB_JOB,
  })
  if (provenance) {
    article.provenance = provenance
    reportArticleProvenance(provenance)
  } else {
    console.warn('::warning title=Article provenance unavailable::Generated article will continue without provenance metadata')
  }

  const registry = readActionRegistry(REPO_ROOT)
  const originalMarkdown = toMarkdown(article)
  const articlePath = join(REPO_ROOT, '_articles', `${date}.md`)
  const previousArticle = existsSync(articlePath) ? readFileSync(articlePath, 'utf8') : null
  const articleStatuses = readArticleStatuses(REPO_ROOT)
  const draftCandidates = article.suggestedActions ?? []
  const actionSources = process.env.MOCK_LLM === 'true' ? [] : collectActionSources({ registry, repoRoot: REPO_ROOT, markdown: originalMarkdown, feedback: '', context: `${buildUserPrompt(ctx)}\nStructured draft candidate evidence hints: ${JSON.stringify(draftCandidates)}`, continuityTargets: acceptedClosingContinuityTargets(ctx.previousArticles) })
  const actionReview = await reviewDraftActions({ cycle: generationActionCycle(), registry, articleStatuses, articleDate: date, markdown: originalMarkdown, feedback: '', draftCandidates, sources: actionSources, agents: process.env.MOCK_LLM === 'true' ? mockActionAgents : createActionAgents() })
  const renderingStatuses = new Map(articleStatuses)
  if (!renderingStatuses.has(date)) renderingStatuses.set(date, 'draft')
  const renderedHtml = renderArticleActionHtml(actionReview.markdown, actionReview.registry, date, renderingStatuses)
  const prepared = prepareGeneratedTime({
    date, markdown: actionReview.markdown, records: recordsFromContext(ctx), capture: timeCapture, renderedHtml,
    referenceKinds: githubReferenceKinds(ctx),
    shipmentStates: shipmentStatesFromContext(ctx, actionReview.markdown),
    issueEvents: issueEventsFromContext(ctx, actionReview.markdown, renderedHtml),
  })
  const markdown = prepared.markdown
  for (const warning of prepared.warnings) console.warn(`::warning::${date}: ${warning}`)
  if (prepared.unresolved.length) console.warn(`     ⚠ ${prepared.unresolved.length} time reference(s) unresolved; left as plain text`)

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
  writeActionRegistry(REPO_ROOT, actionReview.registry, registryRevision(registry), { path: articlePath, expected: previousArticle, next: markdown, publish: () => { persistGeneratedTime({ repoRoot: REPO_ROOT, prepared }) } })
  console.log(`     Written: _articles/${date}.md`)

  if (blogEngineUrl) {
    console.log('     Posting to BlogEngine...')
    await postToBlogEngine(markdown, blogEngineUrl)
  }

  console.log('\n✓ Done.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\n❌ Fatal:', err)
    process.exit(1)
  })
}
