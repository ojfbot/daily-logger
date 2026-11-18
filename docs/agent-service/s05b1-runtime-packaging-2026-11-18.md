# S05b.1 runtime packaging integration

This source slice combines ingress PR567 head
`9d14296f786441bc94e4fb8163029d038c26e32d` and exporter PR568 head
`723b110ae985af1329a0a7d019e728cb71090503`, preserving ingress SD2.5 and exporter
SD2.6. Packaging implementation is `cd1bf356535b0a3d1492536ae9c17de5ae44c9aa`.
The exporter commits were applied locally as `7510e2c` and `9d62372`; merge
resolution retained production `tsx` and compatible OTel peer resolutions.

**API and worker CLI injection remains disabled.** This does not deploy Langfuse,
select a live endpoint, introduce real credentials or enable telemetry. Image
archive/manifest/authenticated-verifier work is separate; its workflow and contract
are untouched here.

## Packaging change

The service's `files` list now includes `dist` alongside `src` and `migrations`.
It retains pinned production `tsx` 4.21.0 and the exporter SDK dependency set.
The service owns exact esbuild 0.27.4 as a development dependency so the filtered
Docker build has an explicit compiler dependency.

The committed build-context boundary admits only the exact exporter build script
as an `.mjs` asset. It excludes `dist` even when output is force-committed, and
still rejects arbitrary modules, dirty/missing build inputs and nonordinary files.
Host output, tests, environment files and unrelated scripts do not become image
inputs. The Dockerfile compiles both entry points inside the build stage before
pnpm production deploy; the deployment includes generated ESM and production SDK
dependencies without the exporter build script or direct development compiler.
The pre-existing production `tsx` loader retains its own transitive compiler.

## Final-image startup smoke added

The existing offline final-image smoke now checks both compiled entry points on
the actual `/app/apps/service` production filesystem, owned by UID 1000 and
read-only. With Docker networking disabled, it first checks the no-op default,
then constructs an explicit adapter using disposable synthetic key/CA files in
`/tmp`. It requires the real child to report **ready**, then shuts it down. Merely
returning the no-op factory would fail. No observations are emitted, so this
startup proof needs no telemetry endpoint. The generated synthetic CA is never
installed into a trust store and its temporary files are removed.

This extends the existing runtime-image workflow through its existing smoke
command; no workflow or artifact contract was changed. Target-image execution is
still required before treating restricted-UID/read-only startup as qualified.

## Actual local results

Environment: macOS, Node 24.22.1, pnpm 9.15.4, OpenSSL 4.1.0. No Docker executable
is available in this workspace. Consequently no Linux image, UID-1000 container,
read-only container filesystem, PostgreSQL container or ingress container proof
was run locally for this slice.

| Check | Result |
| --- | --- |
| Frozen offline workspace install | Passed with pnpm 9.15.4. |
| Service typecheck | Passed. |
| Complete local service suite | 44 passed, zero skipped. |
| Runtime/context suite | 6 passed, zero skipped. Includes rejection of missing/dirty build input, unrelated committed `.mjs`, and exclusion of force-committed prebuilt output. |
| Committed context preparation | Passed for implementation commit `cd1bf356535b0a3d1492536ae9c17de5ae44c9aa`; fixture store has zero remotes/alternates. |
| Filtered install/build/deploy from only that context | Passed offline; both ESM entry points were built inside the isolated context and copied by production deploy. |
| Real child startup from that deployed production tree | Passed under local UID 501: child ready then closed, zero batches, default factory still no-op; tests/build script/direct dev esbuild absent. This is not a UID-1000 image result. |
| Runtime smoke syntax | `node --check` passed. |
| OPM | Deterministic second render; 14 sections, 530 facts, no ignored facts, all source anchors exist. |
| Diff checks | Passed; CLI entry points, Compose configuration and workflows unchanged by this integration. |

The context proof uses the same dependency filter, build script and production
deploy sequence as the Dockerfile:

```sh
pnpm service:runtime:context /absolute/new/context
cd /absolute/new/context
pnpm --filter @ojfbot/daily-logger-service... install --frozen-lockfile --offline
pnpm --filter @ojfbot/daily-logger-service build:telemetry
pnpm --filter @ojfbot/daily-logger-service deploy --prod --offline /absolute/new/production/service
```

Offline install assumes the pinned packages are already present in the local
store; ordinary image CI can populate its store through the existing frozen install.

## Remaining gates

Run the updated Docker image/ingress smoke and service PostgreSQL suites in CI
on this combined head, including the configured Node minimum matrix. Then review
concrete runtime secret mounts/CA/endpoint and inject one owned adapter per API
and worker in a later slice. No export enablement or external-network capability
is added to Compose here. Actual Langfuse authenticated ingestion/readback,
retention/deletion, container resource/process limits and deployment restart
behavior remain separately qualified work. The S05b.1 lossy/fail-open semantics
and resource limitations in `apps/service/OBSERVABILITY.md` still apply.
