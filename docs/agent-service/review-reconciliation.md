# DailyLogger review reconciliation

Recorded 2026-11-17 America/Chicago. Yuri Codex returned its review through HelpDesk as session `dl-delivery-20261117`. Yojimbo's coordinating session is `dailylogger-plan-20261117`.

The review is received and its three findings are accepted as plan defects. The architecture and roadmap now describe the corrections below. This records design reconciliation; it does not claim those corrections are implemented or qualified in production.

## Review and delivery evidence

| Record | Evidence and meaning |
| --- | --- |
| Review thread | `6103377f-85ce-4528-ba9c-df58fc8ab11b` |
| Review reply | Sequence `11966`, message `ebdc85cd-93d8-487e-aeff-caf28d76bb70`; exact reply read through HelpDesk |
| Joint delivery thread | `77967b66-fa56-420a-b047-0703144b4c83` |
| Delivery scope and reported owner choices | Sequence `11963`, message `2a6b2f32-2d6f-4fbd-b9fa-e724eac6744b` |
| Yuri existing-reader baseline | Sequence `11979`, message `03ce9be7-f084-4436-b732-6d2da620be16`; reported offline browser/API verification, not reclassified as Yojimbo evidence |
| Reported theme choice | Sequence `11989`, message `b01ad93a-412e-4bec-b779-bb8f762f5109`; dark default with persistent accessible light option |
| Yuri prototype receipt | Sequence `11997`, message `3f97b0dd-bfb5-4fc3-8d3f-e42cc15bdd9c`; sample data and simulated writes; the later portable archive was imported and checked as recorded below |
| Yuri follow-up review | Sequence `12118`, message `02a99574-5105-4324-8059-8c61c385808e`; separate persistent Cleaner migration, explicit shadow rewrite tests, and correction of the unapproved late-publication Cleaner rule |
| Direct owner instruction in Yojimbo chat | “Check helpdesk. i authorize you to be helpdesk conductor and run sessions and make model calls for yojimbo child sessions” |

Yuri attributes the delivery choices to owner decisions in its chat. They are adopted here as attributed design inputs, with live activation left to the qualified release path. A signed peer message is correspondence evidence, not a runtime grant. Supervised child work in this chat is authorized directly by the owner; no unattended listener enablement follows from the handoff.

## Findings and corrections

| Finding | Source assessment | Architecture and roadmap correction | Required implementation proof |
| --- | --- | --- | --- |
| Initial approval can act on a newer article than the one shown | The initial `stampDraft` request carries date/title and re-fetches a source; stricter continuation controls already exist and must survive migration. | Bind initial acceptance to displayed article/projection/action revision and expected proposal head. Keep rewrite requests distinct from approval of resulting bytes. Retain feedback and the trusted exact-head receipt. | Concurrent source/proposal changes reject stale approval; feedback survives; checks and merge apply only to the approved revision. |
| Local and Actions producers lack a shared effective handover fence | A GitHub run census cannot reveal a local write being prepared; local leases do not cancel remote effects. | One independently reachable publication authority and enforcing gate for both producers; serialize transfers and effects; retire bypass credentials and reconcile unknown writes/queued merges. | Transfer with NAS unreachable; stale-epoch requests cannot publish; unknown writes or unresolved queued auto-merge hold failover. |
| Draft timing and Cleaner admission need end-to-end receipts | Existing timing documentation already separates 03:30 start, 04:00 public readback, later human acceptance, and 07:00 review. Cleaner currently uses workflow/ready-step success and later checks out current source. | Budget checks/merge/deploy/readback inside the deadline. Retain the independent review. Keep Cleaner manual until Publisher and Cleaner qualification, then admit only verified local publication receipts with immutable article/action inputs. | Real page and JSON match expected source/date/status/actions; Actions-failover days remain manual; Cleaner input revisions are pinned and holds survive. Settle late-publication eligibility before automatic activation. |

Two related defects in the initial proposal were also corrected: an owner interrupt before first publication would block the overnight Draft target; offline replays cannot replace the required three eligible live local Drafts in qualification. The revised plan separates the two article lifecycles and requires extending observation when live eligibility is insufficient.

## Follow-up review: sequence 12118

Yuri's follow-up identifies missing delivery detail in M3/S08: Cleaner must become a separate persistent LangGraph workflow in DailyLogger, not remain an unchanged Actions runner behind a new admission check. The revised architecture and roadmap now specify manual date/repository inputs with dry-run defaulting to true, independent pause and model-budget controls, CLI parity on pinned inputs, a separately admitted canary, and recovery after a branch push but before PR creation. Publisher and Cleaner both qualify in M3. Automatic Cleaner remains gated on Publisher's seven accounted intervals, three eligible live local Drafts, restore and production exact-version acceptance, plus Cleaner's own workflow proof. Actions-failover days remain manual.

The earlier revision also imposed a permanent manual-Cleaner rule on late but eventually verified local publication without owner approval. That rule is withdrawn from the plan. Late-publication eligibility is an unresolved owner policy decision to record before automatic Cleaner activation; a missed 04:00 target still requires an explicit timing result and eventual readback evidence.

M2 shadow exit now explicitly requires two successive rewrites on the same PR with original and later feedback retained, plus rejection if the proposal advances during required checks. This evidence is required before production ownership transfer. The LAN workspace remains parallel, and production cutover still uses the existing editor. These are reconciled future delivery requirements; Cleaner migration and production editor qualification are not implemented by this M1A repair. The Git-read, provenance, filesystem and parsing fixes are recorded in the [M1A verification](m1a-verification-2026-11-17.md).

## Implementation boundaries

The refreshed source baseline is `8b6263ad9a798eae20b3573546cf0ae762bff661`. Implementation uses isolated branch `codex/dailylogger-service-m1`; the original checkout's planning changes remain preserved.

The first delivery is M1A: recorded fixture input, a real persisted LangGraph workflow, a deterministic reviewer, restart/resume, and a Draft plus dated action artifact verified through the existing reader. A local development checkpointer is not PostgreSQL production qualification. The fixture's pending candidates must remain pending; replay must not admit or settle actions.

The full LAN editor is a parallel increment. Its design includes a Draft inbox, revision history, any-two comparison, retained feedback and repeated rewrites, restore as a new revision, and exact-version acceptance. Public cutover uses the existing editor and preserves public URLs. Production schedules, publication, merges, Cleaner activation, and listener configuration are outside the offline slice.

## Current source references

Resolve these against the refreshed baseline rather than the original stale checkout:

- [`stampDraft.ts`](../../packages/frontend/src/utils/stampDraft.ts): initial acceptance source selection and feedback attachment.
- [`editorial-continuation.ts`](../../api/_lib/editorial-continuation.ts) and [`editorial-revise.yml`](../../.github/workflows/editorial-revise.yml): existing proposal-revision, write-receipt, and trusted workflow boundaries.
- [`daily-schedule.md`](../daily-schedule.md): local reporting interval, public readback target, and separate independent review.
- [`daily-cleaner.yml`](../../.github/workflows/daily-cleaner.yml) and [`daily_blog_schedule.py`](../../.github/scripts/daily_blog_schedule.py): current Cleaner admission and source handling.
- [`clean.ts`](../../src/clean.ts) and [`cleaner.ts`](../../src/cleaner.ts): existing Cleaner CLI, collection/validation pipeline, and PR effects to preserve through the service migration.
- [`action-intake.md`](../action-intake.md) and [`action-recovery.md`](../action-recovery.md): canonical identities, pending state, grants, and recovery holds.

Subsequent verification results belong in a dated M1A receipt with exact commands, output identities, source version, and stated limits. A child session's report must be checked before it is presented as delivery evidence.

## Imported prototype verification

The archive supplied with sequence 12118 was downloaded through the configured HelpDesk transfer root, checked against its declared digest, and extracted in isolation. It contains only `index.html` and `design-notes.md`. Independent offline browser checks passed dark default despite a light system preference, persistent explicit light selection, all nine original revision comparisons, restore as a new revision, two rewrites with retained feedback, failed rewrite/retry, stale acceptance rejection, simulated checks/publication, keyboard navigation, and wide/narrow layouts without page overflow. No external requests or script errors were observed.

One minor usability defect remains with Yuri's prototype: after restoring on a narrow screen, the focused new revision is partly clipped in the horizontal history scroller because focus suppresses scrolling. Return that item to the prototype owner before carrying the interaction into the real editor. Sample-state behavior and simulated publication do not qualify backend authentication, durable approvals or production acceptance.
