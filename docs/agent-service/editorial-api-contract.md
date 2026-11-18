# S04 editor and API contract

Draft for review. The first implementation uses recorded fixtures and prepares the private owner interface. GitHub and Vercel remain the public journal path. S03b provides durable command admission for operations that need a worker. See [delivery roadmap](delivery-roadmap.md) and [existing editorial continuation](../editorial-continuation.txt).

## Article and revision identities

The reporting date identifies the article. Each article has one ordered history of immutable revisions. A revision has a server-assigned ID, parent revision, source, content digest, and timestamp. A restore also records the older revision it copies. The service exposes the public revision and current proposal separately. The owner can compare any two revisions, including an earlier restore and its source.

The current proposal response includes an opaque `proposalVersion` for the complete approval subject. The subject binds the article and revision, exact article bytes, and the action projection the editor displayed. For an existing GitHub acceptance PR it also binds the PR number, head commit, article blob, and canonical action registry blob. An acceptance receipt retains those identities for readback. Changing any member of the approval subject changes the proposal version.

Each saved feedback entry is immutable. It belongs to one article and source revision. Saving another version appends an entry and records its predecessor. A rewrite request pins one saved feedback entry and the proposal it was written against. The history retains both entries when the owner reviews a rewrite and requests another.

`runId` identifies a logical execution. `commandId` identifies one durable request, including inline writes and recorded rejections. Each execution attempt gets its own `attemptId`. The owner reads status by these IDs. Queue delivery IDs stay internal.

The command record pins its kind and schema version, verified `actorId`, idempotency key, and canonical request digest. The digest covers the operation, canonical route, and payload validated against the recorded schema version. Retries use the same digest rules. The server resolves and stores the proposal subject and applicable editorial policy version. A rewrite also pins the feedback ID and digest. Once the command has a run, it retains that run's ID, workflow version, and manifest digest. A new revision or artifact belongs to the result. The worker reads the original target from the command record.

## Private owner session

The private web app and its API share an HTTPS origin on the local network. Check the authenticated owner on every private read and write. Use the verified GitHub account ID as the actor in audit records. Use a separate host-scoped session cookie with `Secure`, `HttpOnly`, and `SameSite=Lax`. The OAuth callback validates state against the login session. Logout revokes the private session.

Every mutation validates its origin and a CSRF token bound to the session. Requests parse the expected JSON schema before admission. Reject missing sessions with `401` and unauthorized actors or invalid CSRF with `403`. Private responses use `Cache-Control: no-store`. The trusted default-branch editorial and publication checks supply the GitHub-side authority. See [deployment and access](architecture.md#deployment-and-access) and [the existing OAuth decision](../../decisions/adr/0034-github-oauth-auth.md).

## Proposed request shapes

The paths and field names are proposals for the joint S03b review. Editor state exposes stable revision, feedback, run, and command IDs through the API.

| Request | Response |
| --- | --- |
| `GET /v1/editor/articles?cursor=…` | A page of Drafts with current revision, public status, and active command status. |
| `GET /v1/editor/articles/{date}` | Current proposal and its `proposalVersion`, current public revision, review state, and feedback references. |
| `GET /v1/editor/articles/{date}/revisions/{id}` | An immutable article revision and its reviewable content. Fetch two revision IDs for a comparison. |
| `GET /v1/editor/articles/{date}/revisions?cursor=…` | A page of the revision history. |
| `POST /v1/editor/articles/{date}/feedback` | `201` with `commandId` and the saved feedback ID. Accept `revisionId`, `previousFeedbackId`, and `text`. The separate rewrite request authorizes execution. |
| `POST /v1/editor/articles/{date}/rewrites` | `202` with `commandId` and `runId`. Accept `revisionId`, `feedbackId`, and `expectedProposalVersion`. |
| `POST /v1/editor/articles/{date}/restores` | `201` with `commandId` and a new revision ID. Accept `sourceRevisionId` and `expectedProposalVersion`. Copy the older article text and preserve both revisions. |
| `POST /v1/editor/articles/{date}/acceptances` | `202` with `commandId` and `runId`. Accept the displayed `revisionId` and `expectedProposalVersion`. |
| `POST /v1/runs/{runId}/resumes` | `202` with `commandId` and `runId`. Accept the `resumeTargetId` displayed for an explicit owner action. |
| `POST /v1/runs/{runId}/cancellations` | An admission receipt for a separate cancellation request. |
| `GET /v1/commands/{commandId}` | Original admission, current disposition, immutable target, attempts, and result or sanitized failure. |
| `GET /v1/runs/{runId}` | Run state, current review target when present, linked commands and attempts, and cancellation status. |

## Admission, retries, and readback

The browser creates one `Idempotency-Key` per mutation and retains the frozen request until it knows the outcome. The API checks the owner session, authorization, origin, CSRF token, and request shape before consulting the actor's key. A missing required field returns `400`. An identical authorized retry returns the recorded admission HTTP status, body, and IDs before the service checks today's proposal. Reusing the key for a different operation or payload returns `409 idempotency_conflict` and preserves the original binding.

The service records an authorized, well-formed stale proposal or feedback conflict as a rejected command with no delivery and a null `runId`. A stale proposal response carries `observedProposalVersion` and `observedAt`. Fetch current state before creating a deliberate new request with a new key. A feedback conflict carries the observed saved feedback ID. A retry of either original rejection returns the same response.

Commit each inline feedback or restore effect with its admission record and response in one database transaction. For a worker command, return `202` once S03b commits the command and delivery together. The response records admission. The owner reads current progress through GET. After a lost response the editor can fetch a known command or send the exact frozen request. Page load, refresh, and polling issue reads only.

| Record | State exposed to the editor |
| --- | --- |
| Command admission | `admitted` or `rejected`, with the original HTTP status, response body, and stable IDs. |
| Command disposition | `queued`, `running`, `retrying`, `reconciliation_required`, `succeeded`, `failed`, `stale`, `cancelled`, or `rejected`. |
| Attempt | `running`, `succeeded`, `failed`, or `abandoned`, with `commandId`, timestamps, and before and after checkpoint IDs. |
| Run | Logical workflow state, including an owner wait or recoverable failure. Reaching an owner interrupt settles the current command successfully and releases the job and run lock. |
| Cancellation | A durable `requested`, `effective`, or `already_completed` result. Preserve completed effects and expose uncertain outcomes until reconciliation. Check cancellation before redelivery and on any direct CLI path. Keep cancellation records separate from checkpoint-derived status. |

An opaque `resumeTargetId` resolves to the run, workflow version, checkpoint namespace and ID, task and interrupt identity, subject digest, and approval scope. Validate and consume it under the run lock and record which command consumed it. A second command cannot consume it again. Redelivery of the same command reconciles its recorded consumption and subsequent checkpoints. The first worker attempt rechecks the bound target before acting. An uncertain provider or GitHub result remains visible for reconciliation.

## Owner workflow

**Feedback and rewrite.** Save feedback to the revision the owner read. A separate click requests a rewrite. Installing the result compares the current proposal with the proposal pinned by the command in the same transaction. If it has advanced, mark the command stale and retain the feedback, output, and attempt record. After a rewrite, the owner can save feedback on the new revision and make another explicit request.

**Restore.** Append a new revision from the selected older text while the displayed proposal is current. Keep the public revision and prior feedback as separate records. Re-run the existing publication checks on the restored proposal before acceptance can publish it. Focus the restored revision in the history and scroll it fully into view on a narrow screen.

**Accept Draft.** The click is the owner's final approval of the displayed subject. Record the actor, proposal version, and exact revision before starting checks. For initial acceptance, derive the artifact with the existing deterministic transition to `status: "accepted"`. Bind the stamped artifact digest and resulting PR head before checks. The trusted publication operation rechecks the bound head at merge time. A head advance makes the old approval stale even if checks previously passed. Show the latest proposal and require a fresh click. Mark the article Accepted only after public readback matches the bound artifact. Preserve the independent action review state and open holds throughout.

The existing editor remains the initial cutover entry point. Its GitHub-backed adapter must enforce the same approval-subject semantics in S07. The private browser calls the API through its own origin. It keeps the Draft inbox, history, comparison, feedback, and restore in a parallel release. Both interfaces default to dark on a fresh visit, and an explicit Light or Dark choice survives reload. See [delivery roadmap](delivery-roadmap.md#m3-scheduled-operation-and-publication-cutover).

The proposed three-day quality comparison can reuse the side-by-side article view. Give the reviewer stable anonymous labels in the displayed order until the plan allows provenance to be revealed. Retain both candidate identities, pinned evidence and priorities, review outcomes, and failed or missing runs for readback. Keep this view read-only during comparison. GitHub Actions owns publication during that trial. See [comparison roadmap draft](https://github.com/ojfbot/daily-logger/pull/556).

## First fixture proof

1. Sign in to the private app as the configured owner. Confirm unauthenticated reads and writes fail, a different account receives `403`, and missing or invalid CSRF blocks writes before admission.
2. Open a seeded Draft, compare two revisions, save feedback, and request two successive rewrites with outputs in one revision history. Confirm reload preserves saved feedback and no POST occurs on refresh.
3. Drop the response after admission, retry the same key, and compare the exact response. Advance the proposal and repeat the retry. Confirm one command and one effect. Reuse the key with a different payload and confirm rejection. Repeat the exercise for an inline restore and a stale rejection. Show the run and attempt IDs after a worker restart.
4. Restore older text as a new revision. Verify keyboard focus and full visibility on the narrow-screen history. Confirm both themes keep diff changes legible.
5. Accept the displayed version. In a second fixture run, advance the proposal during checks and confirm the prior approval cannot merge. On success, public readback must match the explicitly approved version. Publication in the S04 fixture uses a simulated adapter. S07 qualifies the existing editor against the trusted GitHub path.

6. Reach an owner wait and confirm the command succeeds with no running delivery. Consume the displayed resume target once and reject another command against it. Redeliver the admitted command after checkpoint progress and confirm it reconciles the same effect. Request cancellation during an active attempt and verify that checkpoint updates preserve the cancellation record.

Finalize route names and JSON schemas against the S03b review before wiring these operations.
