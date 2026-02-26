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
- Body length: 600–900 words

## Output format

Return a single JSON object — no markdown fences, no preamble, raw JSON only:

{
  "title": "string — specific and informative, not clickbait. Example: 'Extracting @ojfbot/shell: what three identical App.tsx files tell you'",
  "tags": ["3-6 lowercase-hyphenated tags"],
  "summary": "One sentence, 15–25 words, plain text for preview cards",
  "body": "Full article body in GitHub-flavored markdown. No title/date/tags in the body — start directly with content."
}

The body must contain these sections (## headings):
- **What shipped** (or "What we worked on" for low-commit days)
- **The decisions** (architecture choices or tradeoffs made — the most important section)
- **Roadmap pulse** (specific phase progress, not vague references to "the plan")
- **What's next** (one concrete next action)

On days with zero commits: write a "thinking day" article — architecture analysis, a tradeoff exploration, or a deep-dive on one specific technical area. Never write filler.`

// ─── User prompt builder ──────────────────────────────────────────────────────

function buildUserPrompt(ctx: BlogContext): string {
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
      parts.push(`- [${i.repo}] #${i.number}: ${i.title}${l}`)
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

  let parsed: { title: string; tags: string[]; summary: string; body: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    console.warn('  ⚠ JSON parse failed — using raw response as body')
    parsed = {
      title: `ojfbot dev log — ${ctx.date}`,
      tags: ['dev-log'],
      summary: `Development notes for ${ctx.date}.`,
      body: raw,
    }
  }

  return {
    title: parsed.title ?? `ojfbot dev log — ${ctx.date}`,
    date: ctx.date,
    tags: parsed.tags ?? ['dev-log'],
    summary: parsed.summary ?? '',
    body: parsed.body ?? raw,
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
