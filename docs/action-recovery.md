# Recover action review without losing the article

## Pause admission

Set the repository Actions variable `ACTION_REVIEW_DISABLED` to `true`. Daily generation retains a draft with action review pending and admits no suggestions or dispositions. Clean acceptance and editorial action reconciliation stop before action-model calls. Existing accepted projections continue to build. Remove the variable or set it to `false` after the repair passes CI.

Do not run a production CLI deploy. Publish repairs through a normal PR, CI, merge, and the automated deployment.

## Repair a prose-only edit

Keep the article's managed action block and acceptance status unchanged. Save the prose edit in the working tree, then run:

```bash
ARTICLE_DATE=2026-10-17 ACTION_ACTOR=ojfbot \
EDITORIAL_FEEDBACK='Correct the prose typo; retain all action decisions.' pnpm actions:rebind
pnpm check:action-intake
```

The command reads the prior article from HEAD. It verifies the old binding and writes an audited new prose binding. Decisions, evidence, identity, and model round stay the same. The command calls no model or remote API. Stage the article and its exact dated JSON file together. If time references exist, independently re-adjudicate their body binding before publication.

## Recover an interrupted write

Read `actions/registry.json.lock`. It records a PID and acquisition time. Confirm that the owning process has ended before removing the lock. Inspect the dated JSON and article against Git, then rerun the authorized reconciliation. A stale article binding blocks API publication. Never edit hashes to bypass that check.

## Diagnose an editorial receipt

An output receipt needs the matching hash-named artifact from the first attempt of `.github/workflows/editorial-revise.yml`. Other workflows cannot authorize their output by copying a run ID or a bot comment. Failed, stale, and uncertain comments are diagnostic; they never clear an outstanding request or authorize replay.

Artifacts are retained for 90 days. Deleted, expired, or unavailable evidence holds an unmerged acceptance branch. The system never infers a safe retry from its absence. Preserve that branch and its correspondence, close the stale acceptance PR, and start a fresh acceptance branch from trusted main with an explicit owner instruction. Review and port any wanted edits before invoking a new round. Merged state already has trusted-main authority, so later article reviews do not need the old transient artifact to admit that state.

## Revert the cutover atomically

Before merge, close the PR to abandon it. After merge, pause admission first and save the current baseline, dated files, article sources, and generated action feeds in a recovery branch.

If there have been no later accepted action changes, open a normal PR reverting the complete cutover merge with `git revert -m 1 <cutover-merge-sha>`. Revert the code, workflows, data layout, and generated projections together. Confirm that the pre-cutover IDs and completion objects match the pinned baseline before merging the revert.

If later decisions or admissions exist, a blind revert can discard accepted work. Keep admission paused and fix forward, or prepare a complete reverse migration in the revert PR. The reverse migration must preserve every current identity, inclusion choice, accepted disposition, completion object, and historical hold. Prove those comparisons before removing the dated store. Do not deploy a mixed writer or a Markdown fallback while preparing recovery.
