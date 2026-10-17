# Action registry cutover verification

Recorded October 17, 2026. This verifies the proposed cutover; it does not merge or deploy it.

## Historical conservation

`pnpm check:action-intake` passes against the pinned source commit `faac3c9bb310bc0fc1c1ec445433e310e0498558`:

- 88 original open and 125 original completed objects are preserved.
- All 138 held source lines, hashes, and frozen article appearances match the migration pins.
- Three protected reviewed records keep their authority restrictions.
- Two consecutive API builds produce identical bytes.

The migration registry has 213 records, no review receipts, and no history changes. Its SHA-256 revision is `30819f5cb3f65a2180f620fe6f4a0e46df8d6a62ddd4e207c1269c6fdc9f65b1`. October 17 remains unchanged in this PR. Its explicit reconciliation is tested with a dry run.

## Local checks

- `pnpm test`: 530 tests pass across 45 files.
- `pnpm exec playwright test`: 13 browser tests pass, including checked defaults, saved opt-out after reload, acceptance branch reuse, and conflict handling. GitHub writes are intercepted.
- `pnpm type-check` and `pnpm --dir packages/frontend build`: pass.
- `pnpm lint`: no errors; the existing `schema.test.ts:195` explicit-any warning remains.
- Node feedback-extraction and revision-admission tests: nine pass.
- Python editorial boundary tests: pass for article/registry changes and rejected code or symlink variants.
- `git diff --check`: passes.

The registry tests exercise later-article disposition, draft isolation, correction before promotion, rerunning both agents at promotion, sticky exclusion, terminal exclusion from every master feed, a non-replenishing admission limit, exact identity matching, source-line resolution and invalid-range rejection, unsupported completion, stale writers, rollback after injected failure, real generated-card HTML, and authored/registry HTML injection attempts.

## Live quality check

The operator explicitly authorized sending the October 17 article, action history, relevant goal/review documents, and linked GitHub discussions to Anthropic for a no-write test. Early attempts failed closed on malformed output, invalid quotes, and report-only evidence. A structurally successful attempt still retained a disproved claim in #372's active wording. This was treated as a failed quality check, not acceptance. Repeated quote-copying failures led to source-line selection: application code now resolves evidence text before verification.

`scripts/check-action-review.ts` checks the final receipt for the exact three expected dispositions, preserved original objects, unchanged canonical state, a rendered history card, and current #372 wording with overlay, timing, preview, and owner-decision gates. Final receipt result is recorded separately in the decision trail.

## Limits

Independent model agreement cannot establish source truth or semantic novelty by itself. Literal source checks, strict identity links, preserved rejected/held history, bounded admissions, and human article acceptance remain separate controls. Missing evidence stops an existing-action review and excludes an unsupported candidate.

Git is the publication boundary. An ordinary write exception restores prior article bytes; process termination between filesystem renames can leave local files and a stale lock requiring the recovery described in [Action intake](../docs/action-intake.md).

The independent GPT reviewer found and helped resolve lifecycle, identity, and rendering gaps. The transcript-to-trail audit used this chat's recorded transcript. A review from another model family was not independently verified; no such claim is made here.
