# S05b.1 isolated exporter: local source verification

This slice adds an **inactive, injectable metadata exporter** on qualified combined
base `c365640521b1e32a8225b76e07213d9f48d180c5`. It is not a deployed Langfuse
service. Existing API/worker CLI wiring, fixture HTTP blockade, LangSmith suppression,
canonical state, graph outputs, approvals and publishing behavior are unchanged.

**Integration remains required:** build and include the two exporter ESM artifacts
in the runtime image, supply protected key/CA file references and an explicit
private HTTPS endpoint, inject one owned adapter per process, and requalify runtime
shutdown and the real PostgreSQL HTTP-to-worker path. Real Langfuse stack deployment,
authenticated ingestion/readback, retention/deletion, backup/restore and resource
capacity are separate gates. Local HTTP success does not prove server indexing.

## Implemented boundary

`createLangfuseTelemetry` in `apps/service/src/telemetry-export-process.ts` is an
optional factory. Invalid/absent enablement returns the existing no-op adapter.
Enabled construction owns one child process; that child's responsive supervisor
owns one SDK worker thread. All application hooks remain nonblocking and retain
their existing closed projector. No SDK is imported into the application by this
factory. The child environment contains only `LANG` and `TZ`, has no inherited
Node options/proxy/provider/database/OAuth secrets, and does not relay stdout/stderr.
Keys enter only as explicit file references and are opened in the SDK thread.

There is one unacknowledged IPC batch, 100 ms batch allowance, 3-second startup
allowance, and 230 ms parent shutdown allowance. A separate one-second supervisor
heartbeat deadline handles SDK CPU hangs **after** batch acknowledgement as well
as hangs during admission. No failed child is restarted automatically. Remote
export failure quarantines transport and becomes a fixed child failure at the
thread's next 250 ms health tick. IPC acknowledgement never means queue ACK,
new durable admission or successful remote ingestion.

The assembler retains at most 128 records/16 incomplete segments for 60 seconds,
and creates SDK observations only for structurally complete segments. Native
OTel IDs represent parentage; application UUIDs remain complete correlation
metadata. Historical timing uses start plus monotonic duration with millisecond
display precision; the original observed end timestamp remains metadata.

After SDK enrichment, `telemetry-wire.ts` rebuilds every public span surface.
Only the existing scalar allowlist, fixed service/scope/release/environment/type
labels and root marker survive. There are no raw contents, error descriptions,
host identities, events, links or trace state. Full UUID metadata and native
ancestry/run grouping are verified against decoded wire data.

The exporter has at most 128 waiting spans plus 16 in one in-flight batch. The
official serializer produces the exact uncompressed bytes checked against a
64 KiB request-body cap before sending. Response body retention is capped at
4 KiB and response headers at 8 KiB. Private-address checks, explicit supplied CA,
normal hostname verification and a two-second request deadline are mandatory.
No redirect class forwards authorization, and there are no request retries.
Transport is aborted before delegate shutdown/drain.

The build script uses the repository's locked esbuild to compile only the two
isolated entry points into `apps/service/dist/telemetry/*.mjs`, with dependencies
external. Generated artifacts are ignored by Git. This avoids runtime TypeScript
compiler/helper processes under the exporter. It does not imply the artifacts
are included in existing deployment packaging.

## Dependencies and public APIs

Exact direct pins are `@langfuse/tracing` / `@langfuse/otel` 6.1.1,
`@opentelemetry/api` 1.9.1, OTel core/resources/sdk-trace-base 2.12.1, and
OTLP HTTP exporter/exporter-base/transformer 0.223.2. Transitive Langfuse core is
6.1.1. The service's LangChain and pg-boss peer resolutions now use compatible
OTel API 1.9.1 rather than their previous 1.10.0 resolution; existing service
regression tests passed with that lock. No auto-instrumentation, SDK-node,
LangChain callback handler or model dependency was added.

The transport uses package-root exports `JsonTraceSerializer`,
`createOtlpNetworkExportDelegate`, `OTLPExporterBase` and `IExporterTransport`.
It does not access SDK private fields or patch a default transport. The SDK's
manual observation API and explicit provider are used; global application
context is not installed or propagated. Reference:
[Langfuse v6.1.1 source](https://github.com/langfuse/langfuse-js/tree/v6.1.1),
[OTel exporter-base public API](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/otlp-exporter-base),
[Langfuse SDK compatibility](https://langfuse.com/docs/observability/sdk/overview).

## Actual local checks

Environment: macOS, Node **24.22.1**, **pnpm 9.15.4**, OpenSSL **4.1.0**
(23 Oct 2026). Tests generated disposable synthetic certificates and keys only
under the operating system temporary directory, removed their fixture directories,
and used loopback receivers. No real credentials, external telemetry endpoint,
model, trust-store change, NAS or live service was used.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` with CI mode | Passed; exact lock accepted using the populated local package store. |
| `pnpm --filter @ojfbot/daily-logger-service type-check` | Passed. |
| `pnpm --filter @ojfbot/daily-logger-service test` | 44 passed, zero skipped: 27 existing regression cases plus 17 new exporter cases. |
| Official serializer exact-cap / cap-minus-one | Exact bytes accepted; one byte below blocks before network. |
| Wire/privacy | Complete UUIDs, native parentage and run grouping retained; ambient/capture-surface/resource/scope/status/event/link canaries excluded. |
| TLS/address policy | Wrong CA and hostname reject before HTTP handler; public numeric and mocked public/mixed DNS results rejected. |
| Redirects and status errors | 301/302/303/307/308 same/cross-origin never forwarded auth; 401/429/503 never retried. |
| Backpressure / timeout / shutdown | Bounded queues and one in-flight request; header/body blackholes abort; live-blackhole shutdown stays within the test's 350 ms scheduling tolerance around the 230 ms budget. |
| Process cleanup | Stopped owned child killed; SDK CPU hangs before and after ACK terminated; owner SIGKILL while SDK thread is stuck leaves no live exporter child in the tested process topology. |
| OPM rendering | 13 sections / 516 facts, no ignored facts, source anchors exist; second render byte-identical. |
| `git diff --check` | Passed. |

The existing byte-equivalence fixture test still compares no-op/capture/failed/
stuck **S05a test sinks**. It is not represented as a real Langfuse canonical-state
integration proof. That proof remains part of the runtime/API/worker integration
gate above. PostgreSQL suites and the Node 24.11.1 minimum matrix were not rerun
locally in this slice; CI and integrated qualification must cover those separately.

## Operating limits

V8 heap/stack limits are not total RSS or CPU quotas. One child plus one internal
SDK thread does not establish NAS capacity or container/process-group isolation.
The tested cleanup relies on a responsive child supervisor: an externally suspended
whole child whose parent then dies needs OS-level supervision, which this source
slice does not supply. Parent shutdown remains bounded even when its owned child
is stopped. Loss of buffered observations, startup drops and quarantine drops are
intentional; application records/checkpoints remain authoritative.

SDK secrets are bounded strings in child memory, not a zeroization guarantee.
Deployment must protect their parent directories/mounts and rotate credentials
through supervised adapter/application restart. Runtime memory/process limits,
secret delivery, CA renewal, endpoint DNS and real server retention/readback must
be reviewed with the concrete deployment before enablement.
