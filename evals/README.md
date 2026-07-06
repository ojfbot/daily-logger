# Golden eval suite — daily-logger

First golden suite of the ojfbot audit program (roadmap `rm:rm-l2-ojfbot#S19`,
integration plan slice I4). Seeded exclusively from
`core/decisions/failure-taxonomy.md` v1 (the 2026-07-06 S17 error-analysis
ritual) and the real failures it catalogues.

## What a golden task is

A golden task replays a **real, documented failure** of this pipeline as a
fixture + deterministic assertions, and pins the guarantee that would have
caught it. It is a regression tripwire for a failure class, not a unit test
for an implementation detail: unit tests (`src/__tests__/`) follow the code;
golden tasks follow the failure taxonomy.

Layout — one task per spec file, grouped by taxonomy cluster:

```
evals/
  tasks/<cluster>/<slug>.eval.ts   # one golden task (header cites cluster + evidence)
  fixtures/                        # evidence-derived inputs (small slices, not full dumps)
  harness.ts                       # corpus/frontmatter/trials helpers
  run.ts                           # runner: vitest → snapshot → diff
  results/latest.json              # committed per-task pass/fail snapshot
```

## The seeded-from-taxonomy rule (anti-Goodhart)

Every task **must** cite, in its file header:

1. its primary `failure:` cluster from the taxonomy, and
2. the real evidence it replays (article branch, oracle finding, Dolt query,
   postmortem decision — something that actually happened).

**No invented tasks.** A task may only be added from a real failure or an
error-analysis-ritual finding. If you can't name the evidence, you don't add
the task — a suite padded with imagined failures optimizes the metric instead
of the risk. New clusters come from the ritual (S17 cadence), never ad hoc.

Current inventory: 10 tasks across 4 clusters (`no-validation-gate`,
`blind-retry`, `silent-stall`, `asserted-not-verified`), anchored on the
named first eval: the July no-validation-gate failure — the drafter was fed
a corrupted ADR registry (`0004-narrow-su` truncated mid-word, 0005–0007
title-less) and emitted raw prompt context that reached council review and,
on 07-04, publication (`origin/article/2026-07-0{3,4,5}`).

## Determinism, MOCK_LLM, and trials

- **Deterministic assertions only** — schema parses, regex tripwires,
  corpus checks, stub-shape checks. **No LLM-as-judge**: the calibrated
  judge is S20 and does not exist yet; nothing here may pretend to be it.
- `pnpm eval` is **hermetic**: no Anthropic API call ever leaves the
  machine. The one task that exercises the real-call code path
  (`blind-retry/failed-generation-yields-honest-stub`) points the SDK at an
  unroutable localhost endpoint; the existing CI smoke test's `MOCK_LLM=true`
  pattern covers the happy path.
- **Trials:** stochastic-path tasks run `EVAL_TRIALS` trials (default 3, the
  I4 ≥3-trials contract) via `harness.trialIndices()`, so a flaky pass can't
  read as a stable one. Future real-LLM tasks (post-S20) must use the same
  mechanism plus recorded fixtures for the default run.

## Running

```bash
pnpm eval          # run suite, print per-task results + diff vs committed snapshot,
                   # rewrite evals/results/latest.json (commit it with your change)
pnpm eval:test     # vitest only, no snapshot/diff (watchable in dev)
pnpm test          # unit suite — unchanged, does NOT include evals
```

`evals/results/latest.json` is the committed baseline: stable ordering, no
timestamps. When your PR changes a result, the diff shows up in `pnpm eval`
output and in CI; commit the regenerated snapshot alongside the change.

## CI-advisory contract

The `pr-check` workflow runs `pnpm eval` with `continue-on-error: true` and
posts the summary + diff to the job summary. **It never blocks a PR.**
Making any part of this suite blocking is a data-gated RIDM promotion (the
S16 shadow→enforce pattern) that needs accumulated run history — not a
config flip. Until then: red evals are a signal to read, not a gate.

## Adding a task

1. Bring evidence: a real failure artifact or a ritual finding, with a
   `failure:` cluster tag (if none fits, that's taxonomy work first).
2. Create `evals/tasks/<cluster>/<slug>.eval.ts`; header cites cluster +
   evidence; assertions deterministic; fixtures are small evidence-derived
   slices (excerpts with the real corruption patterns, never wholesale dumps).
3. `pnpm eval`, commit the code **and** the regenerated
   `evals/results/latest.json`.
4. Update the inventory table in the PR that adds it.

## Honest gaps (known, documented, deliberately not asserted)

- **Salvage title echo:** `validateArticleOutput`'s salvage path trusts any
  string `title`, so a prompt-fragment title would survive salvage. The
  structural fix (staged runners / ingestion gate) is deliberately deferred
  per the taxonomy's root-cause note on cluster 1; when it lands, add the
  task that pins it.
- **Registry ingestion gate:** there is still no validation between registry
  ingestion and prompt assembly — `registry-renders-without-fabricated-titles`
  pins only that the prompt layer doesn't compound the corruption.
- Clusters `dup-identity`, `stranded-work`, `unowned-drift`,
  `vantage-isolation` have no daily-logger-scoped deterministic surface yet;
  they are seeded elsewhere (Dolt store, core tooling) and enter this suite
  only when a daily-logger failure gives them evidence.
