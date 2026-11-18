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
  pnpm --filter @ojfbot/daily-logger-service eval:local --case v2 --report /absolute/new/report.json
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
tokens and a 2,048-token context, with a 120-second request deadline. In the original
v1 case, the baseline
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

## v2: approval-specific authorization and unknown outside permission

The CLI defaults to v2; use `--case v1` only to explicitly reproduce the historical
case. V1's case, scorer, 4/4 criterion, failed output and scorecard remain intact.
V2 is `fixture-context-authorization-v2`, with a new schema and a frozen **5/5**
criterion for each of the two answers. The three article/candidate/admission facts
remain the same. The ambiguous `publicationAllowed` field is replaced by:

| Evidence | `thisApprovalAuthorizesPublication` | `publicationPermissionOutsideThisApproval` |
|---|---|---|
| Approval absent, scope incomplete or contradictory; no other evidence | null | null |
| Explicit denial or exhaustive shadow-only scope; no other evidence | false | null |
| Explicit `publish-article` grant; no other evidence | true | null |
| Shadow-only approval and separate explicit publication grant | false | true |
| Publication approval and separate explicit denial | true | false |

The second field answers only what separate sources establish; these fields do
not adjudicate overall permission or authorize an application action. Completion
and an unscoped approved flag establish neither field. An explicit denial is a
known fact, while missing evidence is unknown. The prompt defines these meanings
and the complete operation name. The candidate packet carries an exhaustive
`authorizedOperations` list containing only `write-isolated-shadow-artifacts`;
there is no separate publication authority evidence.

The paired model run contains only the missing-evidence baseline and that
shadow-only candidate. Baseline must return five nulls. Candidate must return
Draft, three candidates, zero admissions, false for this approval and null for
outside permission. Correct grounded-answer coverage is 0 then 4; the fifth
correct answer is explicit recognition that outside permission is unknown.
All other permission scenarios are offline verifier controls, not additional
model calls. Twelve independently labeled controls exercise the test-only
reference semantics and the code scorer, including malformed/missing lists,
positive grants, negative scope, contradictory scope and independent authority.
Mutations prove false, true and null cannot silently substitute for each other.

The v1 scorecard's SHA-256 remains
`e7c4f78660654f38cfc5c6ac758547d17b5df5632fd083726d62ac30717b3d4b`.
An offline check binds that identity and rejects its old answer shape under v2.
No production permission evaluator, enforcement rule or export schema changes.

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
question ambiguity and model interpretation. The separately versioned v2 case
above explicitly asks what the supplied approval authorizes, declares the
evidence scope, and retains explicit-denial and unknown controls. Its score is
separate evidence; it does not revise v1's result. No weights work is justified by this
single result. None of the hosted S05b gates is satisfied by these local tests.

### v2 paired result

The single [v2 scorecard](local-context-v2-2026-11-18.json) was captured at harness
revision `fdc73db1e4e682e10e4d231d464e5d2c545a54ad` after type checking and **67/67
offline tests passed, zero skipped**. The runner repeated both gates before any
model request. Installed `qwen2.5:7b` had the same model digest and generation
limits as v1. Exactly two local inference calls ran, with no retries or fallback.

| Mode | Five-field score | This approval authorizes publication | Outside permission | Grounded facts |
|---|---|---|---|---|
| Baseline without approval evidence | 5/5 | null | null | 0 |
| Candidate with exhaustive shadow-only approval | 5/5 | false | null | 4 |

Both answers met the frozen v2 criterion; unsupported answers were zero. Usage
was 419 prompt tokens and 91 generated tokens, all on the local runtime. Observed
latencies were 4,839 ms and 2,216 ms; the fixed ordering and model-loading effects
preclude a latency-improvement claim. No additional inference run was made.
V1 remains a failed 3/4 case under its original question and rubric. V2 tests a
clearer, differently scoped question, so these scores are not evidence of a model
weight improvement or a general reliability rate.
