# Historical backfill acceptance

Status: accepted by the operator on October 8, 2026, for the coverage obligation in [daily-logger #323](https://github.com/ojfbot/daily-logger/issues/323).

The operator chose **"Accept audited digest as substitute"** after being asked whether the June 10 digest should replace the missing May 19 through June 9 daily articles. The source audit supports a best-effort retrospective with the qualifications below. The accepted substitute is the existing June 10 digest, not a claim that 22 daily articles were generated or that every historical activity was reconstructed. The daily reconstruction requirement is waived for this particular gap.

This coverage decision does not change the digest's editorial `status: "draft"`, approve every statement in it, or establish publication. It does not close unrelated reliability, credential, or metric-gate obligations.

## Symptom

Original action `act-2026-06-11-pr-review-f028f2` requested merging #209 after #210 and closing the May 19 through June 9 log gap. Both PRs merged in the opposite order, and current source contains one returning-from-absence digest rather than the 22 daily articles. The remaining question was whether that digest could substitute for the daily reconstruction. Issue #323 and Available human-only gate-0 bead `dail-task-5e3f1111` preserve this obligation.

## Evidence

- [#209](https://github.com/ojfbot/daily-logger/pull/209) merged at `2026-06-11T01:18:29Z`, commit `b3e2d8cf405a6b4e1cb183da7a088b9530335e21`. Its [original digest](https://github.com/ojfbot/daily-logger/blob/b3e2d8cf405a6b4e1cb183da7a088b9530335e21/_articles/2026-06-10.md) declares a local authenticated sweep hand-extended to the four unregistered repos. That method is the author's provenance assertion; the original sweep receipt was not available for replay.
- [#210](https://github.com/ojfbot/daily-logger/pull/210) merged four seconds later, at `2026-06-11T01:18:33Z`, commit `745beb2dd0d6c59436100af7aa72a443774233ec`. Comparing the historical `REPOS` arrays confirms this registered the four names for future sweeps. It did not regenerate or edit the already-merged digest.
- At audited main `c44f936f77fa1a1e9eaa4538b86e3ea55384a1c3`, all 22 daily files from May 19 through June 9 are absent. `_articles/2026-06-10.md` is byte-identical to #209's artifact, SHA-256 `12929b5835bcba4491be579731b06339c7c13ac904be17a0a221eed32b50ed73`, and remains a draft. Its provenance and body explicitly name all four repos.

### Four repo source audit

| Repo | Historical source supporting its representation | Qualification |
| --- | --- | --- |
| `f1-pit-wall` | [Initial UI commit](https://github.com/ojfbot/f1-pit-wall/commit/3206cc359678a23f3539bc0fd90b36ffcc2d1010) contains the scrubber, tower, traces, map and annotations. The [retained metric report](https://github.com/ojfbot/f1-pit-wall/blob/5c736632af122cdfc9ddd20cd5c9d0efbcc889dc/reports/claim-harness-latest.json) records 117/133 numeric passes, 88.0%, and 112/117 noun passes, 95.7%, across 11 sessions | These are the historical report's measurements. The [handoff](https://github.com/ojfbot/f1-pit-wall/blob/5c736632af122cdfc9ddd20cd5c9d0efbcc889dc/.handoff/20260610-0430-session2-state.md) explicitly leaves the numeric gate unmet. No present-day benchmark or gate promotion is inferred |
| `f1-substrate` | [Initial source commit](https://github.com/ojfbot/f1-substrate/commit/3d46b6c46483d290db4c3c21c5ed6f0ca74c9bcf) contains the DuckDB store, FastF1 loader, gap algorithm and API. Its [session handoff](https://github.com/ojfbot/f1-substrate/blob/7154d9e38325048c9f98cf4eaf3be6fbfbe264f9/.handoff/20260610-0430-session2-state.md) records 11 loaded sessions, shared apex definitions and aggregate queries | This supports the stack's inclusion. The audit does not independently rerun the digest's 0.1-second accuracy or 8.3-million-row claims |
| `lofi-beaver` | [Reboot commit](https://github.com/ojfbot/lofi-beaver/commit/f69086bc0ee81d169d666900e152565cbff41e70) and its [README](https://github.com/ojfbot/lofi-beaver/blob/f69086bc0ee81d169d666900e152565cbff41e70/README.md) contain the Willow Bend season, two outcomes, Mechanics Lab, sprite pipeline and visual gate. Its tree contains eight ADR files | Source corroborates the described reboot. This audit does not replay the game, Blender pipeline or visual gate |
| `golf-platform-scripts` | [Scaffold commit](https://github.com/ojfbot/golf-platform-scripts/commit/3ce04f678c59cfc402db7801209851a0ea0fafda) exists from July 21, 2025. A [documentation commit](https://github.com/ojfbot/golf-platform-scripts/commit/45217f799a8d8e33eb8b74e443ba61bde2d91d77) has author date June 4, 2026, but committer date June 11, after the digest PR opened | The name and scaffold are represented. No retained push receipt establishes the digest's claim that the repo was first pushed during the outage. An author date is not evidence of when content was available on GitHub |

### Time boundaries

The audit queried paginated default-branch commit history from `2026-05-19T00:00:00Z` through the digest PR's opening time, `2026-06-11T01:02:51Z`. The result contained 16 pit-wall commits, six substrate commits, one lofi-beaver commit and zero golf commits in that range. These counts describe retained commit history, not all historical branches, pushes or activity.

The F1 repos were created at `2026-06-10T02:05:09Z` and `02:05:10Z`, and lofi-beaver at `03:56:27Z`. Their cited commits fall before `2026-06-10T05:00:00Z`, the end of June 9 in Chicago. They therefore fit June 9 local time, but not a June 9 UTC cutoff. The digest also includes later June 10 developments: [core #146](https://github.com/ojfbot/core/pull/146) merged at `22:33:11Z` and [selfco-box #4](https://github.com/ojfbot/selfco-box/pull/4) at `22:29:49Z`. It is an outage retrospective with June 10 context, not an exact daily-window projection. [Core #138](https://github.com/ojfbot/core/pull/138), the headline ADR identity change, merged June 5 UTC within the missing period.

## Cause map

Confirmed: the delivered artifact is a reconstructed summary, while the original action combines an obsolete merge sequence with a daily-coverage criterion. Merging a draft established neither operator acceptance of a substitute nor daily completeness. The four-second ordering deviation alone does not establish omitted repos because the digest already names them and declares manual extension. This acceptance decision resolves the criterion mismatch; it does not retroactively change the merge order or diagnose the historical token outage.

## Candidate fixes

1. **Chosen:** accept the existing digest as the bounded substitute, preserving its provenance and these limitations. This resolves the historical coverage decision without introducing daily records that did not exist.
2. Individual daily reconstruction would require a separate bounded scope, historical evidence and review. The operator waived that requirement for this gap; no bulk generation is part of this decision.

## Verification experiments

Completed read-only checks: inspect the two merged PR receipts and historical roster diff; enumerate the 22 missing paths; compare the digest bytes at #209 and audited main; query each repo's paginated commit history; read the retained F1 metric report and handoffs, lofi README and ADR tree; and inspect the original queue bead's ID, issue backlink and gate. These support source representation and an explicit bounded acceptance, not exhaustive factual certification of the article.

Landing checks: preserve the historical article, generated APIs and original action identities; check the documentation diff; and require fresh PR CI before merge. Close #323 when this record merges, then close the existing `dail-task-5e3f1111` bead with the accepted disposition. The separate review-instruction settlement in #324 is not merged or modified by this work.

Recorded by Codex from the operator's direct choice in this chat. No separate reviewer participated; a subsequent informational PR review must disclose that attribution.
