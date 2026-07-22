# ADR-0039: Pilot the OJF-OPL Object-Process model — pipeline as a lintable artifact

Date: 2026-07-22
Status: Proposed
OKR: —
Commands affected: /opm (from core), /daily-logger
Repos affected: daily-logger (pilot for the fleet convention)
Linked: core ADR draft `opm-inspectability-layer` (the fleet convention), ADR-0035 (article status lifecycle), ADR-0037/0038 (editorial workflows)

---

## Context

This repo is the fleet's cleanest pipeline — collect → generate → verify → write, plus editorial
state transitions (`draft → accepted | rejected`, ADR-0035/0037) — and its documentation is prose:
the CLAUDE.md source-file table says what files exist, not what each step consumes, produces,
requires, or who gates it. Core's ADR draft `opm-inspectability-layer` defines OJF-OPL, a
controlled-English profile of ISO 19450 Object-Process Methodology: one fact per line
("Drafting requires Claude API."), deterministically rendered to Mermaid, with `[src:]` anchors a
linter can check against the tree. daily-logger is the designated pilot (S2 of the core ADR's
rollout) because its pipeline is small, real, and already has the state machine OPM models well.

## Decision

Commit `opm/system.opl` (+ rendered `opm/system.md`) modeling the article pipeline and its
editorial state transitions, seeded in this ADR's branch. Propose a CI step (not yet wired) that
runs `/opm lint` **observe-only** on PRs touching `src/` or `opm/` and posts findings as a
comment — never failing the build. Promotion of the lint to a required check is a separate,
data-gated decision per the core ADR's rollout (needs: ≥1 real drift caught, or 4 weeks of
model-accurate operation).

## Consequences

**Gains.** The pipeline's data-flow contract ("Claim Verifying consumes Article and Commit
Context") becomes diffable and checkable; the human/automation boundary is explicit (Jim is the
only *agent* — everything else is instruments, which is exactly the repo's standalone posture);
new-session orientation can `query` the model instead of re-reading five source files.

**Costs.** One more artifact to keep truthful when `src/` changes; the shadow-mode CI comment
adds PR noise if the model rots (which is itself the signal the pilot measures).

**Neutral.** The model is descriptive: it never executes, and it deliberately omits
quantitative facts (cron time, token budgets) — those stay in CLAUDE.md/workflows.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep prose-only docs | The drift this pilot exists to measure; "Honest gaps" culture says make it checkable |
| Mermaid freehand diagram | Pretty but unlintable — no consume/yield/require semantics, no anchors |
| Full BPMN of the pipeline | Control-flow-only; articles/contexts are stateful first-class objects here |
| Pilot in a bigger repo (core, shell) | Larger SD, weaker signal; pilot wants the smallest true pipeline |
