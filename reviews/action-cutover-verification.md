# Action registry cutover verification

Recorded October 18, 2026, after Claude's independent review of PR #381 and the round-three patch brief. This record covers local verification of the corrections. Hosted checks and Claude's follow-up review remain separate observations.

## Historical conservation

`pnpm check:action-intake` verifies 91 imported open and 125 imported completed objects against accepted main `d540e2c5d7aa21b3916c3db1527e993e66c705bd`. All 213 original objects from the earlier `faac3c9` migration survive unchanged, along with the three October 18 objects added on main while this PR was open. The 138 historical holds and three protected reviewed records retain their authority limits.

The frozen baseline contains 216 identities. October 17's three verified dispositions produce 88 open, 126 completed, zero proposed, and two dismissed records. No new identity was admitted by that reconciliation. Two consecutive API builds produce identical bytes.

`actions/registry.json` is the immutable imported baseline. Each article owns `actions/articles/YYYY-MM-DD.json`. Every runtime writer, checkbox, workflow path restriction, and output receipt uses the exact dated file. The old Markdown admission parser remains only in the explicit importer and its tests. Reading the former mutable monolithic layout fails explicitly.

## Local checks

- `pnpm test`: 782 tests pass across 58 files.
- `pnpm type-check` and `pnpm --dir packages/frontend type-check`: pass.
- Explicit TypeScript checking of the trusted editorial scripts, output-proof helper, and rebind CLI: passes.
- `pnpm lint`: zero errors. The existing explicit-any warning at `src/__tests__/schema.test.ts:195` remains.
- `pnpm exec playwright test`: 21 browser journeys pass, including the actual October 17 card artifact, checked defaults, saved opt-out after reload, acceptance branch reuse, and conflicting saves. GitHub requests are intercepted in these browser tests; live authenticated preview behavior was not verified in this correction pass.
- `VITE_BASE_PATH=/ pnpm --dir packages/frontend build` and the continuation Playwright configuration: production build and six browser journeys pass.
- Nine Node feedback extraction and admission tests pass. The executable Python test passes both original workflow boundaries against real Git article, dated-state, code, and symlink changes.
- `git diff --check`: passes.

The native continuation tests create real Git worktrees, execute the actual revision CLI in mock mode, and push to a local bare remote. They cover registry-only rounds, trusted-main advancement, at-most-once claims, exact parent/blob checks, artifact-bound receipts, hidden changes, actor mismatches, and unsupported file modes. The native continuation and action-intake integration files have an explicit twenty-second timeout after a loaded full run exceeded Vitest's implicit five-second timeout. The frozen monthly Git replay has a sixty-second limit after it passed alone in about seventeen seconds but exceeded thirty seconds under full-suite filesystem load. Production request timeouts did not change.

New storage tests perform a real merge of acceptance on day D and generation on D+1, preserve the frozen baseline, round-trip the composed state, reject corrupt files, and inject failure during sidecar installation after article publication. Ordinary failures restore both files. Process termination between filesystem operations remains covered by stale-binding rejection and the documented recovery procedure.

New evidence and lifecycle tests cover the XSS reproducer, normalized proxy paths, private-repository access, optional rejected changes, provider failure, pending draft publication, semantic holds without repair, current-source selection, source-author authority, source and prompt budgets, deterministic editorial rebind, and authored lines named `status`, `outcome`, or `provenance`. Rejection memory suppresses equivalent work across dates while its evidence is unchanged. Changed evidence requires another independent verdict. Exact held historical suggestions stay unadmitted even if both injected agents pass them.

Round three first reproduced eight active-field HTML injections, mixed trusted and third-party terminal citations, an apply-phase storage error causing a second model pair, and the stale time-binding warning from the actual API builder. The build-level fixture needs the repository's real Git and portable admission evidence. Once complete, it failed on the stale warning before the fix and now checks all three October 17 merge references in generated entries.

Active fields now fold newlines and escape HTML, including managed delimiters. Marker-shaped fields rerender byte-identically with exactly one managed block. The only raw card match is the last generated card inside that block. New reviews require every completion, dismissal, and supersession citation to be authoritative. Only current API facts and member-authored body or review text carry GitHub authority; metadata does not. An independent audit reproduced the missing dismissal check and marker-shaped text failure, which are now covered. Explicit operator dismissal remains supported. The v5 evidence policy invalidates older caches.

Registry validation and rendering run outside the format-repair scope. An oversized verified output makes one proposer/verifier pair, admits nothing, and leaves a pending draft. Bogus or missing artifact claims are skipped; provider outages still fail closed.

## Bounded size

[The local size check](action-cutover-size-check.json) builds the current prompts with an injected capture using all current article statuses and the earlier authorized receipt sources. Run `pnpm check:action-size /path/to/authorized-receipt.json` to reproduce it. The verifier measurement uses an empty proposal and does not predict the size of a live proposal. It calls no provider and writes no article or queue state.

The frozen baseline is 556,370 bytes. The October 17 dated file is 31,618 bytes. The proposer prompt is 540,450 bytes for 247,734 bytes of source material. Enforced limits are 128 KiB per source, 384 KiB total sources, 640 KiB per complete proposer or verifier prompt, and 64 KiB per dated file. Earlier rounds remain in Git; dated state retains current decisions and cited excerpts rather than full discussions. Exceeding a limit preserves a pending daily draft with no new admissions.

CI also runs `pnpm check:action-size` without a receipt, network, provider, or output write. Both actual prompt paths use a small repository-source fixture. The measured fixed context is 274,454 proposer bytes and 274,423 verifier bytes against a 327,680-byte budget. `action-budget.test.ts` proves the same CLI succeeds normally, preserves input bytes, and exits unsuccessfully after a completion condition expands the fixed context beyond 320 KiB. This budget detects growth but does not prove token-window fit. Relevance-scoped records and a total token-aware ceiling are tracked in [issue #386](https://github.com/ojfbot/daily-logger/issues/386), owned by ojfbot.

## Live quality receipt

The operator previously authorized an October 17 Anthropic dry run. Its proposer was Sonnet 4.6 and its independent verifier was Opus 4.6. The [original result](action-cutover-live-result.json) remains an immutable record of that test. This correction pass made no new live provider calls. The v5 prompt and new evidence policy were tested with injected agents only.

`scripts/check-action-review.ts` verifies the preserved receipt against all current original objects and exact action histories. The storage conversion retains its model round and evidence hashes. An explicit editorial rebind records the reporting-window prose clarification without changing those decisions. October 17's three inherited GitHub time references were independently re-adjudicated against the current body; the [follow-up receipt](../docs/time-backfill/2026-10/oct17-action-cutover.json) records them. No stale-backfill warning remains for that article.

October 17 is a one-time v3 cutover snapshot, preserved for owner review in this ordinary source/data PR. Its terminal decisions include report citations and persisted excerpts without the transient GitHub trust metadata. Projection retains that explicit legacy receipt; it does not retroactively certify those decisions under v5. Every future reconciliation uses v5, and an older snapshot cannot satisfy its review cache. The independent audit called out this prospective boundary. A fresh live round would need separate authorization and has not been performed.

## Authority and recovery limits

Fresh acceptance verification is intentional. A draft's model findings remain provisional until the final accepted round passes and the owner merges its visible output. No automatic PR readiness, merge, command execution, or protected-action settlement follows from an article disposition.

Editorial receipts are bound by hash to immutable artifacts from the first attempt of the trusted workflow, with run event, branch, policy, request, output blob, and parent checks. Failed, stale, or uncertain bot comments cannot clear an outstanding request. The proof window is 90 days for an unmerged acceptance PR. Expiry fails closed and never authorizes automatic replay. Trusted main supplies durable authority after merge. Recovery and the atomic revert conditions are in [Action recovery](../docs/action-recovery.md).

Separate unmerged branches cannot reserve identities globally. The composed registry rejects duplicate work keys before API publication; reconciliation is required when their states meet. Model agreement and exact matching cannot prove semantic novelty. Goal evidence, immutable identity history, independent verification, bounded admissions, and owner review remain separate controls.

Claude's posted independent review found material gaps missed by the original GPT audit. A subsequent GPT audit identified the body-line hash exclusions, which are now fixed and tested. This record does not claim Claude approved the corrected head.

## Hosted observation

Before round three, all applicable checks passed on pushed head `75e6bc764e6c822be48b7185371dddcf5a646f8d`, including [Test + pipeline smoke test and browser regression](https://github.com/ojfbot/daily-logger/actions/runs/39136840468), the deployment build, secret scan, skill audit, and Vercel preview. Editorial execution jobs correctly skipped this non-acceptance branch. Round three changes implementation, tests, and generated entries; that earlier green head does not verify these changes. Its hosted result must be observed separately after pushing.

At 2026-10-18T16:10:59Z, all applicable checks passed on round-three head `a028a76291b9ccc451ad3caa8190127abfeafdec`. [Unit/pipeline and browser CI](https://github.com/ojfbot/daily-logger/actions/runs/39143648012), deployment build, secret scan, skill audit and Vercel preview succeeded. The unit job records 782 passing tests, including the receipt-free budget regression. Editorial execution jobs skipped the non-acceptance branch. Main advanced only with October 18 review records to `aa6dc7b`; merge-tree reports no conflicts. This observation does not imply a Claude verdict or a live authenticated-preview check.
