/**
 * Council review phase
 *
 * Loads persona definitions from personas/*.md, runs each one as an
 * independent critic against the draft article, then synthesizes a
 * final polished article that preemptively addresses their questions.
 *
 * Designed for overnight runs — 2-4 extra Claude calls per persona,
 * but the output quality gain is the point.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BlogContext, GeneratedArticle, Persona, CouncilNote } from './types.js'

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
    max_tokens: 1024,
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

// ─── Synthesis phase ──────────────────────────────────────────────────────────
//
// Takes the draft + all council notes and produces a final, polished article
// that preemptively addresses the council's questions where information exists,
// honestly acknowledges known gaps, and sharpens the framing based on what landed.
//
// Returns the same GeneratedArticle shape — drops directly into the write step.

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

  const system = `You are the technical writer for the ojfbot project — the same writer who produced the draft below. You have now received feedback from a panel of trusted expert reviewers, each reading the article through their own professional lens.

Your job is to produce the final, polished version of this article. Incorporate the feedback by:

1. **Preemptively answering questions** where the information is available from the project context. If a reviewer asks "is this live?" and it is, say so clearly in the article.
2. **Honestly acknowledging gaps** that the reviewers flagged where the information isn't available — a sentence of honest acknowledgment is better than silence.
3. **Sharpening the framing** based on what the reviewers said landed well — if something worked, make sure it's prominent.
4. **Preserving the structure** — the final article must still have these sections: What shipped, The decisions, Roadmap pulse, What's next.
5. **Do not add marketing language or fluff** to compensate for gaps. Honest and direct always wins.

The audience for this article is a technical reader who is also evaluating the author as an engineer and systems thinker. Every word should earn its place.

Return the same JSON format as the original:
{
  "title": "string",
  "tags": ["3-6 lowercase-hyphenated tags"],
  "summary": "One sentence, 15–25 words",
  "body": "Full article body in GitHub-flavored markdown. No title/date/tags in body."
}

Raw JSON only — no fences, no preamble.`

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
    `## Project context`,
    ctx.projectVision ? ctx.projectVision.slice(0, 1000) : '',
  ].join('\n')

  console.log('  Synthesizing final article with council input...')
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: { title: string; tags: string[]; summary: string; body: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    console.warn('  ⚠ Synthesis JSON parse failed — falling back to draft')
    return draft
  }

  return {
    title: parsed.title ?? draft.title,
    date: ctx.date,
    tags: parsed.tags ?? draft.tags,
    summary: parsed.summary ?? draft.summary,
    body: parsed.body ?? draft.body,
  }
}
