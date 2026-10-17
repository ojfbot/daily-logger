# October 2026 time-reference backfill

This metadata-only backfill adds three source-verified popovers to the October 17 article. It preserves every article byte, all 33 previously admitted references, acceptance and provenance fields, review freshness, action IDs, and completion data. It uses the existing legacy sidecar contract; it adds no article frontmatter or generation-owned record pointer.

## Frozen scope

- Source commit: `faac3c9bb310bc0fc1c1ec445433e310e0498558`. The 16 existing October articles contain 42 recognized token occurrences and 39 unsupported spellings.
- October references: 22 before, 25 after. The corpus has 36 admitted references after replay. Seventeen supported occurrences remain plain.
- Three dates have no recognized or unsupported time mentions: October 10, 11, and 12. October 5 and October 18–31 have no article at the frozen source.
- Existing facts: 194. Fresh observations: 33 source groups, yielding 121 additional facts. Seven attempted source groups were unavailable; no dates are inferred for them.

## Per-date inventory

| October date | Recognized occurrences | Before → after admitted | Supported left plain | Unsupported spellings |
| --- | ---: | ---: | ---: | ---: |
| 2026-10-01 | 2 | 2 → 2 | 0 | 0 |
| 2026-10-02 | 9 | 9 → 9 | 0 | 0 |
| 2026-10-03 | 2 | 0 → 0 | 2 | 0 |
| 2026-10-04 | 1 | 0 → 0 | 1 | 4 |
| 2026-10-06 | 0 | 0 → 0 | 0 | 1 |
| 2026-10-07 | 1 | 1 → 1 | 0 | 16 |
| 2026-10-08 | 1 | 1 → 1 | 0 | 3 |
| 2026-10-09 | 0 | 0 → 0 | 0 | 6 |
| 2026-10-10 | 0 | 0 → 0 | 0 | 0 |
| 2026-10-11 | 0 | 0 → 0 | 0 | 0 |
| 2026-10-12 | 0 | 0 → 0 | 0 | 0 |
| 2026-10-13 | 0 | 0 → 0 | 0 | 3 |
| 2026-10-14 | 8 | 3 → 3 | 5 | 4 |
| 2026-10-15 | 8 | 6 → 6 | 2 | 0 |
| 2026-10-16 | 2 | 0 → 0 | 2 | 0 |
| 2026-10-17 | 8 | 0 → 3 | 5 | 2 |

## Source records and admission

`harvest-plan.json` lists the requests discovered by the existing production helper. Previously covered source groups retain their original facts. `source-observations.json` freezes all newly attempted observations, retrieval times, source URLs, immutable source pins where available, and digests of minimal timestamp projections. PR lifecycle fields are retained together; commit author and committer dates remain distinct.

The GitHub connector supplied PR timestamps. Its commit projection omits author/committer dates, so the five observed commit groups use the matching immutable Git object (`git show -s --format=%H%n%aI%n%cI`). No time is inferred from a connector’s generic creation field. Response headers and ETags were unavailable. Digests prove consistency of the saved projections; they do not authenticate a provider account.

`adjudications.json` classifies all 20 previously unresolved supported occurrences against exact article blobs. Three exact merged events qualify:

| Article token | Source | Complete UTC instant |
| --- | --- | --- |
| 06:22Z | daily-logger #370 merged | `2026-10-17T06:22:23.000Z` |
| 21:05Z | daily-logger #373 merged | `2026-10-16T21:05:02.000Z` |
| 13:34Z | daily-logger #366 merged | `2026-10-16T13:34:59.000Z` |

Reporting-window bounds, schedules/examples, an unsupported cross-sentence source, unsupported event kinds, and approximate multi-PR ranges remain plain. In particular, `19:42Z` raw-resolves with the fresh facts but is withheld from the sidecar. `18:21Z` is also an approximate upper endpoint and additionally fails clock matching against the observed source. All complete source groups remain available; facts are not removed to manufacture uniqueness.

**Coverage accounting:** reader/resolver `unresolved` excludes raw-resolved references withheld from a sidecar. Count plain supported occurrences as recognized tokens minus admitted references, then report unsupported spellings separately. The manifest records both parser diagnostics and occurrence adjudications. One occurrence is currently raw-resolved and withheld; both approximate endpoints remain plain.

**Known runtime gap:** new-format generation can also admit an approximate range endpoint through the current resolver. Historical sidecar adjudication protects this backfill only. The separate source/grammar decision is recorded in [audit #357](https://github.com/ojfbot/daily-logger/issues/357#issuecomment-6240542708); instruction wording and this backfill do not close it.

## Reproduce the accepted metadata

Use an isolated checkout containing the frozen article/helper bytes and this change’s script and frozen inputs. The script rejects changed articles, changed production helpers, stale adjudications, mismatched source/event/day identities, incomplete observations, and unrelated metadata edits. It performs no network or model calls.

```sh
pnpm exec node --import tsx scripts/backfill-time-month.mjs --month 2026-10 --out /private/tmp/october-replay-a
pnpm exec node --import tsx scripts/backfill-time-month.mjs --month 2026-10 --out /private/tmp/october-replay-b
diff -r /private/tmp/october-replay-a /private/tmp/october-replay-b
```

The output contains the three runtime metadata files and `manifest.json`. Compare the manifest with the committed fixture before applying. To apply that same replay:

```sh
pnpm exec node --import tsx scripts/backfill-time-month.mjs --month 2026-10 --out /private/tmp/october-replay-a --apply
```

Apply preflights all three metadata targets, then replaces each file individually. A Git commit is the publication unit; the script does not claim a filesystem-wide transaction or concurrent-writer safety. Rerunning identical output/apply is idempotent. Existing different output bytes and unrelated metadata edits are refused.

The generic `backfill:times --harvest --write` command produces raw parser proposals. It does not apply this occurrence adjudication and must not replace the accepted sidecar blindly.

## Evidence index

- `manifest.json`: all 31 dates, present/absent disposition, article Git blobs and hashes, before/after admitted references, all supported occurrences and dispositions, unsupported spellings, selected source groups, parser candidates and diagnostics, source input/helper/artifact hashes.
- `source-observations.json`: complete newly attempted source groups, observations, unavailable requests, and source pins.
- `harvest-plan.json`: all 85 requests and the original-coverage decision for each.
- `adjudications.json`: pinned semantic decisions for all 20 previously unresolved supported tokens.
- Native tests retain the original immutable 134-article/33-reference replay and add real offline month replay, byte identity, safe refusal, idempotence, conservation, and evidence rejection controls.

The existing build pipeline regenerates article JSON from the sidecar. This change intentionally does not commit unrelated pre-existing index drift. Review [#372](https://github.com/ojfbot/daily-logger/pull/372) for the time UI and [#376](https://github.com/ojfbot/daily-logger/pull/376)/[#377](https://github.com/ojfbot/daily-logger/pull/377) for the surrounding article/review history.
