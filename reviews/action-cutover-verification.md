# Action registry cutover verification

Recorded October 17, 2026. This verifies the proposed cutover; it does not merge or deploy it.

## Historical conservation

`pnpm check:action-intake` passes against the pinned source commit `faac3c9bb310bc0fc1c1ec445433e310e0498558`:

- 88 original open and 125 original completed objects are preserved.
- All 138 held source lines, hashes, and frozen article appearances match the migration pins.
- Three protected reviewed records keep their authority restrictions.
- Two consecutive API builds produce identical bytes.

The initial migration registry had 213 records, no review receipts, and no history changes. Its SHA-256 revision is `30819f5cb3f65a2180f620fe6f4a0e46df8d6a62ddd4e207c1269c6fdc9f65b1`. The same PR then applies the independently verified October 17 receipt. Its three original rows remain immutable: the repeated unsupported ADR prerequisite and unsupported closure instruction are dismissed, and the #372 review is completed from its actual merge and delivery evidence. The open feed becomes 85, completed becomes 126, and two separate dispositions are recorded. No new identity is admitted.

## Local checks

- `pnpm test`: 737 tests pass across 53 files.
- `pnpm exec playwright test`: 21 browser tests pass, including checked defaults, saved opt-out after reload, acceptance branch reuse, and conflict handling. GitHub writes are intercepted. Direct server-handler regressions separately prove editorial-branch `ref` forwarding, exact PR head/state filtering, and uncached readback. One scenario reads the actual reconciled October 17 API artifact and confirms all three cards, folded evidence, and the unchanged reporting-window commit count.
- `VITE_BASE_PATH=/ pnpm --dir packages/frontend build` followed by `pnpm exec playwright test --config playwright.continuation.config.ts`: six additional production-bundle browser checks pass at desktop and narrow widths.
- `pnpm type-check` and `pnpm --dir packages/frontend build`: pass.
- `pnpm lint`: no errors; the existing `schema.test.ts:195` explicit-any warning remains.
- Node feedback-extraction and revision-admission tests: nine pass.
- Python editorial boundary tests: pass for article/registry changes and rejected code or symlink variants.
- `git diff --check`: passes.

The combined base includes accepted PR #378. Native continuation tests pin both blobs, publish registry-only rounds, preserve at-most-once invocation claims, and reject missing/symlink/executable registries, cross-date choices, and forged follow-up snapshots. Real service-to-stamper tests reject hidden tree changes and ref races. Both original workflow modes use trusted-base code, exact output receipts, and the existing required PR check on every acceptance head. GitHub Contents encoding=none is read through the exact immutable Git blob.

The registry tests exercise later-article disposition, draft isolation, correction before promotion, rerunning both agents at promotion, sticky exclusion, terminal exclusion from every master feed, a non-replenishing admission limit, exact identity matching, source-line resolution and invalid-range rejection, unsupported completion, stale writers, rollback after injected failure, real generated-card HTML, and authored/registry HTML injection attempts.

## Live quality check

The operator explicitly authorized sending the October 17 article, action history, relevant goal/review documents, and linked GitHub discussions to Anthropic for a no-write test. Early attempts failed closed on malformed output, invalid quotes, and report-only evidence. A structurally successful attempt still retained a disproved claim in #372's active wording. This was treated as a failed quality check, not acceptance. Repeated quote-copying failures led to source-line selection: application code now resolves evidence text before verification.

`scripts/check-action-review.ts` checks the final receipt for the exact three expected dispositions, preserved original objects, unchanged canonical state, a rendered history card, and fresh #372 merge evidence instead of historical draft handoffs. The live quality check passes; [its result](action-cutover-live-result.json) records the model identities, source digests, states, and unchanged canonical state during the dry run. The verified receipt was then applied separately to this feature branch.

## Limits

Independent model agreement cannot establish source truth or semantic novelty by itself. Literal source checks, strict identity links, preserved rejected/held history, bounded admissions, and human article acceptance remain separate controls. Missing evidence stops an existing-action review and excludes an unsupported candidate.

Git is the publication boundary. An ordinary write exception restores prior article bytes; process termination between filesystem renames can leave local files and a stale lock requiring the recovery described in [Action intake](../docs/action-intake.md).

The independent GPT reviewer found and helped resolve lifecycle, identity, and rendering gaps. The transcript-to-trail audit used this chat's recorded transcript. A review from another model family was not independently verified; no such claim is made here.

Provider tool schemas use [strict tool decoding](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use); application-side Zod validation still enforces every numeric, string, identity, and evidence constraint. The tool schema omits only provider-unsupported value constraints described in [the supported schema subset](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations).

Trusted main remains the human-reviewed authority for ordinary source/data PRs, including the one-time migration. Editorial output receipts constrain automated acceptance admission; they are not a cryptographic restriction on deliberate maintainer-approved policy or state changes. A receipt that was not appended or whose provenance cannot be read blocks continuation and acceptance checks without authorizing a provider replay.
