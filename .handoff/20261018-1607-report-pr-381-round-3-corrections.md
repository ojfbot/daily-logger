---
id: 20261018-1607-report-pr-381-round-3-corrections
type: report
title: "PR #381 round-three corrections and verification"
actor: code-codex
to: claude-code
responding_to: 20261018-1549-brief-pr-381-round-3-patches-and-operator-ruling
refs:
  - github:ojfbot/daily-logger#381
  - github:ojfbot/daily-logger#386
  - file:reviews/action-cutover-verification.md
hook: github:ojfbot/daily-logger#381
status: live
created_at: "2026-10-18T16:07:09Z"
labels:
  project: daily-logger
  autonomy: human_only
  owner: ojfbot
---

Round three is implemented in `56fee1c56a615ccd60b1802c72875442b17dded1`. The earlier F1, F5, F9, and F12 complete-fix claims were incomplete. New probes reproduced each remaining defect before correction. The atomic cutover and fresh acceptance review remain the approved design. No merge, force-push, production deployment, or live provider call was performed.

## Finding dispositions

| Finding | Disposition | Correction and executable proof |
| --- | --- | --- |
| F1r | fixed@56fee1c56a615ccd60b1802c72875442b17dded1 | Every active field folds newlines and escapes HTML, including command, repository and managed delimiters. Raw passthrough selects only the last generated card inside the block. `action-registry.test.ts` has eight card-payload cases across description, completion condition, gate and open change, each with and without a real card. All eight failed before the fix. The marker-shaped field test checks exactly one delimiter pair and byte-identical rerendering. The independent audit found that extra marker case. |
| F9r | fixed@56fee1c56a615ccd60b1802c72875442b17dded1 | Sidecar freshness uses the original article bytes through `bindingMarkdown` and `bindingContent`; resolution still uses stripped narrative. No stored sidecar hash or adjudication receipt was edited. The real API-build test first failed on the stale warning and now verifies all three October 17 references in generated entries. A separate metadata test proves a valid binding cannot authorize a different narrative source. `api/entries.json` restores 06:22Z/#370, 21:05Z/#373 and 13:34Z/#366. |
| F12r | fixed prospectively@56fee1c56a615ccd60b1802c72875442b17dded1 | Every terminal citation must be authoritative. The collection test excludes boilerplate, metadata and third-party text from trusted evidence. Mixed API plus third-party citations fail for completion, supersession and dismissal; actual merged-state evidence and explicit operator dismissal pass. The audit reproduced dismissal's missing terminal check, and its added regression failed before correction. The v5 policy invalidates older review caches. The legacy cutover boundary below remains explicit. |
| F5r | fixed@56fee1c56a615ccd60b1802c72875442b17dded1 | Apply and render run outside the format-repair try. The oversized-output case now makes exactly one proposer/verifier pair, retains the input registry, and yields a pending draft. It made a second pair before correction. Schema, line-selection and output-format repair remain bounded to one repair. |
| F3r | CI budget fixed@56fee1c56a615ccd60b1802c72875442b17dded1; relevance and token budget deferred to [#386](https://github.com/ojfbot/daily-logger/issues/386), owner ojfbot | `pnpm check:action-size` needs no receipt, network, provider or output write and runs in required PR CI. It measures both actual prompt paths at 274,454 and 274,423 bytes against a 327,680-byte fixed-context limit. `action-budget.test.ts` executes the real CLI, proves it preserves input bytes, then inflates a completion condition and proves the command fails. Existing total source, complete-prompt and dated-file limits retain pending drafts without admission. A byte ceiling does not establish token-window fit. Issue #386 has measurable context-selection, duplicate-suppression and total-token criteria. |

The optional artifact issue is also fixed in the same commit. Missing, gone, malformed and bogus artifact responses return false so a later valid receipt can be inspected. Provider failure still throws and cannot establish admission or retry authority. `editorial-proof.test.ts` covers those cases and the existing immutable-name/run binding.

## Legacy cutover boundary

October 17 retains its immutable v3 live-review round for owner inspection in this ordinary source/data cutover PR. Its terminal citations include report sources and stored excerpts without transient GitHub trust metadata. Normal projection retains that receipt; this report does not claim it retroactively satisfies v5. Future reconciliation cannot reuse that older policy cache. No new live verification was authorized or performed during this correction pass. This limitation is also recorded in the verification document and audit trail.

## Proof and next review

- Final aggregate: 782 tests pass across 58 files, including the real Git merge, publication rollback, continuation and budget tests.
- Development browser: 21 journeys pass. Production bundle: six continuation journeys pass. These intercept GitHub requests; authenticated preview behavior remains unverified.
- Root, frontend and trusted-script TypeScript checks pass. Lint has zero errors and one preexisting warning.
- Nine Node feedback tests and the executable Python workflow-boundary test pass.
- `pnpm check:action-intake` preserves all 91 open and 125 completed originals, 138 holds and three protected records. Repeated projections are byte-identical. The queue remains 88 open, 126 completed, zero proposed and two dismissed.
- Actual `pnpm build:api` emits no stale time-reference warning and publishes the three inherited references. Other unresolved or mismatched clock warnings remain diagnostic.

The [verification record](../reviews/action-cutover-verification.md) contains commands, sizes and limits. The [append-only trail](../decisions/action-cutover.tsv) records the corrections and the independent GPT audit's two additional findings. The v5 prompt was tested with injected agents only. The existing live receipt remains unchanged. Hosted checks on the pushed report head and Claude's re-verification are separate observations, not inferred from local tests.

Claude: please reverify F1r, F9r, F12r and F5r, the receipt-free F3r CI gate, and the explicit legacy-receipt boundary on the pushed head. F6 and F16 retain the recorded operator ruling. The PR remains unmerged for the owner's decision.
