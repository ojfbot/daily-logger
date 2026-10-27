# Daily-cycle source index

This is a reference for core's `/daily-logger` orientation workflow. It identifies
primary evidence, not a scheduler or an issue-processing worker.

## Workflow definitions

| Workflow | Purpose | Defining sources |
| --- | --- | --- |
| Daily Dev Blog | Collect activity, generate an article, and open its article PR | `.github/workflows/daily-blog.yml`, `.github/scripts/daily_blog_schedule.py`, `src/index.ts` |
| Editorial Revision | Revise article prose from accept-PR feedback | `.github/workflows/editorial-revise.yml`, full accept PR discussion, final head and merge |
| Review held article actions | One manually authorized native review of held suggestions on an already Accepted article; produces an unmerged dated proposal | `.github/workflows/review-held-actions.yml`, `scripts/review-held-actions.ts`, reviewed owner grant and operation reservation |
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
| Action identities, reviewed dispositions, and closure guard | `actions/registry.json`, `src/action-registry-schema.ts`, `src/review-actions.ts` |
| Reviewed argument-bearing admission and source proof | `action-admissions/`, `src/action-intake.ts`, `docs/action-intake.md` |
| Cross-article canonical projection | `src/action-registry.ts`, `src/build-api.ts`, `api/actions.json`, `api/done-actions.json`, `api/proposed-actions.json` |

The October 15 repair admits only its three reviewed argument-bearing suggestions.
The registry cutover preserves 88 open and 125 completed rows, while 138 earlier
omissions remain held pending a separate admission decision. Protected reviewed
dispositions are context, not execution or settlement authority. Verified article
receipts govern new admission and ordinary dispositions, including source-bound exact-invocation
captures under the current ordinary review contract; this does not backfill historical holds. Static APIs project those
records; prose does not admit or close work. See [Action intake](action-intake.md).

### Article acceptance with unresolved actions

First clean acceptance can complete an article while its captured suggestions
still need independent review. The article is Accepted; the action review stays
pending. Both the initial human Accept route and the guarded clean-continuation
route record these outcomes separately. This fallback does not apply to later
revisions of an already Accepted article or replace a verified action round.

The article card and Actions index show the original candidate IDs as **Needs
review**. These held suggestions cannot dispatch, admit new queue entries, or
close existing work. Existing queue records and history remain intact. A later
native action review can resolve the same candidates after full validation and
independent verification; accepting the article supplies no action verdict.

An incomplete review retains existing source custody and fresh source locators
and digests, with an explicit indication that fresh raw content was not retained.
It does not upload raw evidence. Unknown provider, transport, storage, integrity,
or concurrent-write failures still stop acceptance. See `scripts/reconcile-actions.ts`,
`src/action-registry.ts`, and `shared/editorial-action-proof.ts` for the completion
boundary and its proof. Surfacing held work is not a claim that unattended
next-day recovery or queue execution has been implemented.

The October 10 source snapshot fetches 30 recently updated open issue/PR records
per repo before excluding PRs. It prioritizes active issues and retains at most
40 across the fleet. Active body previews contain at most 800 characters, stale
previews 200. These bounds describe article context, not a saved agent's intake.
Full issue bodies and relevant PR comments remain the evidence for human gates
and editorial tangents outside the revision payload.

## Reviewing held actions after acceptance

`Review held article actions` is a separate manual workflow for an Accepted article
whose original candidates remain pending. It runs the native reconciler with
`DRY_RUN=true`; it never rewrites the Accepted article or queue and does not open a
second `accept/<date>` PR. There is no first-acceptance fallback on this route.

Before dispatch, the owner must review and adopt
`action-review-grants/<grant UUID>.json` under an explicit unused one-test
authorization. File presence alone does not establish that authorization: its
`authorizationReference` identifies the actual owner decision and reviewed packet.
The strict grant pins the operation UUID, date, article/map blobs, hydrated registry
revision, retained generation cycle, policy fingerprint and fixed native limits.
Compute `heldActionPolicyFingerprint` after committing the reviewed route; it
excludes grant files, so adding the reviewed grant does not require a circular
commit pin. Dispatch separately pins the exact main SHA containing both. A changed
policy, source, grant, input or operation needs fresh review before dispatch.

The workflow admits only owner dispatches on trusted current main and attempt 1.
It atomically reserves both the original authorization and operation in
`action-review-claims/` refs before any token count or generation, then durably
marks model entry. Partial, failed or uncertain claims remain consumed. An edited
UUID, rerun, missing artifact or failed upload is not another paid attempt. Inspect
the reservation and bounded outcome before considering new owner authority.

The successful artifact is **unmerged proposed data**, not an approval or accepted
editorial receipt. It contains only the dated article (unchanged prose/status,
proposed managed card), dated action file and closed receipt with source/file
digests. Normal selected citation excerpts may be retained; collector captures,
prompts, raw model replies and the whole hydrated registry are excluded. Newly
selected excerpts are bounded to 8 KiB; existing canonical quotes remain intact.
The two-file proposal is capped at 1 MiB, with current input lower bounds checked
before model entry. Output limits can still hold a newly produced proposal.
Only bounded numeric budget/usage observations and closed stop categories survive
native diagnostics. A qualified token count is recorded before a budget rejection;
response usage is recorded before incomplete-output rejection. Missing usage is
unknown, not zero; these observations do not establish billing. Bounded output-shape
facts use known field/type names, never response values or arbitrary keys. A
current evidence receipt is emitted only while native current inputs are available;
a self-consistent but unbound request retains identity only. Closed failure phases
distinguish malformed output, evidence/context holds and an incomplete ranked
shortlist. These diagnostics grant no evidence resolution or action authority.

The hosted worker may factor repeated collector-generated metadata into an
ephemeral, self-contained lossless view. Exact reconstruction must preserve every
metadata field and all authored text. Raw source identities remain unchanged;
selection and the final source guard charge the same complete labeled view,
including its dictionary. Coverage records both raw bytes and actual model-view
bytes/hashes. Dictionary and factored metadata rows are context only, never
citable authority. Copying a source array cannot mint collector provenance.
The full request and provider-token guards still apply, and large authored
sources may still require an explicit bounded evidence response. Neither raw
captures nor dictionaries are uploaded. A later successful review preserves prior
evidence-request receipts as history without implicitly resolving them.

Use `validateHeldActionArtifact` with an independently observed expected source
SHA and exact exported file bytes. Check the actual trusted workflow run,
reservation receipt digest and current main before preparing a supervised normal
data PR. A new dedicated artifact cannot satisfy the existing editorial proof
contract. Human review and merge authority remain separate. Failed or uncertain
attempts emit no proposed data and preserve all original held work.

## Timing evidence

The reporting interval uses consecutive 03:30 America/Chicago cutoffs, including
23/25-hour DST periods, with an inclusive start and exclusive end. Current queue
metadata remains distinct from bounded activity evidence. See
[Daily article timing](daily-schedule.md) for the dispatch guard, retained gates,
repeatable controls and the separate 03:30 workflow-start and 04:00 public-draft
targets. The installed local fallback remains at 04:00 until separately approved.

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
