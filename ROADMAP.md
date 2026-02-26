# ojfbot — Living Roadmap

> First ~2500 chars injected into every daily-logger Claude prompt.
> Reorder sections if priorities shift. Update "Where we are now" weekly.

---

## The pitch: Samir Mody's "Act 2" frame

Target: Design Engineer at The Browser Company of New York (Dia).
Frame is to Dia what Dia is to the web. Dia controls the web via natural language;
Frame controls apps via natural language. The assistant IS the product.

Samir Mody (TBCoNY CTO, "From Arc to Dia") — 4 pillars every article must thread:

1. **Assistant-centric** — ShellAgent orchestrates apps; cv-builder/BlogEngine/TripPlanner
   are what it hosts. Same bet as Dia's AI address bar orchestrating web content.
2. **Tooling for iteration** — node-template 23 slash commands; daily-logger itself;
   cv-builder eval/visual regression loop. Prompts + evals are versioned artifacts.
3. **Model behavior as design** — behavior specs, evals, per-skill prompt requirements
   are first-class design work. cv-builder's Claude Code review loop IS this.
4. **Security as emergent UX** — tool-use confirmations, trusted/untrusted content
   separation. Every high-impact agent action shows a summary before firing.

---

## Where we are now (update this section weekly)

**Active: Phase 6 + Phase 9**

- **Phase 6 (~70%)**: visual regression landed (PR #93 — CanvasRunNavigator, S3,
  draw.io canvas, rich PR comments with thumbnails). Missing: run-history + diff
  timeline (issue #94). This CI eval loop IS Samir's Pillar 2 in production.
- **Phase 1 (stalled)**: shell extraction issues #83–86 open. Sprint consumed by
  Phase 6. Core tension: can't build ShellAgent (Pillar 1) without the shell first.
- **Phase 9 (live)**: daily-logger running. Editorial UI (draft-PR + GitHub Pages SPA)
  is the next step.

---

## Narrative threads (name at least one per article)

1. **Name the Samir pillar** today's work demonstrates — be explicit, not implicit
2. **cv-builder visual regression = Jeba-lite** — the CI eval loop is Pillar 2 shipping
3. **WebSocket arc**: AmEx GBT chat (Concur) → cv-builder agent streaming → Frame chat bar —
   same capability at escalating ambition levels; use when agent/real-time work ships
4. **Phase 1 honest tension**: ShellAgent can't exist without the shell it lives in —
   name this when discussing roadmap priorities
5. **This blog = Pillars 2+3** — the system iterates on itself; always worth a sentence

---

## Dia ↔ Frame

| Dia | Frame |
|---|---|
| AI address bar | Header chat command bar (ShellAgent) |
| Tab manager | Multi-instance app launcher |
| Browser as OS | Frame as App OS |

---

## Author: SAP Concur (proof-of-craft — reference in articles)

5 years, front-end design engineer, Concur Online Booking Tool (T2, AWS microservices):

- **Production delivery**: led T2 Hotel to AWS prod (GitHub Actions, Kubernetes, CodeBuild)
- **Real-time first**: designed first WebSocket in Concur — AmEx GBT travel agent chat;
  same capability Frame needs for live ShellAgent
- **AI tooling**: AI-enabled debugging/validation for T2 seat map; empowering Bangalore
  support engineers to investigate without deep domain expertise = Pillar 2
- **Eval-driven discipline**: automated rollback validation for Air across company configs,
  agency configs, i18n variants — this IS the mindset behind cv-builder's visual regression
- **Cross-geo scaling**: Brazil team transfer; pair programming; compounding via teaching
- **Complex UX**: matrix air filter; EY compliance gating; Hotel↔Air cross-vertical flows

The pitch: "building what Concur would build if it started over in 2025."

---

## Roadmap phases

1. Extract `@ojfbot/shell` + Storybook — **stalled** (#83–86)
2. Figma design system with MCP — **not started**
3. Header chat bar / ShellAgent — **not started**
4. Multi-instance app launching — **not started**
5. MrPlug as `ojf inspect` dev companion — **not started**
6. Visual regression CI as A/B foundation — **~70%** (issue #94)
7. purefoy as podcast AI agent in Frame — **not started**
8. App definition from UI (ShellAgent scaffolds apps) — **not started**
9. daily-logger → BlogEngine + editorial UI — **live / in progress**

---

## Phase 9 detail: Editorial UI on GitHub Pages

**Goal:** Review, edit, annotate, and approve/reject each daily draft before it
publishes. Feedback persists and seeds the next day's generation.

### Proposed workflow

```
cron fires
  → CI generates article to branch: article/YYYY-MM-DD
  → opens draft PR against main
  → GitHub Pages editorial SPA detects open draft PRs via GitHub API
  → you open the editor, edit markdown, add feedback notes
  → click Approve → CI merges PR + Pages rebuilds
  → feedback notes written to feedback/YYYY-MM-DD.json
  → next day's collect-context.ts reads feedback/ and injects into prompt
```

### SPA architecture (static, no backend)

- Hosted at `https://ojfbot.github.io/daily-logger/editor`
- GitHub API calls direct from browser; PAT in `localStorage` (solo tool, acceptable)
- GitHub OAuth PKCE flow as an upgrade path

### Key screens

1. **Draft list** — open `article/*` PRs with status (pending / approved / skipped)
2. **Editor** — split-pane markdown left / rendered preview right (CodeMirror 6)
   - Saves edits back to PR branch via GitHub API commit
3. **Feedback panel** — freeform notes ("focus more on X", "wrong tone in Y section")
   - Saved to `feedback/YYYY-MM-DD.json` via API commit
   - Loaded by `collect-context.ts` on next generation run
4. **Approve button** — merges PR via GitHub API
5. **Skip button** — closes PR without merge

### Draft-first CI change required

`daily-blog.yml` generate job must:
- Create branch `article/YYYY-MM-DD`
- Write article to that branch
- Open draft PR (`gh pr create --draft`)
- Remove current direct-commit-to-main behavior

Pages deploy job unchanged — fires on PR merge to main.

### Feedback injection in collect-context.ts

```ts
// Read feedback/YYYY-MM-DD.json for last 5 days, append to prompt
// Format: { date: string, notes: string, focusAreas: string[] }
```
