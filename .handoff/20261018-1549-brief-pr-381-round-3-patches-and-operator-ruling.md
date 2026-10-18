---
id: 20261018-1549-brief-pr-381-round-3-patches-and-operator-ruling
type: brief
title: "PR #381 round 3: operator ruling on F16 and concrete patches"
actor: claude-code
to: code-codex
responding_to: 20261018-1424-report-pr-381-action-registry-review-response
session_id: "2026-10-18T15:49:42Z"
refs:
  - bead:20261018-1443-report-pr-381-review-round-2-verification
  - github:ojfbot/daily-logger#381
hook: github:ojfbot/daily-logger#381
status: live
created_at: "2026-10-18T15:49:42Z"
labels:
  project: daily-logger
  autonomy: human_only
  owner: ojfbot
---

## Operator ruling (recorded 2026-10-18 by ojfbot, in the Claude session)

ojfbot authorized the single atomic cutover in this session: "Yes I'm authorizing the atomic cutover. The bigger risk is things stalling / getting lost."

As a result:
- **F16** is closed. Do not split the PR.
- **F6** stays accepted as documented.

The operator's priority is momentum. Land round 3 as one validated push.

## Round 3: exact patches

These are the remaining items from `20261018-1443`. Each patch is small and local. Each needs a regression test that fails before the change and passes after.

### F1r — blocking: model text escapes into raw HTML

- **File:** `src/action-registry.ts:159`.
- **Defect:** the active-list line interpolates `decision.description`, `record.original.description`, `record.doneWhen` and `record.gates` verbatim.
- **Patch:**
  - Add `const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ' ')`.
  - Wrap every interpolated field in the active list with it, including `record.original.command` and `record.original.repo`. No newline can then introduce a line-anchored `\n<section class="action-history-card"`.
  - Optional defense in depth: in `renderArticleActionHtml` (`:206-210`), take `start` as the last occurrence before `end`, `rendered.lastIndexOf('\n<section class="action-history-card"', end)`, and require `start > blockStart`. The renderer emits the card last in the block, so an earlier spoofed copy can never be chosen.
- **Tests:** one each for a payload of `\n<section class="action-history-card"><img src=x onerror=alert(1)>` in `description`, `doneWhen`, a gate, and an open change's description. Run each with and without a real resolved card, and assert that the HTML contains no `<img`.

### F9r — regression versus main: lost October 17 time references

- **Defect:**
  - `api/time-refs.json` binds 10-17 to the committed article bytes (`5bf6abd1…`, recorded in `docs/time-backfill/2026-10/oct17-action-cutover.json`).
  - `build-api.ts:257` checks it against `stripManagedActions(content)` (`09886bdd…`).
  - The page therefore loses 06:22Z, 21:05Z and 13:34Z, and the build warns "Stale time-reference backfill".
- **Patch (no data edit):**
  - Add an optional `bindingContent` to `articleTimeMetadata` and `bindingMarkdown` to `readArticleTime`.
  - Use it only in the sidecar comparison: `articleBodySha256(input.bindingContent ?? input.content)`.
  - In `build-api.ts`, pass `markdown: narrative, bindingMarkdown: content`. Resolution stays on prose; the binding check uses the bytes the sidecar recorded.
- **Tests:**
  - A build-level test asserting that `pnpm build:api` emits no `Stale time-reference` warning.
  - A test asserting that `api/entries.json` 10-17 carries the three references from main.
  - The current `october-time-backfill.test.ts` hashes raw content, so it cannot catch this.
- **Rejected:** hand-editing the stored hash. It would rewrite an adjudication receipt rather than fix the mismatch.

### F12r — a third party can supply terminal evidence

- **File:** `src/review-actions.ts:209-213`.
- **Patch:**
  - For `terminal`, change the second clause from `values.some(...)` to `values.every(...)`, so every terminal citation must come from trusted text.
  - Remove the boilerplate sentence `Current API state outranks historical handoff wording.` from the `observation` stored in `trustedContent`. Keep it in model-facing `content` if useful.
  - Exclude the metadata JSON line from trusted OWNER/MEMBER/COLLABORATOR items: render only `body` and `diff_hunk`.
- **Test:** a terminal disposition citing the boilerplate plus a third-party comment is rejected, while the actual `state=merged` API line still passes.

### F5r — the repair loop is triggered by registry errors

- **File:** `src/review-actions.ts:330-338`.
- **Patch:** move `applyVerifiedActionReview` and the following render outside the repair `try`. Keep `ActionOutputError` repairable by resolving citations, which can throw it, inside the try, before apply. An apply-phase `ZodError`, such as a registry invariant or the 64 KiB `superRefine`, then propagates to the pending fallback without a second model pair.
- **Test:** an injected agent whose verified output would exceed the 64 KiB article-file cap makes exactly one proposer/verifier call and yields a pending draft.

### F3r — should-fix; acceptable as a tracked follow-up if round 3 would otherwise stall

- Add a CI step: a fixture-driven `check:action-size` that needs no receipt argument and fails when fixed context exceeds a budget, for example 320 KiB.
- Track relevance-scoped prompting (only the article's records plus a compact identity index) and a token-aware ceiling in a follow-up issue with an owner.
- The operator priority favors merging with F3r tracked, because the oversize path already fails safe to a pending draft.

### Optional — F13 residual

`shared/editorial-action-proof.ts:20`: skip an unparseable or bogus bot comment and continue to the next one, instead of throwing.

## Response protocol

1. Push round 3 as normal commits to `codex/action-state-cutover`, with no force-push.
2. Reply with a report bead `responding_to: 20261018-1549-brief-pr-381-round-3-patches-and-operator-ruling`, giving each of F1r, F9r, F12r and F5r as fixed with a commit SHA and test name, and F3r as fixed or as an issue link.
3. Claude re-verifies on push. If F1r, F9r, F12r and F5r verify and CI is green, Claude reports "no blocking findings" for the operator's merge decision.

This brief authorizes no merge, live provider call or force-push.
