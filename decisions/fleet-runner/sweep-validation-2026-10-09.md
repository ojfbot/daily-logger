# Sweep validation and queue closure, October 9, 2026

## Request and scope

The operator requested a fresh validation of daily-logger PR #280, followed by an evidence-backed response closing its suggested action using the October 8 queue-settlement procedure. This is collection-only validation plus ledger settlement. It does not generate or publish an article, change discovery policy, or modify repository protections.

Original action: `act-2026-09-25-validate-b892d7`. Today's reminder: `act-2026-10-09-investigate-abb8d9`. Both IDs, commands, descriptions, source dates and repo fields are preserved. The reminder incorrectly names core; the actual collector belongs to daily-logger. Preserving that historical field preserves identity rather than rewriting provenance.

## Evidence

- [PR #280](https://github.com/ojfbot/daily-logger/pull/280) merged on September 24. The [successful production generation run](https://github.com/ojfbot/daily-logger/actions/runs/37940663039) on October 9 executed the implemented collector; the corresponding article was merged through [PR #326](https://github.com/ojfbot/daily-logger/pull/326).
- Fresh validation used clean current-main revision `c0321638a051a5440be7feb9f12e6a95f14911e8`, associated with [PR #327](https://github.com/ojfbot/daily-logger/pull/327). Collection ran October 9, 14:56:39–15:00:06 UTC, or 09:56:39–10:00:06 America/Chicago.
- [Current package scripts](https://github.com/ojfbot/daily-logger/blob/c0321638a051a5440be7feb9f12e6a95f14911e8/package.json) contain no `sweep:dry`. [The actual collector](https://github.com/ojfbot/daily-logger/blob/c0321638a051a5440be7feb9f12e6a95f14911e8/src/collect-context.ts) uses single-page capped queries with a 16 MB buffer. [Fleet discovery](https://github.com/ojfbot/daily-logger/blob/c0321638a051a5440be7feb9f12e6a95f14911e8/src/fleet.ts) queries the live org, applies policy exclusions and requires notes for non-public repos.
- The committed [machine-readable receipt](sweep-validation-2026-10-09.json) retains only aggregate counts, revision, times and public-repo signals. Raw context, private repo names, local telemetry and credentials are not published.

## Fresh results

| Criterion | Result | Evidence and limits |
| --- | --- | --- |
| Live discovery rather than cached membership | PASS | `gh repo list ojfbot --limit 300` listed 56 repos; no `FLEET_REPOS` override was set; all 45 selected repos were collected. This does not prove discovery beyond its explicit 300-repo limit. |
| No old pagination/buffer drop | PASS | Zero non-ADR API skips. Core supplied 7 merged PRs and 5 recent PRs; daily-logger supplied 27 merged PRs and 17 recent PRs. Existing collector tests passed, including the synthetic page larger than the old 1 MB buffer. The implemented fix intentionally removes pagination from capped API calls. |
| Private repos without opt-in excluded | PASS | Four unnoted private repos were skipped; zero reached collected membership. |
| Policy exclusions honored | PASS | Zero excluded repos reached collected membership. |
| Collection returns activity | PASS | 37 commits, 38 merged PRs, 25 recent PRs, 3 closed issues and 199 ADRs. Commit/recent-PR and merged-PR windows differ by design; these counts are not a count of today's shipments. |
| Existing regression checks | PASS WITH NOTES | `pnpm test`: 279 passed; `pnpm type-check`: passed; `pnpm lint`: no errors and one existing warning at `src/__tests__/schema.test.ts:195`. |

Twenty-three API skips were missing `contents/decisions/adr` directories. No commit, PR or issue request was skipped. Empty shell/cv-builder activity is not presented as proof of current activity. The API sweep is a sequence of requests, not an atomic org snapshot.

## Reproduction

Install the locked dependencies with `pnpm install --frozen-lockfile` in a clean checkout of the named revision. Run only the exported collector, leaving fleet discovery unpinned and local telemetry disabled:

```sh
TELEMETRY_DIR=/tmp/daily-logger-no-telemetry \
SKILL_DISPOSITIONS_PATH=/tmp/daily-logger-no-telemetry/dispositions.jsonl \
pnpm exec node --import tsx --input-type=module -e 'import {collectContext} from "./src/collect-context.ts"; const c=await collectContext("2026-10-09"); console.log(JSON.stringify({repos:c.repos.length,commits:c.commits.length,mergedPRs:c.mergedPRs.length,recentPRs:c.recentPRs.length}))'
```

The recorded run also compared fresh membership with `classifyFleet()` on a separate live listing and asserted zero missing eligible repos, zero unnoted private inclusion and zero policy-excluded inclusion. No generation entry point was invoked. Replays on later days may differ because PR and issue queries use live updated state.

## Disposition

Both suggested actions are fulfilled by this fresh receipt. The original's nonexistent command and incorrect pagination expectation are superseded by validation of the actual implementation, not by inventing a new script. The reminder's question about production use is answered by the successful October 9 production run and retained implementation on current main.

The prepared queue projection moves from 80 open / 114 dispositions to 78 open / 116 dispositions. These counts remain prospective until PR merge and deployed readback. All other records and order must remain unchanged. Article projections remain historical and unchanged; no editorial acceptance is implied by action closure.

## Queue verification

Existing action and closed-action schemas and deterministic IDs pass for both dispositions. All prior 114 dispositions and all other 78 open actions retain their content and order. Legacy matching closes no additional records. Two `pnpm build:api` runs produced byte-identical output across 133 JSON files. The rebuild also projected the already-accepted October 9 article from main; that unrelated pre-existing projection change was excluded from this settlement diff. `git diff --check` passes. Merge, CI and deployed readback remain the final publication checks.
