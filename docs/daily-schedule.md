# Daily article timing and reporting coverage

The workflow start target is 03:30 America/Chicago. The initial draft should be
public by 04:00. Human editorial acceptance is a separate later decision.
Independent review remains at 07:00 until the revised path has live evidence.
These targets are not a claim of guaranteed GitHub delivery.

## Reporting interval

The article date labels the interval from yesterday at 03:30 Chicago, inclusive,
to today at 03:30 Chicago, exclusive. The interval spans 23 hours at spring DST,
25 hours at fall DST, and 24 hours otherwise. It is not the previous calendar day.
Seven-day context uses seven local calendar periods with the same cutoff.

`src/activity-window.ts` owns the interval used by collection and the run gate.
Both article and persona-report CLIs default to today's Chicago calendar date;
`DATE_OVERRIDE` still selects an explicit date. Before 03:30, today's interval
is incomplete and collection stops rather than silently selecting a prior date.
Collection rejects an interval whose ending cutoff has not arrived. Commit
eligibility keeps the existing author-date policy. Merged PRs, issue closures,
recent PR activity, skill reports and local telemetry use their recorded event
timestamps. The start is inclusive and the end is exclusive in every filter.
The GitHub commit query also supplies an upper bound; local filtering excludes
the endpoint even if the remote query includes it.

Current open PRs, issues, ADRs, project vision and action dispositions remain
current context. GitHub status and description fields cannot reconstruct their
historical state at the cutoff. A PR opened during the interval and merged later
is not a shipment in that interval. Prompt sections distinguish bounded events
from the collection-time snapshot. Previous article excerpts precede the article
date. Existing page caps, current-state APIs and inaccessible records still limit
historical coverage. No exhaustive event-history claim is made.
Skill comments use the last report update timestamp. A report edited after the
cutoff cannot prove its earlier body, and an updated report's credits are not
individual skill-invocation event counts.

## Fallback dispatch guard

The native workflow already declares 03:30 America/Chicago. GitHub supports the
timezone field and documents that scheduled delivery can be delayed or dropped:
[schedule event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
The cause of any particular late trigger remains unknown.

The existing local fallback is still scheduled for 04:00. Installing this source
does not change it. Moving that existing task to 03:30 and adopting a revised
saved prompt require a separate owner decision after source review and merge.
No new scheduler, daemon or automation is introduced by this change.

With `watchdog --dispatch`, the accepted script requires today's Chicago date.
If the local invocation is at most five minutes early, it waits in intervals no
longer than 30 seconds, then reads fresh GitHub state. Earlier invocations,
date rollover or a clock that fails to reach the target stop without dispatch.
A final clock/date check precedes the POST. Read-only historical checks remain
available without `--dispatch`; deliberate generation backfills retain the
existing explicit workflow-dispatch path.

The watchdog retains the existing checks for an article, an active or successful
run, a failed/cancelled run, orphan branches and a second run read before POST.
Workflow concurrency and fresh preflight handle a native/manual arrival race.
There is at most one POST in an invocation. An uncertain or receipt-free POST
never gets replayed automatically. A failed run requires inspection rather than
an automatic retry. A no-activity result or editorial rejection is not a public
draft receipt.

## Evidence for the two targets

Record the workflow run's actual start separately from `created_at` and the
`Generate article` step start. Checkout, preflight and setup normally precede the
model step. Measure start-target drift from `run_started_at`; do not require the
model call to begin at exactly 03:30. No seconds-level tolerance is asserted.

Record generation completion, article PR merge and deployment separately. To
verify public availability, read the public article and
`https://log.jim.software/api/articles/YYYY-MM-DD.json` without following a private
login redirect. Match its date, `sourceBlobSha` and rendered content to the
generated source and serving projection. The article route returning an SPA
shell, a green workflow or deployment success alone is insufficient.

The October 19 audit's eight attempts took 7m46s–9m41s from run creation through the CI
production command. A run created around 03:30 therefore suggests completion
around 03:40, before extra host, queue, CI or cache delay. This is an observation,
not an upper bound or proof of a future 04:00 deadline. Local host availability,
the app, credentials, GitHub, required checks, merge eligibility and publication
remain dependencies. Keep the independent reviewer at 07:00. Adopting the earlier
fallback prompt must retain read-only follow-through and report an unmet 04:00
target without dispatching a second generation to repair publication.

## Repeatable verification

Run the native controls without providers or live dispatch:

```sh
pnpm exec vitest run src/__tests__/activity-window.test.ts src/__tests__/cli-reporting-date.test.ts src/__tests__/collector-window-boundaries.test.ts src/__tests__/collect-telemetry-window.test.ts
pnpm exec python3 -m unittest discover -s .github/scripts -p test_daily_blog_schedule.py
pnpm type-check
pnpm lint
```

These controls verify local behavior with synthetic GitHub and telemetry inputs.
They do not qualify installed scheduling, GitHub concurrency, public delivery or
producer/provider execution. Those need matching scheduled live receipts after
publication and separate activation approval.

## Bounded adoption decision

This source repair can be adopted independently to correct reporting coverage and
prevent an early fallback POST. It does not repair GitHub's delayed scheduled-run
creation. Keeping the existing fallback at 04:00 leaves no generation or publishing
budget before the 04:00 public-draft target, so the timing goal remains unqualified.
After source adoption, the owner can separately approve moving that same fallback
to 03:30 and updating its prompt to use the accepted-source watchdog, adding
bounded read-only delivery follow-through while preserving the uncertain-POST hold. That uses the existing
task; it does not introduce a Mac dispatcher. The reviewer remains at 07:00.

For the first production run after any approved activation, save the installed task
ID, full prompt/schedule read-back, source commit and watchdog output. Match the
returned run ID with the native/manual run census, workflow creation and start,
Generate step start/end, article commit/blob, PR merge and deployment. At or before
04:00 Chicago, capture an unauthenticated timestamped read of both the target
article and its JSON projection, with date, sourceBlobSha and rendered content
matched to the generated source. A shell-only route response or a cached earlier
article does not pass. Record duplicate-generation count and any missed target;
unknown reads remain unknown. Do not issue another generation to repair a late
publication. Repeat on subsequent production dates and DST transitions before
claiming demonstrated reliability; one successful day is one observation.
