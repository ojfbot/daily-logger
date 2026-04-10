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
import { readFileSync, writeFileSync, existsSync } from 'fs'

const MODEL = 'claude-opus-4-6'
const MAX_TOKENS = 8192

const SYSTEM_PROMPT = `You are a careful editor revising a daily development blog article for the ojfbot project.

You have received the original article (full markdown including YAML frontmatter) and a set of editorial revision instructions from the human author.

Rules:
1. Apply ONLY the changes described in the editorial feedback. Do not rewrite sections that are not mentioned in the feedback.
2. Preserve the article's voice — first-person plural ("we"), direct, technical, didactic.
3. Keep ALL YAML frontmatter fields intact (title, date, tags, summary, status). Do not modify the status field.
4. Preserve section structure: ## What shipped, ## The decisions, ## Roadmap pulse, ## What's next, and the > **Suggested actions** blockquote.
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

interface RevisionResult {
  revisedMarkdown: string
  changesSummary: string[]
  changed: boolean
}

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
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [REVISE_TOOL],
    tool_choice: { type: 'tool', name: 'revise_article' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use response')
  }

  const input = toolBlock.input as { revisedMarkdown: string; changesSummary: string[] }

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

  const articleContent = readFileSync(articlePath, 'utf-8')

  console.error(`📝 Revising ${articlePath}`)
  console.error(`   Feedback: ${feedback.length} chars`)
  console.error(`   Mode: ${isMock ? 'mock' : 'live'}${isDryRun ? ' (dry run)' : ''}`)

  let result: RevisionResult

  try {
    result = isMock ? mockRevise(articleContent) : await revise(articleContent, feedback)
  } catch (err) {
    console.error(`\n❌ Revision failed: ${err instanceof Error ? err.message : err}`)
    process.exit(2)
  }

  console.error(`\n✓ Revision complete (${result.changed ? 'changes applied' : 'no changes needed'})`)
  for (const change of result.changesSummary) {
    console.error(`  - ${change}`)
  }

  if (!isDryRun && result.changed) {
    writeFileSync(articlePath, result.revisedMarkdown, 'utf-8')
    console.error(`\n✓ Written to ${articlePath}`)
  }

  console.log(JSON.stringify({
    revisedMarkdown: result.revisedMarkdown,
    changesSummary: result.changesSummary,
    changed: result.changed,
  }))
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err)
  process.exit(2)
})
