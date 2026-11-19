# Private fixture runtime preparation

This packages the qualified fixture API, worker and explicit migration command
into one non-root image. The Compose draft publishes no host ports and retains
the API's loopback listener. Private HTTPS, NAS architecture, proxy topology,
certificate trust/renewal and real owner GitHub login require live qualification.

## Prepare and verify

Run from a committed checkout with the pinned fixture objects available locally.
Use the repository's pnpm9.15.4 and Node24.

```sh
pnpm install --frozen-lockfile
pnpm service:runtime:context /absolute/new/private-build-context
docker build -t dailylogger-runtime:local /absolute/new/private-build-context
pnpm service:runtime:smoke dailylogger-runtime:local
```

Context preparation copies only committed runtime inputs selected by the
service's `files` list and required build/schema assets. The `dist` deploy tree
is excluded even if force-committed: the image rebuilds it from source. Only the
explicit exporter build script is admitted as an `.mjs` build input; arbitrary
scripts and host output remain excluded. The shared journal manifest and its two
explicitly named source files are also required build inputs. Journal tests,
unrelated source, environment files and host build output
are excluded even when committed. Changed runtime inputs,
symlinks and existing destinations reject. Untracked files, environment files,
developer node_modules and source Git metadata never enter the build context.
A fresh local-only shallow fetch supplies the public fixture commit. The store
has no remote, alternate object store, local reflogs, source config or hooks; its shallow
boundary and object identities are verified before packaging.

The build installs from the frozen workspace lock for the target platform, uses
the service's exact esbuild development dependency to compile the two isolated
exporter entry points, and then uses pnpm production deploy. The service owns its
pinned production `tsx` loader and Langfuse/OTel dependencies. SQL and
schema assets retain their existing paths. Source and Git metadata belong to
UID/GID1000 and are read-only; `/app/node_modules` links to the same service-owned
production dependency tree so root-directory CLI subprocesses resolve the loader.
The exporter build script, source tests and fault preloads are excluded from the
runtime. The existing production `tsx` loader retains its own transitive compiler;
the compiled exporter child does not launch that loader or a compiler helper.

The dependency-free shared journal package is installed through the workspace
lock and included by production deploy. Its two TypeScript entry points use the
same `tsx` loader. Offline smoke imports the installed package, verifies resolved
files remain inside `/app`, checks representative DST windows and the empty
eligibility result, and checks that the installed journal manifest declares no
runtime, optional or peer dependencies. Root CLI source and build-stage paths
are absent. This qualifies package closure, not a journal graph or
semantic validation of recorded evidence.

Node24.22.3 and PostgreSQL18.7 base images are pinned by official multi-platform
index digest. Each built image still requires target-platform proof; rebuilding
later can resolve newer distribution packages. Do not equate the macOS object
preparation proof with a Linux image build.

The smoke command owns a unique disposable Compose project and a separately named
offline container. Standalone cleanup checks its exact name and random ownership
label, then removes only the verified container ID, including after Docker-client
timeout. Each lookup/removal has a five-second limit; a failure is reported while
project-only Compose cleanup still runs. The synthetic OpenSSL subprocess also
has a five-second limit. It tests the actual image offline and with a
read-only filesystem, opens native SQLite, runs production entrypoints before
mounting test code, requires explicit repeatable migration, and completes a
cross-container fixture start/restart/resume with canonical artifact bytes.
It then mounts the existing HTTP tests read-only to verify the production
dependency closure against disposable PostgreSQL. All credentials in this
harness are generated or fixed test values. This is not real GitHub login proof.

The offline final-image portion also verifies that both compiled exporter entry
points are present and read-only under UID 1000. It first checks the no-op default,
then constructs an explicitly configured adapter with disposable synthetic key/CA
files under `/tmp`, waits for the real SDK child to report ready, and closes it.
No observations are emitted and the container has no network: this proves the
production dependency/path/UID startup closure, not TLS transport or Langfuse
ingestion. API/worker commands use the no-op adapter unless their explicit
`--telemetry-config` argument is supplied. Enabled CLI integration against a
synthetic receiver is a separate test from this final-image offline startup proof.

## Enabled exporter image qualification

After export/reload qualification, run the same four enabled-exporter integration
tests against the exact loaded image and its matching config identity:

```sh
pnpm service:runtime:exporter sha256:<qualified-engine-id> sha256:<qualified-config-id>
```

The pinned PostgreSQL image must already be present. The proof neither builds nor
pulls images. It creates an internal network and disposable PostgreSQL storage,
then mounts only the test harness and helpers read-only. Application source,
production dependencies and compiled exporter entry points come from the image.
API and worker CLIs run against the synthetic strict-TLS receiver inside the
restricted test container; database connections stay on the internal network.
No host ports, real credentials, model calls or public endpoints are used.

CI requires four passing tests with no skips, verifies owned-resource cleanup,
and records a separate closed receipt before retaining the artifact. The existing
artifact manifest contract remains unchanged. This tests enabled image behavior
with both CLIs inside one disposable test container; it does not qualify actual
deployment topology, target-host capacity, real owner login or Langfuse indexing,
retention and backup recovery.

## Deployment inputs

Keep real values outside Git and build contexts. Compose requires these runtime
variables through the host's private environment management:

- `DAILYLOGGER_RUNTIME_IMAGE`: the exact locally qualified image.
- `DAILYLOGGER_DATABASE_PASSWORD`: dedicated PostgreSQL password.
- `DAILYLOGGER_DATABASE_URL`: complete URL for the `database` service and
  `dailylogger` database/user; URL-encode password characters as needed.
- `DAILYLOGGER_PRIVATE_ORIGIN`: exact private HTTPS origin.
- `DAILYLOGGER_OWNER_GITHUB_ID`: immutable numeric owner ID.
- `DAILYLOGGER_GITHUB_CLIENT_ID` and `DAILYLOGGER_GITHUB_CLIENT_SECRET`: the
  separately registered private OAuth application.

The migration service is explicit; serving and working never create schema.

```sh
docker compose -f apps/service/runtime/compose.yaml run --rm migrate
docker compose -f apps/service/runtime/compose.yaml up -d api worker
```

API and worker share `/var/lib/dailylogger/fixtures` at the same absolute path.
PostgreSQL stores that path, so a different worker mount is invalid. Named-volume
ownership is verified in CI; actual NAS bind-mount ownership needs separate proof.
Application PostgreSQL and fixture files use separate persistent volumes.
Telemetry stays no-op by default. The exporter code/dependencies are packaged;
explicit opt-in CLI configuration is described in [OBSERVABILITY.md](../OBSERVABILITY.md).
The supplied Compose profile does not enable it or mount telemetry credentials.
No telemetry database or disk spool is configured.
Any later telemetry storage, retention and backups remain independent.

The worker, migration and database use an internal container network. Only the
API also joins an outbound-capable network for its GitHub HTTPS exchange. No
ports are published, and that network is not an outbound destination allowlist.
A separate proxy container cannot reach the API loopback through an ordinary
bridge. The NAS-specific connection must be designed from the observed topology.
This draft configures no proxy, WAN forwarding, public exposure or production
publication authority. LAN and WireGuard access, including both address families,
must be demonstrated before the private deployment is called ready.
