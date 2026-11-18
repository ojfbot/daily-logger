# M1A verification — 2026-11-17

The first service increment is an **offline recorded-artifact replay with real LangGraph persistence**. It is ready for code review. It is not completion of M1B, a live journal generator, or a production cutover.

Source baseline: `8b6263ad9a798eae20b3573546cf0ae762bff661`. Implementation branch: `codex/dailylogger-service-m1`. Node `24.22.1`, pnpm `9.15.4`. The implementation and repeatable commands are in [apps/service](../../apps/service/README.md).

## What ran

The CLI started the graph in one process, saved the collected/draft/review state in SQLite, and stopped at an interrupt. A separate invocation resumed using the digest of the frozen input and invariant review. It wrote one isolated Draft bundle. Repeated resume returned the same completed checkpoint without replacing the files.

The gate in this fixture only permits writing isolated local artifacts. It is not a production human approval identity, an editorial quality verdict, or action admission. The graph copies a recorded article and its dated actions; it does not reconstruct the original raw collection or call a drafting model. Original GitHub Actions provenance remains unchanged inside the article, and the separate replay receipt identifies this offline operation.

## Checks and results

| Check | Result |
| --- | --- |
| `pnpm type-check:service` | Passed. |
| `pnpm test:service` | Seven subprocess integration tests passed: interrupt/restart; stale approval/input rejection; failed-output recovery; crash after output before checkpoint; changed-output rejection; path/symlink isolation; command serialization and lock release on process death. |
| `pnpm install --frozen-lockfile --offline --ignore-scripts` | Lockfile current; resolution skipped; installation already up to date. Dependencies had already been installed, including the SQLite native module exercised by tests. |
| `pnpm type-check` | Passed for the existing root pipeline. |
| `pnpm lint` | No errors; one existing `no-explicit-any` warning in `src/__tests__/schema.test.ts`. |
| `pnpm test` | Initial sandbox run: 1,760 passed, two skipped, one failed because the existing socket fixture could not bind localhost. A direct bind confirmed `EPERM`. |
| `pnpm exec vitest run tests/review-surface/editorial-transport.test.ts` with loopback permission | The remaining test passed. This was a targeted rerun, not a second full-suite run. |
| `git diff --check`, local documentation links, JSON ledger parsing | Passed. |

The PR check workflow now invokes service type-check and service tests. Its existing full-history checkout supplies the recorded source objects. Existing generation, editorial, Cleaner, deployment, and recurrence behavior is unchanged.

## Independent reader playback

A separate verifier used two disposable Git clones pinned to the source baseline. One rebuilt the original reader; the other received only the service's two output artifacts before rebuilding. Both retained source Git history and the existing action registry and supporting files.

Build commands inside each checkout:

```sh
pnpm exec node --import tsx src/build-api.ts
VITE_BASE_PATH=/ pnpm --dir packages/frontend exec vite build
```

Browser verification used the production Vite build and a locally intercepted synthetic origin. Every browser request was fulfilled locally or blocked. Google Fonts CSS was replaced with empty CSS, so visual checks used fallback fonts. The available headless Chrome version was 131; this does not establish coverage of all supported browsers. Existing missing-time-evidence and large-bundle build warnings remain.

Both 1440×1000 and 390×844 views passed:

- Article route and per-article JSON returned 200 through the interceptor, with the expected date, title, body, and `DRAFT` label.
- Three exact pending candidate identities and commands remained `awaiting-review`; the dated artifact admitted zero actions.
- The pending-action card retained its warning; signed-out readers saw no Accept Draft control.
- The article, entries, actions, proposed-action projections, and rendered body matched baseline byte for byte. No horizontal overflow or missing local assets appeared.
- A signed-out `null` authentication fixture produced zero console and page errors. A separate realistic HTTP 401 fixture produced one expected authentication console diagnostic per viewport and zero unexpected/page errors.

| Artifact | Verified identity |
| --- | --- |
| Article Git blob | `b9449c3db22b40fcc4970778504a1763ad2ffb08` |
| Article SHA-256 | `3477294dd6c05f1a9b07220d30c051076d1463062df760a555b284dc4b1dfd14` |
| Dated actions Git blob | `1cc773a7a7b88081dbca299fab89e89bc185be91` |
| Dated actions SHA-256 | `22a2bf5bcb1ffcbb8a3bef89fbbed58b0a68199968b98ced38bcd86b2d58fbfd` |
| Built per-article JSON SHA-256 | `af767a037675b7a059fc16f0a747a3e23a40947b407653cf5da89a95b6aad53b` |
| Replay receipt SHA-256 | `c9e37c133c8fbfc235df343b4076cdd264efdbea54f0959ee5e14e024949c164` |

This independently reproduces Yuri's reported baseline and verifies the actual service output against it. Zero admissions refers to this dated artifact, not all historical actions.

## Remaining qualification

SQLite proves process restart and the tested process-crash boundaries on one development machine. It does not qualify host power loss, production backup/restore, PostgreSQL concurrency, a durable job queue, authenticated controls, or distributed publication ownership. No live collection, model quality, LangSmith export, public delivery deadline, signed-in acceptance, or protected-content isolation was tested.

M1B supplies authenticated controls, production-target persistence and LangSmith. M2 adds real collection and bounded model/reviewer execution. M3 qualifies exact displayed-revision acceptance, shared publication authority and manual failover, live public readback, and Publisher-before-Cleaner activation. See the [roadmap](delivery-roadmap.md) and [review reconciliation](review-reconciliation.md).

## Review remediation

Yuri's follow-up found that the initial Git subprocesses could lazily fetch missing promisor objects and could apply local replacement refs. The initial Node fetch guard did not prevent either behavior. The repaired reader disables lazy fetch, all Git transports, and replacement objects for every Git subprocess; clears ambient Git overrides; and independently hashes returned bytes against the two pinned Git blob identities.

The service suite now has **12 passing tests** on Node 24.22.1 / Git 2.56.0. The five additional boundary cases prove missing-object reads start no fetch subprocess/helper (with a harmless local positive control), replacement refs cannot alter replay, corrupt loose-object bytes fail identity checks, ordinary/bare/separate/linked Git metadata cannot be an output destination, and malformed JSON receives fixture diagnostics. The dangling WAL test now uses `unlinkSync` and asserts the directory entry is gone before checking the output symlink. A dedicated Node 24.11.1 CI job covers Yuri's reported runtime separately.

The previous completed run still reads successfully through the repaired code; its manifest, approval, checkpoint and artifact identities remain unchanged. The workflow implementation and artifact bytes did not change, so the earlier independent reader playback remains applicable. These checks do not expand the process-crash proof into a hostile-user security boundary or production qualification.

The first remediation CI run passed the Node 24.11.1 portability job and the full existing unit suite, but exposed a lock-test helper lifetime defect on the other runner: its discarded release closure allowed SQLite to be garbage-collected before the contention assertion. A forced-GC reproduction confirmed that the discarded handle permits the second command while a retained handle rejects it. The helper now retains its release closure through a signal handler and forces garbage collection before signaling readiness; the targeted contention/process-death test passes. The actual CLI already retains its release closure through `finally`. The final pushed revision requires a fresh CI result.

That final qualification passed at `4570b333b9639450eb3c00d730a8e0a9651e2502`: [PR Check](https://github.com/ojfbot/daily-logger/actions/runs/44236430728) passed the current-Node pipeline, Node 24.11.1 portability job and editorial browser job. Yuri independently ran all 12 service tests, root and service type checks, lint, and the repaired reader replay, then returned **APPROVE for the offline M1A increment** through the addressed review handoff. [PR #554](https://github.com/ojfbot/daily-logger/pull/554) subsequently merged by rebase as `7072501e372802754dc36d604b4a49cb9ae65502`; its merged file tree matches the reviewed foundation exactly. S03a was rebased separately onto that foundation, preserving its three patches and file tree. This qualification does not extend to later PostgreSQL, authentication or live operation work.
