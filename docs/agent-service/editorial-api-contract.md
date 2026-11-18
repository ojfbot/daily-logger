# S04 editor and API contract

Draft for review. The first implementation uses recorded fixtures and prepares the private owner interface. GitHub and Vercel remain the public journal path. S03b provides durable command admission for operations that need a worker. See [delivery roadmap](delivery-roadmap.md) and [existing editorial continuation](../editorial-continuation.txt).

Contract v3, reviewed against S03b `d0a7b5dd2d6be0169c5e3bc24716b3984cf44751` on November 18, 2026. The [fixture response schemas](editorial-api-responses.schema.json) define the proposed browser boundary. HTTP handlers, authenticated sessions, and durable editorial records require implementation and qualification.

## S03b integration baseline

S03b supports `start`, `resume`, `recover`, and `cancel` for a recorded fixture. Its resume target grants `write-isolated-shadow-artifacts-only`. S04 implements article revisions, feedback, rewrites, restores, proposal versions, and acceptance records separately. A fixture start exercises command delivery. An editorial rewrite requires its own immutable revision and feedback target.

| S03b interface | S04 mapping |
| --- | --- |
| `parseCommand(value)` | The private handler resolves the authenticated actor, parses its route's payload, and constructs the trusted request. The server selects the fixture destination. |
| `admitCommand(pool, boss, value)` | Write the returned `body` string directly as JSON with the returned HTTP `status`. The database owns the serialized admission response. |
| `commandStatus(pool, boss, commandId)` | Build an allowlisted command response with camel-case attempt fields and explicit command identities. Read linked run and cancellation state in one database snapshot. |
| `runStatus(pool, connectionString, runId)` | Use this lock-taking reconciliation operation for bounded inspection. Foreground polling reads application projections as specified below. |
| `runOperation(..., 'status', ...)` | Account for lock contention, history and artifact validation, abandoned-attempt settlement, and projection writes. A newly admitted run can still await input initialization. |

The internal route recorded in the request digest is `fixture/runs` for start and `fixture/runs/{runId}/{operation}` for the other fixture operations. Preserve that identity when adding HTTP paths. The shared actor/key namespace also covers operation changes. A deliberate editorial operation requires a defined operation and schema version before admission.

Source references pin the [command implementation](https://github.com/ojfbot/daily-logger/blob/d0a7b5dd2d6be0169c5e3bc24716b3984cf44751/apps/service/src/delivery-commands.ts), [worker](https://github.com/ojfbot/daily-logger/blob/d0a7b5dd2d6be0169c5e3bc24716b3984cf44751/apps/service/src/delivery-worker.ts), and [delivery guide](https://github.com/ojfbot/daily-logger/blob/d0a7b5dd2d6be0169c5e3bc24716b3984cf44751/apps/service/DELIVERY.md).

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

The first HTTP qualification uses `POST /v1/fixture/runs`, `POST /v1/fixture/runs/{runId}/resumes`, `POST /v1/fixture/runs/{runId}/recoveries`, and `POST /v1/fixture/runs/{runId}/cancellations`. Start accepts an empty JSON object for the single recorded fixture. Resume accepts `resumeTargetId`. Recovery and cancellation accept empty JSON objects. The server supplies `actorId`, the internal operation, canonical run ID, and destination. The browser supplies its idempotency key in the header. The handler retains the original server-selected inputs for exact retries, including a retry after service restart or configuration change. These four routes use the stored S03b admission schemas.

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

For S03b admissions, the serialized body already contains JSON. HTTP sends those bytes once with `Content-Type: application/json`. A retry preserves whitespace, property order, status, and IDs. The `admission.body` field in a subsequent command GET contains the parsed, schema-validated object. Current progress belongs in that GET response. An idempotency conflict returns the original command ID and preserves its original admission.

| Record | State exposed to the editor |
| --- | --- |
| Command admission | `admitted` or `rejected`, with the original HTTP status, response body, and stable IDs. |
| Command disposition | `queued`, `running`, `retrying`, `reconciliation_required`, `succeeded`, `failed`, `stale`, `cancelled`, or `rejected`. |
| Attempt | `running`, `succeeded`, `failed`, or `abandoned`, with `commandId`, timestamps, and before and after checkpoint IDs. |
| Run | Logical workflow state, including an owner wait or recoverable failure. Reaching an owner interrupt settles the current command successfully and releases the job and run lock. |
| Cancellation | A durable `requested`, `effective`, or `already_completed` result. Preserve completed effects and expose uncertain outcomes until reconciliation. Check cancellation before redelivery and on any direct CLI path. Keep cancellation records separate from checkpoint-derived status. |

An opaque `resumeTargetId` resolves to the run, workflow version, checkpoint namespace and ID, task and interrupt identity, subject digest, and approval scope. Validate and consume it under the run lock and record which command consumed it. A second command cannot consume it again. Redelivery of the same command reconciles its recorded consumption and subsequent checkpoints. The first worker attempt rechecks the bound target before acting. An uncertain provider or GitHub result remains visible for reconciliation.

## Browser response schemas

The JSON Schema file uses Draft 7 and closes every object with `additionalProperties: false`. It defines fixture admission responses, command and run views, attempts, cancellation records, and API errors. Editorial routes acquire their response schemas with their implementation slice.

| Response | Required mapping |
| --- | --- |
| `fixtureAdmitted`, `fixtureRejected`, `idempotencyConflict` | Preserve the existing S03b mutation bodies. A recorded semantic rejection has `runId: null`. |
| `fixtureCommandView` | Include original admission, operation, current disposition, safe target, attempts, result, sanitized failure, and read metadata. |
| `fixtureRunView` | Include the application run projection, linked command summaries, flattened attempts, effective resume availability, all cancellation records, and read metadata. |
| `attempt` | Map database field names to camel case. Attach the enclosing command's ID when adapting `commandStatus().attempts`. Preserve null command identity for legacy direct-CLI attempts in a run view. |
| `apiError` | Return an allowlisted error code. Resolve missing sessions and forbidden requests before admission. Use `503 read_unavailable` with `Retry-After: 2` for bounded read failures. |

The handler validates database and CLI-derived data before constructing the response. The browser contract permits run, command, attempt, and resume-target IDs. Local paths, request keys, actor labels, queue IDs, approval digests, raw interrupt subjects, and database error text stay in trusted service records. A target response carries the fixture scope and safe run identity. A command with rejected admission exposes a null target.

Command attempts retain their own state. Admission rejection and execution disposition are separate fields. For example, an admitted command can later acquire disposition `rejected` after an integrity check. A command with disposition `succeeded` can end at the owner wait.

The response adapter also checks identities across records. Admission IDs match the command and run view. Each command-view attempt belongs to that command. Run-view attempts reference linked commands or retain a null identity for a legacy direct operation. Resume availability requires the current checkpoint's unconsumed target, the fixture scope, and an empty cancellation list. These comparisons require adapter tests in addition to structural schema validation.

## Polling and freshness

The first HTTP read model queries `fixture_runs`, `fixture_commands`, `operation_attempts`, `resume_targets`, and `run_cancellations` in one read-only, repeatable-read database transaction. Select the fields required by the response schemas. Command reads observe the pinned delivery schema through the same transaction to derive `reconciliation_required` for missing or exhausted delivery. The existing `commandStatus()` uses separate queries and requires this snapshot adaptation. Database-only polling can represent the initial admitted run before the worker creates frozen files.

Each response carries `read.source: "application_projection"`, `read.readAt`, and `read.runUpdatedAt`. `readAt` records the database snapshot time. `runUpdatedAt` records the run row's projection time and is null for a rejected command with no run. Graph checkpoints and artifact files can advance separately. The UI displays the last recorded checkpoint and its projection time while an attempt runs. Integrity qualification comes from a successful bounded inspection or worker reconciliation.

Each HTTP read has a one-second end-to-end deadline that includes pool acquisition and SQL. The implementation cancels and releases timed-out work. On timeout or unavailable storage, return the schema-defined `503` response. The browser retains its last successful snapshot, displays the read failure and last observation time, and suspends Resume and Accept until a successful refresh.

Foreground polling permits one in-flight read per selected resource. Poll every two seconds during an unsettled command and every ten seconds while idle. Pause polling in a hidden tab. Retry read failures with backoff capped at thirty seconds, respecting `Retry-After`. A successful response resets the backoff. Navigation cancels the previous read. Polling and navigation issue GET requests.

The CLI inspection can wait up to ten seconds for the run lock and performs reconciliation writes. An HTTP inspection adapter requires a separate bounded implementation and qualification. Its lock deadline returns `503 read_busy` with `Retry-After: 2`. The UI retains the projection and displays the busy result. Schema validation and polling through the new projection queries require proof before browser integration.

## Fixture state and cancellation mapping

| S03b value | Browser value and meaning |
| --- | --- |
| Run `admitted` | `admitted`, awaiting fixture execution or initialization. |
| Run `awaiting-approval` | `awaiting_owner`, with the exact fixture resume target when available. |
| Run `recoverable` | `recoverable`, requiring an explicit recovery command or an existing command's redelivery. |
| Run `complete`, result outcome `complete` | `fixture_complete`, identifying the isolated bundle and its receipt digest. |
| Result outcome `awaiting_approval` | `awaiting_owner`. The current command succeeded at the fixture interrupt. |
| Result outcome `no_segment_executed` | `no_segment_executed`. Consult the separate run and cancellation records. |
| Result outcome `cancelled_before_next_segment` | `cancelled_before_next_segment`. Previously completed effects retain their identities. |

The fixture UI labels completion **Fixture bundle ready**. Article acceptance requires the exact displayed proposal, trusted publication checks, and matching public readback through the editorial publication path.

Any recorded cancellation suppresses Resume and Recover immediately, including state `requested`. Return `resumeTarget: null` to the browser while retaining the stored target for audit. The worker settles cancellation as `effective` or `already_completed`. A cancellation can coexist with a completed checkpoint or a succeeded command. The UI renders both records and preserves artifact receipts. Exact retries of earlier admissions retain their original response even after cancellation. A new resume request receives the recorded `run_cancelled` rejection.

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

7. Poll immediately after start admission and while a worker holds the run lock. Confirm the response meets the read deadline and exposes projection timestamps. Force a read failure, verify stale-state feedback and suspended controls, and confirm a later refresh restores them. Compare database rows and files before and after polling to detect reconciliation side effects.
8. Validate every browser response against the JSON Schema. Reject fixtures containing a local path, request key, approval digest, queue ID, or raw database field. Confirm each flattened attempt retains its command identity.
9. Cancel at the fixture owner wait while its stored resume target still exists. Confirm `resumeTarget: null`, disabled controls, the separate cancellation record, and rejection of a deliberate new resume. Preserve exact retry of the earlier admission. Render fixture completion beside the article's independently tracked publication state.

## Qualification gaps and next checkpoint

The existing prototype keeps editorial changes in browser memory and simulates rewrites and publication with timers. S03b provides CLI delivery evidence. The next S04 implementation checkpoint is an authenticated fixture HTTP adapter with the response schemas and read-only projection queries, followed by the polling, retry, cancellation, and redaction proofs above. Durable editorial revisions and feedback then support the existing prototype's repeat-rewrite and restore interactions.

The independent S03a review remains changes-requested at `92769b8d138ce190c2644d5668edd3cced50ca29`. Its 25 PostgreSQL cases and 17 boundary cases pass locally. An additional macOS reproduction admits an absent nested destination through a case-aliased parent when the completed ancestor's reservation marker is missing. The nested run then invalidates the completed bundle. The repair requires an exact regression, green supported-platform CI, and independent re-review. S03b includes the same admission code at the pinned integration revision.

The delivery contract retains the 04:00 America/Chicago public readback deadline, exact displayed-revision acceptance through the existing editor, and separate 07:00 independent review. Manual Actions failover transfers a single publication authority. Publisher qualification precedes Cleaner automation. The private editorial workspace proceeds in parallel, with production changes subject to owner approval.
