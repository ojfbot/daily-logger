# daily-logger

Part of the [ojfbot](https://github.com/ojfbot) org — building **Frame**, an AI App OS that hosts Claude-powered applications inside a unified, natural-language shell. This repo is Phase 9 of the Frame roadmap: the self-documenting development system.

daily-logger generates one markdown blog article per day by sweeping the last 24 h of commits (and 7 days of PRs/issues) across all Frame stack repos, feeding that context to Claude Sonnet, and opening a draft PR for editorial review. Merging the PR publishes the article to GitHub Pages via Jekyll.

---

## Reading the blog

**https://ojfbot.github.io/daily-logger/**

Each article lives at `/articles/YYYY-MM-DD/`.

---

## How it works

```
09:00 UTC cron (or manual dispatch)
  → collect-context.ts   sweeps: commits (24 h), PRs/issues (7 d) across all Frame repos
                         injects ROADMAP.md context (~2500 chars) into the prompt
  → generate-article.ts  Claude Sonnet → JSON → markdown
  → index.ts             writes articles/YYYY-MM-DD.md

  → CI: git checkout -b article/YYYY-MM-DD
        git commit + push
        gh pr create --draft  ← structured PR template for editorial review

  → you: review draft PR, edit on the branch if needed, merge to publish

  → deploy-pages.yml     fires on push to main → Jekyll build → GitHub Pages
```

Repos swept: `shell`, `cv-builder`, `BlogEngine`, `TripPlanner`, `node-template`, `MrPlug`, `purefoy`, `daily-logger`.

---

## The Frame stack

| Repo | Role |
|---|---|
| [shell](https://github.com/ojfbot/shell) | Frame OS — Vite Module Federation host + `frame-agent` LLM gateway + K8s |
| [cv-builder](https://github.com/ojfbot/cv-builder) | Multi-agent resume builder; CI/CD flagship with visual regression pipeline |
| [BlogEngine](https://github.com/ojfbot/BlogEngine) | AI blog platform; daily-logger publishes here |
| [TripPlanner](https://github.com/ojfbot/TripPlanner) | AI trip planning |
| [node-template](https://github.com/ojfbot/node-template) | Dev environment as a product — 23 Claude Code slash commands |
| [MrPlug](https://github.com/ojfbot/MrPlug) | Chrome extension for AI UI/UX feedback; Frame dev companion |
| [purefoy](https://github.com/ojfbot/purefoy) | Roger Deakins knowledge base; roadmap: podcast AI agent in Frame |
| **daily-logger** | This repo — self-documenting dev system |

---

## Development

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and a GITHUB_TOKEN with read access to ojfbot repos

pnpm install

# Dry run — prints article to stdout, writes nothing
pnpm generate:dry

# Live run — writes articles/YYYY-MM-DD.md
pnpm generate

# Generate for a specific date
DATE_OVERRIDE=2026-02-20 pnpm generate:dry
```

**Requirements:** Node ≥ 24, pnpm 9, `gh` CLI authenticated.

---

## Source files

| File | Purpose |
|---|---|
| [`src/index.ts`](src/index.ts) | Entry point — orchestrates collect → generate → write |
| [`src/collect-context.ts`](src/collect-context.ts) | GitHub API sweep via `gh` CLI; reads `ROADMAP.md` for prompt context |
| [`src/generate-article.ts`](src/generate-article.ts) | Claude API call + system prompt, JSON → markdown |
| [`src/types.ts`](src/types.ts) | Shared TypeScript types |
| [`ROADMAP.md`](ROADMAP.md) | Living roadmap — first ~2500 chars injected into every generation prompt |
| [`.github/scripts/build_pr_body.py`](.github/scripts/build_pr_body.py) | Builds the deterministic draft PR body from article frontmatter |

---

## Article format

```yaml
---
title: "..."
date: YYYY-MM-DD
tags: ["tag1", "tag2"]
summary: "One sentence preview."
---
```

Required body sections: `## What shipped`, `## The decisions`, `## Roadmap pulse`, `## What's next`.

---

## Customisation

**Add repos to the sweep** — edit the `REPOS` array in [`src/collect-context.ts`](src/collect-context.ts). Run `gh repo list ojfbot` to audit.

**Update project context** — edit [`ROADMAP.md`](ROADMAP.md). The "Where we are now" section should be updated weekly. The system prompt lives in [`src/generate-article.ts`](src/generate-article.ts).

---

## GitHub Pages setup

- Source: **GitHub Actions** (Settings → Pages → Source → GitHub Actions)
- [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) fires on every push to `main`
- Articles are a Jekyll collection in `articles/`; config in [`_config.yml`](_config.yml)

---

## Secrets

| Secret | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `GH_PAT` | Yes | PAT with read access to all ojfbot repos (for cross-repo sweep) |
| `GITHUB_TOKEN` | Auto | Provided by Actions; used for branch push and PR creation |
| `BLOGENGINE_API_URL` | No | e.g. `https://blog.ojfbot.dev` — enables live publish to BlogEngine |

---

## Manual dispatch

**Actions → Daily Dev Blog → Run workflow**

| Input | Notes |
|---|---|
| `date_override` | Generate for a past date (`YYYY-MM-DD`) |
| `dry_run` | Print article to logs without writing, committing, or opening a PR |
