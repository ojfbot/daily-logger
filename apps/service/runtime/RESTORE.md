# Isolated matched restore qualification

This test-only harness exercises same-version recovery of a fully stopped,
credential-free fixture. It uses the exact runtime image qualified by the image
workflow, the pinned PostgreSQL image and matching dump/restore tools, and fresh
isolated database and fixture volumes. It publishes no ports and runs no owner
login, model provider, journal publisher or telemetry exporter.

```sh
DAILYLOGGER_RESTORE_IMAGE=sha256:<exact-loaded-image-id> \
DAILYLOGGER_RESTORE_CONFIG_ID=sha256:<verified-config-id> pnpm test:service:restore
```

Docker and the exact loaded image are required. Missing prerequisites fail the
proof rather than skipping it. The runtime image workflow runs this test after
its existing export/reload qualification and before uploading the retained
artifact. Both identities come from that qualification's manifest; an arbitrary
tag is insufficient. The image store's engine identity and runnable config
identity remain distinct, including in container readback.

## Recovery boundary

The source contains completed/consumed, paused with an admitted resume, and
cancelled fixture histories, along with synthetic authentication state. All
application and queue processes stop before capture. No active operation or
partial artifact bundle may remain. Source state stays stopped and unchanged
throughout the drill, establishing the limited no-post-cut-effects premise.

The recovery point binds one complete logical database dump and the full fixture
tree to a backup identity. Application migrations, saver history, queue state,
commands, approval targets, session state and frozen file bytes belong to the
same recovery point. Restored raw state is checked before calling status helpers,
because status reconciliation can write rows and settle attempts.

Fresh volumes preserve the original container-visible absolute paths. Ordinary
copied reservation markers must fail the live physical-identity checks. A
test-only reconciliation helper validates the matched database/files and original
bindings before changing only the marker's physical identity to the new measured
directory identity. Logical IDs, paths, digests, approvals and artifact bytes
remain unchanged. The live destination admission code stays strict.
Reconciliation assumes trusted single-writer control with no concurrent filesystem
mutation; its process-interruption proof establishes neither power-loss durability
nor an atomic transaction across the entire restore.

Only after validation may the test release its single pending fixture resume.
Completed and cancelled runs stay unchanged; command replay cannot create a new
job, and a fresh command cannot reuse a consumed target. Mismatched recovery
packages, corrupt state, foreign or replaced destinations, and interrupted
reconciliation must fail with workers still fenced. Receipts expose only
synthetic qualification metadata; database dumps and configuration are not
uploaded as CI artifacts.

## Production recovery remains a separate gate

An internally consistent older backup can restore authority that was consumed,
revoked or cancelled after capture. The current validators have no independent
restore epoch and cannot discover later external effects from restored data
alone. This fixture's stopped-source premise does not solve that problem.

Production recovery requires effective fencing of both old and restored writers,
an authority epoch outside restored state, invalidation of restored sessions,
login grants and job claims, and reconciliation of external effects before fresh
approval bound to the current exact version. Historical decisions must remain
history. The recovery control plane and publication reconciliation protocol still
need design and qualification before an operator restore command or stable
release can rely on them.
