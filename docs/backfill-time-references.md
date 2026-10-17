# Reconstruct article time references

Run these commands from the repository root. Reconstruction preserves article prose. It supplies historical reference claims; the API admits them only when independent recorded evidence and current prose resolve the same source, event and instant. New generated articles retain bounded immutable source facts automatically and do not require routine backfill after revision.

1. Collect the referenced event records and write the backfill:

   ```bash
   pnpm backfill:times --harvest --write
   ```

   This step uses authenticated, read-only `gh api` calls. It stores timestamp fields and source identities in `api/time-evidence.json`. Source failures stay visible in that snapshot.

2. Inspect `api/time-refs-report.json` for unsupported or unresolved times. Check their source records before changing article prose. Schedules and ambiguous dates stay unresolved.

3. Replay against the saved evidence without network access:

   ```bash
   pnpm backfill:times
   ```

   The default previews the report. Add `--write` to replace `api/time-refs.json` and its report from the same snapshot.

4. Build the article API:

   ```bash
   pnpm build:api
   ```

   Historical caches require a matching body fingerprint and independent source validation. After a historical article revision, its old cache can become stale; rerun reconstruction when needed. Invalid inline metadata does not block a separately valid current sidecar. New articles use their generation-owned `time_records_sha256` pointer and are resolved from retained facts on each build, including after ordinary one-file revisions.

5. Verify the feature:

   ```bash
   pnpm type-check
   pnpm lint
   pnpm test
   pnpm --filter @ojfbot/daily-logger-frontend build
   pnpm exec playwright test packages/frontend/e2e/time-popovers.spec.ts
   ```

## Run independent workers

Harvest once. Give every worker the same immutable evidence snapshot and a distinct output path. Workers do not fetch or mutate shared evidence.

For two workers:

```bash
pnpm backfill:times --shard 0/2 --output /tmp/time-refs-0.json --write
pnpm backfill:times --shard 1/2 --output /tmp/time-refs-1.json --write
```

Each worker writes its report beside its output. After both finish, merge their results with one writer:

```bash
pnpm backfill:times --merge /tmp/time-refs-0.json --merge /tmp/time-refs-1.json --write
```

The same partition rule supports any positive worker count. Conflicting outputs for the same article fail instead of choosing a winner. Use `--snapshot <path>` to select a separately preserved evidence snapshot. Keep the article revision fixed while workers run.

Read [Article time references](time-popovers.md) for provenance rules, timezone tradeoffs, and calculation sources.
