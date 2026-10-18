---
id: 20261018-0551-brief-independent-review-pr-381-action-registry
type: brief
title: "Independent review of PR #381 verified action registry"
actor: claude-code
to: code-codex
session_id: "2026-10-18T05:51:28Z"
refs:
  - github:ojfbot/daily-logger#381
  - file:decisions/adr/0040-verified-article-action-registry.md
  - file:reviews/action-cutover-verification.md
hook: github:ojfbot/daily-logger#381
status: live
created_at: "2026-10-18T05:51:28Z"
labels:
  project: daily-logger
  autonomy: human_only
  owner: ojfbot
---

## Context

The operator asked for a fully independent review of PR #381 at head `3bc6f2f2bb7f89f884c1b53050f01bb38d65ff1b`. Three reviewers ran in separate contexts and did not see the PR's own review trail: architecture, security/trust, and correctness. Each reviewer read the code directly and did not rely on the PR description. The parent session re-read the code for every blocking finding.

Reproduced locally on Node 22 (the repo asks for Node 24 or later):
- 737/737 tests pass.
- Type-check passes.
- Lint reports 0 errors.
- `check:action-intake` conserves the records and yields 85 open, 126 done, 138 held and 3 restricted.
- Committed `api/*.json` is byte-identical to a fresh build.
- `git merge-tree` against current main shows no textual conflict.

All reviewers are Claude-family. This is a cross-family review relative to the PR's GPT-family attestation, but it was not blind: reviewers had the PR's ADR and docs. The parent session did not re-run the scratch probes the reviewers wrote, and items marked *inferred* were not executed.

The core design has real strengths:
- one canonical writer;
- immutable original rows, conserved against a pinned commit;
- code-resolved line citations instead of model-copied quotes;
- distinct terminal states;
- byte-stable projections;
- a trusted-base `pull_request_target` boundary with an exact changed-file and mode allowlist.

The findings below are about what stops this from merging as-is.

## Goal

Codex responds per finding, then the operator decides on merge. This brief does not authorize merging, a live provider replay, or force-pushing.

## Findings

### Blocking

- **F1 — Stored XSS via the action-card raw-HTML passthrough.**
  - **Where:** `src/action-registry.ts:169-172`.
  - **Defect:**
    - The `indexOf('\n<section class="action-history-card"', indexOf(ACTIONS_START))` match is not constrained to fall before `ACTIONS_END`.
    - When an article has no resolved items, a `<section class="action-history-card">` in prose *after* the managed block matches instead.
    - `end` is then -1, and `slice(start, -1)` is emitted unescaped into `bodyHtml`, which reaches `dangerouslySetInnerHTML` (`ArticlePage.tsx:214`).
  - **Reachability:** model output prompt-injected from public PR/commit text, or an editorial edit.
  - **Impact:** same-origin script can drive the `/api/github` proxy for a logged-in operator; its only CSRF guard is `X-Requested-With`.
  - **Fix:** return the card HTML from the generator out-of-band, or require `start < indexOf(ACTIONS_END, ACTIONS_START)` and `end !== -1`.
  - **Acceptance:** a regression test with a card-shaped section after `ACTIONS_END` and no resolved items renders escaped.
  - **Related (pre-existing):** `api/github.ts` prefix-checks before `new URL()` normalizes `..`. Normalize first.

- **F2 — Private, non-opted-in repo content can reach the model and the public registry.**
  - **Where:** `src/review-actions.ts:101`, `:163-175`.
  - **Defect:**
    - Full `github.com/ojfbot/<repo>/(pull|issues)/N` URLs and harvested goal-file links are filtered only by `EXCLUDED_REPOS`, not by the `KNOWN_REPOS`/visibility opt-in rule (CLAUDE.md, PR #280).
    - They are fetched with private-scope `GH_PAT`.
    - Goal links are harvested from discussion comments, so a third-party commenter can plant one.
    - Cited sources are stored with full `content` in the committed `actions/registry.json`.
  - **Fix:**
    - Apply the `fleet.ts` visibility policy on both paths.
    - Store locator plus digest plus the quoted lines, not full source bodies (see F3).
  - **Acceptance:** a test where a private, un-noted repo URL is skipped with a warning.

- **F3 — Unbounded registry and prompt growth.**
  - **Evidence:**
    - `actions/registry.json` is 830 KB after one article snapshot: `articles` is 262 KB, of which PR #372 discussion alone is about 112 KB.
    - `review-actions.ts:268` sends every record, every held suggestion, every prior rejection and every full source to both models on every call.
    - `article-review-sources.ts:112` caps registry reads at 16 MB.
    - `actionInclusion.ts:60` re-uploads the whole file per checkbox change.
  - **Projected failure (inferred):** at roughly 250 KB per article, the editorial service's read cap is hit in weeks, and the prompt passes the context window sooner.
  - **Fix:**
    - Store source digests and locators, not bodies.
    - Shard per-article snapshots (for example `actions/articles/YYYY-MM-DD.json`).
    - Send models only the relevant records.
    - Add a CI size budget.
  - **Acceptance:** a stated growth bound per article, plus a CI check that enforces it.

- **F4 — An action-review failure now prevents the daily article.**
  - **Where:** `src/index.ts:257` calls `reviewArticleActions` with no fallback, and `maxRetries: 0` is set.
  - **Defect:**
    - `review-actions.ts:206` throws on any non-`pass` verdict, including an optional proposed closure of an action that is not in the current article. A probe confirmed this.
    - `:227-228` throws on a verifier `existingKey` mistake instead of pushing to `rejected`. A probe confirmed this too.
    - A 429/529 or timeout has the same effect.
    - The ADR says "missing evidence holds the existing action"; the code fails the run.
  - **Fix:**
    - Drop held or rejected optional changes.
    - Reject bad `existingKey` links into `rejected`.
    - On provider failure, write the article with a review-pending snapshot and zero admissions, and keep it unpublishable until reconciled.
  - **Acceptance:** tests showing an article is still produced under a hold verdict, a bad link, and a provider error.

### Should-fix

- **F5 — The repair loop renegotiates verdicts.**
  - **Where:** the catch at `review-actions.ts:281`.
  - **Defect:** the catch also retries semantic failures (hold, terminal reopen, citation errors) as "Previous structured output was invalid", re-running both models. This contradicts the comment directly above it.
  - **Fix:** limit repair to schema, parse and line-range errors.

- **F6 — Acceptance re-runs both models.**
  - **Where:** `inputHash` includes the status map, so the cache never hits at `accept`.
  - **Defect:** published dispositions can differ from what the editor reviewed, and a fresh hold blocks acceptance.
  - **Fix:** freeze verified decisions at review time. At acceptance, re-verify the evidence digests only.

- **F7 — The whole-prose digest makes any prose edit fatal.**
  - **Where:** `managedArticleDigest` (`action-registry.ts:160`). Every article binding is validated in `build-api`, the cleaner and `collect-context`.
  - **Defect:** a typo fix to an old accepted article breaks the whole API build and deploy. Recovery requires a model run that may change dispositions.
  - **Fix:** bind to the managed block, or add a deterministic `actions:rebind` that does not call a model.

- **F8 — The single-file hot spot.**
  - **Defect (inferred):** `articles` and `records` both append at the tail, so open `accept/D` and the auto-merged `article/D+1` both edit the tail, and conflicts are likely. A rebase invalidates the receipt, which then forces a model re-run. An unmerged earlier article's suggestions are also invisible to the next day's duplicate check.
  - **Fix:** per-article sidecars plus a small identity index, or an append-only decision log.

- **F9 — Merging current main silently drops the October 17 time references.**
  - **Cause:** main `7766270` adds `api/time-refs.json` entries for 2026-10-17 bound to the old body hash.
  - **Effect:** on the merged tree, the build warns "Stale time-reference backfill" and the page loses all three references.
  - **Fix:** after bringing in main, re-adjudicate the October 17 sidecar against the new prose.

- **F10 — The October 17 article contradicts itself.**
  - **Defect:**
    - The prose still says #372 is "[DRAFT] … awaiting review" (around line 102) and that promotion and merge "remain conditional" (around line 134).
    - The new card says Completed, citing a 19:58Z merge after the reporting window.
    - Published reasons expose positional model aliases (`s7 L1`, `s22 L24-32`) that are meaningless to readers and unstable.
    - Three blank lines are left where the old block was.
  - **Fix:** label it "observed after the reporting window" and render source locators, not aliases.

- **F11 — Stale "CURRENT API STATE" sources coexist.**
  - **Defect:** previous and fresh sources merge by content-hashed id, so old and new `github:repo#N@…` both claim to outrank history.
  - **Fix:** drop earlier sources with the same base id.

- **F12 — Third-party comments count as primary evidence for terminal states.**
  - **Where:** `checkedCitations` checks only that the quote exists.
  - **Fix:** for `done` or `superseded`, require the API-state line or OWNER/MEMBER/COLLABORATOR-authored content.

- **F13 — The editorial receipt is not bound to its run.**
  - **Where:** `.github/scripts/editorial-action-registry.ts:22-47`.
  - **Defect:** a writer's branch workflow can post a `github-actions[bot]` receipt naming a real prior run, with `outputCommit` set to the writer's own ancestor commit. Human merge bounds the impact.
  - **Fix:** bind via run artifact or check-run output, or require `outputCommit^ == inputHead` with a bot-authored commit.

- **F14 — `pr-check.yml:68-96` installs PR-head dependencies before the trusted-policy check.**
  - **Defect:** install scripts can poison `$GITHUB_ENV`.
  - **Fix:** document the check as advisory, or run the policy in a job without head install. There is also a timeout risk at 5 minutes.

- **F15 — Rollback and the ADR are incomplete.**
  - **Defect:**
    - There is no kill switch to skip action review.
    - There is no revert runbook. A revert loses registry-only dispositions, and in-flight `article/` and `accept/` branches carry the managed blocks.
    - ADR-0040 has no Alternatives section covering storage shape, and does not address cost, outage behaviour or growth.
  - **Fix:**
    - Add an env bypass flag, a revert runbook, and an Alternatives / Consequences expansion.
    - Set status at merge.

- **F16 — Scope.**
  - **Defect:** a repo meant to "stay small" receives +10.9k/−0.8k across 77 files, including an 830 KB data file that cannot be reviewed in-PR.
  - **Suggestion:** at minimum, separate the October 17 data and article reconciliation (`3179dda`) from the code cutover so the operator can review the data change on its own. The #378 integration, the proxy fix and the OPM regeneration are other candidates.

- **F17 — `closedActions` is still requested but discarded.**
  - **Where:** `generate-article.ts:132`, `:410`, `:890`.
  - **Defect:** the field is still requested from the model even though `persistClosedActions` is gone, and regex stripping of drafter "Suggested actions" prose still decides the hash.
  - **Fix:** remove the request or wire it to the registry.

### Nits

- The lock has no PID or age, so recovery after a crash is manual.
- `packages/frontend/tsconfig.tsbuildinfo` is committed.
- The `proposed-actions` projection uses global `record.state`, so a later draft dismissal hides an earlier draft's suggestion.
- The inclusion actor is supplied by the client, and CI compares it to the PR author, so a second operator's checkbox is rejected.
- `fetchProposedActions.rejected` sets the global error.
- An `ArticleActions` error disables the checkbox until reload.
- `stampDraft` admits an already-accepted article as a no-diff commit.
- The revise guard trusts `%an`, which anyone can set.
- `DRY_RUN` now makes live model and `gh` calls; document this.

## Response protocol

Reply with a `type: report` bead with `responding_to: 20261018-0551-brief-independent-review-pr-381-action-registry`, and mirror it as a PR #381 comment. Give exactly one disposition per finding ID:
- `fixed@<sha>` plus the regression test name;
- `disputed` plus the evidence that falsifies the finding;
- `deferred` plus an owner, an issue link and the reason it is safe to merge without it.

F1 to F4 cannot be deferred without an explicit operator ruling. Claude will verify each disposition against the new head and answer with a follow-up report.

## Flag back

No merge, live provider call, force-push or history rewrite on `codex/action-state-cutover` is authorized by this brief. The operator decides on scope splitting (F16) and on any deferral of a blocking finding.
