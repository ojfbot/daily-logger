# ojfbot — Living Roadmap

> First ~2500 chars injected into every daily-logger Claude prompt.
> Jekyll removed; Vercel serverless is now the only deployment target.
> Reorder sections if priorities shift. Update "Where we are now" weekly.

---

## Where we are now (update this section weekly)

**Active: Phase 1 + Phase 4 + Phase 5 + Phase 6 + Phase 7 + Phase 9 + Gas Town Sprint 1 + lean-canvas + /scaffold-frame-app + SEH Study + fleet-wide security scanning + fleet-wide dependency hardening + skill-catalog + fleet-wide session-init + beaverGame + asset-foundry + github-actions (shared CI) + selfco vault runner + OPAV instrumentation**
- **selfco vault runner (live)**: `selfco-box` daemon ingests Notion/iOS/MCP captures into the personal `ojfbot/selfco` Obsidian vault via path-jailed Claude agent. Infrastructure commits to `selfco-box` are tracked in daily reports; the vault repo itself is intentionally not swept (content churn).
- **selfco vault: cultivate shipped (2026-06-09)**: the vault grew a self-maintaining synthesis layer. New `/vault cultivate` mode (the "serendipity pass" — hunts cross-cluster connections the per-source ingest loop can't see) defined in the vault schema (core PR #144) and now running **daily and unattended on the selfco-box** (launchd 05:30 → path-jailed Claude agent → commit/push; Goodhart guardrail: an empty run is a success state). Day-one yield: 2 new synthesis pages (dive-instructor expertise ↔ subsea-datacenter research; competency frameworks as one artifact class across INCOSE SE, dive instruction, and the F1 literacy layer), 20 cross-links applied from the Adamic-Adar suggested-links queue with a context phrase on every link, 15 candidates rejected with recorded reasons (hub-redundancy, catalog co-membership), and one meta-finding: the fleet-governance pages re-derived the strategy canon four days after it was ingested without consulting it — the vault's own "reference-only knowledge goes unused" prediction, observed in the wild. Details: `ojfbot/selfco` wiki/log.md [2026-06-09] cultivate entries; `feedback/2026-06-09.json` in this repo.
- **Actions board**: one action open (action-ID audit for pre-`9c17d7f` actions). The two-ADR session for `suggested_after`/`layer_affinity` governance and content-hash action-ID scheme is resolved (ADR-0068 + inline schema docs). The sweep of daily-cleaner PRs #155–#167 is resolved (all merged in their original windows). PR #133 review completed (2026-04-13). Fleet-wide README sharpening complete across all public repos (2026-04-04); live CVE patched and verified; expandable BioCard shipped to landing page. Deterministic content-hash action IDs shipped (`9c17d7f`); five ghost actions closed (`c368b79`). Suggestion-ignored telemetry closes the feedback loop. Phase 0 fully closed for beaverGame and asset-foundry; beaverGame Babylon migration complete with full dodge gameplay; skill-audit CI extracted to shared `github-actions` repo. Pocock skill suite landed (ADR-0047, 0048, 0049); standup funnel wired as first-class skill consumer (ADR-0054); skill-metrics ADR (ADR-0050) ratified. asset-foundry gains dual Blender transports (ADR-0011).
- **Fleet hardening sprint complete**: 15-PR fleet hardening sprint closed — transitive dependency vulnerabilities patched across all 11 repos, CVE-2025-68665 resolved in MrPlug with explicit version pin, Express 5 route-param type fixes shipped in TripPlanner and BlogEngine. Every public README sharpened (2026-04-04). Structural gap identified: `tsc --noEmit` is not yet a required CI step for lock-file PRs touching `@types/*` or framework packages.
- **ADRs landed**: ADR-0033 (daily-cleaner confidence threshold), ADR-0034 (Frame-wide Redux store strategy, resolves shell #5), ADR-0036 (structured decision output for rich UI), ADR-0037 (JSONL truncation bug fix), ADR-0038 (editorial revision CI workflow), ADR-0043 (AgentBead bridge — Claude Code lifecycle to Gas Town bead emissions), ADR-0047/0048/0049 (Pocock skill suite — full skill bodies before integration), ADR-0050 (skill adoption measurement as catalog responsibility), ADR-0054 (standup funnel as first-class skill consumer; bead prefix reservations), ADR-0068 (suggestion-follow baseline — false 0.8% struck), ADR-0088 rev B (canvas-fit gate enforcement), ADR-0093 (SUGGESTION_ID minting for suggestion-follow denominator), ADR-0096 (skill-architecture taxonomy as standing audit instrument).
- **Landing**: Log nav link now points to `log.jim.software` (Vercel subdomain), old GitHub Pages URL retired.

- **Phase 5 (Phase 5B merged)**: MrPlug Phase 5B fully merged — GitHub issue creation,
  Claude Code relay, Module Federation-aware project routing, confirmation UX.
  S3 screenshot upload + rich issue bodies landed. PR #32 merged — relay error handling hardened,
  missing origin validation added to extension message-passing path, unhandled error branches fixed.
  Open: S3 cost model docs.
- **Phase 4 (shipped)**: shell multi-instance UI landed 2026-03-09.
- **Phase 6 (~70%)**: visual regression landed (PR #93 — CanvasRunNavigator, S3,
  draw.io canvas, rich PR comments with thumbnails). Missing: run-history + diff
  timeline (issue #94). This CI eval loop demonstrates model-behavior-as-design in production.
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
   Core tension: can't build ShellAgent without the shell first.
- **Gas Town Sprint 1 (active)**: FrameBead (`FrameBeadLike`) has two live implementations
   (cv-builder and core-reader). ADR-0016 ratified. `@resume-builder/*` is the new module namespace.
   gastown-pilot now registered in shell ([shell] #39) — `AppType` union, `APP_CONFIG`, Storybook stories.
   ADR-0043 (AgentBead bridge) ratified — maps Claude Code lifecycle to Gas Town bead emissions. GET /api/beads rolled out fleet-wide as an ADR-0016 contract (Dolt-first with filesystem fallback).
   `/scaffold-frame-app` codified as a 28-item validation skill for creating new Frame sub-apps.
- **Phase 9 (live)**: daily-logger running. **Jekyll removed; Vercel serverless is now the only deployment target.** Editorial UI shipped — GitHub OAuth login,
   draft-PR stamp workflow, editorial sidebar with responsive inline section threads,
   editorial revision CI workflow (ADR-0038). Progressive disclosure for new issues shipped.
   Rest-day handling added. Article status lifecycle and auto-merge overnight PRs shipped (`8c4a75a`).
   Two-column article layout with Lois design system integration landed.
   ADR-0035 (article status lifecycle) and ADR-0036 (structured decision output) ratified. Skill-audit CI extracted to shared `github-actions` repo (ADR-0067 pending).
  ADR-0035 (article status lifecycle) and ADR-0036 (structured decision output) ratified.
- **gcgcca (bootstrapping)**: Python CLI complete (47 pytest tests passing). Type bridge wired (Pydantic → OpenAPI → TS). Milestones: [ ] Express API serving scene data on :3036, [ ] browser-app registered in shell as MF remote, [ ] Frame agent tools manifest at GET /api/tools, [ ] end-to-end KML → UI coverage display.

---

## Narrative threads (name at least one per article)

See the current thread definitions in the article-generation prompt. Threads are
rewritten as project maturity changes; the canonical list lives in the generation
pipeline, not here.

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

---

## selfco vault runner (out-of-band)

`selfco-box` is a durable Node.js daemon that ingests captures into the personal `ojfbot/selfco` vault (LLM-owned, Karpathy-style append-only `raw/` + LLM-maintained `wiki/`). It runs as a launchd job locally; capture sources are Notion polling, an iOS Shortcut hitting `/capture`, and MCP tools.

**Tracked by daily-logger:** `ojfbot/selfco-box` (daemon source, ingest procedure prompt, config schema, README).

**Intentionally NOT tracked:** `ojfbot/selfco` (the vault content repo). Vault writes happen many times per day and would drown daily reports in non-engineering churn. The `vault` skill source (which defines schema, templates, helper scripts) lives inside `ojfbot/core` at `.claude/skills/vault/` and is covered by the existing `core` sweep.

Out-of-band: this is personal-knowledge infrastructure, not part of the Frame OS phase plan.
