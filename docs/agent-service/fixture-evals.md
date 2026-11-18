# Fixture oracles and the opt-in local context experiment

The recorded fixture now has an independent trace oracle and an optional local
model case. These exercise the fixture and test harness; application behavior and
the closed S05a observation schema are unchanged. This is follow-on evidence for
S05b and [Core #510](https://github.com/ojfbot/core/issues/510).

## Offline acceptance

Run `pnpm type-check:service` and `pnpm test:service` from the repository root.
The oracle uses the real `@opentelemetry/sdk-trace` provider with an in-memory
exporter. Start and resume run in separate Node processes against one SQLite
checkpoint, with HTTP blocked in both children. It requires:

- Start: one delivery root plus `collect_fixture`, `draft_fixture`,
  `review_fixture`, and a paused `human_gate`. No artifacts exist at the wait.
- Resume: one new delivery root plus `human_gate` and `write_shadow_artifacts`,
  both succeeded. Exactly eight finished spans across the two processes.
- Every child shares its root's native trace ID and names its root's span ID as
  parent. The roots have different trace IDs and the same LangSmith session ID.
- Every observation/span identity is unique, every expected role/outcome appears
  exactly once, no unexpected node appears, and mapper diagnostics have no gaps.
- Written article and action bytes match the frozen source. The existing fault
  suites still check checkpoint/output recovery, stale approval, exact artifact
  equivalence, immutable destinations, disabled telemetry and exporter faults.

The oracle must reject all eight isolated negative controls: missing node,
duplicate span, wrong parent, split child trace, wrong thread, false completion at
the wait, an unexported open span, and a reused restart trace. Six additional
mapper fault cases exercise orphan parents, missing starts/ends, duplicate starts,
failed status and a run ID bound after the start record. The old stub-based mapper
tests remain narrower checks; only the new SDK-backed case establishes native ID
relationships and the actual separate-process boundary.

## Local model entrance and command

The local experiment is excluded from ordinary tests. It refuses to make even an
inventory request until both offline commands pass in that invocation. Unit tests
prove a failed gate makes zero model requests. It requires explicit opt-in and an
installed GGUF model at the fixed loopback Ollama endpoint; it follows no redirects,
pulls no model, performs no retry and selects no fallback.

```sh
DAILYLOGGER_LOCAL_MODEL_EVAL=1 DAILYLOGGER_LOCAL_MODEL=qwen2.5:7b \
  pnpm --filter @ojfbot/daily-logger-service eval:local --report /absolute/new/report.json
```

Use a new report path. The runner writes the scorecard with exclusive creation,
records failures, and exits nonzero unless both answers pass. It records the
source commit, fixture manifest/context digests, installed model digest, fixed
generation options, gate exits, outputs, code scores, latency and token counts.
It sends only a small synthetic packet of public fixture metadata and the fixed
shadow-approval contract. It sends no article, private vault text, credentials,
traces, or data to LangSmith. Local inference still consumes machine resources.

One experiment is **two calls**, one per context mode, with the same model,
instruction, JSON schema, seed and temperature. Each is capped at 192 generated
tokens and a 2,048-token context, with a 120-second request deadline. The baseline
lacks the snapshot and approval contract and must return four nulls. The candidate
receives that evidence and must report Draft, three candidates, zero admissions,
and no publication permission. A deterministic evaluator requires **4/4 fields**
in each mode. Unsupported baseline guesses and candidate publication permission
fail; malformed/truncated output fails without a retry.

Report grounded-answer coverage separately from abstention correctness. A passing
pair shows that the installed model used this supplied context on this case. It
does not establish retrieval quality, a trained model improvement, editorial
quality, general agent reliability, or a population-level improvement. Frozen
holdouts and a second task family are still needed before promotion. Keep S05b's
live ingestion/readback, exporter, PostgreSQL, privacy, overhead and retention
qualification gates separate.

## Evidence

The first local pair ran once after 49/49 offline tests and type checking passed
at harness revision `1600fcb540f6c655cfa0cb7483500dedf2fe573e`. The saved
[scorecard](local-context-2026-11-18.json) records the original inputs, output and
frozen scores. Baseline abstention passed 4/4; the candidate answered three facts
correctly but returned null for publication permission, scoring **3/4: fail**.
Grounded answers increased from 0 to 3; this does not meet the full exit criterion.
There were two local calls, 234 prompt tokens and 53 generated tokens in total.
No inference rerun or threshold change was made. A new offline regression test
re-scores this recorded result, keeping the failed field visible.

The failure is conservative abstention, not an unsafe grant. The broad field name
`publicationAllowed` may conflate global permission with what this approval
authorizes; the case intended the latter. Root cause remains unresolved between
question ambiguity and model interpretation. A follow-up case should explicitly
ask whether the supplied approval authorizes publication, declare the evidence
scope, and retain both explicit-denial and unknown controls. Freeze that new case
as a new version before another model run. No weights work is justified by this
single result. None of the hosted S05b gates is satisfied by these local tests.
