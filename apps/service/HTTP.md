# Authenticated fixture HTTP

S04 exposes the recorded PostgreSQL fixture through Fastify 5.12.8. The owner
signs in with GitHub, submits durable fixture commands, and polls application
projections. The [editor contract](../../docs/agent-service/editorial-api-contract.md)
and [response schemas](../../docs/agent-service/editorial-api-responses.schema.json)
define the browser responses.

## Configuration and startup

Use Node 24 and pnpm 9.15.4. Configure these values privately in the service
environment. The fixture root must exist outside Git checkouts and metadata.

| Variable | Value |
| --- | --- |
| `DAILYLOGGER_DATABASE_URL` | Dedicated PostgreSQL database URL. |
| `DAILYLOGGER_PRIVATE_ORIGIN` | Exact HTTPS origin, such as `https://dailylogger.example.test`. |
| `DAILYLOGGER_OWNER_GITHUB_ID` | The owner's immutable numeric GitHub account ID. |
| `DAILYLOGGER_GITHUB_CLIENT_ID` | Private-service OAuth application client ID. |
| `DAILYLOGGER_GITHUB_CLIENT_SECRET` | OAuth application client secret. |
| `DAILYLOGGER_FIXTURE_ROOT` | Absolute application-owned directory for fixture reservations. |
| `DAILYLOGGER_HTTP_PORT` | Loopback listener port, default `4300`. |

Register `${DAILYLOGGER_PRIVATE_ORIGIN}/v1/auth/callback` as the OAuth callback.
The HTTPS reverse proxy forwards the configured origin's `Host` header to the
loopback listener. The server compares that host exactly and uses its configured
origin for redirects. Cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
and the `__Host-` prefix.

Install the migration-aware API and worker code together before applying 003.
Every installed migration has a checked version and digest. The current direct
CLI and worker accept the known 003 suffix. Earlier binaries reject that suffix.
Migration installation is an explicit command. Serving checks the installed
application, checkpointer, delivery version, and queue configuration.

```sh
pnpm install --frozen-lockfile
pnpm service:http migrate
pnpm service:http serve
```

The migration command requires the database URL. Serving requires the complete
configuration. Run the fixture worker in another process using the same database.

```sh
pnpm service:delivery work
```

SIGTERM closes the HTTP listener, producer, and database pools. The executable
has an eight-second shutdown deadline.

The HTTP executable selects the no-op observation adapter. Tests can pass a
separate adapter to `createHttpServer(config, fetcher, telemetry)`. The server
owns that adapter and closes it after its application resources, with the same
250 ms optional allowance as the worker and inside the existing executable
deadline. A migration/startup rejection also closes the supplied adapter.
There is no telemetry endpoint, credential, SDK, or exporter configuration here.

## Owner session and requests

`GET /v1/auth/login` starts a ten-minute GitHub OAuth challenge with state and
S256 PKCE. The callback consumes the challenge bound to the login cookie,
exchanges the code, and verifies the numeric account ID from GitHub `/user`.
Successful login creates an eight-hour session. PostgreSQL stores the hash of
the session credential and its revocation state.

`GET /v1/auth/me` returns the verified account ID, session expiry, and session
CSRF token. Every private read and write checks session expiry, revocation, and
the configured owner. Mutations require the exact origin and `X-CSRF-Token`.
The configured owner can inspect prior direct and trusted-CLI fixture records.
New HTTP admissions use the authenticated actor's idempotency namespace.
`POST /v1/auth/logout` accepts `{}` and revokes the session before clearing its
cookie. Every response uses `Cache-Control: no-store`.

| Method and path | JSON body |
| --- | --- |
| `POST /v1/fixture/runs` | `{}` |
| `POST /v1/fixture/runs/{runId}/resumes` | `{"resumeTargetId":"UUID"}` |
| `POST /v1/fixture/runs/{runId}/recoveries` | `{}` |
| `POST /v1/fixture/runs/{runId}/cancellations` | `{}` |
| `GET /v1/commands/{commandId}` | Current command view. |
| `GET /v1/runs/{runId}` | Current run projection, commands, attempts, cancellation, and resume availability. |

Each fixture POST requires `Idempotency-Key`. The server resolves the actor and
destination. It records the browser intent and original command reference in
the same transaction as S03b admission and delivery. Identical retries return
the original status and JSON bytes across restart, root configuration changes,
run progress, and cancellation. A different intent under the key returns
`409 idempotency_conflict` with the original command ID.

Optional [offline observations](OBSERVABILITY.md) receive only the closed
admission-response metadata after this HTTP transaction confirms COMMIT. The
hook is outside the transaction catch, awaits no sink, and leaves response bytes
unchanged. Identical retries can repeat the same response observation; it does
not claim a new command. Authentication failures, rollback and uncertain COMMIT
emit no admission observation. A later successful retry can observe the stored
response. Session identity, cookies, CSRF tokens, idempotency keys and selected
directories never enter the adapter. Read-only polling does not run or observe
graph reconciliation.

`503 operation_unavailable` can follow an unknown COMMIT outcome. Retain the
original key and frozen request. An exact retry resolves the stored admission.
`503 authentication_unavailable` indicates an unavailable or invalid upstream
identity exchange. `503 integrity_rejected` identifies inconsistent stored
records. Error responses expose an allowlisted code.

## Polling and fixture state

GET reads session, application records, and pinned pg-boss delivery state in
one read-only repeatable-read transaction. It exposes an admitted run before
input initialization and reads while execution holds its advisory lock.
`readAt` identifies the observation. `runUpdatedAt` identifies the run's last
application projection update.

The reader uses a dedicated pool with a 150 ms acquisition timeout, server SQL
timeouts, and an 850 ms destructive cutoff within the one-second HTTP budget.
A separate bounded connection cancels the owned backend on cutoff or client
disconnect before destroying its client. The reader also releases a late
checkout. A failed read returns `503 read_unavailable` with `Retry-After: 2`.

The browser contract specifies one foreground poll at a time, every two seconds
during activity and ten seconds while idle. It pauses hidden-tab polling and
backs off failed reads up to thirty seconds. Frontend integration must display
the last observation and suspend controls during read failure.

Any cancellation record suppresses the returned resume target, including a
pending request. Fixture completion has state `fixture_complete` and a bundle
receipt. The UI label is **Fixture bundle ready**. Editorial revision history,
feedback, exact-version acceptance, and public readback have their own delivery
and qualification work.

## Verification

```sh
pnpm type-check:service
pnpm test:service
# Use a disposable PostgreSQL server with CREATE DATABASE permission.
pnpm test:service:postgres
pnpm test:service:delivery
pnpm test:service:http
```

The HTTP suite uses real loopback HTTP, a local OAuth protocol fixture, real
PostgreSQL, and the fixture worker. It exercises session and CSRF rejection,
concurrent destination selection, response loss, unknown COMMIT, record identity
corruption, read-only polling, timeout cleanup, disconnects, cancellation, and
the CLI entrypoint. Its preload injects rollback after provisional HTTP binding
and response loss after the database commits. Observation integration tests cover
commit gating, exact replay with captured/throwing/stuck sinks, privacy canaries,
bounded close, and HTTP-to-instrumented-worker correlation on migration 003.
The worker's real durable attempts and unchanged artifact bytes remain the
authority. The executable has its regular database and OAuth configuration.

Real registered GitHub login, the owner's HTTPS ingress and browser, host
operation, and production cutover require deployment qualification. The agreed
04:00 public readback and 07:00 independent review, existing-editor acceptance,
single publication authority, and Publisher-before-Cleaner gates govern that
later delivery.

The implementation follows the official OAuth PKCE flow and Fastify response
serialization interfaces. [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps),
[Fastify serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/).
