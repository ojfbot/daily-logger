# PR-review queue qualification, October 8, 2026

## Symptom

Six published `/pr-review` suggestions reference merged PRs; two requested outcomes have complete historical evidence and four retain validation, acceptance or coverage obligations that merge status alone does not satisfy.

## Scope and authorization

The operator requested a lightweight pass across this category and explicitly authorized retiring an original review instruction after a linked GitHub investigation issue and queue bead preserve unmet work. This permits review-instruction settlement, not a claim that the transferred work is complete. Merge approval for this settlement PR remains a separate gate.

Opening snapshot: daily-logger `c44f936f77fa1a1e9eaa4538b86e3ea55384a1c3`, 81 open / 108 done, six `/pr-review` actions. The prepared projection is 75 open / 114 done, zero `/pr-review`; it remains prospective until merge and deployed readback. Four unresolved obligations move into three investigation issues. This does not remove four obligations from the broader fleet backlog.

## Evidence and dispositions

| Original action | Evidence | Disposition |
| --- | --- | --- |
| `act-2026-08-02-pr-review-2641d0` | [core #359](https://github.com/ojfbot/core/pull/359) merged `5e71c6297da95814f5ea9ab11b844a13f795f1b6`; current catalog marks user scope and installed skill resolves. Helper replay returns lite from `/private/tmp`, full with 26 registry entries from `/Users/yuri/ojfbot`. No complete charting-session receipt was found | Transfer workflow validation to [core #507](https://github.com/ojfbot/core/issues/507), bead `core-task-f130ba6a` |
| `act-2026-07-25-pr-review-33b3df` | [f1-doctrine #1](https://github.com/ojfbot/f1-doctrine/pull/1) merged `4fe026cf3b95d3ee19face3989c5806555a0039a`. Compute-boundary ADR committed in S0 `5636139` before the merge. All 33 registry nodes carry `substrate_call_template`, 28 full and five declared partial; taxonomy v2 supersedes v1 through documented S1 grill. Gate document is committed with PASS and both caveats | Historical review/merge prerequisites fulfilled; existing F1 capability/experiment issues remain open |
| `act-2026-06-11-pr-review-f028f2` | [daily-logger #209](https://github.com/ojfbot/daily-logger/pull/209) merged at `2026-06-11T01:18:29Z`, [#210](https://github.com/ojfbot/daily-logger/pull/210) four seconds later. Current source has the June 10 draft digest and zero daily articles in the requested May 19–June 9 window. Digest explicitly includes all four dark repos | Transfer coverage/substitution decision to [daily-logger #323](https://github.com/ojfbot/daily-logger/issues/323), bead `dail-task-5e3f1111` |
| `act-2026-05-18-pr-review-e902e3` | [core #118](https://github.com/ojfbot/core/pull/118) merged Proposed text; ADR-0079 remains Proposed on core `65c24b09e19f346b02ee39b00b2d1c46858ad4e6` | Transfer explicit acceptance/rejection decision to [core #508](https://github.com/ojfbot/core/issues/508), bead `core-task-997ccfbb` |
| `act-2026-05-18-pr-review-42141c` | [core #121](https://github.com/ojfbot/core/pull/121) merged at `2026-06-02T02:10:53Z`, before #118 at `02:14:09Z`; ADR-0080 and its policy dependency remain Proposed. Descriptive overlap does not prove accepted-policy conformance | Transfer policy dependency and scanner consistency review to the same [core #508](https://github.com/ojfbot/core/issues/508) and bead, preserving both source IDs |
| `act-2026-04-30-pr-review-8f36f1` | [Beaver #27](https://github.com/ojfbot/beaverGame/pull/27) merged `b10da73a976bbba74702951b19c52b3389612535`, selecting merge-as-spec. The required [decision comment on #28](https://github.com/ojfbot/beaverGame/pull/28#issuecomment-6072669179) links the merge and preserves triangle-exact sampling limits. Conditional extract-before-closing does not apply | Historical disposition and correspondence fulfilled; no current Babylon parity claimed |

Immutable source anchors:

- [Wayfinder resolver](https://github.com/ojfbot/core/blob/65c24b09e19f346b02ee39b00b2d1c46858ad4e6/.claude/skills/wayfinder/scripts/resolve-anchor.mjs), blob `3bc9dad6edbcc0d7fcf4ab7d79fdea8faca32288`, matched to the replayed local helper.
- [ADR-0079](https://github.com/ojfbot/core/blob/65c24b09e19f346b02ee39b00b2d1c46858ad4e6/decisions/adr/0079-vault-page-lifecycle-policy.md) and [ADR-0080](https://github.com/ojfbot/core/blob/65c24b09e19f346b02ee39b00b2d1c46858ad4e6/decisions/adr/0080-vault-staleness-scanner.md) retain Proposed status. No acceptance is inferred from their merge.
- [Historical F1 compute-boundary ADR](https://github.com/ojfbot/f1-doctrine/blob/4fe026cf3b95d3ee19face3989c5806555a0039a/decisions/adr/draft-raqg-not-rag.md), [registry](https://github.com/ojfbot/f1-doctrine/tree/4fe026cf3b95d3ee19face3989c5806555a0039a/registry/nodes), [taxonomy v2](https://github.com/ojfbot/f1-doctrine/blob/4fe026cf3b95d3ee19face3989c5806555a0039a/schema/taxonomy.md), and [recorded gate](https://github.com/ojfbot/f1-doctrine/blob/4fe026cf3b95d3ee19face3989c5806555a0039a/docs/gates/2026-07-24-phase-keying-relevance.md). Original criterion requires a committed compute-boundary ADR, not acceptance; source history supplies that pre-merge evidence.
- [Backfill digest](https://github.com/ojfbot/daily-logger/blob/c44f936f77fa1a1e9eaa4538b86e3ea55384a1c3/_articles/2026-06-10.md). No daily files exist in the window at that source revision. All four dark repo names appear in the digest, so the historical ordering deviation alone does not prove omission.

## Cause map

Confirmed: review suggestions combine merge instructions with validation and human-decision obligations. Confirmed: PR terminal state proves neither ADR acceptance nor full workflow/daily coverage. The two fully evidenced requests can be retired; the other four cannot be described as delivered. Root causes of any runtime defects remain unknown because this lightweight pass did not reproduce a runtime failure.

## Candidate fixes

1. Retire the two fulfilled requests using the existing ledger and unchanged original identities.
2. Retire the four obsolete review instructions only as transferred, after assigned issues and Available beads preserve their unmet criteria. The two vault requests share one coherent investigation; neither source identity is lost.
3. Resolve workflow validation, human ADR dispositions and historical coverage decisions in their linked venues before proposing implementation fixes. No new scheduler, queue, runtime migration, ADR acceptance or bulk generation is part of this settlement.

## Verification experiments and checks

- Read back each new issue as open, assigned to `ojfbot`, labelled `bug`, carrying its original IDs and bead backlink. Read back the same beads as Available, unexpired, human-only, gate-0, with issue URL and original IDs in the supported writer's title/why fields. All checks passed before ledger preparation.
- Exercise mode detection from registry-free and registry-resolvable directories, retaining the distinction between helper tests and a complete Wayfinder session. These two helper probes passed; complete workflow validation remains in #507.
- Validate the six new ledger records with existing schemas and deterministic IDs; preserve all 108 prior dispositions and all other 75 open actions and order; check legacy matching does not close extra work.
- Rebuild via `pnpm build:api` twice and compare all 132 JSON hashes. Do not trigger a production article or claim a fresh F1 blind-judge run. Independent settlement review, CI, human merge and live queue readback follow as separate gates.

## Tracking and attribution

Follow-up issues and beads are verified open/Available. They are not marked complete when the source review instruction is retired. Bead expiry is October 14 UTC for this medium-size posting; no work was claimed or dispatched, and no roadmap slice or autonomy promotion was invented.

This is a Codex-authored lightweight retrospective using the investigate skill, with a subsequent PR-review audit of the settlement diff. Exact runtime model, effort and resource observations are unavailable and remain unknown. No exchange-schema version or independent authentication of human authority is asserted. The operator's direct policy choice authorizes transfer; it does not itself approve merging a subsequently prepared revision.
