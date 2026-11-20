# DailyLogger service: M1A offline fixture checkpoint

The [S03a PostgreSQL fixture path](POSTGRES.md) adds checkpoint storage and durable
run/attempt identities. [S03b durable delivery](DELIVERY.md) adds transactional
command admission and a pg-boss worker for that same fixture. The SQLite commands
below retain their original behavior. An owner API, model providers,
authentication, publication, and Langfuse remain later slices.

This package is the first executable slice of the proposed persistent backend.
It runs a real TypeScript LangGraph with the official SQLite checkpointer. It
replays two **recorded artifacts**, pauses for an explicit local review decision,
and writes an isolated Draft bundle. It does not collect GitHub data, call a model,
review article quality, admit actions, publish, or replace the scheduled runner.
The existing web app remains at `packages/frontend`.

This is **M1A**, not completion of M1 or a deployable service. PostgreSQL remains
the production persistence target. Langfuse export, a scheduler, authenticated
API, provider adapters, deployment, and protected journal content are deferred.

## Run the proof

Use Node 24, Git with `--no-lazy-fetch` support, and the repository's pnpm version.
Install from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm type-check:service
pnpm test:service
pnpm service:shadow start --run-dir /private/tmp/dailylogger-shadow-example
```

The run directory must be a new absolute path whose parent exists, outside every
Git checkout or metadata directory, including bare and linked-worktree Git
directories. Its files are local development state and must not be committed or
copied to a public static host. The command reports `awaiting-approval`, a
checkpoint ID, the completed steps, the invariant review, and an `approvalDigest`.
Inspect `manifest.json`, `inputs/article.md`, and `inputs/actions.json` before
resuming. Copy the reported digest into the next command:

```sh
pnpm service:shadow status --run-dir /private/tmp/dailylogger-shadow-example
pnpm service:shadow resume --run-dir /private/tmp/dailylogger-shadow-example --approval-digest DIGEST_FROM_START
pnpm service:shadow recover --run-dir /private/tmp/dailylogger-shadow-example
```

Each invocation is a new process. `status` does not execute graph steps. `resume`
requires the exact digest and only authorizes local shadow output. Repeating it
after completion verifies the bundle and returns the same checkpoint. `recover`
continues a failed step from its checkpoint, reusing completed steps; it cannot
approve a pending human interrupt. Resolve any conflicting local output yourself
before recovery. The runner refuses to overwrite conflicting output. A repeated
`start` on a checkpointed run is rejected; use a fresh directory for another run.
If initialization is interrupted before a complete manifest exists, use a new
directory; initialization recovery is outside this proof.

Successful output:

```text
<run-dir>/
  manifest.json
  inputs/article.md
  inputs/actions.json
  checkpoints.sqlite        # LangGraph state, development only
  mutex.sqlite              # one CLI command at a time; OS releases on death
  attempts.jsonl            # local diagnostic attempts, not an audit authority
  artifacts/
    _articles/2026-11-17.md
    actions/articles/2026-11-17.json
    receipt.json
```

Only the three files inside `artifacts` form the immutable output bundle. It is
staged in a sibling directory and exposed by one rename. A process killed during
staging may leave a `.staging-*` directory; recovery writes a fresh bundle and does
not treat staging debris as published output. Identical existing bundles are
verified and reused. Changed frozen inputs, manifest, approval digest, or
completed artifacts fail closed.

## Graph and fixture contract

```text
collect_fixture → draft_fixture → review_fixture → human_gate → write_shadow_artifacts
                                                       ↑ interrupt / resume
```

`collect_fixture` verifies frozen recorded artifacts. `draft_fixture` checkpoints
their digests; it is deliberately not a model-backed writer. `review_fixture`
checks the exact fixture's invariants. The separate gate keeps preapproval work
checkpointed while waiting. The final node writes the bundle idempotently.

The source is fixed at Git commit
`8b6263ad9a798eae20b3573546cf0ae762bff661` in `ojfbot/daily-logger`:

- `_articles/2026-11-17.md`, blob `b9449c3db22b40fcc4970778504a1763ad2ffb08`
- `actions/articles/2026-11-17.json`, blob `1cc773a7a7b88081dbca299fab89e89bc185be91`

**This commit and its blobs must exist in the local Git object database.** A
shallow or partial clone missing an object cannot run the fixture. The runner
reads raw objects with `git cat-file`, with lazy fetch and all Git transports
disabled for every Git subprocess, independently of the Node fetch guard.
It disables Git replacement refs on both object-ID and byte reads, verifies
the resolved IDs against the two constants above, and recomputes each Git blob
hash from the returned bytes before accepting provenance. Ambient Git repository
and config environment overrides cannot redirect these reads or hide a Git
directory from the output-path check. Unsupported Git versions fail closed.
It does not have the original raw collector context; this proves replay and
persistence of recorded artifacts, not reproducibility of the original model
generation. Manifest and receipt carry the source commit, Git blobs, SHA-256
digests, workflow/reviewer versions, candidate identities, and shadow scope.

The markdown and dated action JSON are copied byte for byte. The original
GitHub Actions provenance remains inside the article, describing its actual
origin. The separate receipt describes this replay and cannot be mistaken for
a new model-generation receipt. Draft status, three `awaiting-review` candidates,
pending action review, zero suggestions, zero decisions, and zero action keys
are preserved. The local gate does not constitute an action-review verdict.

For existing-reader verification, use a **disposable Git checkout at the pinned
source commit**, copy only the two fixture artifacts into that checkout, then
call the existing `buildApi(playbackRoot)` export. That checkout supplies the
registry, time metadata, supporting files, and Git history required by the
current reader. Do not copy outputs over articles/actions in the working or
production checkout. A directory with only the two files is not a valid
existing-reader compatibility test.

## Evidence and limits

`pnpm test:service` launches separate Node processes to verify:

- interruption, restart, exact approval, and repeated-resume idempotency;
- unchanged artifact bytes, provenance, pending candidates, and zero admissions;
- stale approvals and changed inputs rejected without checkpoint advancement;
- failed-output recovery without repeating completed collection/draft/review;
- `SIGKILL` after output becomes visible but before the final checkpoint, followed
  by recovery that reuses the bundle;
- output conflict/tamper rejection, repository path/symlink rejection, and
  command serialization with lock release after process death;
- missing promisor objects rejected before a fetch subprocess starts, with an
  independent deny-all Git transport check and a harmless local-helper control;
- replacement refs ignored and corrupt bytes rejected against pinned Git IDs;
- bare, ordinary, separate, and linked-worktree metadata rejected as destinations;
- malformed action JSON and nested values reported as fixture diagnostics.

The test-only crash preload patches the checkpointer in its subprocess. The
production CLI has no crash-injection flag. Root Vitest uses explicit include
patterns that do not collect this package's Node test files.

This proves **process restart and process-crash recovery on one development
machine**, not host power-loss durability, backup/restore, distributed worker
fencing, queue authority, or PostgreSQL behavior. The local JSON diagnostics,
digest gate, path checks, and SQLite mutex are not an authentication or security
boundary against a hostile local user. The static digest is not a signed human
identity or a production approval receipt. Power-loss-safe publication and a
transactional outbox require a later production design.

The CLI disables ambient LangSmith tracing and rejects `fetch` calls before
loading the graph; no exporter, live collector, provider, or publisher is wired.
Git subprocesses separately enforce [`GIT_NO_LAZY_FETCH`, `GIT_NO_REPLACE_OBJECTS`,
and an empty `GIT_ALLOW_PROTOCOL`](https://git-scm.com/docs/git).
The fetch guard is an application guard, **not an operating-system network
sandbox** and not protection against arbitrary future Node networking code.
Do not add live integrations without a separate capability and egress design.

SQLite is explicitly a development proof backend. The implementation follows
the official [LangGraph persistence guidance](https://docs.langchain.com/oss/javascript/langgraph/persistence)
and [SqliteSaver API](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-sqlite/SqliteSaver),
with synchronous graph checkpoint durability enabled. The locked versions are
LangGraph 1.7.5, core 1.3.4, checkpoint 1.2.3, and SQLite saver 1.1.1.

The first independent delivery record is [M1A verification](../../docs/agent-service/m1a-verification-2026-11-17.md).
