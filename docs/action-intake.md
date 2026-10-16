# Reviewed action intake

The canonical Actions API has one bounded admission path for suggestions that include command arguments. It exists to recover three reviewed suggestions from the accepted October 15 article without silently activating the historical backlog.

## Contract

- `src/action-intake.ts` recognizes both the legacy bare-command form and the argument-bearing form. Legacy extraction remains byte-compatible with the previous builder.
- `action-admissions/2026-10-15.json` is the only admission record in this delivery. It freezes three new IDs, full invocations, exact source lines, dispositions, and authority limits.
- Every admitted source must resolve through the recorded Git commit, path, blob, article SHA-256, line number, and line SHA-256. Required repository evidence carries its own commit and blob identity and is SHA-256 checked before any API file is written.
- `api/actions.json` remains the only open-action feed. `api/done-actions.json` remains the only accepted completion ledger. Reviewed evidence and dispositions do not settle an action.
- Reviewed actions carry no execution or settlement authority. Drafting and cleaner prompts receive them as continuity context only; they must not recommend, redispatch, or close them.
- The other 138 historical argument-bearing suggestions remain held. Future admission needs another explicit policy decision; recognition alone is not eligibility.

The completed-existing-evidence disposition means its bounded replay has evidence. It does not mean the canonical action is done. A separately accepted exact-ID settlement receipt is required before it can enter `done-actions.json`.

## Tradeoffs

This keeps one product queue and makes the reviewed state visible everywhere that already consumes it. The cost is strict dependence on historical Git objects during API builds, so supported CI checkouts fetch full history and fail honestly when a source commit is unavailable.

Rejected alternatives were a second advisory queue, which left normal consumers blind, and a broad parser backfill, which would have activated 138 unreviewed historical suggestions.

## Verification

Run:

```bash
pnpm check:action-intake
pnpm type-check
pnpm test
pnpm --dir packages/frontend type-check
pnpm --dir packages/frontend build
```

The intake check proves that the 85 baseline rows and IDs are unchanged, the three frozen reviewed rows are present, the completion ledger is byte-identical, 138 historical suggestions remain held, and a retry is byte-identical. Unit tests additionally falsify source variants, missing Git objects, missing or tampered portable evidence, duplicate admissions, and settlement attempts by exact ID or legacy key.
