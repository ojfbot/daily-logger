# Action intake

`actions/registry.json` is the frozen imported baseline. Bounded `actions/articles/YYYY-MM-DD.json` files hold new identities and article decisions. These files form the canonical action store. `api/actions.json`, `api/done-actions.json`, `api/proposed-actions.json`, and `api/action-dispositions.json` are generated projections. Article prose never admits or closes work. [ADR-0040](../decisions/adr/0040-verified-article-action-registry.md) records the cutover decision.

## Article review cycle

Generation and editorial revision finish with a proposer and independent verifier. Every cycle first reconciles every carried identity: delivered work becomes done, a disproved premise is dismissed, a genuinely replaced obligation is superseded, and waiting work stays open or deferred with its owner and evidence gates. Resolved work leaves the active block and remains in history. Initial generation targets 3–5 useful source-supported follow-ups, admitting at most five new identities. Each later editorial revision or fresh clean-acceptance action review may admit up to two new identities. Fewer or zero is valid; evidence, novelty and independent verification take precedence over the target. The proposer selects source IDs and line ranges. Code resolves their exact text before the verifier judges it; models never have to reproduce quotations. A new identity requires factual evidence, a cited goal, an observable completion condition, and known owner or evidence gates. Revisions retain original descriptions and IDs as history while correcting current actionable wording. The article shows current suggestions in its active block and resolved suggestions in a dedicated card with original wording and evidence.

The limit counts newly admitted identities in the trusted logical cycle, including excluded or subsequently resolved identities. Existing active work does not consume a later revision’s two slots. Rewording, existing-identity links, retries and disposal do not create new slots. Trusted callsites provide the phase and stable request identity: generation uses the dated initial cycle; initial clean acceptance uses the PR number plus its intent; PR-body revisions also bind the trusted extractor’s exact feedback digest, so changed human feedback is a distinct request while identical feedback and retries share a budget; continuations use the immutable request comment ID and digest. A recorded pending-generation retry retains its initial cycle. A fresh acceptance review is a follow-up cycle, while a status-only or prose rebind does not create an action-review cycle. Pre-v6 pending snapshots have no recorded phase: acceptance does not infer an initial allowance from their status or history. Legacy suggested identities keep their original data and conservatively consume initial slots. Held historical suggestions remain in compact duplicate context. Each article retains its own rejected candidates for later rounds. Compact global work and evidence fingerprints suppress a rejected candidate on later dates while its cited facts and goals are unchanged. Unrelated source changes do not clear that suppression. New capacity-only holds carry a typed article/cycle scope from the deterministic admission guard. They block the same logical cycle, including retries, but may be reconsidered in a later distinct trusted cycle through a fresh proposer and verifier. No admission or reopening is automatic; semantic rejections and unclassified legacy holds keep their existing behavior. Changed evidence still requires independent verification. An exact held historical suggestion cannot be automatically admitted. Equivalent work requires its existing normalized target and outcome plus independent review. Legacy identities use their immutable command and original description for that match. A shared file or PR number alone does not establish equivalence. Ambiguous equivalence is held.

Draft proposals appear in the Actions page's **Proposed** column. Cleaner and drafting open-work feeds exclude them. A checked suggestion enters the open index only with an accepted review receipt. The checkbox defaults on and saves to the editorial branch. Unchecking retains an article-only suggestion and survives rewording. It cannot close accepted work. Conflicting saves fail visibly and require refreshing the article.

Run an explicit reconciliation:

```bash
ARTICLE_PATH=_articles/2026-10-17.md ACTION_REVIEW_REQUEST=manual:review-2026-10-19 pnpm actions:reconcile
ARTICLE_PATH=_articles/2026-10-17.md ACTION_REVIEW_REQUEST=manual:review-2026-10-19 DRY_RUN=true pnpm actions:reconcile --receipt
```

Reuse the same `ACTION_REVIEW_REQUEST` for retries of that request; a new identity is reserved for a genuinely new human action-review request. The workflow sets it from its trusted PR/comment metadata, never model output. The revision CLI also requires it.

An instructed agent can change an unaccepted suggestion's inclusion:

```bash
ARTICLE_PATH=_articles/2026-10-18.md ACTION_KEY=act-2026-10-18-0123456789abcdef \
INCLUDE_IN_INDEX=false ACTION_ACTOR=ojfbot \
EDITORIAL_FEEDBACK='Keep this suggestion in the article only.' pnpm actions:reconcile
```

`ACTION_ACTOR` must identify the accepting GitHub account. The stored instruction and actor survive later review rounds; acceptance rejects choices attributed to another actor or unrelated registry edits.

The reconciler allows one format repair, with no SDK retries. Each provider call has a two-minute timeout. Linked GitHub discussions are bounded to 12 references. Up to eight goal documents include core’s fleet northstar and roadmap plus linked wayfinder, slice, and convoy documents. Remote evidence shares a 90-second collection budget. Missing sources cannot substantiate a disposition. The 128 KiB per-source, 384 KiB total-source and 640 KiB prompt guards remain unchanged; the phase policy does not solve source-budget issue #386. Repository goal files and operator feedback supply goal evidence; the article itself does not prove its claims. Absent goal evidence yields no new admission.

The explicit importer `pnpm actions:migrate` refuses to overwrite a registry. It is not part of generation or API builds. New articles without a receipt and edited articles with stale receipts fail before API output is written. The article and registry are staged in the same workflow commit. Both initial and continued editorial jobs execute the pinned trusted-base policy. The v6 review cache includes the trusted cycle and cannot reuse a v5 receipt. Birth-cycle metadata persists on new identities across current-decision rewrites. Automated admission verifies the output phase and request identity against the trusted workflow and the artifact-bound dated blob. The artifact also binds clean-acceptance versus prose-revision mode and the exact extracted-feedback digest for PR-body revisions, so an actual revision cannot borrow a pending initial retry’s larger allowance. Further acceptance rounds require an exact bot-issued output receipt bound by its hash to an immutable Actions artifact, with matching run provenance and Git ancestry, or an identified inclusion-only change. The existing required Test + pipeline smoke test checks every acceptance PR head without invoking models and waits up to 25 seconds for the post-push receipt. A lost or edited receipt fails closed and requires diagnosis; it never authorizes replay.

Trusted main is the human-reviewed authority, including ordinary source/data PRs and this one-time import. These controls guard automated editorial admission; they are not a cryptographic restriction on a maintainer deliberately approving policy or state changes through a normal PR.

After a terminated local process, confirm that no generation or reconciliation process owns `actions/registry.json.lock` before removing that stale lock. Rerun reconciliation to repair any interrupted article write before publication. CI uses ephemeral checkouts. Ordinary write exceptions restore the prior article and registry; process termination between renames requires this recovery.

## Preserved October 15 contract

- `src/action-intake.ts` recognizes the legacy source forms for the one-shot importer. Normal API builds verify recorded admissions but never extract membership from markdown.
- `action-admissions/2026-10-15.json` is the only admission record in this delivery. It freezes three new IDs, full invocations, exact source lines, dispositions, and authority limits.
- Every admitted source must resolve through the recorded Git commit, path, blob, article SHA-256, line number, and line SHA-256. Required repository evidence carries its own commit and blob identity and is SHA-256 checked before any API file is written.
- `api/actions.json` remains the only open-action feed. `api/done-actions.json` projects accepted completions. Reviewed evidence and dispositions do not settle the protected October 15 records.
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

The continuous check compares all 91 imported open and 125 imported completed rows against their pinned Git source. It pins exact historical article appearances and all 138 held source lines, verifies decision citations and source digests, retains three restricted admissions, and builds projections twice to prove byte-stable retry. Lifecycle tests cover draft isolation, cross-day disposal, pre-acceptance corrections, opt-out persistence, stale writes, missing reviews, unsupported completion, and rollback after injected publication failure. Browser tests exercise real checkbox interaction, reload, acceptance branch reuse, and conflicting saves with intercepted GitHub requests.

The browser reads only its dated file. API readers and the deterministic CI check enforce the 64 KiB limit. Repository content from full GitHub links and harvested goal links follows the same public-repository or explicit `REPO_NOTES` opt-in policy as fleet collection. Terminal dispositions require repository evidence, current API state, or a comment from an OWNER, MEMBER, or COLLABORATOR.

A dry run writes no article or queue state, but it still calls GitHub and the configured models unless `MOCK_LLM=true`. Use mock mode for offline checks. See [Action recovery](action-recovery.md) for the pause switch, prose rebinding, artifact expiry, and rollback.
