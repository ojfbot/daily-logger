# CLAUDE.md — daily-logger

## What this repo does

`daily-logger` generates one markdown blog article per day by:

1. Sweeping the last 24 h of commits (and 7 days of PRs/issues) across all ojfbot repos via the GitHub API
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
| `src/types.ts` | Shared TypeScript types |

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
