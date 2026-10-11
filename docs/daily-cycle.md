# Daily-cycle source index

This is a reference for core's `/daily-logger` orientation workflow. It identifies
primary evidence, not a scheduler or an issue-processing worker.

## Workflow definitions

| Workflow | Purpose | Defining sources |
| --- | --- | --- |
| Daily Dev Blog | Collect activity, generate an article, and open its article PR | `.github/workflows/daily-blog.yml`, `.github/scripts/daily_blog_schedule.py`, `src/index.ts` |
| Editorial Revision | Revise article prose from accept-PR feedback | `.github/workflows/editorial-revise.yml`, full accept PR discussion, final head and merge |
| Daily Cleaner | Propose stale-document and TODO changes after an admitted successful blog run | `.github/workflows/daily-cleaner.yml`, `src/clean.ts`, triggering blog-run receipt |
| Codex scheduled task | Execute its saved prompt within its existing permissions | Matching task name, saved prompt, status, schedule, and latest receipt |

The observed local tasks cover blog fallback and cleaner-PR correspondence.
The operator's separately described 24-hour issue-processing task has not been
identified in this investigation. Its intake remains unresolved, not disproven.

## Article intake and projection

| Evidence question | Source |
| --- | --- |
| Eligible repositories | `src/fleet.ts` |
| Activity-window bounds | `src/activity-window.ts` |
| Issue query, ordering, and body previews | `src/collect-context.ts` |
| Article prompt and suggested output | `src/generate-article.ts` |
| Action identities and closure schema | `src/schema.ts` |
| Cross-article closure and API projections | `src/index.ts`, `src/build-api.ts`, `api/actions.json`, `api/done-actions.json` |

The October 10 source snapshot fetches 30 recently updated open issue/PR records
per repo before excluding PRs. It prioritizes active issues and retains at most
40 across the fleet. Active body previews contain at most 800 characters, stale
previews 200. These bounds describe article context, not a saved agent's intake.
Full issue bodies and relevant PR comments remain the evidence for human gates
and editorial tangents outside the revision payload.

## Timing evidence

The October 10 merged declaration schedules Daily Dev Blog at 03:30
America/Chicago. The activity-window anchor is a separate contract. Actions
creation and start, generation completion, editorial merge, and deployment each
have separate receipts. The article's visible time alone cannot locate a delay.

## Origin

The [revision PR #332](https://github.com/ojfbot/daily-logger/pull/332) and
[queue settlement #340](https://github.com/ojfbot/daily-logger/pull/340) exposed
the workflow-identity and editorial-tangent gaps.
[Core #524](https://github.com/ojfbot/core/issues/524) places its human gate beyond
the collector's active-body preview. This context repair changes no intake,
scheduling, storage, or execution permissions.
