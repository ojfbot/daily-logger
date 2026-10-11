# Author verification notes

Recorded by Codex, the PR author, for PR #338. These are executed checks and
coverage notes, not an independent review or merge approval. Claude Code's
independent reviews live on the PR discussion.
No auth, ownership or credential boundary changes.
Queue settlement is excluded from this PR and reviewed separately.

## Author-checked coverage

| Criterion | Result | Evidence |
|---|---|---|
| Evidence after former 400/200 cutoffs reaches article and report drafting | PASS | collection-to-prompt regression |
| Body size has a named bound and exact omitted-character marker | PASS | 6,000-character policy; maximum-size fixture and idempotence test |
| Article prompt renders a merged body once, including recent-only records | PASS | duplicate and recent-only assertions |
| Existing non-merged recent preview stays bounded | PASS | literal 400-character assertion |
| Public audit and final verification are separate from private constraints | PASS | inline article correction against core #509 |
| CI, credential and server rollback claims are corrected throughout narrative | PASS | source comparison with #329/#509 and correction regression |
| Original action identities remain intact | PASS | API rebuild retains all four exact original action IDs |
| Model follows untrusted-evidence instruction without error | UNTESTED | No live model call; prompt instructions are not a security guarantee |

## Executed checks

- New grounding checks failed before the fix: report prompt omitted the conclusion and a 70,049-character collected body exceeded the 6,000 budget. They passed after the shared policy change.
- `pnpm test`: 306 passed after reconciling main at `4b4589a482435bf4d3dc6cd26a868b11a3b36619`, including its provenance regressions (290 passed before that reconciliation).
- `pnpm exec tsc --noEmit`: passed.
- Changed-file ESLint: passed without findings.
- `pnpm --dir packages/frontend build`: passed.
- `pnpm exec node --import tsx src/build-api.ts`: passed. The ordinary script's tsx IPC socket was denied by the local sandbox; this runs the same builder without its CLI IPC server.
- API decision titles were read back from generated `api/entries.json` and contain the corrected marker-removal, final-push PAT and verified-public-rollout wording.

## Invariants and limits

No new route, ownership policy, credential, model call or administrative action. Existing source list limits are unchanged. At most 15 weekly and 30 recent merged bodies can be rendered, each under the shared body budget before quotation formatting. A fixed budget may omit material facts from the middle; the marker declares that absence. Head/tail retention is not semantic extraction, and quoted source text is not authenticated policy.

Original suggested-action descriptions retain historical errors so their hash-derived identities stay auditable. The article explicitly labels those premises as incorrect. Current narrative and exported decision titles are corrected. The full original article remains at its linked Git revision.

Rollback reverts this PR's code/article/API projection together. It does not revert server-side GitHub rulesets. No production deployment or deployed readback is claimed by local checks.
