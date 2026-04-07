# ojfbot — Living Roadmap

> First ~2500 chars injected into every daily-logger Claude prompt.
> Jekyll removed; Vercel serverless is now the only deployment target.
> Reorder sections if priorities shift. Update "Where we are now" weekly.

---

## The pitch: Samir Mody's "Act 2" frame

Target: Design Engineer at The Browser Company of New York (Dia).
Frame is to Dia what Dia is to the web. Dia controls the web via natural language;
Frame controls apps via natural language. The assistant IS the product.

Samir Mody (TBCoNY CTO, "From Arc to Dia") — 4 pillars every article must thread:

1. **Assistant-centric** — ShellAgent orchestrates apps; Resume Builder/BlogEngine/TripPlanner
   are what it hosts. Same bet as Dia's AI address bar orchestrating web content.
   Resume Builder eval/visual regression loop. Prompts + evals are versioned artifacts.
2. **Model behavior as design** — behavior specs, evals, per-skill prompt requirements
   are first-class design work. Resume Builder's Claude Code review loop IS this.
3. **Security as emergent UX** — tool-use confirmations, trusted/untrusted content
   separation. Every high-impact agent action shows a summary before firing.

---

## Where we are now (update this section weekly)

**Active: Phase 1 + Phase 4 + Phase 5 + Phase 6 + Phase 7 + Phase 9 + Gas Town Sprint 1 + lean-canvas + /scaffold-frame-app + SEH Study + fleet-wide security scanning + fleet-wide dependency hardening**

- **Actions board**: all 36 actions closed (2026-03-29). Two open actions remain: validate ADR-0038 editorial revision CI end-to-end; verify static-file-shadowing fix deployment on Vercel preview. Fleet-wide README sharpening complete across all public repos (2026-04-04); live CVE patched and verified; expandable BioCard shipped to landing page.
- **Fleet hardening sprint complete**: 15-PR fleet hardening sprint closed — transitive dependency vulnerabilities patched across all 11 repos, CVE-2025-68665 resolved in MrPlug with explicit version pin, Express 5 route-param type fixes shipped in TripPlanner and BlogEngine. Every public README sharpened (2026-04-04). Structural gap identified: `tsc --noEmit` is not yet a required CI step for lock-file PRs touching `@types/*` or framework packages.
- **ADRs landed**: ADR-0033 (daily-cleaner confidence threshold), ADR-0034 (Frame-wide Redux store strategy, resolves shell #5), ADR-0036 (structured decision output for rich UI), ADR-0038 (editorial revision CI workflow).
- **Landing**: Log nav link now points to `log.jim.software` (Vercel subdomain), old GitHub Pages URL retired.

- **Phase 5 (Phase 5B merged)**: MrPlug Phase 5B fully merged — GitHub issue creation,
  Claude Code relay, Module Federation-aware project routing, confirmation UX.
  S3 screenshot upload + rich issue bodies landed. PR #32 merged — relay error handling hardened,
  missing origin validation added to extension message-passing path, unhandled error branches fixed.
  Open: S3 cost model docs.
- **Phase 4 (shipped)**: shell multi-instance UI landed 2026-03-09.
- **Phase 6 (~70%)**: visual regression landed (PR #93 — CanvasRunNavigator, S3,
  draw.io canvas, rich PR comments with thumbnails). Missing: run-history + diff
  timeline (issue #94). This CI eval loop IS Samir's Pillar 2 in production.
- **Phase 1 (active)**: shell extraction issues #83–86 open. [shell] #23 merged —
   `AppSwitcher` extracted to `packages/ui/`. [shell] #25 merged — `ShellHeader` extracted.
   [shell] #29 merged — `Header` extracted to `packages/ui/` (pure props-driven, zero Redux).
   [shell] #30 merged — `HomeScreen` extracted to `packages/ui/`.
   [shell] #31 merged — `HeaderConnected` + `HomeScreenConnected` wired in `shell-app`.
   [shell] #41 merged — `ApprovalQueue`, `ResumptionToast`, `SettingsModal` decomposed into pure components + `*Connected` wrappers (five components extracted total).
  [shell] #32 merged — cross-domain fan-out PR (ADR-0019 isolation hardened with integration tests).
  [shell] #33 merged — `POST /api/resumption` thread resumption synthesis endpoint.
    lean-canvas deployed to Vercel as a Module Federation remote ([lean-canvas] #3); `.claude/commands/` renamed to `.claude/skills/` ([lean-canvas] #2). **Not yet registered in the shell** — `VITE_REMOTE_LEAN_CANVAS`, `AppType`, and `REMOTE_LOADERS` entries are pending.
    [lean-canvas] #6 merged — `DashboardLayout` adopted from `@ojfbot/frame-ui-components`, local dashboard CSS deleted, Carbon g100 dark theme added.
   gastown-pilot registered end-to-end as a shell sub-app ([shell] #39 — `AppType` union, `APP_CONFIG`, Storybook stories).
  Display label rename ("CV Builder" → "Resume Builder") shipped in #26/#27; four rename regression fixes merged.
  Resume Builder default label renamed 'My Resume' → 'Start Fresh'.
  Cross-domain signal detection fix landed. Storybook hoisting fix merged.
   Core tension: can't build ShellAgent (Pillar 1) without the shell first.
- **Gas Town Sprint 1 (active)**: FrameBead (`FrameBeadLike`) has two live implementations
   (cv-builder and core-reader). ADR-0016 ratified. `@resume-builder/*` is the new module namespace.
   gastown-pilot now registered in shell ([shell] #39) — `AppType` union, `APP_CONFIG`, Storybook stories.
   `/scaffold-frame-app` codified as a 28-item validation skill for creating new Frame sub-apps.
- **Phase 9 (live)**: daily-logger running. **Jekyll removed; Vercel serverless is now the only deployment target.** Editorial UI shipped — GitHub OAuth login,
   draft-PR stamp workflow, editorial sidebar with responsive inline section threads,
   editorial revision CI workflow (ADR-0038). Progressive disclosure for new issues shipped.
   Rest-day handling added. Article status lifecycle and auto-merge overnight PRs shipped (`8c4a75a`).
   Two-column article layout with Lois design system integration landed.
    MetricsBar extracted with hover popovers and 5 stat cards landed (commit `2520988`). Done actions page now shows recent/archived tiers (commit `449e321`). Sparkline dead code removed (commit `3d5e4dd`). Dev mode auth bypass for editorial testing added. Editorial revision sidebar includes feedback quote in revision comment; auto-merge disabled (commit `84aec32`).
  ADR-0035 (article status lifecycle) and ADR-0036 (structured decision output) ratified.
- **gcgcca (bootstrapping)**: Python CLI complete (47 pytest tests passing). Type bridge wired (Pydantic → OpenAPI → TS). Milestones: [ ] Express API serving scene data on :3036, [ ] browser-app registered in shell as MF remote, [ ] Frame agent tools manifest at GET /api/tools, [ ] end-to-end KML → UI coverage display.

---

## Narrative threads (name at least one per article)

1. **Name the Samir pillar** today's work demonstrates — be explicit, not implicit
2. **Resume Builder visual regression = Jeba-lite** — the CI eval loop is Pillar 2 shipping
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
   agency configs, i18n variants — this IS the mindset behind Resume Builder's visual regression
- **Cross-geo scaling**: Brazil team transfer; pair programming; compounding via teaching
- **Complex UX**: matrix air filter; EY compliance gating; Hotel↔Air cross-vertical flows

The pitch: "building what Concur would build if it started over in 2025."

---

## Roadmap phases

1. Extract `@ojfbot/shell` + Storybook — **active** (#83–86, PRs #23 + #25 + #29 + #30 + #31 + #32 + #39 + #41 merged, AppSwitcher + Header + HomeScreen + ApprovalQueue + ResumptionToast + SettingsModal extracted to `packages/ui/` as pure components with `*Connected` wrappers in shell-app, five components decomposed total, `/api/resumption` endpoint live, gastown-pilot registered end-to-end as sub-app, SEH Study registered as fifth sub-app, ADR-0019 isolation hardened, lean-canvas deployed to Vercel but **not yet registered in shell**). Fleet-wide `@ojfbot/frame-ui-components` adoption complete across purefoy, lean-canvas, TripPlanner, BlogEngine, cv-builder, core-reader — 2,816 lines of duplicated component code deleted. TruffleHog secret scanning added to all CI pipelines.
2. Figma design system with MCP — **not started**
3. Header chat bar / ShellAgent — **not started**
4. Multi-instance app launching — **shipped** (shell multi-instance UI, 2026-03-09)
5. MrPlug as `ojf inspect` dev companion — **Phase 5B merged + security hardened** (GitHub issue creation, Claude Code relay, MF-aware routing, `file-techdebt` handler — AI-spotted debt files directly to `TECHDEBT.md`; PR #32 — relay error handling hardened, origin validation added to message-passing path)
6. Visual regression CI as A/B foundation — **~70%** (issue #94)
7. purefoy as podcast AI agent in Frame — **corpus complete; frame-ui-components migration complete** ([purefoy] #9–#14 merged — 348/348 episodes transcribed, AWS runner retired, typed transcript editing UI in Frame, standalone Flask reference UI at localhost:5050, ADR-006–009; [purefoy] #17 + #18 merged — local components replaced with `@ojfbot/frame-ui-components` wrappers, `DashboardLayout` adopted, Vercel deployment wired)
8. App definition from UI (ShellAgent scaffolds apps) — **not started**
9. daily-logger → BlogEngine + editorial UI — **live / in progress**
10. gcgcca as Frame OS geospatial sub-app — **bootstrapping** (Python CLI complete, type bridge wired, browser-app skeleton + Express API scaffolded, not yet registered in shell)

---

## Phase 9 detail: Editorial UI on Vercel

**Goal:** Review, edit, annotate, and approve/reject each daily draft before it
publishes. Feedback persists and seeds the next day's generation.

### Proposed workflow

```
cron fires
  → CI generates article to branch: article/YYYY-MM-DD
  → opens draft PR against main
   → Vercel editorial SPA detects open draft PRs via GitHub API
  → you open the editor, edit markdown, add feedback notes
   → click Approve → CI merges PR + Vercel rebuilds
  → feedback notes written to feedback/YYYY-MM-DD.json
  → next day's collect-context.ts reads feedback/ and injects into prompt
```
### SPA architecture (Vercel)

- Hosted at `log.jim.software` (Vercel subdomain)
- GitHub OAuth PKCE flow — OAuth login shipped (commit `7a01021`). Editorial revision CI workflow shipped (ADR-0038); catch-all route replaced with single function + rewrite (commit `735939c`).

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

Vercel deploy fires on PR merge to main.

### Feedback injection in collect-context.ts

```ts
// Read feedback/YYYY-MM-DD.json for last 5 days, append to prompt
// Format: { date: string, notes: string, focusAreas: string[] }
```
