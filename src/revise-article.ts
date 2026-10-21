import { revisionActionCycle } from './action-review-cycle.js'
/**
 * Editorial revision script — applies human feedback to a generated article.
 *
 * Standalone entry point: `tsx src/revise-article.ts`
 *
 * Env vars:
 *   ARTICLE_PATH       required — path to the markdown file
 *   EDITORIAL_FEEDBACK  required — the editorial feedback text
 *   ANTHROPIC_API_KEY   required (unless MOCK_LLM=true)
 *   DRY_RUN            "true" → print to stdout, don't write
 *   MOCK_LLM           "true" → return fixture, no API call
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { readActionRegistry, registryRevision, writeActionRegistry, readArticleStatuses, renderArticleActionHtml, stripManagedActions } from './action-registry.js'
import { assertArticleReferenceContract } from './article-references.js'
import { readArticleTime } from './article-time-metadata.js'
import { collectActionSources, createActionAgents, mockActionAgents, reviewProducedDraftActions } from './review-actions.js'
import { persistActionEvidenceResolutions, readActionEvidenceReply } from './action-evidence-retrieval.js'
import { stampOutcome } from './stamp-outcome.js'
import { detachArticleTime, preserveTimeDuringRevision, type RevisionResult } from './article-time-frontmatter.js'
import {
  appendAuthoringStage,
  preserveProvenanceFrontmatter,
  promptSha256,
} from './run-provenance.js'

export const REVISION_MODEL = 'claude-opus-4-6'
export const REVISION_PROMPT_VERSION = 'editorial-revision-v3-single-recommendation-surface'
const MAX_TOKENS = 8192

export const REVISION_SYSTEM_PROMPT = `You are a careful editor revising a daily development blog article for the ojfbot project.

You have received the original article (full markdown including YAML frontmatter) and a set of editorial revision instructions from the human author.

Rules:
1. Apply ONLY the changes described in the editorial feedback. Do not rewrite sections that are not mentioned in the feedback.
2. Preserve the article's voice — first-person plural ("we"), direct, technical, didactic.
3. Keep ALL YAML frontmatter fields intact (including title, date, tags, summary, status, and provenance). Do not modify the status or provenance fields.
4. Preserve the reader-facing prose sections: ## What shipped, ## The decisions, ## Roadmap pulse. Do not create or preserve a ## What's next section or any parallel priority/action list. Preserve relevant facts, evidence gaps and owner gates in Roadmap pulse; the separately managed Suggested actions card is the sole current recommendation surface.
5. Preserve all markdown formatting: GFM links, backtick code references, blockquotes, headings, lists.
6. Return the FULL revised article (not a diff), including the YAML frontmatter delimiters (---).
7. In changesSummary, list each discrete change you made as a short sentence. If a feedback item required no change (e.g., the article already says what was requested), note "No change needed: ..." and explain why.
8. If the feedback is contradictory or unclear, make your best interpretation and note it in changesSummary.`

const REVISE_TOOL: Anthropic.Tool = {
  name: 'revise_article',
  description: 'Return the revised article markdown and a summary of changes made.',
  input_schema: {
    type: 'object' as const,
    properties: {
      revisedMarkdown: {
        type: 'string',
        description: 'The full revised article including YAML frontmatter (--- delimiters). Must be valid markdown.',
      },
      changesSummary: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of short sentences, each describing one discrete change applied. Include "No change needed" notes for feedback items that required no action.',
      },
    },
    required: ['revisedMarkdown', 'changesSummary'],
  },
}

const RevisionResponseSchema = z.object({ revisedMarkdown: z.string().min(1), changesSummary: z.array(z.string()).min(1) })

function mockRevise(original: string): RevisionResult {
  const revised = original.replace(
    /^summary:\s*"(.+)"/m,
    'summary: "[REVISED] $1"',
  )
  return {
    revisedMarkdown: revised,
    changesSummary: ['Mock: prepended [REVISED] marker to summary'],
    changed: revised !== original,
  }
}

async function revise(articleContent: string, feedback: string): Promise<RevisionResult> {
  const client = new Anthropic()

  const userPrompt = `Here is the article to revise:

\`\`\`markdown
${articleContent}
\`\`\`

Here is the editorial feedback to apply:

${feedback}`

  const response = await client.messages.create({
    model: REVISION_MODEL,
    max_tokens: MAX_TOKENS,
    system: REVISION_SYSTEM_PROMPT,
    tools: [REVISE_TOOL],
    tool_choice: { type: 'tool', name: 'revise_article' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use response')
  }

  const input = RevisionResponseSchema.parse(toolBlock.input)
  if (typeof input.revisedMarkdown === 'string') {
    input.revisedMarkdown = preserveProvenanceFrontmatter(articleContent, detachArticleTime(input.revisedMarkdown).markdown)
  }

  if (!input.revisedMarkdown || !input.revisedMarkdown.startsWith('---')) {
    throw new Error('Revised markdown is missing or does not start with YAML frontmatter')
  }

  if (!Array.isArray(input.changesSummary) || input.changesSummary.length === 0) {
    throw new Error('changesSummary is missing or empty')
  }

  const requiredFields = ['title:', 'date:', 'tags:', 'summary:', 'status:']
  for (const field of requiredFields) {
    if (!input.revisedMarkdown.includes(field)) {
      throw new Error(`Revised article is missing frontmatter field: ${field}`)
    }
  }

  return {
    revisedMarkdown: input.revisedMarkdown,
    changesSummary: input.changesSummary,
    changed: input.revisedMarkdown.trim() !== articleContent.trim(),
  }
}

export async function reviseArticle(input: { articleContent: string; feedback: string; mode: 'mock' | 'model'; dryRun: boolean }): Promise<RevisionResult> {
  return preserveTimeDuringRevision({ originalMarkdown: input.articleContent, revise: async (modelMarkdown) => {
    const revision = input.mode === 'mock' ? mockRevise(modelMarkdown) : await revise(modelMarkdown, input.feedback)
    if (revision.changed) {
      revision.revisedMarkdown = appendAuthoringStage(revision.revisedMarkdown, {
        role: 'revision',
        model: input.mode === 'mock' ? 'mock-llm' : REVISION_MODEL,
        promptVersion: input.mode === 'mock' ? 'mock-editorial-revision-v1' : REVISION_PROMPT_VERSION,
        promptSha256: promptSha256(input.mode === 'mock' ? 'daily-logger mock editorial revision v1' : REVISION_SYSTEM_PROMPT),
      })
      if (!input.dryRun) revision.revisedMarkdown = stampOutcome(revision.revisedMarkdown, 'edited')
    }
    return revision
  } })
}

async function main() {
  const articlePath = process.env.ARTICLE_PATH?.trim()
  const feedback = process.env.EDITORIAL_FEEDBACK?.trim()
  const isDryRun = process.env.DRY_RUN === 'true'
  const isMock = process.env.MOCK_LLM === 'true'

  if (!articlePath) {
    console.error('❌ ARTICLE_PATH is not set')
    process.exit(1)
  }

  if (!existsSync(articlePath)) {
    console.error(`❌ Article not found: ${articlePath}`)
    process.exit(1)
  }

  if (!feedback) {
    console.error('❌ EDITORIAL_FEEDBACK is not set or empty')
    process.exit(1)
  }

  if (!isMock && !process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set (and MOCK_LLM is not true)')
    process.exit(1)
  }

  const requestIdentity = process.env.ACTION_REVIEW_REQUEST?.trim()
  if (!requestIdentity) throw new Error('ACTION_REVIEW_REQUEST must identify this logical editorial request; retries retain it')
  const cycle = revisionActionCycle(requestIdentity)
  const actionKeys = (name: string) => (process.env[name] ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const reassessActionKeys = actionKeys('ACTION_REASSESS_KEYS')
  const preserveActionKeys = actionKeys('ACTION_PRESERVE_KEYS')
  const evidenceReplies = actionKeys('ACTION_EVIDENCE_REPLY').map(path => readActionEvidenceReply(resolve(path)))

  const articleContent = readFileSync(articlePath, 'utf-8')

  console.error(`📝 Revising ${articlePath}`)
  console.error(`   Feedback: ${feedback.length} chars`)
  console.error(`   Mode: ${isMock ? 'mock' : 'live'}${isDryRun ? ' (dry run)' : ''}`)

  let result: RevisionResult
  let registryChanged = false

  try {
    result = await reviseArticle({ articleContent, feedback, mode: isMock ? 'mock' : 'model', dryRun: isDryRun })
    const repoRoot = resolve(dirname(resolve(articlePath)), '..')
    const registry = readActionRegistry(repoRoot)
    const articleDate = result.revisedMarkdown.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})/m)?.[1]
    if (!articleDate) throw new Error('Article date is missing')
    const statuses = readArticleStatuses(repoRoot)
    const actions = await reviewProducedDraftActions({ cycle, registry, articleStatuses: statuses, articleDate, markdown: result.revisedMarkdown, feedback,
      collectSources: (draftCandidates, draftCandidateEvidence) => [...(isMock ? [] : collectActionSources({ cycle, registry, articleStatuses: statuses, repoRoot, markdown: result.revisedMarkdown, feedback, reassessActionKeys, preserveActionKeys, draftCandidates, draftCandidateEvidence })), ...evidenceReplies],
      agents: isMock ? mockActionAgents : createActionAgents(), reassessActionKeys, preserveActionKeys, selectedEvidenceProjectionIds: evidenceReplies.map(reply => reply.id), ...(isDryRun ? {} : { repoRoot }) })
    const renderedHtml = renderArticleActionHtml(actions.markdown, actions.registry, articleDate, statuses)
    const evidence = readArticleTime({ repoRoot, date: articleDate, markdown: stripManagedActions(actions.markdown), bindingMarkdown: actions.markdown, renderedHtml })
    const referenceAudit = assertArticleReferenceContract(actions.markdown, evidence.referenceKinds, renderedHtml)
    console.error(`   References: ${referenceAudit.verified} source-verified, ${referenceAudit.unknown} identity-unknown`)
    result.revisedMarkdown = actions.markdown
    result.changed = result.revisedMarkdown.trim() !== articleContent.trim()
    registryChanged = registryRevision(actions.registry) !== registryRevision(registry)
    if (!isDryRun) {
      writeActionRegistry(repoRoot, actions.registry, registryRevision(registry), { path: articlePath, expected: articleContent, next: result.revisedMarkdown, publish: () => writeFileSync(articlePath, result.revisedMarkdown, 'utf8') })
      persistActionEvidenceResolutions(repoRoot, actions.evidenceResolutions)
    }
  } catch (err) {
    console.error(`\n❌ Revision failed: ${err instanceof Error ? err.message : err}`)
    process.exit(2)
  }

  console.error(`\n✓ Revision complete (${result.changed ? 'changes applied' : 'no changes needed'})`)
  for (const change of result.changesSummary) {
    console.error(`  - ${change}`)
  }

  if (!isDryRun && result.changed) {
    // S18 (audit I2): a human-driven revision IS the 'edited' outcome — stamp it mechanically
    // (never via the LLM, whose prompt forbids touching frontmatter).
    console.error(`\n✓ Written to ${articlePath} (outcome: edited)`)
  }

  console.log(JSON.stringify({
    revisedMarkdown: result.revisedMarkdown,
    changesSummary: result.changesSummary,
    changed: result.changed,
    registryChanged,
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\n❌ Fatal:', err)
    process.exit(2)
  })
}
