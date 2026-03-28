/**
 * Council review phase
 *
 * Loads persona definitions from personas/*.md, runs each one as an
 * independent critic against the draft article, then synthesizes a
 * final polished article that preemptively addresses their questions.
 *
 * Designed for overnight runs — 2-4 extra Claude calls per persona,
 * but the output quality gain is the point.
 *
 * Architecture note: synthesis returns a StructuredArticle routed through
 * assembleBody() — same path as the initial draft. This guarantees every
 * council-reviewed article has the same structural guarantees (section headings,
 * > **Suggested actions** blockquotes) as the initial draft, regardless of what
 * the synthesis Claude call decides to include or omit.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BlogContext, GeneratedArticle, Persona, CouncilNote, StructuredArticle } from './types.js'
import { assembleBody } from './generate-article.js'
import { validateArticleOutput } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../')
const PERSONAS_DIR = join(REPO_ROOT, 'personas')
const MODEL = 'claude-sonnet-4-6'

// ─── Persona loader ───────────────────────────────────────────────────────────

function parsePersonaFile(filePath: string): Persona | null {
  const raw = readFileSync(filePath, 'utf-8')

  // Split on YAML frontmatter delimiters
  const parts = raw.split(/^---\s*$/m)
  if (parts.length < 3) {
    console.warn(`  ⚠ Persona file ${filePath} has no valid frontmatter — skipped`)
    return null
  }

  const frontmatter = parts[1]
  const content = parts.slice(2).join('---').trim()

  const slugMatch = frontmatter.match(/^slug:\s*(.+)$/m)
  const roleMatch = frontmatter.match(/^role:\s*(.+)$/m)

  if (!slugMatch || !roleMatch) {
    console.warn(`  ⚠ Persona file ${filePath} missing slug or role — skipped`)
    return null
  }

  return {
    slug: slugMatch[1].trim(),
    role: roleMatch[1].trim(),
    content,
  }
}

export function loadPersonas(slugFilter?: string): Persona[] {
  if (!existsSync(PERSONAS_DIR)) return []

  return readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !slugFilter || f.replace('.md', '') === slugFilter)
    .map((f) => parsePersonaFile(join(PERSONAS_DIR, f)))
    .filter((p): p is Persona => p !== null)
}

// ─── Review phase ─────────────────────────────────────────────────────────────
//
// Each persona reads the draft independently and returns a pointed critique:
// questions they'd ask, gaps they'd flag, what lands from their POV.

export async function reviewDraft(
  draft: GeneratedArticle,
  persona: Persona,
): Promise<CouncilNote> {
  // MOCK_LLM=true: return a fixture critique, no API call.
  if (process.env.MOCK_LLM === 'true') {
    return {
      personaSlug: persona.slug,
      personaRole: persona.role,
      critique: `**Questions you'd ask**\n- Mock question 1: is the pipeline working correctly?\n- Mock question 2: are all four sections present?\n\n**Gaps you'd flag**\n- Mock gap: this is a smoke test, no real gaps to flag.\n\n**What lands**\n- The mock fixture article structure looks correct.`,
    }
  }

  const client = new Anthropic()

  const system = `You are ${persona.role}. You are a trusted friend and advisor to Jim Green, who is building Frame OS — a shared AI app shell — and targeting a Design Engineer role at The Browser Company.

Your background and how you see the world:

${persona.content}

Jim has sent you a draft of his daily development blog article to review before he publishes it. Read it carefully from your perspective and give him honest, pointed feedback.

Respond with exactly three sections:

**Questions you'd ask** (3-5 questions): Things the article leaves unanswered that you'd want addressed. Be specific — name the exact decision, gap, or claim you're questioning.

**Gaps you'd flag** (2-3 items): Things that should be in the article but aren't, from your specific vantage point. What's missing that would make this more credible or useful to you?

**What lands** (1-2 items): What works and should be preserved. So Jim knows what not to cut.

Be direct. No hedging. This is feedback from someone who wants him to succeed, not someone trying to seem helpful.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [
      {
        role: 'user',
        content: `Here is the draft article for ${draft.date}:\n\n---\n${draft.body}\n---\n\nWhat's your read?`,
      },
    ],
  })

  const critique = message.content[0].type === 'text' ? message.content[0].text : ''

  return {
    personaSlug: persona.slug,
    personaRole: persona.role,
    critique,
  }
}

// ─── Synthesis tool schema ────────────────────────────────────────────────────
//
// The synthesis call uses the same tool_use mechanism as the initial draft
// so the output is guaranteed structured — no JSON fence issues, no partial
// parse, and all fields are schema-validated by the API.

const SYNTHESIS_TOOL: Anthropic.Tool = {
  name: 'write_article',
  description: 'Write the final polished article incorporating council feedback (v2 schema).',
  input_schema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'number', description: 'Always 2.' },
      title: { type: 'string' },
      summary: { type: 'string', description: 'One sentence, 15-25 words' },
      lede: { type: 'string', description: '1-3 sentence opening paragraph. Empty string if none.' },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['repo', 'arch', 'practice', 'phase', 'activity', 'concept', 'infra'] },
          },
          required: ['name', 'type'],
        },
      },
      whatShipped: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            description: { type: 'string' },
            commits: { type: 'array', items: { type: 'string' } },
            prs: { type: 'array', items: { type: 'string' } },
          },
          required: ['repo', 'description', 'commits'],
        },
      },
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            repo: { type: 'string' },
            pillar: { type: 'string', enum: ['assistant-centric', 'tooling-for-iteration', 'model-behavior-as-design', 'security-as-emergent-ux'] },
            relatedTags: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'summary', 'repo', 'relatedTags'],
        },
      },
      roadmapPulse: { type: 'string' },
      whatsNext: { type: 'string' },
      suggestedActions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            description: { type: 'string' },
            repo: { type: 'string' },
            status: { type: 'string', enum: ['open'] },
            sourceDate: { type: 'string' },
          },
          required: ['command', 'description', 'repo', 'status', 'sourceDate'],
        },
      },
      commitCount: { type: 'number' },
      reposActive: { type: 'array', items: { type: 'string' } },
      activityType: { type: 'string', enum: ['build', 'rest', 'audit', 'hardening', 'cleanup', 'sprint'] },
    },
    required: ['schemaVersion', 'title', 'summary', 'tags', 'whatShipped', 'decisions', 'roadmapPulse', 'whatsNext', 'suggestedActions', 'commitCount', 'reposActive', 'activityType'],
  },
}

// ─── Synthesis phase ──────────────────────────────────────────────────────────
//
// Takes the draft + all council notes and produces a final, polished article
// that preemptively addresses the council's questions where information exists,
// honestly acknowledges known gaps, and sharpens the framing based on what landed.
//
// IMPORTANT: synthesis returns a StructuredArticle routed through assembleBody().
// Never assign the raw synthesis body directly — the deterministic assembly step
// is what guarantees section headings and > **Suggested actions** blockquotes.

export async function synthesizeWithCouncil(
  draft: GeneratedArticle,
  notes: CouncilNote[],
  ctx: BlogContext,
): Promise<GeneratedArticle> {
  const client = new Anthropic()

  // Format council feedback as a structured block
  const councilBlock = notes
    .map(
      (n) =>
        `### Reviewer: ${n.personaRole}\n\n${n.critique}`,
    )
    .join('\n\n---\n\n')

  const system = `You are the technical writer and educational narrator for the ojfbot project — the same writer who produced the draft below. You have now received feedback from a panel of trusted expert reviewers, each reading the article through their own professional lens.

Your job is to produce the final, polished version of this article. Incorporate the feedback by:

1. **Preemptively answering questions** where the information is available from the project context. If a reviewer asks "is this live?" and it is, say so clearly in the article.
2. **Honestly acknowledging gaps** that the reviewers flagged where the information isn't available — a sentence of honest acknowledgment is better than silence.
3. **Sharpening the framing** based on what the reviewers said landed well — if something worked, make sure it's prominent.
4. **Deepening the didactic layer**: if a reviewer asked a question that the article doesn't answer, and the answer is knowable, answer it. Explain it as if teaching a developer who is returning to this codebase after two weeks away.
5. **Preserving structure** — the final article must have four sections: What shipped, The decisions, Roadmap pulse, What's next.
6. **Preserving action items** — include 1-3 slash-command action items per section in the \`actions\` field. These must be specific to today's work, not generic filler.
7. **Do not add marketing language or fluff** to compensate for gaps. Honest and direct always wins.

The audience for this article is a technical reader who is also evaluating the author as an engineer and systems thinker. Every word should earn its place.

Output each section as its body text only — no ## headings, those are injected automatically. Use the write_article tool.`

  const userPrompt = [
    `Synthesize the final article for **${ctx.date}**.`,
    '',
    '## Original draft',
    '',
    `Title: "${draft.title}"`,
    `Tags: ${draft.tags.join(', ')}`,
    `Summary: ${draft.summary}`,
    '',
    draft.body,
    '',
    '## Council feedback',
    '',
    councilBlock,
    '',
    '## Project context',
    ctx.projectVision ? ctx.projectVision.slice(0, 1000) : '',
  ].join('\n')

  // MOCK_LLM=true: skip synthesis, return the draft as-is.
  // The draft already went through assembleBody() so structure is guaranteed.
  if (process.env.MOCK_LLM === 'true') {
    console.log('  [MOCK_LLM] Skipping synthesis — returning draft unchanged')
    return draft
  }

  console.log('  Synthesizing final article with council input (tool_use, v2 schema)...')
  let raw: unknown = null
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      tools: [SYNTHESIS_TOOL],
      tool_choice: { type: 'tool', name: 'write_article' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    raw = toolUse ? (toolUse as { type: 'tool_use'; input: unknown }).input : null
  } catch (err) {
    console.error('  ✗ Synthesis API call failed:', (err as Error).message)
  }

  if (!raw) {
    console.warn('  ⚠ Synthesis returned no data — falling back to draft')
    return draft
  }

  // Inject date/schemaVersion if omitted
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>
    if (!r.date) r.date = ctx.date
    if (!r.schemaVersion) r.schemaVersion = 2
  }

  const result = validateArticleOutput(raw, ctx.date)

  if (result.version === 2) {
    return {
      title: result.data.title,
      date: ctx.date,
      tags: result.data.tags.map((t) => t.name),
      summary: result.data.summary,
      body: assembleBody(result.data),
    }
  }

  if (result.version === 1) {
    console.warn('  ⚠ Synthesis fell back to v1 schema')
    return {
      title: result.data.title ?? draft.title,
      date: ctx.date,
      tags: result.data.tags ?? draft.tags,
      summary: result.data.summary ?? draft.summary,
      body: assembleBody(result.data),
    }
  }

  console.warn('  ⚠ Synthesis validation failed — falling back to draft')
  return draft
}
