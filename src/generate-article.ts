import Anthropic from '@anthropic-ai/sdk'
import type { BlogContext, GeneratedArticle } from './types.js'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the technical writer for the ojfbot project — a solo developer building an AI App OS called Frame.

## What ojfbot is building

Frame is a shared shell framework that hosts multiple Claude-powered applications inside a unified, browser-like interface. The three flagship apps are:

- **cv-builder** — AI-powered resume builder with multi-agent orchestration (Orchestrator → Resume Generator → Job Analysis → Tailoring → Skills Gap → Interview Coach agents). The most active repo and CI/CD flagship. Has a production-grade visual regression pipeline: Playwright → pixelmatch → draw.io canvas with embedded screenshots → S3 → GitHub Pages visual dashboard.
- **BlogEngine** — AI-powered blog content creation. This daily-logger publishes articles here. Meta.
- **TripPlanner** — AI trip planning and itinerary management.

Additional repos:
- **shell** — Frame OS. Vite Module Federation host + \`frame-agent\` LLM gateway + K8s manifests. This IS the Phase 1/3 work: the shared shell being extracted and the ShellAgent that will become Frame's AI address bar equivalent. Most architecturally significant repo after cv-builder.
- **node-template** — Dev environment as a product: 23 Claude Code slash commands backed by a TypeScript engine. The \`/techdebt\` command is a self-improving loop that scans for debt, proposes file patches, and applies them. Domain-knowledge docs keep all five apps in context.
- **MrPlug** — Chrome extension for AI UI/UX feedback on localhost pages. Click any DOM element, get AI design analysis with a per-element chat session. Being rebuilt as the dev-tooling companion for Frame.
- **purefoy** — Roger Deakins cinematography knowledge base (Python scraper + podcast transcripts). Roadmap: AI podcast interaction agent inside Frame.
- **daily-logger** — This repo. Generates and commits one blog article per day by sweeping GitHub activity across all ojfbot repos and calling Claude.

## The bigger pitch

The goal is to pitch for a Design Engineer role at The Browser Company (building Dia, an AI-first browser). The argument: "We're building the same thing you're building, one layer down." Dia controls the web through natural language. Frame controls applications through natural language. The header chat input in Frame is Dia's AI bar. The multi-instance app launcher is Dia's tab manager.

The four Samir/TBCoNY pillars — name one in every article:
1. **Assistant-centric architecture** (ShellAgent as organizing primitive)
2. **Tooling for fast iteration** (node-template slash commands, daily-logger, cv-builder eval loop)
3. **Model behavior as design discipline** (evals, prompt versioning as first-class artifacts)
4. **Security as emergent UX** (tool-use confirmations, trusted/untrusted separation)

## Architecture snapshot

All three TypeScript apps share an identical extracted shell:
- IBM Carbon Design System for layout
- Redux Toolkit for navigation + chat + thread state
- Express + Claude API backend, React frontend

**Active roadmap phases:**
1. Extract shared components to \`@ojfbot/shell\` + Storybook (design system source of truth)
2. Figma design system with MCP integration (figma-developer-mcp + bidirectional claude-talk-to-figma-mcp)
3. Header chat command bar — natural language modifies the active app via ShellAgent
4. Multi-instance app launching from the chat bar (replace port-hop navigation)
5. MrPlug rebuilt as Frame's dev companion + CLI element-chat agent (\`ojf inspect <selector>\`)
6. Visual regression CI as A/B testing foundation (same baseline system, variant flag added)
7. purefoy as podcast AI agent inside Frame
8. App definition from the UI (ShellAgent scaffolds + registers new apps via node-template)
9. daily-logger articles published to BlogEngine (this system)

## Tone

- First-person plural ("we built", "we decided", "we're exploring")
- Direct and technical — name the files, patterns, and decisions
- Opinionated — explain the "why" behind architectural choices, not just the "what"
- Honest: distinguish shipped from in-progress from planned
- Aware that this blog is itself a demonstration of AI-native development (the system writes about itself)
- No marketing language, no hype, no "exciting new features"

## Output format

Return a single JSON object — no markdown fences, no preamble, raw JSON only. ALL keys are required.

{
  "title": "string — specific and informative, not clickbait. Example: 'Extracting @ojfbot/shell: what three identical App.tsx files tell you'",
  "tags": ["3-6 lowercase-hyphenated tags"],
  "summary": "One sentence, 15–25 words, plain text for preview cards",
  "lede": "1–3 sentence opening paragraph setting the day's narrative theme. Use empty string on zero-commit days.",
  "whatShipped": "GFM markdown body for the What shipped section. Name specific PRs, commits, files. ONLY reference merged/committed work here — open/in-flight PRs must go in roadmapPulse.",
  "theDecisions": "GFM markdown body for The decisions section — the most important section. Name architectural choices and WHY. Name which TBCoNY/Samir pillar this work demonstrates.",
  "roadmapPulse": "GFM markdown body for Roadmap pulse. Specific phase progress. MUST explicitly reference every open PR from the Open PRs context by [repo] #number as in-flight work — do not omit any.",
  "whatsNext": "GFM markdown body for What's next — the one or two most immediately actionable items.",
  "actions": {
    "whatShipped": ["- \`/skill\` — one sentence action specific to what shipped today"],
    "theDecisions": ["- \`/skill\` — one sentence action specific to a decision made today"],
    "roadmapPulse": ["- \`/skill\` — one sentence action specific to phase progress"],
    "whatsNext": ["- \`/skill\` — the single most immediately actionable follow-up"]
  }
}

Field rules:
- \`actions\`: each sub-key requires 1–3 items. Skill commands: \`/plan-feature\`, \`/techdebt\`, \`/investigate\`, \`/validate\`, \`/adr\`, \`/hardening\`, \`/pr-review\`, \`/roadmap\`, \`/scaffold\`, \`/sweep\`. Use a plain imperative when no skill fits.
- All action items must be specific to that day's actual shipped work or decisions — never generic filler.
- Total word count across lede + four sections combined: 600–900 words.
- Zero-commit days: \`whatShipped\` becomes "What we explored" — architecture deep-dive or tradeoff analysis. Never write filler.`

// ─── Structured article type (what Claude returns) ────────────────────────────

type StructuredArticle = {
  title: string
  tags: string[]
  summary: string
  lede?: string
  whatShipped: string
  theDecisions: string
  roadmapPulse: string
  whatsNext: string
  actions?: {
    whatShipped?: string[]
    theDecisions?: string[]
    roadmapPulse?: string[]
    whatsNext?: string[]
  }
}

// ─── Deterministic body assembly ──────────────────────────────────────────────

/**
 * Assembles the article body from structured Claude output.
 * Section headings and suggested-actions blockquotes are injected by code —
 * Claude only supplies the prose content and action items.
 * This guarantees every article has the required four sections and blockquotes,
 * regardless of what Claude decided to include or omit.
 */
export function assembleBody(s: StructuredArticle): string {
  const formatActions = (acts?: string[]): string => {
    const items =
      acts && acts.length > 0
        ? acts.map((a) => `> ${a.startsWith('- ') ? a : `- ${a}`}`)
        : ['> - `/roadmap` — review this section and queue the next concrete action']
    return ['> **Suggested actions**', ...items].join('\n')
  }

  const sections: Array<[string, string, string[] | undefined]> = [
    ['What shipped', s.whatShipped, s.actions?.whatShipped],
    ['The decisions', s.theDecisions, s.actions?.theDecisions],
    ['Roadmap pulse', s.roadmapPulse, s.actions?.roadmapPulse],
    ["What's next", s.whatsNext, s.actions?.whatsNext],
  ]

  const parts: string[] = []

  if (s.lede?.trim()) {
    parts.push(s.lede.trim(), '')
  }

  for (const [heading, content, acts] of sections) {
    parts.push(`## ${heading}`, '', content.trim(), '', formatActions(acts), '')
  }

  return parts.join('\n').trimEnd()
}

// ─── User prompt builder ──────────────────────────────────────────────────────

export function buildUserPrompt(ctx: BlogContext): string {
  const parts: string[] = [`Generate the daily development blog article for **${ctx.date}**.\n`]

  if (ctx.commits.length > 0) {
    parts.push(`## Commits in last 24h (${ctx.commits.length})`)
    ctx.commits.slice(0, 40).forEach((c) => {
      parts.push(`- [${c.repo}] ${c.message} (${c.hash}, ${c.author})`)
    })
    if (ctx.commits.length > 40) parts.push(`  …and ${ctx.commits.length - 40} more`)
    parts.push('')
  } else {
    parts.push('## Commits in last 24h\n_No commits today._\n')
  }

  if (ctx.mergedPRs.length > 0) {
    parts.push(`## PRs merged in last 7 days (${ctx.mergedPRs.length})`)
    ctx.mergedPRs.slice(0, 15).forEach((pr) => {
      parts.push(
        `- [${pr.repo}] #${pr.number}: ${pr.title} (+${pr.additions}/-${pr.deletions})`
      )
      if (pr.body) parts.push(`  > ${pr.body.slice(0, 200).replace(/\n/g, ' ')}`)
    })
    parts.push('')
  }

  if (ctx.openPRs.length > 0) {
    parts.push(`## Open PRs — in-flight work (${ctx.openPRs.length})`)
    ctx.openPRs.slice(0, 20).forEach((pr) => {
      const draft = pr.draft ? ' [DRAFT]' : ''
      parts.push(`- [${pr.repo}] #${pr.number}${draft}: ${pr.title} (opened ${pr.createdAt.slice(0, 10)})`)
      if (pr.body) parts.push(`  > ${pr.body.slice(0, 200).replace(/\n/g, ' ')}`)
    })
    parts.push('')
  }

  if (ctx.closedIssues.length > 0) {
    parts.push(`## Issues closed in last 7 days (${ctx.closedIssues.length})`)
    ctx.closedIssues.slice(0, 20).forEach((i) => {
      const l = i.labels.length ? ` [${i.labels.join(', ')}]` : ''
      parts.push(`- [${i.repo}] #${i.number}: ${i.title}${l}`)
    })
    parts.push('')
  }

  if (ctx.openIssues.length > 0) {
    parts.push(`## Open issues snapshot (top ${Math.min(ctx.openIssues.length, 25)})`)
    ctx.openIssues.slice(0, 25).forEach((i) => {
      const l = i.labels.length ? ` [${i.labels.join(', ')}]` : ''
      const created = i.createdAt ? ` (opened ${i.createdAt.slice(0, 10)})` : ''
      parts.push(`- [${i.repo}] #${i.number}: ${i.title}${l}${created}`)
    })
    parts.push('')
  }

  if (ctx.projectVision) {
    parts.push('## Project context (ROADMAP.md / CLAUDE.md excerpt)')
    parts.push(ctx.projectVision.slice(0, 1500))
    parts.push('')
  }

  if (ctx.previousArticles.length > 0) {
    parts.push(`## Previous ${ctx.previousArticles.length} articles (continuity context)`)
    ctx.previousArticles.forEach((a) => {
      parts.push(`### ${a.date}\n${a.excerpt}\n`)
    })
  }

  return parts.join('\n')
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export async function generateArticle(ctx: BlogContext): Promise<GeneratedArticle> {
  const client = new Anthropic()

  console.log('  Calling Claude...')
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  // Claude occasionally wraps in ```json fences despite instructions — strip them
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: StructuredArticle | null = null
  try {
    const p = JSON.parse(jsonText) as StructuredArticle
    // Validate required section fields are present
    if (p.whatShipped && p.theDecisions && p.roadmapPulse && p.whatsNext) {
      parsed = p
    }
  } catch {
    // fall through to legacy body fallback below
  }

  if (parsed) {
    return {
      title: parsed.title ?? `ojfbot dev log — ${ctx.date}`,
      date: ctx.date,
      tags: parsed.tags ?? ['dev-log'],
      summary: parsed.summary ?? '',
      body: assembleBody(parsed),
    }
  }

  // Fallback: legacy single-body parse (handles malformed / old-format responses)
  console.warn('  ⚠ Structured JSON parse failed — attempting legacy body fallback')
  let legacy: { title: string; tags: string[]; summary: string; body: string }
  try {
    legacy = JSON.parse(jsonText)
  } catch {
    console.warn('  ⚠ JSON parse failed entirely — using raw response as body')
    legacy = {
      title: `ojfbot dev log — ${ctx.date}`,
      tags: ['dev-log'],
      summary: `Development notes for ${ctx.date}.`,
      body: raw,
    }
  }

  return {
    title: legacy.title ?? `ojfbot dev log — ${ctx.date}`,
    date: ctx.date,
    tags: legacy.tags ?? ['dev-log'],
    summary: legacy.summary ?? '',
    body: legacy.body ?? raw,
  }
}

export function toMarkdown(article: GeneratedArticle): string {
  const esc = (s: string) => s.replace(/"/g, '\\"')

  return [
    '---',
    `title: "${esc(article.title)}"`,
    `date: ${article.date}`,
    `tags: [${article.tags.map((t) => `"${t}"`).join(', ')}]`,
    `summary: "${esc(article.summary)}"`,
    '---',
    '',
    article.body,
    '',
    '---',
    '',
    '*Generated by [daily-logger](https://github.com/ojfbot/daily-logger) — ' +
      'part of the ojfbot self-documenting development system.*',
    '',
  ].join('\n')
}
