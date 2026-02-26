---
name: daily-logger
description: >
  Context briefing for the daily-logger repo. Trigger: "daily-logger", "how does this
  repo work", "orient me", "what's the pipeline", "how do I add a persona", or any time
  a new Claude instance needs to get productive in this codebase quickly.
  Outputs a dense technical briefing — no file modifications.
---

# daily-logger — Architecture Briefing

You are working in `daily-logger`, one component of the ojfbot stack. Read this before
touching anything.

---

## What this repo does

Runs nightly at 09:00 UTC. Sweeps the last 24h of commits (and 7d of PRs/issues) across
all ojfbot repos via the GitHub API, runs that context through a **4-phase Claude pipeline**,
and commits the resulting markdown article to `_articles/YYYY-MM-DD.md`. Also opens a draft
PR for editorial review before the article goes to GitHub Pages.

---

## The 4-phase pipeline (`src/index.ts`)

```
1. Collect   — src/collect-context.ts  → BlogContext
2. Draft     — src/generate-article.ts → GeneratedArticle (initial)
3. Council   — src/council.ts          → CouncilNote[] (one per persona)
4. Synthesize — src/council.ts         → GeneratedArticle (final, council-informed)
```

**Phase 3 (council review)** is the new thing. Each `.md` file in `personas/` defines an
expert reviewer. Claude calls each persona independently, gets their critique, then a
synthesis call incorporates all feedback into the final article. Set `SKIP_COUNCIL=true`
to bypass for a fast run.

The council review does NOT produce separate output files. It is an internal quality pass
that improves the public article. On-demand addressed memos are a separate concern (`src/report.ts`).

---

## File map

| File | Role |
|---|---|
| `src/index.ts` | Entry point — orchestrates the 4-phase pipeline |
| `src/collect-context.ts` | GitHub API sweep via `gh` CLI. Reads commits (24h), PRs/issues (7d), ROADMAP.md or CLAUDE.md, previous `_articles/`. Exports `collectContext()` |
| `src/generate-article.ts` | Claude call for the initial draft. Exports `generateArticle()`, `toMarkdown()` |
| `src/council.ts` | Council system. Exports `loadPersonas()`, `reviewDraft()`, `synthesizeWithCouncil()` |
| `src/generate-report.ts` | Standalone persona-addressed memo generator. Used only by `src/report.ts` |
| `src/report.ts` | On-demand report entry point — explicitly requested, not run nightly |
| `src/types.ts` | All shared interfaces: `BlogContext`, `GeneratedArticle`, `Persona`, `CouncilNote`, `GeneratedReport` |
| `personas/*.md` | Persona definitions — one file per council member |
| `_articles/` | Published articles (committed by CI, served via Jekyll/GitHub Pages) |
| `_reports/` | On-demand persona reports (not committed by CI, not public) |
| `ROADMAP.md` | Primary project vision context injected into every Claude prompt (first 2500 chars) |

---

## The council system (`src/council.ts`)

### Persona file format (`personas/[slug].md`)

```markdown
---
slug: principal-cloud-architect
role: Principal Cloud Architect, Enterprise IT (25yr career — ...)
---

# Display Name

## Background
Career arc, key pattern, what they've built.

## Their lens
Numbered list of what they focus on and challenge. Be specific.

## What they typically challenge
Bullet list of the exact questions/pushbacks they'd raise.

## What lands for them
What works from their perspective — so the synthesis call knows what to preserve.
```

**To add a new council member:** drop a `.md` file in `personas/`. No code changes.
The slug must match the filename (minus `.md`). The `role:` frontmatter field is used
as the display name in logs and report headers.

### Review call
Each persona gets: their own system prompt (who they are + their lens) + the draft article.
Returns a critique: questions they'd ask, gaps they'd flag, what lands.
Max tokens: 1024. One call per persona.

### Synthesis call
Gets: original draft + all critiques + project vision.
Returns: the same JSON shape as `generateArticle()` — title, tags, summary, body.
The synthesized article preemptively answers the council's questions where info is available,
honestly acknowledges gaps where it isn't, and sharpens framing based on what landed.
Falls back to the original draft if JSON parse fails.

---

## Running things

```bash
# Standard run — full 4-phase pipeline (collect + draft + council + synthesize + write)
node_modules/.bin/tsx --env-file .env src/index.ts

# Or via pnpm scripts
pnpm generate          # live write
pnpm generate:dry      # print only, no writes

# With date override
DATE_OVERRIDE=2026-02-25 pnpm generate:dry

# Skip council review (fast — 3-phase, lower quality)
SKIP_COUNCIL=true pnpm generate:dry

# On-demand persona report (explicit, not nightly)
pnpm report:dry                                          # all personas
PERSONA_SLUG=design-program-manager pnpm report:dry     # one persona
```

---

## Key env vars

| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `GITHUB_TOKEN` | Yes in CI | Auto-provided by Actions; use `GH_PAT` for cross-repo private access |
| `DATE_OVERRIDE` | No | YYYY-MM-DD. Falsy check (`||`), not nullish — empty string from CI treated as unset |
| `DRY_RUN` | No | `"true"` → print, no writes |
| `SKIP_COUNCIL` | No | `"true"` → skip council phase (phases 3+4) |
| `PERSONA_SLUG` | No | Filter for `pnpm report` — runs only the named persona |
| `OJFBOT_ORG` | No | Default: `"ojfbot"` |
| `BLOGENGINE_API_URL` | No | If set, POSTs the article to BlogEngine on completion |

Local dev: create `.env` from `.env.example`. `.env` is gitignored.

---

## CI workflow (`.github/workflows/daily-blog.yml`)

1. Runs on cron `0 9 * * *` (09:00 UTC) or manual dispatch
2. Generates article → commits to `article/YYYY-MM-DD` branch
3. Opens a draft PR using `.github/scripts/build_pr_body.py`
4. Separate `deploy-pages.yml` fires on push to `main` (PR merge)
5. Uses `GH_PAT` secret (not `GITHUB_TOKEN`) for cross-repo `gh` CLI calls

---

## Known gotchas

- **`DATE_OVERRIDE` empty string**: CI passes `DATE_OVERRIDE: ""` on cron runs.
  `index.ts` uses `|| todayUTC()` (falsy check), not `?? todayUTC()` (nullish).
  Do not change this to `??` or cron runs will produce `_articles/.md`.

- **`_articles/` vs `articles/`**: Articles are written to and read from `_articles/`.
  The old `articles/` dir was renamed. `collect-context.ts` line 9 must say `_articles`.

- **Council adds ~2-4 min** per run (1 call per persona + 1 synthesis). Normal for overnight CI.
  Use `SKIP_COUNCIL=true` locally when iterating on prompt changes.

- **Persona `.md` files must have valid frontmatter** (`---` delimiters, `slug:`, `role:`).
  Malformed files are warned and skipped, not fatal.

- **Synthesis JSON parse failure**: falls back to the original draft silently.
  If the synthesized article looks identical to the draft, check Claude's raw output for
  fence-wrapped JSON (the stripping regex should handle it, but check if Claude changes format).

---

## Current council members

| Slug | Role | Lens |
|---|---|---|
| `principal-cloud-architect` | Principal Cloud Architect, Enterprise IT | Architecture defensibility, ADRs, cost story, live demos, innovation lab tangibility |
| `design-program-manager` | Senior DPM, Platform Products (Roblox) | Demo choreography, visual design visibility, Roblox platform analogy, the missing moment |

$ARGUMENTS
