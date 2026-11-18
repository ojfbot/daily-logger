# S03b — durable fixture command delivery

This slice adds one pg-boss queue and one worker to the recorded S03a fixture.
It is a CLI fixture proof. There is no HTTP server, authentication, editor UI,
recurrence, provider, collector, publishing operation, or deployment. The
`actorId` is an explicitly supplied **trusted local fixture label**. It is not
an authenticated identity. S04 must authenticate and authorize before calling
the transport-neutral admission API.

The existing article/action bytes, S03a workflow version, and artifact receipt
remain unchanged. Durable command admissions and results are separate records.

## Run

Use Node 24 and pnpm 9.15.4, with `DAILYLOGGER_DATABASE_URL` privately configured
for a dedicated development database. Never pass credentials in CLI arguments.

```sh
pnpm service:delivery migrate
pnpm service:delivery enqueue --request /absolute/path/start.json
pnpm service:delivery work
pnpm service:delivery command --command-id COMMAND_UUID
pnpm service:delivery run --run-id RUN_UUID
```

The worker stays alive until SIGTERM or SIGINT. Enqueue uses a JSON file:

```json
{
  "schemaVersion": 1,
  "actorId": "trusted-fixture-owner",
  "key": "first-fixture-run",
  "operation": "start",
  "payload": { "runDir": "/tmp/dailylogger-delivery-example" }
}
```

Supported operations and exact payloads:

| Operation | Payload |
| --- | --- |
| `start` | `{"runDir":"/absolute/path/outside/git"}` |
| `resume` | `{"runId":"UUID","resumeTargetId":"UUID_FROM_RUN_STATUS"}` |
| `recover` | `{"runId":"UUID"}` |
| `cancel` | `{"runId":"UUID"}` |

Use a new key for each deliberate operation. Inspect the frozen inputs and
invariant review before requesting resume. A resume target is an opaque handle
to the exact run/workflow/manifest, checkpoint namespace/ID, task/interrupt,
approval subject digest and local-output scope. It is not a bearer authentication
token. Status reads do not mint targets or enqueue work.

Admission returns `{status,body}`: a transport-neutral status and the exact
stored JSON response string. An identical actor/key/request returns that same
response, even after the run progresses. A changed operation or payload under
the key returns `409 idempotency_conflict` without replacing its binding.
Well-formed known stale/binding conflicts retain immutable rejection receipts
with no job or invented run. Unknown operational failures roll back admission;
they are not converted to sticky semantic rejections. Invalid request shapes
fail before key lookup. Command and run reads show current progress separately.

## Transaction and recovery contract

Migration 002 preserves 001 and adds commands, resume targets, cancellation
records, a delivery installation receipt, queue ownership and attempt links.
`service:delivery migrate` explicitly installs application migration 002 and
pg-boss **12.38.2**, schema **46**, in `dailylogger_delivery`, then creates
`fixture-command-v1`. Existing unknown vendor versions and nonempty vendor
schemas without their version ledger are rejected before installation. Actual
vendor version/configuration are checked afterward.
Runtime has `migrate:false`, `createSchema:false`, and requires both verified
application migrations and the exact vendor/configuration receipt.

Admission holds one short PostgreSQL transaction and a per-actor/key transaction
lock. Caller-owned-client run admission, the command/response record, pg-boss
`send({db})`, cancellation request when applicable, and job linkage commit or
roll back together. A null job ID aborts admission. The pg-boss queue is installed
and committed before this transaction; graph execution never occurs inside it.
Admission lock wait is limited to 5 seconds and each SQL statement to 10 seconds.

The filesystem identity reservation from S03a can outlive a DB rollback. It is
not an admitted run, command or job, and it contains no generated article.
The deterministic internal run key binds actor/key and request digest so an exact
retry can reuse that reservation. A rollback still leaves no accepted database
run/command/job. Missing or changed reservations remain integrity failures.

Each worker uses batch size 1, local concurrency 1 and the existing per-run
advisory lock. Command validation, target consumption, operation attempt and
continuation share that one lock owner. The original direct CLI rejects
modification of queue-owned runs; read-only status remains available. Duplicate
workers serialize at the application lock even when delivery is repeated.

Start redelivery recovers checkpointed pending work until the human interrupt.
Reaching that interrupt settles the command/job and releases the worker. Resume
is a separately admitted command. Only one command consumes a target. A retry
of that same command can replay its original approval at the still-identical
interrupt, or continue a proven successor checkpoint without new approval.
A different target/interrupt is rejected. Completed commands validate and reuse
existing effects. Artifact, checkpoint, command-settlement and queue-ack commits
remain separate; no exactly-once external-effect claim is made.

Cancellation is a separate durable request. Admission does not wait for the
run lock. Before a segment the worker checks requests; an already executing
segment may finish. Reconciliation reports `effective` or `already_completed`
without rewriting checkpoint-derived run status or deleting completed output.
Future resumes/recoveries reject after cancellation. Shutdown is not cancellation.

| Bound | Value |
| --- | --- |
| Run lock wait | 10 seconds |
| Worker segment hard process deadline | 45 seconds |
| Active job expiration | 60 seconds |
| Supervisor / expiry monitor cadence | 1 second each |
| Retries | 2, exponential delay from 1 second, cap 30 seconds |
| Pending/retry retention | 1 day |
| Completed delivery retention | 7 days |
| Graceful shutdown drain | 5 seconds |
| Outer shutdown process deadline | 8 seconds |

Claim abort, lock connection loss or the segment deadline stops the CLI process;
the worker cannot keep running after merely ignoring a cancellation signal.
Transient database failures have bounded retries. Integrity/stale failures are
terminal command dispositions. Queue exhaustion/loss is exposed as
`reconciliation_required` when separate graph effects cannot be inferred from
delivery state. Command evidence outlives queue retention. No HTTP/trace exporter
is configured; PostgreSQL is the only intended network integration. These remain
application controls, not an operating-system egress or hostile-user boundary.

## Qualification

```sh
pnpm type-check:service
pnpm test:service
# Configure DAILYLOGGER_TEST_DATABASE_URL for a disposable PostgreSQL server.
pnpm test:service:postgres
pnpm test:service:delivery
```

The explicit delivery suite fails when its database URL is absent. It creates
fresh random databases and drops only those databases. Tests cover missing
vendor ledger rejection without schema mutation, rollback,
operational-error retry, lost producer response, immutable rejection replay,
duplicate workers, exact target consumption, crashes after consumption/output/
checkpoint before acknowledgement, cancellation before and during a segment,
bounded retry exhaustion, missing delivery, and graceful/forced shutdown. Crash
and pause injection exist only in test preloads. Existing PostgreSQL tests also
exercise lock-connection loss. The dedicated CI workflow runs the real database
suites on Node 24.11.1 and current Node 24. Passing TypeScript or SQLite tests is not
PostgreSQL delivery qualification.

API/lifecycle choices follow the pinned release and official
[transaction adapter](https://pgboss.io/api/adapters),
[worker](https://pgboss.io/api/workers), and
[shutdown](https://pgboss.io/api/ops) documentation. Queue handler transactions
cannot make the separate LangGraph saver pool and filesystem atomic.
