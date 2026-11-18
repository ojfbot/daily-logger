# S04 fixture HTTP verification

The authenticated fixture adapter implements owner OAuth sessions, durable HTTP
admission, and database projection reads. Its backend base is S03b
`c1024559e04bf5e19c1c96526fccd68b2ed12d7d`, including the repaired S03a base
`29567def6f0da0ba9858112057dad6e5e93c64cc`.

## Implementation decisions

Design review compared separate session, admission, and projection modules with
a single service repository. The chosen modules each own their records and
expose concrete functions. The existing `admitCommandInTransaction` owns run,
command, and queue admission. A new HTTP binding references its original command
and response inside that same transaction.

The review contributed an early read cutoff with cleanup time and explicit
migration compatibility. Migration 003 extends the checked application registry.
The API, worker, and direct CLI in this code accept all three known migrations.

The bounded reader owns checkout, backend PID, query dispatch, cancellation, and
release. A separate connection cancels active SQL before client destruction.
Every query checks the lease deadline. The HTTP suite verifies cleanup against
real server activity within the original one-second budget.

Shared receipt validation checks command, run, and admission identities on POST
replay and both GET views. Cancellation records link to admitted cancellation
commands. Configured-owner reads cover prior direct and trusted-CLI fixtures.

## Local results

Verification used macOS, Node 24.11.1, PostgreSQL 18.6 on a disposable Unix-socket
cluster, and measured case-insensitive storage. OAuth tests use a local protocol
server with the actual state, S256 verifier, token-exchange, and identity flow.
HTTP requests cross a loopback listener with the configured private host.

| Check | Result |
| --- | --- |
| Frozen offline install | Passed. |
| Root and service TypeScript | Passed. |
| Service HTTP ESLint | Passed. |
| Root ESLint | Zero errors and one existing warning in `src/__tests__/schema.test.ts`. |
| `pnpm test:service` | 18 passed, zero skipped. |
| `pnpm test:service:postgres` | 26 passed, zero skipped. |
| `pnpm test:service:delivery` | 17 passed, zero skipped. Natural worker expiration/redelivery and shutdown cases passed. |
| `pnpm test:service:http` | 14 passed, zero skipped. |
| Root unit suite | 1,760 passed and two skipped on the initial run. Its socket peer test failed in the sandbox and passed on an isolated loopback-enabled rerun. |
| OPM rendering, source anchors, local documentation links, whitespace | Passed. |

HTTP cases include wrong owner, state replay/mismatch, session expiry/revocation,
session-specific CSRF and Origin rejection, strict payloads, concurrent empty
starts against different server roots, restart/configuration retry, lost HTTP
response, and a lost response after actual COMMIT. They also cover corrupted
receipt identities, cancellation links, pre-initialization polling under a held
run lock, blocked SQL, hard cutoff, disconnect, late checkout, inter-query abort,
prior CLI records, worker operations, and the normal HTTP executable's shutdown.
Raw router errors for malformed URL encoding and overlong parameters return the
closed error schema with `no-store` and suppress the raw-path canary.

The initial cleanup probe showed that socket destruction could leave SQL active.
The final regression requires a ten-second sleep query to disappear within the
original one-second budget. The cancellation and guarded query changes satisfy
that check. Implementation deviations are recorded at the repository root.

## Independent backend disposition

Yuri independently inspected the four-file S03a repair and ran its type check,
18 boundary tests, 26 PostgreSQL tests, and the three prior reservation probes.
The absent nested leaf through a case-aliased parent with a missing owner marker
now rejects before any directory, marker, or row is created. Restoring the owner
marker leaves the original completed status, checkpoint, and artifact tree valid.

HelpDesk sequence 14377 records APPROVE at the repaired S03a SHA. Sequence 14381
acknowledges that disposition. The exact-commit PostgreSQL matrix and full PR
Check passed. [PostgreSQL CI](https://github.com/ojfbot/daily-logger/actions/runs/44374051550),
[PR Check](https://github.com/ojfbot/daily-logger/actions/runs/44374051588).

## Remaining qualification

Real GitHub login with the registered private application, the owner's HTTPS
ingress, and browser operation require deployment qualification. Durable
editorial revisions, feedback, and the workspace UI continue in S04. Exact
displayed-revision acceptance, public readback, authority transfer, and Publisher
qualification govern the later cutover under the existing delivery roadmap.

Runtime configuration, routes, and verification commands are in the service
guide. [Authenticated fixture HTTP](../../apps/service/HTTP.md).

## Real account qualification

The owner requested real GitHub sign-in on the NAS using the established UniFi
UDM and WireGuard setup. A focused Yojimbo session is recovering the earlier
configuration and establishing the exact private HTTPS origin. That origin
determines the private OAuth registration and certificate. The connected owner
identity is `ojfbot`, numeric GitHub ID `151410806`.

The next active checkpoint is browser-trusted TLS, a real owner login and
logout, LAN and VPN access, and evidence of the public/private routing boundary.
Deployment inputs and live configuration evidence belong in the private handoff.
