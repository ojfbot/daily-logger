# Application observations and opt-in exporter

S05a supplies explicit application hooks, a closed metadata projector and bounded
offline test sinks. S05b.1 adds an injectable Langfuse process adapter, tested with
synthetic local TLS receivers. Instrumentation is **disabled by default**. API
`serve` and delivery `work` can explicitly select it with `--telemetry-config`;
omitting that argument selects the exact no-op adapter, and no environment variable enables export. The
fixture worker's HTTP blockade and ambient LangSmith suppression remain unchanged.
The owner API separately permits its configured OAuth exchange; no generic HTTP
instrumentation or capture is added.

The SDK/exporter dependency set is pinned, but a real SDK/server pair still needs
qualification. These tests do not establish Langfuse ingestion,
indexing, UI access, retention, deletion or production readiness.

## Meaning of observations

| Kind | What was actually observed |
| --- | --- |
| `admission_response_observed` | A response after successful commit: admitted, rejected or idempotency-conflict response. A replay can repeat the same response. This never claims a newly created command/admission/rejection. |
| `delivery` | One execution call including validation, lock wait and checkpointer cleanup. Terminal `returned`/`failed` describes the call. Optional `runState` describes observed graph state separately; neither is a durable command disposition or queue acknowledgement. |
| `operation` | Execution/settlement associated with an attempt UUID, created only after its database INSERT succeeds. Terminal observation follows delivery settlement. It excludes checkpointer cleanup, whose failures belong to the enclosing delivery call. |
| `node` | An actual node invocation, including validation and computation. Recognized human interruption ends as `paused`; resume is another invocation. The original result, exception or control-signal object is preserved. |
| `reconciliation` | The runner reconciled its application projection from checkpoint state. Telemetry does not store or replace that checkpoint. |

`admitCommand(pool, boss, input, telemetry?)` observes responses outside its
transaction catch after COMMIT. `admitCommandInTransaction` remains provisional
and has no observation hook. The owner API calls
`observeAdmissionResponse(telemetry, response)` after its `write` transaction
returns from a successful COMMIT. Authentication failures, rollback and unknown
COMMIT outcomes emit nothing; an identical successful retry can observe the
stored response. The hook is nonthrowing, does not change response bytes, and
awaits no sink. Read-only HTTP projections do not emit reconciliation events.

`createHttpServer(config, fetcher, telemetry?)` defaults to the no-op adapter and
owns a separately supplied adapter for that server. It closes the adapter after
application resources on close, or after a migration/startup rejection, using
the bounded shutdown helper. Do not share that adapter with another server or
worker. The existing CLI shutdown deadline remains unchanged. No request/session
object or private HTTP identity reaches the admission hook.

`executeDelivery` and `runWorker` accept an optional adapter. `runOperation` accepts
an optional enclosing observation after its existing delivery hooks; the runner
adds real attempt/node observations under it. The adapter never receives a request,
checkpoint, article, approval or error object from these hooks. No extra database
query or business-state mutation is performed for telemetry.

One application `traceId` is generated per delivery invocation; it is a **segment
correlation UUID**, not an OpenTelemetry wire trace ID. `observationId` and
`parentId` are application observation UUIDs, not OTel span IDs. S05b.1's local SDK
wire test verifies stable pairs, native parent/child links and run grouping.
Removing UUID hyphens alone is not a valid span-ID mapping.

The same durable `runId` groups restarted segments. `commandId` and `attemptId`
remain distinct; status/cancellation paths without a new attempt invent none.
IDs attach only after their application identity is available, so an early delivery
start may lack them. A human wait closes active observations before returning.
A process kill can lose buffered observations or leave an incomplete pair; recovery
uses application records and checkpoints, never manufactured telemetry completion.

## Closed export boundary

`telemetry-schema.ts` reconstructs each record from own data fields. It permits
only fixed event/node/operation/version names, enumerated outcomes/run state,
application UUIDs, retry counts, timestamps and measured durations. Unknown fields
are dropped; invalid required identity fields reject the record. Getter/proxy
failures are contained. No raw names, nested attributes, inputs, outputs, errors,
stacks, events, links, resources, baggage, host/process metadata, actor labels,
request keys, filesystem paths, connection strings or approval digests are exported.
UUID syntax is validation, not authority; only trusted application producers supply
these fields. No generic LangChain/HTTP/database/pg-boss instrumentation is enabled.

Every sink receives only projected metadata, with separate immutable record and
batch copies. A second sink cannot receive an unprojected side channel or mutate
another sink's data. No metric-label API is added. Fixture nodes are not model
generations; there are no fabricated token, cost or model-quality values.

## Bounded lifecycle and limits

The fixed limits are two sinks, 128 queued records, 16 records per batch, 1,024
serialized bytes per record, and 8,192 bytes per serialized batch. Export allowance
is 100 ms; optional flush/shutdown allowance is 250 ms. Overflow drops observations.
No application operation waits for a sink callback or retries to repair telemetry.

A throwing or asynchronously timed-out sink is quarantined for the adapter's
lifetime. It receives no replacement exports; at most one unresolved export per
sink can remain. Late resolution/rejection is consumed without retrying it or
changing the application result. Other sinks keep receiving projected batches.
Diagnostics are numeric counters only, with no exception text. They are volatile,
not an exact durable accounting ledger. The worker flushes only after draining
and closing application resources, inside its unchanged hard shutdown deadline.

The supported direct S05a sinks are **trusted, nonblocking in-process test sinks**. Promise
timeouts cannot preempt synchronous CPU or filesystem blocking on the event loop.
A finite blocking negative control is classified as an overrun and quarantined
when it returns; this does not undo its elapsed delay. Arbitrary blocking adapters
are outside the isolation claim. The S05b.1 adapter below moves SDK work outside
the application process; deployment resource/isolation qualification remains open.

## S05b.1 injectable exporter

Build the two isolated ESM entry points with `pnpm --filter
@ojfbot/daily-logger-service build:telemetry` before constructing an enabled
adapter. Normal service tests also perform this build using the repository's
locked esbuild. The application continues to run from the existing source tree;
the adapter resolves `apps/service/dist/telemetry/telemetry-export-child.mjs`.
The runtime Dockerfile now builds these artifacts from committed source before
production deploy. Its offline final-image smoke requires an actual child-ready
signal under UID 1000 with a read-only root filesystem and networking disabled;
it does not emit observations or require an endpoint. See the [runtime packaging
receipt](../../docs/agent-service/s05b1-runtime-packaging-2026-11-18.md) for which
platform checks have actually run. Missing artifacts fail open
by closing the optional child. API/worker CLI injection requires the explicit
protected configuration described below.

`createLangfuseTelemetry(config?)` returns the existing no-op adapter unless
explicit configuration passes the closed validator. The only enabled shape is:

```ts
{
  mode: 'langfuse',
  endpoint: 'https://receiver.fixture.invalid/api/public/otel/v1/traces',
  publicKeyFile: '/run/secrets/telemetry-public-key',
  secretKeyFile: '/run/secrets/telemetry-secret-key',
  caFile: '/run/secrets/telemetry-ca.pem',
  environment: 'qualification', // or 'production'
}
```

The example uses a reserved domain, not a deployment address. The exact endpoint
and all file references must be supplied; there is no implicit cloud destination,
inline-key configuration, proxy configuration or redirect support. URLs reject
userinfo, query and fragment. Each DNS resolution must contain only private IPv4
(RFC1918, loopback, CGNAT) or IPv6 (ULA, loopback) addresses; numeric addresses
receive the same check. The supplied CA and Node's default hostname verification
are mandatory. The CA bundle is the endpoint's explicit trust set. Public DNS
names are allowed only when their actual resolution satisfies that private-address
policy; no fleet topology is hardcoded. Authentication is sent only in the fixed
ingestion request's Basic header, with ingestion version 4.

Only the exporter thread opens key/CA files. It rejects final-component symlinks,
nonregular files and files above their size cap. Key files must belong to the
effective owner and have no group/other permissions; public/secret keys are
printable ASCII, at most 4,096 bytes each. CA files are at most 128 KiB. Deployment
must protect parent directories and mounts against replacement. JavaScript does
not provide a guarantee of zeroing every in-memory credential copy.

## Explicit API and worker configuration

Only long-running API and worker operations accept this optional argument:

```sh
pnpm service:http serve --telemetry-config /absolute/private/api-telemetry.json
pnpm service:delivery work --telemetry-config /absolute/private/worker-telemetry.json
```

Each file contains exactly the six fields in the configuration example above,
encoded as JSON. It must be an absolute path to a regular file owned by the
effective application user with no group or other permissions. Reading is bounded
to 16 KiB and rejects final-component symlinks and special files. Protect parent
directories and mounts as well. The file contains references to credentials,
never inline keys; each process constructs and owns its own adapter.

Malformed explicit configuration rejects startup with a fixed error before
database or serving resources are acquired. Once configuration is admitted,
missing compiled exporter files, rejected key files, or an unavailable receiver
quarantine the optional exporter without replacing the business result or
making durable execution wait for telemetry delivery. Omission of the argument returns the exact no-op
adapter. Migration, enqueue and read-only CLI operations do not accept it.

The application closes its owned adapter during setup failure and normal
shutdown within the existing deadlines. Enabling this option on a deployed host
still requires reviewed protected mounts, endpoint trust, resource capacity and
enabled final-image lifecycle qualification. The default Compose profile supplies
neither this argument nor telemetry mounts.

The separate [enabled image proof](runtime/README.md#enabled-exporter-image-qualification)
runs the same four mandatory integration cases with application code and the
compiled exporter supplied by the exact final image. Its synthetic receiver and
disposable PostgreSQL qualify that image boundary only; actual Langfuse indexing
and target-host deployment remain separate evidence.

The bounded topology is one application-owned child process containing one
responsive IPC supervisor and one SDK worker thread. No SDK is imported into the
application process by this adapter. The compiled child needs no runtime TypeScript
compiler or helper process. Its environment contains only `LANG=C` and `TZ=UTC`;
database/model/OAuth keys, `NODE_OPTIONS`, LangSmith, OTel, Langfuse debug/resource
settings and proxy variables are not inherited. Its stdout/stderr are discarded.
Only a ready message and fixed sequence acknowledgements cross back to the parent;
parent diagnostics contain counters/booleans, never SDK exception text or payloads.

Startup has a 3-second deadline and does not hold business work. Records before
ready are dropped. Parent IPC permits one unacknowledged batch (16 records,
8 KiB) for 100 ms. An acknowledgement means the thread handled the metadata
batch, **not remote ingestion, new durable admission, or queue acknowledgement**.
A protocol/startup/IPC failure closes and quarantines this child for the adapter's
lifetime; there is no automatic restart. Existing S05a `exported` counters only
describe sink completion; `exporterDiagnostics()` separately exposes IPC drops
and acknowledgements. These are lossy, nondurable diagnostic counters.

The SDK thread buffers at most 128 records across 16 incomplete segments, expiring
them after 60 seconds. Only a fully paired, rooted, acyclic segment creates SDK
spans. Missing/duplicate pairs, orphan links, overflow and expiry never fabricate
completion. Parent spans are created before children; durable IDs bound later in
the segment survive pairing. Standalone events may export immediately. Historical
display times use recorded start plus monotonic duration (millisecond Date
precision); original observed end `at` and duration remain metadata. A backward
wall-clock jump therefore cannot manufacture a negative display duration.

Manual Langfuse observations use an isolated provider and root context. A final
`telemetry-wire.ts` projector reconstructs every `ReadableSpan` surface after SDK
enrichment. Application fields become JSON-encoded scalar attributes under
`langfuse.observation.metadata.dailylogger.*`; `runId` additionally supplies
`langfuse.session.id`. Native SDK trace/span IDs remain separate and trace state
is discarded. Resource/scope identity, release `s05b.1`, environment, observation
type and root marker are fixed/validated. Status has only a code. Events, links,
raw inputs/outputs, host identity, exception descriptions and arbitrary metadata
are absent. There are no model-generation, token, cost or publish observations.

The official public `JsonTraceSerializer` / `createOtlpNetworkExportDelegate` /
`OTLPExporterBase` seam sends the exact checked uncompressed bytes. The exporter
retains at most 128 waiting spans plus 16 in the single in-flight batch, capped at
64 KiB serialized request body. Response body retention is capped at 4 KiB and
headers at 8 KiB. A request has a 2-second deadline. All redirects/non-2xx replies
fail without retry; a failed export quarantines the exporter. The thread's
250 ms health tick turns that quarantine into a fixed child-exit diagnostic,
without forwarding response text or SDK errors. Abort retains the
network slot until actual request close, so a timer cannot create overlapping
replacement requests. Shutdown aborts transport before the official delegate drains.

The parent adapter returns from shutdown within its 230 ms allowance (subject to
ordinary OS/event-loop scheduling), killing its owned child at the deadline.
This fits inside the existing optional 250 ms helper and leaves worker hard
deadlines unchanged. The child supervisor independently expires a stuck SDK
thread after one second without its heartbeat, including hangs after batch ACK,
and exits on parent IPC disconnect; process exit terminates that thread.
Tests cover a stopped child while its parent survives, a CPU-stuck SDK thread,
and owner SIGKILL with a responsive child supervisor. They do not prove cleanup
of an externally suspended whole child after its parent dies; runtime process-group
supervision remains a separate gate. V8 limits (96 MiB child old space; worker
64 MiB old/16 MiB young/4 MiB stack) are **not total RSS or CPU quotas**. No new
container memory/process limit or production capacity claim is made here.

Deployment integration still required: qualify enabled behavior in the built image
on its target platform, and choose protected secret/CA mounts and endpoint.
Explicit source CLI wiring preserves the HTTP blockade/LangSmith suppression,
existing deadlines and no-op defaults. The dedicated real PostgreSQL exporter
suite exercises those CLIs against a synthetic TLS receiver; its actual results
must pass before claiming that boundary qualified. Langfuse
stack deployment, authenticated readback, retention/deletion and backup recovery
are later gates; an HTTP success alone is not proof of indexed observations.

## Qualification

```sh
pnpm type-check:service
pnpm test:service
# Explicit disposable PostgreSQL test server with CREATE DATABASE permission:
pnpm test:service:postgres
pnpm test:service:delivery
pnpm test:service:http
pnpm test:service:exporter
```

Offline tests cover secret canaries across unsupported capture surfaces, multiple
sinks, queue/payload limits, async hangs/errors, synchronous-overrun diagnostics,
async callback rejection containment, and exact node error/interrupt identity.
Separate-process fixture start/resume compares disabled, capture, throwing and
stuck modes: state, approvals and article/action/receipt bytes are identical.

The additional delivery tests require real PostgreSQL and create/drop only their
own random database. They cover rollback silence, post-COMMIT adapter use, exact
response replay/conflicts, worker restart/human wait with real attempt IDs,
cancellation's separate call/graph semantics, exporter outage/shutdown, settlement
failure, process death/checkpoint recovery, and a rejected attempt INSERT. Test capture files are disposable harness
output outside canonical artifact bundles. Existing crash/deduplication suites
remain part of qualification. Passing offline tests alone does not qualify the
PostgreSQL instrumentation or any Langfuse backend.

The HTTP integration suite also covers silence after rollback and uncertain
COMMIT, exact replay across destination roots with capture and failed sinks,
private HTTP canaries, and bounded adapter shutdown. Its schema-003 start/resume
path matches HTTP command/run IDs to real worker attempt observations and checks
canonical article/action bytes. HTTP and worker observations have independent
segment IDs; their durable command/run IDs supply correlation.
