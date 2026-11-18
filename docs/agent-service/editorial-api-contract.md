# S04 editor and API contract

Draft for review. The first implementation uses recorded fixtures and prepares the private owner interface. GitHub and Vercel remain the public journal path. S03b provides durable command admission for operations that need a worker. See [delivery roadmap](delivery-roadmap.md) and [existing editorial continuation](../editorial-continuation.txt).

## Article and revision identities

The reporting date identifies the article. Each article has one ordered history of immutable revisions. A revision has a server-assigned ID, parent revision, source, content digest, and timestamp. A restore also records the older revision it copies. The service exposes the public revision and current proposal separately. The owner can compare any two revisions, including an earlier restore and its source.

The current proposal response includes an opaque `proposalVersion` for the complete approval subject. The subject binds the article and revision, exact article bytes, and the action projection the editor displayed. For an existing GitHub acceptance PR it also binds the PR number, head commit, article blob, and canonical action registry blob. An acceptance receipt retains those identities for readback. Changing any member of the approval subject changes the proposal version.

Each saved feedback entry is immutable. It belongs to one article and source revision. Saving another version appends an entry and records its predecessor. A rewrite request pins one saved feedback entry and the proposal it was written against. The history retains both entries when the owner reviews a rewrite and requests another.

`runId` identifies a logical execution. `commandId` identifies one durable request. Each actual execution attempt gets its own `attemptId`. The owner reads status by these IDs. Queue delivery IDs stay internal.

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
| `POST /v1/editor/articles/{date}/feedback` | `201` with the saved feedback ID. Accept `revisionId`, `previousFeedbackId`, and `text`. The separate rewrite request authorizes execution. |
| `POST /v1/editor/articles/{date}/rewrites` | `202` with the durable `commandId` and `runId`. Accept `revisionId`, `feedbackId`, and `expectedProposalVersion`. |
| `POST /v1/editor/articles/{date}/restores` | `201` with a new revision ID as the current proposal. Accept `sourceRevisionId` and `expectedProposalVersion`. Copy the older article text and preserve both revisions in the history. |
| `POST /v1/editor/articles/{date}/acceptances` | `202` with the durable `commandId` and `runId`. Accept the displayed `revisionId` and `expectedProposalVersion`. |
| `GET /v1/commands/{commandId}` | Recorded admission and latest disposition. Include its target, attempts, and result or sanitized failure. |
| `GET /v1/runs/{runId}` | Run state, current review or checkpoint target, and linked commands and attempts. |

The browser generates one `Idempotency-Key` per mutation and keeps it with the frozen request until the outcome is known. The service resolves an existing key for the same authenticated actor before reevaluating proposal state. An identical retry returns the original response even if the proposal has since advanced. A reused key with a different payload returns `409`. A missing required field returns `400`. A changed proposal returns `409` with `stale_proposal` and the latest proposal identity. A feedback predecessor mismatch returns `409` with the saved feedback identity so the owner can review competing edits.

The API acknowledges a worker command only after S03b commits the command and delivery together. The protocol requires an immutable target and an exact-retry lookup. The worker reconciles persisted attempts and checkpoints when delivery repeats. An uncertain provider or GitHub result stays visible for reconciliation. The editor preserves its frozen request and uses readback or an exact retry after a lost response. Page load, refresh, and polling issue reads only.

## Owner workflow

**Feedback and rewrite.** Save feedback to the revision the owner read. A separate click requests a rewrite. Only the proposal that matches the request can take the rewrite result as its next revision. If the proposal advances before completion, mark the request stale and retain the feedback and execution record. After a rewrite, the owner can save feedback on the new revision and make another explicit request.

**Restore.** Append a new revision from the selected older text while the displayed proposal is current. Keep the public revision and prior feedback as separate records. Re-run the existing publication checks on the restored proposal before acceptance can publish it. Focus the restored revision in the history and scroll it fully into view on a narrow screen.

**Accept Draft.** The click is the owner's final approval of the displayed subject. Record the actor, proposal version, and exact revision before starting checks. For initial acceptance, derive the artifact with the existing deterministic transition to `status: "accepted"`. Bind the stamped artifact digest and resulting PR head before checks. The trusted publication operation rechecks the bound head at merge time. A head advance makes the old approval stale even if checks previously passed. Show the latest proposal and require a fresh click. Mark the article Accepted only after public readback matches the bound artifact. Preserve the independent action review state and open holds throughout.

**Run status.** A worker can wait at an owner review without holding a job or lock. Display queued work, active attempts, awaiting owner review, recoverable failure, uncertain result, and terminal dispositions. For cancellation, show requested until reconciliation establishes which work stopped and which effects already landed. Cancellation semantics need the S03b command contract before UI wiring.

The existing editor remains the initial cutover entry point. Its GitHub-backed adapter must enforce the same approval-subject semantics in S07. The private browser calls the API through its own origin. It keeps the Draft inbox, history, comparison, feedback, and restore in a parallel release. Both interfaces default to dark on a fresh visit, and an explicit Light or Dark choice survives reload. See [delivery roadmap](delivery-roadmap.md#m3-scheduled-operation-and-publication-cutover).

## First fixture proof

1. Sign in to the private app as the configured owner. Confirm unauthenticated reads and writes fail, a different account receives `403`, and missing or invalid CSRF blocks writes before admission.
2. Open a seeded Draft, compare two revisions, save feedback, and request two successive rewrites with outputs in one revision history. Confirm reload preserves saved feedback and no POST occurs on refresh.
3. Drop the response after admission, retry the same key, and confirm one command and one effect. Reuse the key with a different payload and confirm rejection. Show the run and attempt IDs after a worker restart.
4. Restore older text as a new revision. Verify keyboard focus and full visibility on the narrow-screen history. Confirm both themes keep diff changes legible.
5. Accept the displayed version. In a second fixture run, advance the proposal during checks and confirm the prior approval cannot merge. On success, public readback must match the explicitly approved version. Publication in the S04 fixture uses a simulated adapter. S07 qualifies the existing editor against the trusted GitHub path.

For the next joint review, agree on canonical ID and disposition fields, the durable result for rejected or duplicate commands, and the checkpoint target passed to S03b. The route names and concrete JSON schema can be finalized against that interface.
