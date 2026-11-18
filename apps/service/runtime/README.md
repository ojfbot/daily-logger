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
service's `files` list and required build/schema assets. Changed runtime inputs,
symlinks and existing destinations reject. Untracked files, environment files,
developer node_modules and source Git metadata never enter the build context.
A fresh local-only shallow fetch supplies the public fixture commit. The store
has no remote, alternate object store, local reflogs, source config or hooks; its shallow
boundary and object identities are verified before packaging.

The build installs from the frozen workspace lock for the target platform and
uses pnpm production deploy. The service owns its pinned `tsx` loader. SQL and
schema assets retain their existing paths. Source and Git metadata belong to
UID/GID1000 and are read-only; `/app/node_modules` links to the same service-owned
production dependency tree so root-directory CLI subprocesses resolve the loader.
Build tools, source tests and fault preloads are excluded from the runtime.

Node24.22.3 and PostgreSQL18.7 base images are pinned by official multi-platform
index digest. Each built image still requires target-platform proof; rebuilding
later can resolve newer distribution packages. Do not equate the macOS object
preparation proof with a Linux image build.

The smoke command owns a unique disposable Compose project and removes only its
containers, networks and volumes. It tests the actual image offline and with a
read-only filesystem, opens native SQLite, runs production entrypoints before
mounting test code, requires explicit repeatable migration, and completes a
cross-container fixture start/restart/resume with canonical artifact bytes.
It then mounts the existing HTTP tests read-only to verify the production
dependency closure against disposable PostgreSQL. All credentials in this
harness are generated or fixed test values. This is not real GitHub login proof.

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
Telemetry stays no-op with no exporter, database, credentials or disk spool.
Any later telemetry storage, retention and backups remain independent.

The worker, migration and database use an internal container network. Only the
API also joins an outbound-capable network for its GitHub HTTPS exchange. No
ports are published, and that network is not an outbound destination allowlist.
A separate proxy container cannot reach the API loopback through an ordinary
bridge. The NAS-specific connection must be designed from the observed topology.
This draft configures no proxy, WAN forwarding, public exposure or production
publication authority. LAN and WireGuard access, including both address families,
must be demonstrated before the private deployment is called ready.
