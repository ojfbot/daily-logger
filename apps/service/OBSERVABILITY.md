# S05a: offline application observations

This slice supplies explicit application hooks, a closed metadata projector and
bounded offline test sinks. Instrumentation is **disabled by default**. Existing
CLIs select the no-op adapter; there is no exporter environment variable, endpoint,
credential, SDK, OTLP payload or production telemetry configuration here. The
fixture worker's HTTP blockade and ambient LangSmith suppression remain unchanged.
The owner API separately permits its configured OAuth exchange; no generic HTTP
instrumentation or capture is added.

S05b must pin and qualify the official Langfuse SDK/server pair and map this
allowlisted application data to it. These tests do not establish Langfuse ingestion,
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
`parentId` are application observation UUIDs, not OTel span IDs. S05b must test the
official SDK mapping for stable start/end pairs, parent/child relationships and
run grouping. Removing UUID hyphens alone is not a valid span-ID mapping.

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

The supported sinks are **trusted, nonblocking in-process test sinks**. Promise
timeouts cannot preempt synchronous CPU or filesystem blocking on the event loop.
A finite blocking negative control is classified as an overrun and quarantined
when it returns; this does not undo its elapsed delay. Arbitrary blocking adapters
are outside the isolation claim. S05b must qualify the real SDK's event-loop impact
and use process/thread isolation if required before claiming production isolation.

## Qualification

```sh
pnpm type-check:service
pnpm test:service
# Explicit disposable PostgreSQL test server with CREATE DATABASE permission:
pnpm test:service:postgres
pnpm test:service:delivery
pnpm test:service:http
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
