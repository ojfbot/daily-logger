# daily-logger

> **Read the live blog: [log.jim.software](https://log.jim.software)**

Part of the [ojfbot](https://github.com/ojfbot) org — building **Frame**, an AI App OS that hosts Claude-powered applications inside a unified, natural-language shell. This repo is Phase 9 of the Frame roadmap: the self-documenting development system.

daily-logger generates one markdown blog article per day by sweeping the last 24 h of commits (and 7 days of PRs/issues, both open and closed) across all Frame stack repos, feeding that context to Claude Sonnet, and opening a draft PR for editorial review. An editorial revision CI workflow then self-reviews the draft. Merging the PR deploys the article to Vercel.

---

## Reading the blog

**https://log.jim.software/**

Each article lives at `/articles/YYYY-MM-DD`.

---

## How it works

```
03:30 America/Chicago cron (or manual dispatch)
  → collect-context.ts   sweeps: commits (24 h), PRs/issues (7 d, open + closed) across all Frame repos
                         injects ROADMAP.md context (~2500 chars) into the prompt
  → generate-article.ts  Claude Sonnet → JSON → markdown
  → index.ts             writes articles/YYYY-MM-DD.md

  → CI: git checkout -b article/YYYY-MM-DD
        git commit + push
        gh pr create --draft  ← structured PR template for editorial review
        editorial revision CI (`pnpm exec tsx`) self-reviews the draft
        auto-merge job merges accepted article PRs for morning draft visibility

  → you: review draft PR + editorial suggestions, edit on the branch if needed, merge to publish

  → deploy-vercel.yml    fires on push to main → Vercel serverless build + deploy
```

Repos swept: eligible repositories discovered from the live `ojfbot` org list (see `src/fleet.ts`). Archived repositories, forks, policy exclusions, and private repositories without a `REPO_NOTES` opt-in are skipped.

Generated article/editorial commits and PRs in `daily-logger` do not make another
run eligible, regardless of author. This covers dated `article/` and `accept/`
branches through their full PR lifecycle. Daily-logger development work still
counts, and excluded publishing activity remains available as context when other
work triggers generation.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1: Collect Context                                        │
│  collect-context.ts — GitHub API sweep across 20+ repos          │
│  Commits (24h) + PRs/Issues (7d) + ROADMAP.md injection         │
│  + Claude Code telemetry aggregation (skill/tool usage)          │
└──────────────┬───────────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2: Draft Article                                          │
│  generate-article.ts — Claude API (Sonnet, 8192 max tokens)     │
│  Structured prompt: 4 required sections + frontmatter            │
│  Telemetry woven into narrative (skills, quality coverage)       │
└──────────────┬───────────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 3: Editorial Council                                      │
│  4 editorial personas review the draft independently             │
│  Each persona: Claude API call (2048 tokens), domain-specific    │
│  critique + structured feedback                                  │
└──────────────┬───────────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 4: Synthesis + Publish                                    │
│  Final article synthesized from council feedback (8192 tokens)   │
│  PR created → editorial revision CI → merge → Vercel deploy     │
└──────────────────────────────────────────────────────────────────┘
```

**Telemetry integration:** The pipeline reads skill and tool telemetry from `~/.claude/*.jsonl` (synced to a `telemetry/daily` branch via `core/scripts/sync-telemetry.sh`). Skill usage, quality coverage, and lint activity are woven into the article narrative — not a separate section.

---

## What this demonstrates

- **Automated content pipeline** — cron trigger, cross-repo context sweep via GitHub API, Claude generation, PR-based editorial review, Vercel deploy on merge
- **Structured AI prompting** — ROADMAP.md context injection (~2500 chars), enforced article schema (frontmatter + 4 required sections), deterministic PR template
- **Observable development** — each day's activity across eligible ojfbot repositories is public at [log.jim.software](https://log.jim.software)

---

## The Frame stack

| Repo | Role |
|---|---|
| [shell](https://github.com/ojfbot/shell) | Frame OS — Vite Module Federation host + `frame-agent` LLM gateway + K8s |
| [cv-builder](https://github.com/ojfbot/cv-builder) | Multi-agent resume builder; CI/CD flagship with visual regression pipeline |
| [BlogEngine](https://github.com/ojfbot/BlogEngine) | AI blog platform; daily-logger publishes here |
| [TripPlanner](https://github.com/ojfbot/TripPlanner) | AI trip planning |
| [core](https://github.com/ojfbot/core) | Workflow framework — 30+ Claude Code skills + TypeScript engine + suggest-skills engine |
| [MrPlug](https://github.com/ojfbot/MrPlug) | Chrome extension for AI UI/UX feedback; Frame dev companion |
| [purefoy](https://github.com/ojfbot/purefoy) | Roger Deakins knowledge base; roadmap: podcast AI agent in Frame |
| [lean-canvas](https://github.com/ojfbot/lean-canvas) | Lean canvas tool |
| [seh-study](https://github.com/ojfbot/seh-study) | SEH study resource |
| [core-reader](https://github.com/ojfbot/core-reader) | Documentation viewer for the core workflow framework |
| [gastown-pilot](https://github.com/ojfbot/gastown-pilot) | Multi-agent coordination dashboard |
| [frame-ui-components](https://github.com/ojfbot/frame-ui-components) | Shared UI component library (Carbon DS) |
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

**Repos are discovered automatically** — `src/fleet.ts` selects eligible repositories from the live `ojfbot` org list at generation time. Public repositories are included unless excluded by policy; private and internal repositories require a `REPO_NOTES` opt-in. There is no manual `REPOS` array.

**Update project context** — edit [`ROADMAP.md`](ROADMAP.md). The "Where we are now" section should be updated weekly. The system prompt lives in [`src/generate-article.ts`](src/generate-article.ts).

---

## Deployment

- Deployed via **Vercel** at [log.jim.software](https://log.jim.software)
- [`deploy-vercel.yml`](.github/workflows/deploy-vercel.yml) fires on push to `main`
- Frontend is a Vercel serverless app

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

## License

MIT

## Frame OS Ecosystem

Part of [Frame OS](https://github.com/ojfbot/shell) — an AI-native application OS.

| Repo | Description |
|------|-------------|
| [shell](https://github.com/ojfbot/shell) | Module Federation host + frame-agent LLM gateway |
| [core](https://github.com/ojfbot/core) | Workflow framework — 30+ skills + TypeScript engine |
| [cv-builder](https://github.com/ojfbot/cv-builder) | AI-powered resume builder with LangGraph agents |
| [blogengine](https://github.com/ojfbot/BlogEngine) | AI blog content creation platform |
| [TripPlanner](https://github.com/ojfbot/TripPlanner) | AI trip planner with 11-phase pipeline |
| [core-reader](https://github.com/ojfbot/core-reader) | Documentation viewer for the core framework |
| [lean-canvas](https://github.com/ojfbot/lean-canvas) | AI-powered lean canvas business model tool |
| [gastown-pilot](https://github.com/ojfbot/gastown-pilot) | Multi-agent coordination dashboard |
| [seh-study](https://github.com/ojfbot/seh-study) | NASA SEH spaced repetition study tool |
| **daily-logger** | **Automated daily dev blog pipeline (this repo)** |
| [purefoy](https://github.com/ojfbot/purefoy) | Roger Deakins cinematography knowledge base |
| [MrPlug](https://github.com/ojfbot/MrPlug) | Chrome extension for AI UI feedback |
| [frame-ui-components](https://github.com/ojfbot/frame-ui-components) | Shared component library (Carbon DS) |
| [capture-agent](https://github.com/ojfbot/capture-agent) | Golf-course capture agent (formerly gcgcca; renamed 2026-07-30) — TX imagery → segmentation model → HF; Pydantic + TypeScript type bridge |
| [fairway](https://github.com/ojfbot/fairway) | Golf digital twin — explorable twin surface (decomposed from mirrorworld 2026-07-30) |
| [switchboard](https://github.com/ojfbot/switchboard) | FastAPI proxy — byte-for-byte SSE passthrough |
| [f1-pit-wall](https://github.com/ojfbot/f1-pit-wall) | F1 pit-wall telemetry surface |
| [f1-substrate](https://github.com/ojfbot/f1-substrate) | F1 data substrate layer |
| [f1-doctrine](https://github.com/ojfbot/f1-doctrine) | F1 question layer — taxonomy and corpus register |
| [lofi-beaver](https://github.com/ojfbot/lofi-beaver) | Lofi beaver game |
| [golf-platform-scripts](https://github.com/ojfbot/golf-platform-scripts) | Golf platform automation scripts |
## Scheduled fallback

Daily Dev Blog requests a 03:30 America/Chicago start. GitHub can deliver scheduled
triggers hours late. A local Codex automation checks once at 04:00 America/Chicago,
using GPT-6 Luna with low reasoning effort to run a deterministic Python check.
The automation only uses the script from merged `main`; it does not execute a PR branch.
It needs the desktop app running, the machine powered on, and working GitHub CLI credentials.

```bash
# Inspect without dispatching.
python3 .github/scripts/daily_blog_schedule.py watchdog

# Dispatch once only when today's live run and article are absent.
python3 .github/scripts/daily_blog_schedule.py watchdog --dispatch
```

The check treats a successful live run, including an intentional no-activity skip,
as complete. Queued or running live runs suppress dispatch. Dry runs and backfills
for other dates do not count. Failures, cancelled runs, ambiguous legacy manual runs,
API/authentication errors, and an orphan article branch require inspection instead of
automatic retries. A dispatch without a returned run ID is uncertain: inspect remote
runs before retrying. Local callers may clear stale `GH_TOKEN` / `GITHUB_TOKEN` variables
to use stored `gh` authentication; CI uses its supplied token.

The workflow serializes runs and checks fresh GitHub state before collection or model
calls. It skips an existing article or successful live run, and can recover a pushed
article branch by opening/reusing its PR without regenerating the article. Closed
article PRs are respected. Dry runs remain available for inspection. Resolve the date
once from the run's creation time in Chicago, then pass it to generation and branch
creation. Successful prior attempts also suppress regeneration when a run is rerun.

Daily Cleaner only follows a successful live run whose `Article ready for cleaner`
step completed. Duplicate, dry-run, and no-article completions do not start another
cleaner. Manual cleaner dispatch remains available. The dependent cleaner inherits
the source article's date, including explicit backfills.

Run the fallback behavior tests with:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_daily_blog_schedule.py' -v
```

### Required PR checks

Default-branch updates require a PR, including automation and administrators, with
no standing bypass. Generated article, editorial and cleaner commits run CI.
Editorial jobs reject changes outside the dated article before running PR code.
Checkout does not persist credentials. Only the final push receives `GH_PAT`, so
updated-head checks run without the extra workflow-run approval required for
`GITHUB_TOKEN` PR events.

The daily-logger server gate requires `Test + pipeline smoke test` and
`Scan for Secrets`, bound to the GitHub Actions app. Both must pass for the PR's
current head before merge. Other repositories retain their own required checks.
Private-repository protection remains pending a supporting GitHub plan.
