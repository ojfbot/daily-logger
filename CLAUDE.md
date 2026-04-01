# CLAUDE.md — daily-logger

## What this repo does

`daily-logger` generates one markdown blog article per day by:

1. Sweeping the last 24 h of commits and PRs (both open and closed) across all ojfbot repos via the GitHub API
2. Feeding that context to Claude Sonnet with a project-aware system prompt
3. Committing the resulting article to `articles/YYYY-MM-DD.md`
4. Optionally POSTing the article to BlogEngine's API when `BLOGENGINE_API_URL` is set

The workflow runs on a daily cron at 09:00 UTC and can also be triggered manually with a date override or dry-run flag.

## Project context

Part of the ojfbot stack — see the parent roadmap for the full picture. This repo is intentionally standalone: no pnpm workspace, no monorepo. It has one job and should stay small.

## Development

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and GITHUB_TOKEN

pnpm install

# Dry run (prints article, writes nothing)
pnpm generate:dry

# Live run (writes articles/YYYY-MM-DD.md)
pnpm generate

# Generate for a specific date
DATE_OVERRIDE=2026-02-20 pnpm generate:dry
```

## Source files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — orchestrates collect → generate → write |
| `src/collect-context.ts` | GitHub API sweep via `gh` CLI |
| `src/generate-article.ts` | Claude API call + prompt, JSON → markdown |
| `src/schema.ts` | Zod schemas (ArticleDataV2, ActionItem, CodeReferenceSchema, TypedTag, etc.) |
| `src/types.ts` | Shared TypeScript types |
| `src/build-api.ts` | Generates static JSON API (`api/*.json`) from articles |
| `packages/frontend/` | React SPA (Vite + Redux Toolkit), deployed to Vercel |
| `api/auth/`, `api/github/` | Vercel serverless functions (OAuth, GitHub API proxy) |
| `decisions/adr/` | Architecture Decision Records (local to this repo) |

- **ADR-0031** (`decisions/adr/0031-universal-code-reference-popovers.md`) — Extend popover system to all inline code references with structured data model
- **ADR-0032** (`core/decisions/adr/0032-daily-logger-react-vercel-migration.md`) — Migrate frontend to React + Vercel
- **ADR-0033** — Three-tier confidence threshold for daily-cleaner bot
- **ADR-0034** — Isolated Redux stores per remote, coordinated via FrameBus
- **ADR-0035** — Article status lifecycle and auto-merge overnight PRs
- **ADR-0036** (`decisions/adr/0036-structured-decision-output-for-rich-ui.md`) — Structured decision output for rich UI
- **ADR-0038** — Editorial revision CI workflow

## Adding new repos to the sweep

Edit the `REPOS` array in `src/collect-context.ts`. The sweep is additive — adding a repo costs one batch of `gh api` calls per run.

## Updating the system prompt / project vision

Edit the `SYSTEM_PROMPT` constant in `src/generate-article.ts`. The prompt contains the full ojfbot architectural context and should be kept in sync with the master roadmap.

For longer-lived context (roadmap phases, architectural decisions), add a `ROADMAP.md` to this repo root — `collect-context.ts` reads it preferentially over CLAUDE.md.

## Article format

Articles are committed as `articles/YYYY-MM-DD.md` with YAML frontmatter:

```yaml
---
title: "..."
date: YYYY-MM-DD
tags: ["tag1", "tag2"]
summary: "One sentence preview."
status: "draft" | "published"
---
```

Body sections (enforced by the system prompt):
- `## What shipped`
- `## The decisions`
- `## Roadmap pulse`
- `## What's next`

## Secrets required

Set these in the repo's GitHub Settings → Secrets and variables → Actions:

| Secret | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `GITHUB_TOKEN` | Auto | Provided by Actions; use a PAT for private repos |
| `BLOGENGINE_API_URL` | No | e.g. `https://blog.ojfbot.dev` — enables live publish |

## Deployment

**NEVER deploy directly to production** via CLI (`vercel deploy --prod`, `vercel promote`, etc.).
All production deployments go through the GitHub PR → CI → merge → automated deploy pipeline.
The only exception is `workflow_dispatch` for manual CI triggers.
Local Vercel CLI usage is restricted to preview deploys only.
