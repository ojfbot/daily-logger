# S03a — PostgreSQL fixture checkpoint parity

This slice runs the existing recorded fixture graph with a real PostgreSQL
checkpointer. It adds durable logical run identities, idempotent admission,
per-command attempt records, and serialization across separate CLI processes.
It preserves the original SQLite CLI. It does not complete M1B or S03: pg-boss
delivery is S03b; authenticated owner controls and LangSmith remain separate work.

The fixture copies the November 17 article and dated action file from the pinned
Git commit. It makes no model, collector, GitHub, HTTP or publication call. Its
three action candidates stay pending and its admitted-action count stays zero.
PostgreSQL is the only configured network integration. Disabling `fetch` and
ambient tracing is an application control, not an OS egress sandbox.

## Commands

Use Node 24 and the repository's pnpm 9.15.4. Configure
`DAILYLOGGER_DATABASE_URL` privately for an explicitly selected development
database. The CLI accepts no connection string argument, never falls back to
`DATABASE_URL`, and withholds connection diagnostics from errors. It does not
install or start a database server.

```sh
pnpm service:postgres migrate
pnpm service:postgres start --request-key local-proof-01 --run-dir /tmp/dailylogger-pg-proof-01
pnpm service:postgres status --run-id UUID_FROM_START
pnpm service:postgres resume --run-id UUID_FROM_START --approval-digest DIGEST_FROM_START
pnpm service:postgres recover --run-id UUID_FROM_START
```

Inspect the frozen manifest, input files and invariant review before resuming.
The digest authorizes only the isolated local fixture bundle. It is neither an
authenticated approval nor action admission/publication authority. Each run's
UUID is included in its manifest, approval digest, graph `thread_id`, and replay
receipt. UUID input spelling is normalized to lowercase before deriving locks,
manifests or lookups. Identical source bytes can therefore have independent runs.

`start` requires a request key and a directory outside every Git checkout. A
duplicate key with the same canonical directory, source and workflow version
returns the same run without rerunning checkpointed work; conflicting reuse
fails. Admission arbitrates every unique constraint, then reads and validates
the committed request binding; a concurrent duplicate directory conflict is not
mistaken for a different request. This follows PostgreSQL's
[untargeted `ON CONFLICT DO NOTHING` semantics](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
Another run requires another key and a nonoverlapping directory. Admission first
serializes database arbitration, then an atomic filesystem reservation binds the
physical directory to one request and run UUID. Database
admission then precedes frozen-input initialization and graph execution. Repeating
the identical request reuses a reservation left by a crash or rolled-back DB
transaction; the marker itself is not database admission or execution authority.
Partial input initialization fails closed and is never silently overwritten.

The reservation uses actual `realpath` spelling and device/inode identity, not
global lowercasing. Atomic directory creation followed by linking a fully written
marker prevents competing aliases from obtaining different owners. A crash before
the marker leaves an empty, unowned directory that can be reserved; a crash before
link may also leave a staging file in its parent. A published marker is never
reassigned or automatically deleted. Foreign nonempty directories and partial,
missing or changed ownership markers fail closed. Concurrent requests either
link once or read the complete winner; there is no unbounded marker-write wait.

Before any directory or marker is created, admission checks ancestor reservation
markers and canonical database directory bindings in both directions. Existing
parents and bound directories use the same native physical-path resolver, including
when the proposed leaf is absent and an ancestor's ownership marker is missing.
An artifact
subdirectory cannot become another run, including through a physical case alias;
an existing child run also prevents admission of its ancestor. Ancestor markers
protect reservations without committed database rows, while database bindings
protect legacy or marker-damaged runs. A rejected overlapping destination leaves
no new directory, marker or binding and does not alter the original artifact bundle.
An exact database directory binding also prevents a different request key from
recreating a missing destination; the original key remains held on missing ownership.
Because an absent directory has no resolvable physical spelling, any missing
admitted destination holds all new admissions in this database. This deliberately
sacrifices new-run availability until the original ownership is restored; it does
not guess absent-path identity by lowercasing or filesystem probe writes. Intact
existing requests and run operations remain available. The guard also applies to
unrelated new paths on case-sensitive filesystems. No automatic repair is attempted.
These guarantees cover cooperating admissions using one database and its shared
artifact filesystem; they are not a cross-database or hostile-filesystem fence.

New manifests contain `destinationReservation: 1`, a storage-format distinction
that does not change graph computation. Older S03a binaries cannot operate these
new runs. The updated binary reconstructs only the two explicitly supported
manifest formats. Existing initialized legacy runs can adopt a marker only after
their DB binding and frozen inputs validate; their manifest and approval bytes
remain unchanged. Legacy admission-only rows without initialized directories are
held rather than silently migrated. New-format runs with lost markers or changed
physical destinations are always held, including after copy/restore.

An initial LangGraph input checkpoint can have empty public values before its
input writes commit. It still has a checkpoint ID and an internal `__start__`
channel containing the manifest digest. `status` reports this boundary as
recoverable. Recovery validates its original input metadata, raw digest, pending
writes, and absence of prior graph-node/artifact effects, then uses LangGraph's
normal recovery. It neither reconstructs inputs nor deletes checkpoints. Later
missing state is rejected rather than interpreted as a new run.

`status` executes no graph steps. Under the run lock it reconciles the application
projection with the actual checkpoint and marks an unfinished prior operation
attempt abandoned. `resume` requires this run's exact approval digest. `recover`
continues a failed step, preserving successful checkpoints; it cannot bypass the
human interrupt. Repeating resume/recover after completion validates and reuses
the existing bundle. Changed inputs, conflicting outputs, missing recorded
checkpoints, and conflicting application metadata fail closed. Reconciliation
requires the acknowledged checkpoint and every checkpoint observed by operation
attempts to exist in the observed checkpoint's ancestry. It never moves a pointer
backward or onto another branch. Empty history with recorded node/attempt/artifact
effects cannot restart a run, even if its first application projection was lost.

## Storage and ownership

| Store | Contents |
| --- | --- |
| `dailylogger_service.schema_migrations` | Checked application migration and saver version; runtime never migrates automatically. |
| `dailylogger_service.fixture_runs` | Run UUID, request identity, canonical directory, exact manifest, workflow version, and checkpoint-derived status/receipt projection. |
| `dailylogger_service.operation_attempts` | Separate UUID per modifying CLI invocation; before/after checkpoints, attempted nodes and succeeded/failed/abandoned status. |
| `dailylogger_checkpoints` | LangGraph execution cursor/state and vendor migration ledger. |
| Run directory | Physical ownership marker `.dailylogger-reservation.json`, frozen inputs, diagnostic `attempts.jsonl`, and the create-once artifact bundle; no SQLite checkpoint or mutex. |

`migrate` applies the checked SQL migration under a migration advisory lock, then
calls the pinned PostgreSQL saver's `setup()`. These are separate operations;
an interrupted setup can be repeated explicitly. Unsupported application/saver
versions fail instead of silently downgrading. Compatibility checks read the
actual vendor ledger, not only the application stamp: pinned saver 1.1.4 requires
the contiguous versions 0–5 and their tables. Only an unstamped setup may resume
a compatible prefix; unknown versions, gaps or missing required tables are held.
Both schemas belong exclusively
to DailyLogger. Use a dedicated development database.

A dedicated PostgreSQL session holds an advisory lock for each run throughout
each command. Other commands wait up to ten seconds before failing as busy.
Process death releases the lock. Losing its connection terminates the fixture
process; the saver pool cannot reconnect and continue without ownership. Idle
pool failures also terminate with a sanitized diagnostic. Each command rechecks
the stored admission digest against its canonical directory/source/version and
the marker's physical identity/run UUID. Known binding conflicts expose
`AdmissionConflictError` (`code: ADMISSION_CONFLICT`); infrastructure exceptions
remain distinct so a caller-owned transaction can roll back rather than accept
a command. `admitRun(pool, ...)` owns its transaction.
`admitRunInTransaction(client, ...)` requires a caller-owned active
`READ COMMITTED` transaction, checked with a savepoint probe before filesystem
writes. Both acquire transaction advisory locks in the same order: the short
directory-admission namespace lock, then the request key lock, before reading
bindings or creating reservations. The namespace lock serializes
ancestor/descendant admissions across keys. Request arbitration ensures a
concurrent same-key request for a different directory fails before leaving a
stranded marker. Locks release at caller commit/rollback or process death, with
a ten-second lock timeout. Keep this transaction short and execute graph work
only after commit; S03b may include command/job admission in it.

Application updates, saver checkpoints and artifact filesystem writes **are not
one transaction**. Retry validates the actual graph state and immutable artifact
bytes before repairing the application projection. A process killed after output
but before the final checkpoint reuses that output. A process killed after the
checkpoint but before application settlement leaves a stale run row that the
next command reconciles. An abandoned attempt records interrupted settlement
without asserting that its work was rolled back.

This slice qualifies process restart/crash behavior only when its real PostgreSQL
test job passes. It does not prove host power-loss durability, backup/restore,
database failover, network-partition fencing, distributed publication ownership
or exactly-once external effects. Local directory/digest checks are integrity
checks, not a hostile-user security boundary. The article retains original
GitHub Actions provenance; its separate S03a receipt describes this replay.

## Real database tests

```sh
pnpm type-check:service
pnpm test:service
# Configure DAILYLOGGER_TEST_DATABASE_URL privately for a disposable test server.
pnpm test:service:postgres
```

The PostgreSQL command fails when its environment is absent; it never skips to
a passing result. The supplied connection needs `CREATE DATABASE` permission.
The suite creates a random `dailylogger_test_<uuid>` database and removes only
that database. It never clears or drops the database named in the supplied URL.
All fault injections and metadata mutations occur in the newly created database
and temporary directories. Test-only preloads inject crashes; the CLI has no
crash flag.

[The dedicated CI workflow](../../.github/workflows/service-postgres.yml) supplies
a temporary `postgres:18` service on Node 24.11.1 and current Node 24. It prints the actual server
version and checks explicit/repeated migrations, separate-process restart,
concurrent duplicate starts/resumes, conflicting reuse, distinct run UUIDs,
and a forced directory-conflict interleaving with the former targeted SQL as a
positive control (it must raise the old unique-index error while the fixed path
returns the immutable winner). It also covers
admission before initialization, stale inputs and application identity,
held-transaction conflicts with untouched losing directories, both orders of
concurrent ancestor/descendant admission, completed-bundle overlap rejection,
caller transaction/isolation guards, reservation reuse after rollback,
initial-input checkpoint recovery before pending writes, later missing-state
rejection, successful-step reuse, both sides of the final-checkpoint crash boundary, and
termination on lock-session loss. Positive PostgreSQL qualification must come
from that job, not the SQLite suite or missing-environment failure. A separate
macOS job starts disposable PostgreSQL 18 and mounts an actual case-insensitive
APFS image. It requires measured case-insensitive behavior and checks existing
and concurrent aliases leave only one admitted row. Linux tests also verify that
distinct case-sensitive paths are not incorrectly merged. Local filesystem-only
tests exercise reservation races without claiming PostgreSQL qualification.

## Package and API evidence

On 2026-11-17, npm registry metadata confirmed PostgreSQL saver **1.1.4**, `pg`
**8.23.1** and `@types/pg` **8.23.1**. All are pinned in the workspace lockfile.
The saver's peers (`@langchain/core ^1.1.44` and checkpoint `^1.2.0`) match existing
core 1.3.4/checkpoint 1.2.3; LangGraph remains 1.7.5.

The implementation follows the official [PostgresSaver API](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres/index/PostgresSaver)
and [source](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/index.ts):
an owned `pg.Pool` is passed to `new PostgresSaver(pool, undefined, { schema })`,
`setup()` is explicit, and `end()` closes the saver pool. Owning that pool permits
sanitized handling of idle connection errors. Application records stay separate
from the saver's tables.

S03b can add pg-boss wakeups after this slice passes. Its official
[delivery contract](https://pgboss.io/introduction) is at least once, and its
[transaction adapter](https://pgboss.io/api/adapters) can atomically admit a job
with an application command. It does not make graph checkpoints, filesystem
artifacts or external effects atomic; application idempotency remains necessary.
