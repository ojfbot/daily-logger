import Anthropic from '@anthropic-ai/sdk'
import type { BlogContext, GeneratedArticle, StructuredArticle } from './types.js'

const MODEL = 'claude-sonnet-4-6'
// 8 k output budget — enough headroom on high-activity days (64+ commits) to
// avoid mid-response cutoff.
const MAX_TOKENS = 8192

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the technical writer and educational narrator for the ojfbot project — a solo developer building an AI App OS called Frame.

## What ojfbot is building

Frame is a shared shell framework that hosts multiple Claude-powered applications inside a unified, browser-like interface. The three flagship apps are:

- **cv-builder** — AI-powered resume builder with multi-agent orchestration (Orchestrator → Resume Generator → Job Analysis → Tailoring → Skills Gap → Interview Coach agents). The most active repo and CI/CD flagship. Has a production-grade visual regression pipeline: Playwright → pixelmatch → draw.io canvas with embedded screenshots → S3 → GitHub Pages visual dashboard.
- **BlogEngine** — AI-powered blog content creation. This daily-logger publishes articles here. Meta.
- **TripPlanner** — AI trip planning and itinerary management.

Additional repos:
- **shell** — Frame OS. Vite Module Federation host + \`frame-agent\` LLM gateway + K8s manifests. Most architecturally significant repo after cv-builder. **The shell is live at http://frame.jim.software** — a GitHub Pages deployment of \`/shell\` behind a CNAME record. Sub-apps (cv-builder, BlogEngine, TripPlanner) are not yet deployed as Federation remotes against that host. Never say Frame is undeployed or running locally only.
- **core** — (formerly node-template) Dev environment as a product: 23 Claude Code slash commands backed by a TypeScript engine. The \`/techdebt\` command is a self-improving loop that scans for debt, proposes file patches, and applies them.
- **core-reader** — Frame OS metadata dashboard registered as a remote at :3015. Implementation not yet started.
- **MrPlug** — Chrome extension for AI UI/UX feedback on localhost pages.
- **lean-canvas** — Frame OS sub-app for AI-assisted Lean Canvas business model design. Registered as a remote at :3004.
- **seh-study** — NASA SE Handbook study client, Frame OS sub-app. AI-guided study sessions with structured knowledge extraction.
- **GroupThink** — LLM-powered Chrome extension for intelligent tab grouping. Frame-adjacent: demonstrates the same assistant-centric architecture (Pillar 1) applied to the browser chrome layer — the exact layer Dia operates at. Uses Claude to infer semantic relationships between open tabs and auto-organise them.
- **purefoy** — Roger Deakins cinematography knowledge base (Python scraper + podcast transcripts). Roadmap: AI podcast interaction agent inside Frame.
- **daily-logger** — This repo. Generates and commits one blog article per day.

## Authoritative dev environment ports (frame-dev.sh)
- shell: :3000
- cv-builder: :3001
- BlogEngine: :3002
- TripPlanner: :3003
- CoreReader: :3015

Do NOT invent repo names not on the list above. Do NOT fabricate ports.

## The bigger pitch

The goal is to pitch for a Design Engineer role at The Browser Company (building Dia, an AI-first browser). The argument: "We're building the same thing you're building, one layer down." Dia controls the web through natural language. Frame controls applications through natural language.

The four Samir/TBCoNY pillars — name one in every article:
1. **Assistant-centric architecture** (ShellAgent as organizing primitive)
2. **Tooling for fast iteration** (node-template/core slash commands, daily-logger, cv-builder eval loop)
3. **Model behavior as design discipline** (evals, prompt versioning as first-class artifacts)
4. **Security as emergent UX** (tool-use confirmations, trusted/untrusted separation)

## Architecture snapshot

All three TypeScript apps share an identical extracted shell:
- IBM Carbon Design System for layout
- Redux Toolkit for navigation + chat + thread state
- Express + Claude API backend, React frontend

**Active roadmap phases:**
1. Extract shared components to \`@ojfbot/shell\` + Storybook (design system source of truth)
2. Figma design system with MCP integration
3. Header chat command bar — natural language modifies the active app via ShellAgent
4. Multi-instance app launching from the chat bar
5. MrPlug rebuilt as Frame's dev companion + CLI element-chat agent
6. Visual regression CI as A/B testing foundation
7. purefoy as podcast AI agent inside Frame
8. App definition from the UI (ShellAgent scaffolds + registers new apps via core)
9. daily-logger articles published to BlogEngine

## Tone and writing standards

- First-person plural ("we built", "we decided", "we're exploring")
- Direct and technical — name the files, patterns, and decisions
- **Didactic**: Write every architectural decision as if teaching a developer who hasn't touched this codebase in two weeks. Answer: WHY was this chosen? WHAT would break if we did it differently? WHEN does this tradeoff bite you?
- Honest: distinguish shipped from in-progress from planned with explicit clarity
- **Educational callouts** (GFM blockquotes starting with a question): Use \`> **Why X?**\` or \`> **What does this mean in practice?**\` blockquotes to surface the explanation a reader unfamiliar with context would need
- No marketing language, no hype, no "exciting new features"
- Aware that this blog is itself a demonstration of AI-native development

## Action item standards

Action items in the \`actions\` fields must be:
- **Specific**: tied to today's actual shipped work, not generic
- **Executable**: the reader could act on this within 30 minutes of reading
- **Command-linked**: prefer \`/plan-feature\`, \`/techdebt\`, \`/investigate\`, \`/validate\`, \`/adr\`, \`/hardening\`, \`/pr-review\`, \`/roadmap\`, \`/scaffold\`, \`/sweep\` when applicable. Use plain imperative when no skill fits.
- Never filler. If you can't find a specific action, name the concrete next step in plain English.

## Output

Call the \`write_article\` tool with all required fields. Do not add preamble or explanation.

Field rules:
- \`whatShipped\`: GFM markdown. Name specific PRs (#number), commits (7-char hash), files. ONLY reference merged/committed work here — open/in-flight PRs must go in roadmapPulse.
- \`theDecisions\`: The most important section. Explain WHY each architectural choice was made, what alternatives were considered, and what would break if the decision were different. Name which TBCoNY/Samir pillar this demonstrates.
- \`roadmapPulse\`: MUST explicitly reference every open PR from the Open PRs context by [repo] #number as in-flight work — do not omit any.
- \`whatsNext\`: 1-2 items. Immediately actionable. The reader should be able to start in the next 30 minutes.
- Total word count across lede + four sections: 800–1200 words.
- Zero-commit days: \`whatShipped\` becomes "What we explored" — architecture deep-dive or tradeoff analysis. Never write filler.

## Day naming

The article \`date\` is the date the generator runs (09:00 UTC). The article covers the 24h commit window **ending** at that time — it documents **the previous calendar day's** work. The user prompt provides the previous day name explicitly. Use it in the title and prose. If the run date is a Sunday, the work window was Saturday — write "Saturday", not "Sunday".

## Rest days

Zero-commit days (weekends, holidays, deliberate rest) are expected and must be handled gracefully:
- Never apologise for or frame a rest day as a problem
- Use the window as a focused audit: review open PRs, surface the critical-path blocker, document a deferred tradeoff
- \`lede\`: set the reading/audit frame directly — e.g. "No commits Saturday. That's not a gap — it's a reading day."
- \`whatShipped\`: open with "No code committed [day]. What follows is…" then an architectural deep-dive or open PR audit. Never write filler.
- \`theDecisions\`, \`roadmapPulse\`, \`whatsNext\`: same standards as any active development day`

// ─── Tool schema (write_article) ─────────────────────────────────────────────
//
// Using tool_use instead of raw JSON prompting guarantees structured output:
// - No JSON fence stripping needed
// - No JSON.parse failure on high-activity days
// - Schema validates required fields at the API layer

const ARTICLE_TOOL: Anthropic.Tool = {
  name: 'write_article',
  description: 'Write the structured daily development blog article and submit all fields.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Specific and informative. Example: "Extracting @ojfbot/shell: what three identical App.tsx files tell you"',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '3-6 lowercase-hyphenated tags',
      },
      summary: {
        type: 'string',
        description: 'One sentence, 15–25 words, plain text for preview cards',
      },
      lede: {
        type: 'string',
        description: '1–3 sentence opening paragraph setting the day\'s narrative theme. Empty string on zero-commit days.',
      },
      whatShipped: {
        type: 'string',
        description: 'GFM markdown body for the What shipped section. Name specific PRs, commits, files. ONLY reference merged/committed work here.',
      },
      theDecisions: {
        type: 'string',
        description: 'GFM markdown body for The decisions section — the most important section. Name architectural choices and WHY. Explain the tradeoffs as if teaching. Name which TBCoNY/Samir pillar this demonstrates.',
      },
      roadmapPulse: {
        type: 'string',
        description: 'GFM markdown body for Roadmap pulse. Specific phase progress. MUST explicitly reference every open PR by [repo] #number.',
      },
      whatsNext: {
        type: 'string',
        description: 'GFM markdown body for What\'s next — 1-2 most immediately actionable items.',
      },
      actions: {
        type: 'object',
        description: 'Suggested slash-command actions for each section',
        properties: {
          whatShipped: {
            type: 'array',
            items: { type: 'string' },
            description: '1-3 slash command action items specific to what shipped today',
          },
          theDecisions: {
            type: 'array',
            items: { type: 'string' },
            description: '1-3 slash command action items specific to decisions made today',
          },
          roadmapPulse: {
            type: 'array',
            items: { type: 'string' },
            description: '1-3 slash command action items specific to phase progress',
          },
          whatsNext: {
            type: 'array',
            items: { type: 'string' },
            description: '1-2 slash command action items for the most immediately actionable follow-up',
          },
        },
        required: ['whatShipped', 'theDecisions', 'roadmapPulse', 'whatsNext'],
      },
    },
    required: ['title', 'tags', 'summary', 'lede', 'whatShipped', 'theDecisions', 'roadmapPulse', 'whatsNext', 'actions'],
  },
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

/**
 * Groups commits by repo and returns a summarised string.
 * Used when total commit count exceeds COMMIT_GROUP_THRESHOLD to keep the user
 * prompt manageable on high-activity days without losing per-repo signal.
 */
function groupCommitsByRepo(commits: BlogContext['commits']): string {
  const byRepo = new Map<string, typeof commits>()
  for (const c of commits) {
    if (!byRepo.has(c.repo)) byRepo.set(c.repo, [])
    byRepo.get(c.repo)!.push(c)
  }
  const lines: string[] = []
  for (const [repo, cs] of byRepo) {
    // Show up to 6 representative commits per repo; surface the rest as a count
    const shown = cs.slice(0, 6)
    const extra = cs.length - shown.length
    lines.push(`**${repo}** (${cs.length} commits):`)
    shown.forEach((c) => lines.push(`  - ${c.message} (${c.hash})`))
    if (extra > 0) lines.push(`  …and ${extra} more`)
  }
  return lines.join('\n')
}

// When a day has more commits than this, switch to grouped repo summaries
// rather than a flat list so the user prompt stays under ~3 k tokens.
const COMMIT_GROUP_THRESHOLD = 30

/** Returns the full name of the day-of-week for the date string (YYYY-MM-DD). */
function dayOfWeek(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

export function buildUserPrompt(ctx: BlogContext): string {
  // The run date is today (when the generator fires). The commit window covers
  // the previous 24h, so the article documents the *previous* calendar day.
  const runDate = new Date(`${ctx.date}T12:00:00Z`)
  const prevDate = new Date(runDate)
  prevDate.setUTCDate(prevDate.getUTCDate() - 1)
  const prevDay = prevDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const zeroCommit = ctx.commits.length === 0

  const parts: string[] = [
    `Generate the daily development blog article for **${ctx.date}** (run date: ${dayOfWeek(ctx.date)}).`,
    `The 24h commit window covers **${prevDay}**'s work — use "${prevDay}" when naming the day in the title and prose, not "${dayOfWeek(ctx.date)}".`,
    zeroCommit ? `This is a **rest/reading day** — no commits in the window. Follow the Rest days guidelines from the system prompt.` : '',
    '',
  ].filter((l) => l !== undefined)

  if (ctx.commits.length > 0) {
    const total = ctx.commits.length
    parts.push(`## Commits in last 24h (${total})`)
    if (total > COMMIT_GROUP_THRESHOLD) {
      // High-activity day: group by repo to keep prompt size manageable
      parts.push(
        `_High-activity day — commits grouped by repo. Write repo-level summaries._`
      )
      parts.push(groupCommitsByRepo(ctx.commits))
    } else {
      ctx.commits.slice(0, 40).forEach((c) => {
        parts.push(`- [${c.repo}] ${c.message} (${c.hash}, ${c.author})`)
      })
      if (total > 40) parts.push(`  …and ${total - 40} more`)
    }
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
    const newIssues = ctx.openIssues.filter((i) => i.isNew)
    const existingIssues = ctx.openIssues.filter((i) => !i.isNew)

    if (newIssues.length > 0) {
      parts.push(`## New issues — created in last 24h (${newIssues.length})`)
      parts.push('_These are newly filed and have not appeared in a previous article. Include them in roadmapPulse and whatsNext where relevant._')
      newIssues.forEach((i) => {
        const l = i.labels.length ? ` [${i.labels.join(', ')}]` : ''
        parts.push(`- [${i.repo}] #${i.number}: ${i.title}${l}`)
        if (i.body) parts.push(`  > ${i.body.replace(/\n/g, ' ').slice(0, 800)}`)
      })
      parts.push('')
    }

    if (existingIssues.length > 0) {
      parts.push(`## Open issues snapshot (${existingIssues.length} existing)`)
      existingIssues.slice(0, 20).forEach((i) => {
        const l = i.labels.length ? ` [${i.labels.join(', ')}]` : ''
        const created = i.createdAt ? ` (opened ${i.createdAt.slice(0, 10)})` : ''
        parts.push(`- [${i.repo}] #${i.number}: ${i.title}${l}${created}`)
        if (i.body) parts.push(`  > ${i.body.replace(/\n/g, ' ')}`)
      })
      parts.push('')
    }
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

// ─── Mock fixture (MOCK_LLM=true) ────────────────────────────────────────────
//
// Exercises the full assembleBody() path without calling the Anthropic API.
// Used in CI smoke tests (pr-check.yml) so we can verify the pipeline
// structure on every PR without burning API credits or needing ANTHROPIC_API_KEY.

const MOCK_ARTICLE_FIXTURE: StructuredArticle = {
  title: 'Pipeline smoke test — mock article for CI validation',
  tags: ['ci', 'mock', 'pipeline', 'smoke-test'],
  summary: 'Mock article exercising the full tool_use → assembleBody() → toMarkdown() path in CI.',
  lede: 'This article was generated by the pipeline smoke test. No real LLM call was made. If you see this in production, something went wrong.',
  whatShipped: 'Pipeline smoke test ran successfully. The `write_article` tool_use path, `assembleBody()`, and `toMarkdown()` all produced valid output from a fixture `StructuredArticle`.',
  theDecisions: 'Mocking at the LLM layer (not the HTTP layer) exercises the real parsing code — `assembleBody()`, field validation, section assembly — without the API call cost. Pillar 2 — Tooling for fast iteration: the smoke test gives the build fast feedback on structural regressions before they reach the scheduled cron.',
  roadmapPulse: 'No open PRs in this mock run. In a real run, every open PR would be listed here by [repo] #number.',
  whatsNext: 'Merge the PR if the smoke test passes. The real pipeline runs at 09:00 UTC.',
  actions: {
    whatShipped: ['- `/validate` — confirm the pipeline smoke test passes in CI before merging'],
    theDecisions: ['- `/techdebt` — scan for any remaining quality gaps in the pipeline'],
    roadmapPulse: ['- `/roadmap` — review phase progress against the real roadmap'],
    whatsNext: ['- `/validate` — run the full quality gate before merging to main'],
  },
}

export async function generateArticle(ctx: BlogContext): Promise<GeneratedArticle> {
  // MOCK_LLM=true: return a fixture article, no API call.
  // Used in CI smoke tests — exercises assembleBody() without burning credits.
  if (process.env.MOCK_LLM === 'true') {
    console.log('  [MOCK_LLM] Returning fixture article — no API call made')
    return {
      title: MOCK_ARTICLE_FIXTURE.title,
      date: ctx.date,
      tags: MOCK_ARTICLE_FIXTURE.tags,
      summary: MOCK_ARTICLE_FIXTURE.summary,
      body: assembleBody(MOCK_ARTICLE_FIXTURE),
    }
  }

  const client = new Anthropic()

  console.log('  Calling Claude (tool_use)...')
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [ARTICLE_TOOL],
    tool_choice: { type: 'tool', name: 'write_article' },
    messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
  })

  // With tool_choice: {type: 'tool'}, the API guarantees a tool_use block.
  // This eliminates JSON.parse failures, markdown fence stripping, and
  // the legacy body fallback path that loses action blockquotes.
  const toolUse = message.content.find((b) => b.type === 'tool_use')
  const parsed = toolUse ? (toolUse as { type: 'tool_use'; input: StructuredArticle }).input : null

  if (parsed && parsed.whatShipped && parsed.theDecisions && parsed.roadmapPulse && parsed.whatsNext) {
    return {
      title: parsed.title ?? `ojfbot dev log — ${ctx.date}`,
      date: ctx.date,
      tags: parsed.tags ?? ['dev-log'],
      summary: parsed.summary ?? '',
      body: assembleBody(parsed),
    }
  }

  // Should never reach here with tool_choice: {type: 'tool'}, but log and
  // produce a minimal safe fallback so CI doesn't fail hard on article-write.
  console.warn('  ⚠ tool_use block missing or incomplete — check API response')
  return {
    title: `ojfbot dev log — ${ctx.date}`,
    date: ctx.date,
    tags: ['dev-log'],
    summary: `Development notes for ${ctx.date}.`,
    body: '_(Article generation failed — no tool_use block returned. Check daily-logger CI logs.)_',
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
