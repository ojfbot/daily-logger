# Daily cycle and issue follow-up

Use this context for daily-run, queue and follow-up questions. Read only the
sources relevant to the question. Operational evidence wins over this map.

## Which daily run?

| Workflow | What it does | Evidence to inspect |
| --- | --- | --- |
| Daily Dev Blog | Scheduled model-assisted GitHub sweep, draft, optional council, synthesis and article PR | `.github/workflows/daily-blog.yml`, `.github/scripts/daily_blog_schedule.py`, `src/collect-context.ts`, `src/generate-article.ts` |
| Editorial Revision | Applies feedback carried in a dated accept PR; publishing still requires merge | `.github/workflows/editorial-revise.yml`, the accept PR body, comments and final head |
| Daily Cleaner | After an admitted successful blog run, proposes stale-document/TODO changes as PRs | `.github/workflows/daily-cleaner.yml`, `src/clean.ts`, the triggering run reference |
| Codex scheduled tasks | Execute their saved prompts; cadence alone does not define an issue-processing scope | The matching automation's saved prompt, status and latest run receipt |
| Work follow-up | Reconciles issues, article action IDs and linked beads when an authorized session/task performs that work | Full issue/PR discussion, linked bead state and the responsible task's intake rules |

The `/daily-logger` skill in core is orientation for this project. Calling it
does not itself schedule generation or start implementation work. The observed
local daily tasks are a blog fallback check and cleaner-PR correspondence review.
Their existence does not prove a general issue worker, and their absence from
another environment does not prove those tasks were removed. Identify a separately
named scheduled skill from its actual saved prompt before making claims about it.

## Answering "will it pick up this issue?"

Interpret pickup as discovery/reconciliation unless the user asks about execution.
State which workflow you checked and which of these claims the evidence supports:

- Capture: the repository is eligible and the issue fits the collector's current
  query, ordering and limits. An eligible new issue is expected input to a later
  sweep, not a verified receipt from a sweep that has not run.
- Article suggestion: the model may turn collected issue context into a suggested
  action. Presence in context does not guarantee an article mention or action ID.
- Tracked work: a canonical issue and linked bead already exist, with a next action,
  owner, gate and verification criteria. An article action is not a bead receipt.
- Execution: the identified worker's intake/admission rules and authorization
  permit claiming the work. Do not infer this from an open issue or Available lane.

As of the October 10 source check, `getOpenIssues` fetches 30 recently updated
open issue/PR records per repo, removes PRs, prioritizes newly created or updated
issues, and keeps at most 40 issues across the fleet. Active bodies retain up to
800 characters; stale bodies retain 200. This is bounded context, not an exhaustive
backlog or guaranteed ingestion. Confirm current behavior in `src/collect-context.ts`.
The collection window comes from `src/activity-window.ts`, not the invocation time.

For implementation intake, fetch the full issue and relevant discussion directly.
The logger's body preview can omit acceptance criteria and human gates. A PR body
also does not represent all its comments. Reuse canonical issue/action/bead IDs
before creating anything; remote readback is the receipt after a mutation.

## Editorial tangents and queue closure

When asked to drain an article's queue, include relevant editorial PR comments and
operator tangents in the investigation, not only workflow feedback delimiters.
Compare the request with existing issues/beads before proposing a new follow-up.
Keep discovery, a filed issue, a retained gate and verified delivery distinct.
The editorial workflow revises article prose; it is not evidence that a tangent
became structured work. Automated tangent intake remains separate design work.

A "good day" can close a satisfied original action while retaining a linked human
gate. For each retained gate, give the decision needed, operator owner, requested
review checkpoint and evidence packet. State whether the checkpoint was agreed.
At a later authorized review, resurface an elapsed checkpoint with a concrete
decision request instead of copying "still open" indefinitely. This does not arm
a reminder, authorize dispatch, or make an unagreed checkpoint a deadline.

## Timing and receipts

Merged main observed on October 10 declares 03:30 America/Chicago for Daily Dev
Blog. Check the live merged declaration rather than copying a stale 09:00 UTC
description. The collector's activity-window anchor is a separate source contract;
do not assume it moved when the trigger schedule changed.

Compare nominal local kickoff with Actions `created_at`/`run_started_at`, generation
completion, editorial merge and deployment/published-article evidence separately.
Do not attribute the whole gap to GitHub delay or timezone configuration from the
article's visible time alone. Match a cleaner to its triggering blog run.

For local scheduled tasks, read the latest receipt and recheck current state.
A past successful host/keychain check does not establish today's access. Report
an approval timeout as an unexecuted check, not a failed workflow or missing run.
Local tasks require the app and host available; prompt edits do not establish
reliable external triggering or sleeping-host execution.

## Origin of this context

The October 10 queue/revision cycle exposed workflow-name ambiguity, discussion
outside the editorial feedback payload and the distinction between delivery and
retained human gates. Source records are [revision PR #332](https://github.com/ojfbot/daily-logger/pull/332),
[queue settlement #340](https://github.com/ojfbot/daily-logger/pull/340), and
[audit-locked metadata follow-up core #524](https://github.com/ojfbot/core/issues/524).
These are evidence for the context correction, not authorization to change those
issues, queue storage, schedules, credentials or fleet-runner admission.
