import Anthropic from '@anthropic-ai/sdk'
import type { BlogContext, GeneratedArticle, StructuredArticle } from './types.js'
import type { ArticleDataV2 } from './schema.js'
import { validateArticleOutput, getValidationErrors } from './schema.js'

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
- **gcgcca** — USGS Earth Explorer orthoimagery query tool. Python CLI + TypeScript/React UI (purefoy pattern). Pydantic models → OpenAPI → TypeScript types. Module Federation remote (port 3035) with Express API (port 3036). Frame OS sub-app exposing Dashboard and Settings.
- **daily-logger** — This repo. Generates and commits one blog article per day.
- **landing** — jim.software personal landing page. Masonry portfolio grid, Three.js scroll animations, scroll-driven gradient background. Deployed on Vercel.

## Authoritative dev environment ports (frame-dev.sh)
- shell: :3000
- cv-builder: :3001
- BlogEngine: :3002
- TripPlanner: :3003
- CoreReader: :3015
- gcgcca browser-app: :3035
- gcgcca API: :3036

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

## Action triage

You will receive a list of open actions from previous runs. For each:
1. Check if today's commits, merged PRs, or closed issues address it
2. If resolved: add to \`closedActions\` with a one-sentence \`resolution\` explaining what was done
3. If still open: do NOT re-emit it in \`suggestedActions\` — it carries forward automatically
4. Only emit NEW actions in \`suggestedActions\` — actions specific to today's work
5. Be aggressive about closing stale actions (>7 days old) that are no longer relevant

## Output

Call the \`write_article\` tool with all required fields. Do not add preamble or explanation.

Field rules:
- \`whatShipped\`: GFM markdown. Name specific PRs (#number), commits (7-char hash), files. ONLY reference merged/committed work here — open/in-flight PRs must go in roadmapPulse.
- \`theDecisions\`: The most important section. Explain WHY each architectural choice was made, what alternatives were considered, and what would break if the decision were different. Name which TBCoNY/Samir pillar this demonstrates.
- \`roadmapPulse\`: MUST explicitly reference every open PR from the Open PRs context by [repo] #number as in-flight work — do not omit any. When gcgcca activity is present, validate progress against its milestones in ROADMAP.md and note which architectural requirements (type bridge, Frame OS integration, API contracts, test coverage) are advancing or stalled.
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
- \`theDecisions\`, \`roadmapPulse\`, \`whatsNext\`: same standards as any active development day

## Structured output schema (v2)

You MUST return structured data matching the v2 schema. Key differences from previous format:

### Typed tags
Every tag MUST have a \`type\` field. The 7 tag types:
- **repo**: Repository names — e.g. \`shell\`, \`cv-builder\`, \`daily-logger\`, \`GroupThink\`
- **arch**: Architecture patterns — e.g. \`module-federation\`, \`micro-frontend\`, \`container-presenter\`, \`cross-app-orchestration\`
- **practice**: Development practices — e.g. \`ci-cd\`, \`visual-regression\`, \`adr\`, \`security-scanning\`
- **phase**: Roadmap phases — e.g. \`phase-1\`, \`phase-4\`, \`phase-5b\`
- **activity**: Day-level activity type — e.g. \`rest-day\`, \`hardening\`, \`sprint\`, \`cleanup\`
- **concept**: Design/architecture concepts — e.g. \`assistant-centric\`, \`model-behavior-as-design\`, \`hero-demo\`
- **infra**: Infrastructure — e.g. \`storybook\`, \`s3\`, \`vercel\`, \`github-integration\`

### Structured shipments
\`whatShipped\` is an ARRAY of objects, each with: \`repo\` (string), \`description\` (1-3 sentences), \`commits\` (array of 7-char SHAs or short descriptions), optional \`prs\` (array of "#number" strings). Group by repo.

### Structured decisions
\`decisions\` is an ARRAY of objects, each with: \`title\` (heading), \`summary\` (1-2 sentences), \`repo\` (primary repo), optional \`pillar\` (one of: "assistant-centric", "tooling-for-iteration", "model-behavior-as-design", "security-as-emergent-ux"), \`relatedTags\` (array of tag name strings).

### Structured action items
\`suggestedActions\` is an ARRAY of objects, each with: \`command\` (slash command like /adr, /test-expand, /validate, /doc-refactor, /techdebt, /hardening, /investigate, /sweep, /roadmap, /scaffold, /pr-review), \`description\` (what to do), \`repo\` (where), \`status\` (always "open"), \`sourceDate\` (today's date YYYY-MM-DD).

### Activity type
Classify the day as one of: \`build\` (normal development), \`rest\` (zero/very few commits), \`audit\` (review/audit focus), \`hardening\` (stability/security focus), \`cleanup\` (refactoring/debt), \`sprint\` (high-volume feature work).

### Metadata
- \`commitCount\`: total commits across all repos for this day
- \`reposActive\`: array of repo names that had commits
- \`schemaVersion\`: always 2

## Code reference standards (ADR-0031)

For every backtick-wrapped token in the article body, add a corresponding entry to \`codeReferences\`. Classify each token:

| Type | Pattern | Example |
|------|---------|---------|
| commit | 7-40 char hex string | \`f1e5ba1\` |
| component | PascalCase identifier | \`DashboardLayout\` |
| file | Contains \`.\` with extension or \`/\` | \`vite.config.ts\` |
| package | \`@scope/name\` or hyphenated lib name | \`@ojfbot/frame-ui-components\` |
| command | Starts with \`/\` | \`/scaffold-app\` |
| config | camelCase identifier | \`optimizeDeps\` |
| env | ALL_CAPS with underscores | \`VITE_API_URL\` |
| endpoint | HTTP method + path | \`GET /api/tools\` |
| directory | Ends with \`/\` | \`formulas/\` |

For each reference, include:
- \`text\`: exact string as it appears in backticks
- \`type\`: one of the 9 types above
- \`repo\`: which ojfbot repo this belongs to — REQUIRED for commit, file, directory, component types
- \`path\`: file path within repo (for file/component/directory types)
- \`url\`: resolved GitHub URL — REQUIRED for all types except config, env, endpoint. Use these patterns:
  - commit: \`https://github.com/ojfbot/{repo}/commit/{hash}\`
  - file: \`https://github.com/ojfbot/{repo}/blob/main/{path}\`
  - directory: \`https://github.com/ojfbot/{repo}/tree/main/{path}\`
  - component: \`https://github.com/ojfbot/{repo}/blob/main/{path}\`
  - package: \`https://github.com/ojfbot/{name}\` for @ojfbot/ packages; npm URL otherwise
  - command: \`https://github.com/ojfbot/core/blob/main/.claude/skills/{cmd}/{cmd}.md\` (strip leading /)
- \`meta\`: type-specific metadata (e.g. \`{"pr": "42"}\` for commits with associated PRs)`

// ─── Tool schema (write_article) ─────────────────────────────────────────────
//
// Using tool_use instead of raw JSON prompting guarantees structured output:
// - No JSON fence stripping needed
// - No JSON.parse failure on high-activity days
// - Schema validates required fields at the API layer

const ARTICLE_TOOL_V2: Anthropic.Tool = {
  name: 'write_article',
  description: 'Write the structured daily development blog article (v2 schema) and submit all fields.',
  input_schema: {
    type: 'object',
    properties: {
      schemaVersion: {
        type: 'number',
        description: 'Always 2.',
      },
      title: {
        type: 'string',
        description: 'Specific and informative. Example: "Extracting @ojfbot/shell: what three identical App.tsx files tell you"',
      },
      summary: {
        type: 'string',
        description: 'One sentence, 15–25 words, plain text for preview cards.',
      },
      lede: {
        type: 'string',
        description: '1–3 sentence opening paragraph setting the day\'s narrative theme. Empty string on zero-commit days.',
      },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Lowercase hyphenated tag name.' },
            type: {
              type: 'string',
              enum: ['repo', 'arch', 'practice', 'phase', 'activity', 'concept', 'infra'],
              description: 'Tag type category.',
            },
          },
          required: ['name', 'type'],
        },
        description: '4-8 typed tags. Every tag MUST have a type field.',
      },
      whatShipped: {
        type: 'array',
        description: 'Array of shipment entries grouped by repo. ONLY reference merged/committed work.',
        items: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'Repository name.' },
            description: { type: 'string', description: '1-3 sentences describing what shipped.' },
            commits: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of 7-char SHAs or short commit descriptions.',
            },
            prs: {
              type: 'array',
              items: { type: 'string' },
              description: 'PR numbers like "#42". Optional.',
            },
          },
          required: ['repo', 'description', 'commits'],
        },
      },
      decisions: {
        type: 'array',
        description: 'Array of architectural decisions. The most important section. Name choices and WHY. Explain tradeoffs as if teaching.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Decision heading.' },
            summary: { type: 'string', description: '1-2 sentence summary of the decision and its rationale.' },
            repo: { type: 'string', description: 'Primary repo affected.' },
            pillar: {
              type: 'string',
              enum: ['assistant-centric', 'tooling-for-iteration', 'model-behavior-as-design', 'security-as-emergent-ux'],
              description: 'Which TBCoNY/Samir pillar this demonstrates. Optional.',
            },
            relatedTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Architecture/practice tag names relevant to this decision.',
            },
          },
          required: ['title', 'summary', 'repo', 'relatedTags'],
        },
      },
      roadmapPulse: {
        type: 'string',
        description: 'GFM markdown for Roadmap pulse. MUST explicitly reference every open PR by [repo] #number.',
      },
      whatsNext: {
        type: 'string',
        description: 'GFM markdown for What\'s next — 1-2 most immediately actionable items.',
      },
      suggestedActions: {
        type: 'array',
        description: 'Structured action items with slash command prefixes.',
        items: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Slash command: /adr, /test-expand, /validate, /doc-refactor, /techdebt, /hardening, /investigate, /sweep, /roadmap, /scaffold, /pr-review',
            },
            description: { type: 'string', description: 'What needs to be done.' },
            repo: { type: 'string', description: 'Target repo.' },
            status: { type: 'string', enum: ['open'], description: 'Always "open".' },
            sourceDate: { type: 'string', description: 'Today\'s date YYYY-MM-DD.' },
          },
          required: ['command', 'description', 'repo', 'status', 'sourceDate'],
        },
      },
      closedActions: {
        type: 'array',
        description: 'Actions from previous runs that today\'s work resolved. Include resolution text.',
        items: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Original slash command.' },
            description: { type: 'string', description: 'Original action description.' },
            repo: { type: 'string', description: 'Original target repo.' },
            sourceDate: { type: 'string', description: 'Original date YYYY-MM-DD.' },
            resolution: { type: 'string', description: 'One sentence: what was done to resolve this.' },
          },
          required: ['command', 'description', 'repo', 'sourceDate', 'resolution'],
        },
      },
      commitCount: {
        type: 'number',
        description: 'Total commits across all repos for this day.',
      },
      reposActive: {
        type: 'array',
        items: { type: 'string' },
        description: 'Repo names that had commits today.',
      },
      activityType: {
        type: 'string',
        enum: ['build', 'rest', 'audit', 'hardening', 'cleanup', 'sprint'],
        description: 'Classify the day: build (normal), rest (zero/few commits), audit, hardening, cleanup, sprint (high-volume).',
      },
      codeReferences: {
        type: 'array',
        description: 'Every backtick-wrapped token in the article body, classified by type with source metadata.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Exact text as it appears in backticks.' },
            type: {
              type: 'string',
              enum: ['commit', 'component', 'file', 'package', 'command', 'config', 'env', 'endpoint', 'directory'],
              description: 'Code reference type.',
            },
            repo: { type: 'string', description: 'Source repo name. Omit if ambiguous.' },
            path: { type: 'string', description: 'File path within repo (file/component/directory types).' },
            url: { type: 'string', description: 'Resolved GitHub URL if known.' },
            meta: {
              type: 'object',
              description: 'Type-specific metadata (e.g. {"pr": "42"} for commits).',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['text', 'type'],
        },
      },
    },
    required: [
      'schemaVersion', 'title', 'summary', 'tags', 'whatShipped', 'decisions',
      'roadmapPulse', 'whatsNext', 'suggestedActions', 'commitCount',
      'reposActive', 'activityType',
    ],
  },
}

// ─── Deterministic body assembly ──────────────────────────────────────────────

/**
 * Assembles the article body from structured Claude output.
 * Section headings and suggested-actions blockquotes are injected by code —
 * Claude only supplies the prose content and action items.
 * This guarantees every article has the required four sections and blockquotes,
 * regardless of what Claude decided to include or omit.
 *
 * Handles both v1 (StructuredArticle) and v2 (ArticleDataV2) inputs.
 */
export function assembleBody(s: StructuredArticle | ArticleDataV2): string {
  if ('schemaVersion' in s && s.schemaVersion === 2) {
    return assembleBodyV2(s as ArticleDataV2)
  }
  return assembleBodyV1(s as StructuredArticle)
}

function assembleBodyV1(s: StructuredArticle): string {
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

// ─── PR linkification helpers ─────────────────────────────────────────────────

const GITHUB_ORG = 'ojfbot'

/** Convert "#42" (or "42") to markdown link `[#42](https://github.com/ojfbot/{repo}/pull/42)` */
function linkifyPR(ref: string, repo: string): string {
  const num = ref.replace(/^#/, '')
  const display = ref.startsWith('#') ? ref : `#${ref}`
  return `[${display}](https://github.com/${GITHUB_ORG}/${repo}/pull/${num})`
}

/** Convert `[repo] #N` patterns in free-text GFM to markdown links. */
function linkifyPRRefs(text: string, knownRepos: string[]): string {
  const repoSet = new Set(knownRepos)
  return text.replace(
    /\[(\w[\w-]*)\]\s*#(\d+)/g,
    (match, repo: string, num: string) => {
      if (!repoSet.has(repo)) return match
      return `[${repo}] [#${num}](https://github.com/${GITHUB_ORG}/${repo}/pull/${num})`
    },
  )
}

/** Convert bare `#N` in text to a markdown link using a known repo. */
function linkifyBarePRs(text: string, repo: string): string {
  return text.replace(
    /(?<!\[)#(\d+)(?!\])/g,
    (_m, num: string) => `[#${num}](https://github.com/${GITHUB_ORG}/${repo}/pull/${num})`,
  )
}

function assembleBodyV2(s: ArticleDataV2): string {
  const parts: string[] = []

  const knownRepos = [...new Set([
    ...s.whatShipped.map((sh) => sh.repo),
    ...(s.reposActive ?? []),
  ])]

  if (s.lede?.trim()) {
    parts.push(s.lede.trim(), '')
  }

  // ── What shipped ──
  parts.push('## What shipped', '')
  if (s.whatShipped.length === 0) {
    parts.push('No code committed today. What follows is an audit of in-flight work.', '')
  } else {
    for (const ship of s.whatShipped) {
      const prRefs = ship.prs?.length
        ? ` (${ship.prs.map((pr) => linkifyPR(pr, ship.repo)).join(', ')})`
        : ''
      parts.push(`### ${ship.repo}${prRefs}`, '')
      parts.push(linkifyBarePRs(ship.description.trim(), ship.repo), '')
      if (ship.commits.length > 0) {
        parts.push(ship.commits.map((c) => `- \`${c}\``).join('\n'), '')
      }
    }
  }

  // ── The decisions ──
  parts.push('## The decisions', '')
  if (s.decisions.length === 0) {
    parts.push('No major architectural decisions today.', '')
  } else {
    for (const dec of s.decisions) {
      const pillarBadge = dec.pillar ? ` — *${dec.pillar}*` : ''
      parts.push(`### ${dec.title}${pillarBadge}`, '')
      parts.push(linkifyPRRefs(dec.summary.trim(), knownRepos), '')
      if (dec.relatedTags.length > 0) {
        parts.push(`Tags: ${dec.relatedTags.map((t) => `\`${t}\``).join(', ')}`, '')
      }
    }
  }

  // ── Roadmap pulse ──
  parts.push('## Roadmap pulse', '')
  parts.push(linkifyPRRefs((s.roadmapPulse ?? 'No roadmap update today.').trim(), knownRepos), '')

  // ── What's next ──
  parts.push("## What's next", '')
  parts.push(linkifyPRRefs((s.whatsNext ?? 'Review the roadmap and queue the next action.').trim(), knownRepos), '')

  // ── Suggested actions (unified from suggestedActions array) ──
  const actionLines = s.suggestedActions.length > 0
    ? s.suggestedActions.map((a) => `> - \`${a.command}\` — ${a.description} (${a.repo})`)
    : ['> - `/roadmap` — review phase progress and queue the next concrete action']
  parts.push('> **Suggested actions**', ...actionLines, '')

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

  if (ctx.recentPRs.length > 0) {
    parts.push(`## All PRs active in last 24h — open + closed (${ctx.recentPRs.length})`)
    parts.push('_Comprehensive view: every PR created, updated, or merged in the last 24h across all repos._')
    ctx.recentPRs.slice(0, 30).forEach((pr) => {
      const status = pr.mergedAt ? 'MERGED' : pr.state.toUpperCase()
      const draft = pr.draft ? ' [DRAFT]' : ''
      parts.push(`- [${pr.repo}] #${pr.number} [${status}]${draft}: ${pr.title}`)
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

  if (ctx.openActions.length > 0) {
    parts.push(`## Open actions from previous runs (${ctx.openActions.length})`)
    parts.push('_Review each action against today\'s commits, merged PRs, and closed issues. If today\'s work addressed it, include it in `closedActions` with a resolution. If not, leave it open — it carries forward automatically. Do NOT re-emit open actions in `suggestedActions`._')
    ctx.openActions.forEach((a) => {
      parts.push(`- [${a.sourceDate}] [${a.repo}] \`${a.command}\` — ${a.description}`)
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

// ─── Mock fixture (MOCK_LLM=true) ────────────────────────────────────────────
//
// Exercises the full assembleBody() path without calling the Anthropic API.
// Used in CI smoke tests (pr-check.yml) so we can verify the pipeline
// structure on every PR without burning API credits or needing ANTHROPIC_API_KEY.

const MOCK_ARTICLE_FIXTURE_V2: ArticleDataV2 = {
  schemaVersion: 2,
  date: '2026-01-01',
  title: 'Pipeline smoke test — mock article for CI validation',
  summary: 'Mock article exercising the full tool_use → assembleBody() ��� toMarkdown() path in CI.',
  lede: 'This article was generated by the pipeline smoke test. No real LLM call was made. If you see this in production, something went wrong.',
  tags: [
    { name: 'ci', type: 'practice' },
    { name: 'pipeline', type: 'infra' },
    { name: 'smoke-test', type: 'practice' },
    { name: 'daily-logger', type: 'repo' },
  ],
  whatShipped: [
    {
      repo: 'daily-logger',
      description: 'Pipeline smoke test ran successfully. The `write_article` tool_use path, `assembleBody()`, and `toMarkdown()` all produced valid output.',
      commits: ['mock123'],
    },
  ],
  decisions: [
    {
      title: 'Mock at the LLM layer, not the HTTP layer',
      summary: 'Exercises the real parsing code — assembleBody(), field validation, section assembly — without the API call cost.',
      repo: 'daily-logger',
      pillar: 'tooling-for-iteration',
      relatedTags: ['ci', 'pipeline'],
    },
  ],
  roadmapPulse: 'No open PRs in this mock run. In a real run, every open PR would be listed here by [repo] #number.',
  whatsNext: 'Merge the PR if the smoke test passes. The real pipeline runs at 09:00 UTC.',
  suggestedActions: [
    {
      command: '/validate',
      description: 'Confirm the pipeline smoke test passes in CI before merging.',
      repo: 'daily-logger',
      status: 'open',
      sourceDate: '2026-01-01',
    },
    {
      command: '/roadmap',
      description: 'Review phase progress against the real roadmap.',
      repo: 'daily-logger',
      status: 'open',
      sourceDate: '2026-01-01',
    },
  ],
  commitCount: 1,
  reposActive: ['daily-logger'],
  activityType: 'build',
}

export async function generateArticle(ctx: BlogContext): Promise<GeneratedArticle> {
  // MOCK_LLM=true: return a fixture article, no API call.
  // Used in CI smoke tests — exercises assembleBody() without burning credits.
  if (process.env.MOCK_LLM === 'true') {
    console.log('  [MOCK_LLM] Returning fixture article — no API call made')
    const fixture = { ...MOCK_ARTICLE_FIXTURE_V2, date: ctx.date }
    return {
      title: fixture.title,
      date: ctx.date,
      tags: fixture.tags.map((t) => t.name),
      summary: fixture.summary,
      body: assembleBody(fixture),
    }
  }

  const client = new Anthropic()
  const userPrompt = buildUserPrompt(ctx)

  // ── First attempt ──
  console.log('  Calling Claude (tool_use, v2 schema)...')
  let raw = await callClaudeForArticle(client, userPrompt)

  // Inject date and schemaVersion if Claude omitted them
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (!r.date) r.date = ctx.date
    if (!r.schemaVersion) r.schemaVersion = 2
  }

  let result = validateArticleOutput(raw, ctx.date, userPrompt.slice(0, 1500))

  // ── Retry once with validation errors if v2 failed ──
  if (result.version !== 2) {
    const errors = getValidationErrors(raw)
    if (errors) {
      console.log('  v2 validation failed, retrying with error feedback...')
      const retryPrompt = `${userPrompt}\n\n---\n\n**VALIDATION ERROR — FIX THESE ISSUES:**\n${errors}\n\nReturn corrected JSON matching the v2 schema. Fix ONLY the invalid fields.`
      raw = await callClaudeForArticle(client, retryPrompt)
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>
        if (!r.date) r.date = ctx.date
        if (!r.schemaVersion) r.schemaVersion = 2
      }
      result = validateArticleOutput(raw, ctx.date, userPrompt.slice(0, 1500))
    }
  }

  // ── Build GeneratedArticle from validation result ──
  if (result.version === 2) {
    return {
      title: result.data.title,
      date: ctx.date,
      tags: result.data.tags.map((t) => t.name),
      summary: result.data.summary,
      body: assembleBody(result.data),
      closedActions: result.data.closedActions,
    }
  }

  if (result.version === 1) {
    console.warn('  ⚠ Fell back to v1 schema — article generated with legacy format')
    return {
      title: result.data.title ?? `ojfbot dev log — ${ctx.date}`,
      date: ctx.date,
      tags: result.data.tags ?? ['dev-log'],
      summary: result.data.summary ?? '',
      body: assembleBody(result.data),
    }
  }

  // Stub: last resort — pipeline must never produce zero output
  console.warn('  ⚠ Article generation failed — producing stub article')
  const stub = result.data
  return {
    title: stub.title,
    date: ctx.date,
    tags: ['dev-log', 'generation-failed'],
    summary: stub.summary,
    body: `_(${stub.summary})_\n\n\`\`\`\n${stub.rawContext}\n\`\`\``,
  }
}

async function callClaudeForArticle(
  client: Anthropic,
  userPrompt: string,
): Promise<unknown> {
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [ARTICLE_TOOL_V2],
      tool_choice: { type: 'tool', name: 'write_article' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = message.content.find((b) => b.type === 'tool_use')
    return toolUse ? (toolUse as { type: 'tool_use'; input: unknown }).input : null
  } catch (err) {
    console.error('  ✗ Claude API call failed:', (err as Error).message)
    return null
  }
}

export function toMarkdown(article: GeneratedArticle & { schemaVersion?: number }): string {
  const esc = (s: string) => s.replace(/"/g, '\\"')

  const lines = [
    '---',
    `title: "${esc(article.title)}"`,
    `date: ${article.date}`,
    `tags: [${article.tags.map((t) => `"${t}"`).join(', ')}]`,
    `summary: "${esc(article.summary)}"`,
  ]

  lines.push(`status: "draft"`)

  if (article.schemaVersion) {
    lines.push(`schemaVersion: ${article.schemaVersion}`)
  }

  lines.push(
    '---',
    '',
    article.body,
    '',
    '---',
    '',
    '*Generated by [daily-logger](https://github.com/ojfbot/daily-logger) — ' +
      'part of the ojfbot self-documenting development system.*',
    '',
  )

  return lines.join('\n')
}
