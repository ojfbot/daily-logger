# Implementation notes

## Deviations

- 2026-10-13 (PR #348 / issue #342): the existing cohort test assumed reports could omit recent-only merged PRs and measured allocator output rather than rendered prompts; native regressions found missing report evidence and 24,044 characters after quote separators. Added recent-only report coverage with shared-body deduplication and reserved separator space inside the named 24,000-character budget. This remains a character heuristic for selected body quotes, not a token or whole-prompt bound.

- 2026-10-13 (PR #348 integration): PR metadata still named base `872a7e7` while the live main endpoint resolved to `457809f`; rebased the owned detached worktree onto the actual main commit and retained source pins rather than integrating against the stale metadata.

- 2026-10-11 (accepted article deployment): the plan assumed merging a source-only editorial correction would refresh production, but `deploy-vercel.yml` watched frontend and API paths only. Added `_articles/**` and the workflow file itself to push and PR deployment triggers so the existing `vercel.json` build regenerates the static API from article source through CI and this trigger change deploys on merge.

- 2026-10-11 (accepted article contract command): the article assumed a `pnpm test:contracts` script in core, but core has no such script. Replaced the prose instruction with the checker's actual CLI command, retained the historical suggested action for traceability, and added a correction pointing to the open fixture PR.

- 2026-10-11 (accepted article follow-up): the first correction verified telemetry and PR evidence but left the article's #54 missing-section handoff intact. The #54 discussion already contained an October 9 independent review finding no such section was absent, followed by an October 10 amendment. Corrected the article against that receipt, retained the historical action wording for traceability, and retired both misleading action IDs in `api/done-actions.json` rather than posting a duplicate comment.

- 2026-10-10 (final review records): the earlier queue split preserved a legacy-path pointer and immutable handoff text, but neither path nor beads had landed on main. With explicit operator permission, removed the pointer, normalized only references/internal chat IDs in the unmerged records, and kept substantive historical claims as dated snapshots with a new superseding report.

- 2026-10-10 (editorial review reconciliation): the reviewed PR base was c7b3b9c while main contained provenance UI/styles through 4b4589a; preserved both the provenance changes and editorial notes in an isolated merge tree and reran tests/build rather than deploying the stale reviewed snapshot.

- 2026-10-10 (authorized merge policy): repository settings advertised all merge methods, but the active default-branch ruleset permits only rebase; GitHub then rejected rebasing the reviewed merge-commit history. Linearized only the owned PR branch onto inspected main, preserved the final reviewed contents plus this deviation, used an expected-head lease and reran final-head CI. No ruleset or bypass changed.

- 2026-10-10 (review branch reconciliation): the reviewed PR base was c7b3b9c while main already contained run-provenance commits through 4b4589a; preserved that implementation, combined its footer import with the bounded-evidence import, and reran verification against the combined tree rather than reporting stale-head readiness.

- 2026-10-10 (PR #333 review): the plan attached run evidence only during article generation. Review exposed that duplicate admission can route a late run to recover or complete before Node setup, and watchdog fallbacks have no event cron. Added best-effort evidence to the Python preflight for every admission outcome and made the nominal target schedule explicit to both scheduled and fallback runs.

- 2026-10-08 (#323 historical backfill acceptance): the coverage audit initially treated the missing daily dates as the digest's exact source window; retained sources include June 10 UTC developments and no contemporaneous golf first-push receipt. Recorded operator acceptance of a best-effort retrospective with explicit time boundaries and source limits, preserving the original draft rather than claiming exhaustive daily reconstruction.

- 2026-10-08 (two-action settlement): The API rebuild was expected to change only the queue projection; refreshed main had an unprojected accepted outcome from editorial PR #321. Included the existing accepted status and outcome in api/entries.json and retained all other article data and queue records unchanged.

- 2026-10-09 (#300 settlement): Shipping verification initially expected a web deployment, but the Vercel workflow excludes generator-only changes. Verified merged main contains the exact reviewed normalizer and the mock-generation CI passed; no production article run was triggered.

- 2026-10-08 (#300): Fresh review found inserted placeholder delimiters could merge adjacent code spans, and generic angle-token normalization changed intentional HTML markup. Separate changed inline-code delimiters with spaces; preserve paired HTML tags, void tags, and preformatted HTML content while continuing prose normalization. Rendered regressions cover both gaps.

- 2026-10-08 (#300): A separate independent review reproduced broken implicit reference links and increasing code indentation in widely spaced list items despite the passing suite. Changed labels now retain explicit reference identifiers, nested parsing retains shared definitions, and list reconstruction adds only separator spacing. Rendered-link/code and repeated-normalization regressions cover the reported failures.

- 2026-10-08 (#300): Converting an escaped prose newline inside a GFM table cell creates a new row and changes cell associations. Preserve those literal escapes within cells while normalizing placeholders; ordinary prose line breaks are restored. This conservative exception keeps the existing table structure.

- 2026-10-08 (#300): The issue named council synthesis as a separate normalization target; synthesis already calls `assembleBody`, so the shared assembler and final `toMarkdown` boundary apply the fix. Suggested-action lines are preserved because descriptions determine queue IDs. Independent review found link and block-boundary errors in the initial scanner; the existing Marked lexer now bounds normalization by nested blocks and list items and recurses into formatted prose and link labels while preserving code and link destinations. Quote/list prefixes use standard Markdown spacing after normalization. No pipeline step or OPM input/output contract changes.

- 2026-10-08 (#301 production verification): the plan assumed the deployed chat panel could send a mocked message normally; its pre-existing section lookup compares a heading containing the injected '+' button with the original section name, so Send silently returns. Verified the deployed safety renderer after removing that button text only in the isolated browser's DOM; the ordinary Send path remains a separate follow-up, and its source is unchanged by #315.

- 2026-10-08 (#301 chat Markdown): sharing the article safety renderer assumed a backend-to-frontend source import was acceptable; the review checklist prohibits cross-package relative imports, so the frontend uses an equivalent local renderer, as #301 permits, with component regressions for both streaming and completed messages.

- 2026-10-05 (settlement review): plan treated merged #27 and f1-doctrine #1 as full delivery; independent reviews found an unrecorded decision link and a changed registry contract. Reopened both sources, and used the newly inspected explicit #266 → merged #272 replacement to settle two fully evidenced batches.
- 2026-10-05 (settlement evidence): automatic number extraction assumed core was the namespace for draft #28; the source meant beaverGame #28. Corrected the subject and ledger citation, removed unrelated core #28 evidence, and refreshed incomplete partial-delivery observations.

- 2026-10-05 (action settlement): plan assumed a baseline static API rebuild would touch only action projections; current source also re-stamps an unrelated article as accepted in api/entries.json. Verified the same editorial delta exists before ledger edits, retained build digests, and excluded that delta from this settlement PR.
- 2026-10-05 (action settlement): suggestions required #210 before #209; GitHub records #209 merging four seconds earlier. Preserved both original requests; resolved the narrower #210 source by shipped-outcome supersession and retained #209 because its plural backfill completion condition needs operator acceptance of the one shipped digest.

- 2026-10-05 (PR #294 design review): plan assumed the isolated checkout could install dependencies; registry DNS was unavailable, so validation used the PR worktree's existing pnpm dependencies without changing the lockfile.
- 2026-10-05 (PR #294 design review): plan assumed a phone-width browser pass; viewport control timed out, so desktop light/dark views and the responsive CSS were checked, with phone width left unverified.

- 2026-10-02 (article HTML formatting): plan assumed the latest article only needed visual styling. **Territory:** literal `\\n` sequences flattened two sections, while `<port>` and `<section>` in prose became unclosed HTML elements during Markdown conversion. **Went:** repaired the article source and made the API renderer restore escaped breaks and escape raw HTML before improving typography for all articles.

- 2026-09-24 (silent-sweep fix, `fix/collector-paginate-and-fleet-drift`): plan assumed the
  surface-3 drift check could import `KNOWN_REPOS` from `src/build-api.ts`. **Territory:**
  `build-api.ts` calls `buildApi()` at module load, so importing it from the collector would
  build the API as a side effect of every sweep. **Went:** moved `KNOWN_REPOS` into a new
  `src/fleet.ts` (derived from `REPO_NOTES`) and made `build-api.ts` import it; repo tag types
  in `TAG_TYPE_MAP` are now derived from the same set (closes the 2026-05-05 set/map asymmetry).
- 2026-09-24 (same PR): plan assumed a `pushedAt`-in-window filter on discovery to bound API
  cost. **Territory:** open PRs / open issues / ADR listings have no time window, and a closed
  issue does not bump `pushedAt`, so the filter would silently drop that signal. **Went:**
  sweep every non-archived, non-fork org repo (56 → ~49 today vs 39 hand-listed); cost is ~70
  extra `gh api` calls per run, well inside the PAT rate limit.
- 2026-09-24 (same PR): `opm/system.opl` left unchanged on purpose — Context Collecting still
  *requires GitHub* and *yields Commit Context*; deriving the repo set changes an input's
  provenance, not the step's consumes/yields at the model's granularity.
- 2026-09-24 (same PR, after first CI run): plan assumed the PR smoke test would be unaffected by
  deriving the sweep. **Territory:** the smoke step runs the real sweep under the Actions token with a
  fixed `DATE_OVERRIDE=2026-01-01`, so every PR in the org is "recent"; once the busy repos' PR lists
  parsed (the buffer fix), the per-PR skill-comment scrape fanned out to hundreds of `gh` calls and the
  job hit its 5-minute `timeout-minutes` (run 36070106221, cancelled mid-collect). **Went:** added a
  `FLEET_REPOS` env seam that pins the sweep set (test/replay only, documented) and set it to
  `daily-logger` in the smoke step, rather than raising the timeout or changing the live windows.
- 2026-09-24 (same PR, private-repo opt-in ruling): ruling said "fail loud if ALL private noted
  repos are absent". **Territory:** when GH_PAT loses private scope, `gh repo list` omits private
  repos entirely, so the code cannot tell which *noted* repos are private from the payload alone.
  **Went:** throw when discovery returns zero non-public repos while any noted repo is missing
  (and public repos are present) — the same signature, without hard-coding a private-repo list.
  Also: a repo with a missing/unknown `visibility` field is treated as non-public (needs a note).
- 2026-09-30 (`fix/meaningful-activity-gate`): plan assumed the PR smoke test already forced the
  article write path, based on the earlier `feat/skip-bot-only-days` branch. **Territory:** `main`
  never received that branch's `FORCE_RUN=true`, so the corrected gate skipped the synthetic
  2026-01-01 window and CI failed while looking for its mock article. **Went:** set `FORCE_RUN=true`
  only in the smoke-test environment; scheduled runs still use the meaningful-impact gate.
- 2026-10-02 (PR #289 review): the review requested a live `DATE_OVERRIDE=2026-09-28` replay.
  **Territory:** local `gh` credentials return HTTP 401, so the cross-repo sweep cannot run here.
  **Went:** used dated fixtures based on the reviewed September run inputs to prove the gate's
  skip decision; the PR's CI will still run the synthetic pipeline smoke test.

- 2026-10-06 (daily blog fallback): plan assumed the existing branch guard was enough to skip duplicate work; it runs after model generation and leaves a pushed branch without a PR stranded. Moved admission ahead of collection and added PR recovery without regeneration.
- 2026-10-06 (same PR): plan assumed a successful blog workflow identified new work for Daily Cleaner; successful duplicate/no-article completions are indistinguishable by conclusion alone. Added an explicit article-ready step and a cleaner admission check against the source run's jobs.
- 2026-10-06 (same PR): initial guard resolved default dates at job execution while run attribution used creation time; those disagree when a queued run crosses Chicago midnight. Anchored the workflow date to run creation and added prior-attempt checks for reruns that retain the same run ID.

## Deviations — bounded historical action settlement 2026-10-08

- The first candidate list included f1-doctrine's S1 merge request; its specific compute-boundary ADR is absent at the recorded merge revision. Kept that compound suggestion open rather than using the merge alone to claim its prerequisite was fulfilled. Initially selected nine additional candidates alongside #319's existing two; the subsequent independent-review exclusion below leaves ten original action IDs total.
- Historical cleaner suggestions name terminal mixed merged/closed PR cohorts and sometimes an ongoing queue-age target. Recorded their bounded batch instruction as superseded, preserving closure reasons and explicitly avoiding a claim that unmerged edits shipped or today's queue meets the old age target.
- Independent Spec review found that beaverGame #27 had merged but the original suggestion also required an unconditional decision-link comment in #28, which is absent. Removed that candidate from the settlement and kept its original action open; final batch is eight additional suggestions plus the existing two, ten original IDs total.

- 2026-10-09 (sweep validation closure): the action assumed `pnpm sweep:dry --verbose` and a paginated collector; current main has no such script and intentionally uses capped single-page queries with a 16 MB buffer. Validated the exported collector directly without generation and preserved both the original action and its core-labelled reminder as separate evidenced dispositions.

- 2026-10-09 (queue projection): plan assumed the API rebuild would change only the target queue; it also projected the already-accepted October 9 article from main. Verified repeated builds, then retained only the queue closure diff and excluded the unrelated article projection update.

- 2026-10-09 (validation evidence): the initial receipt inferred missing ADR directories from skipped requests; the collector suppresses error details. Reported the 23 ADR skips without assigning a cause and retained the full redacted log for the historical PR #280 evidence venue.

- Mandatory CI assumed removing skip markers was sufficient; editorial GITHUB_TOKEN PR events require workflow-run approval. Use the existing GH_PAT only at final push, and reject changes outside the dated article before executing PR code.
- An inline guard in a pull_request workflow could be edited by its own PR; run editorial policy from pull_request_target's trusted base, reject foreign repositories, and require direct tree equality outside the regular dated article before head checkout.

- 2026-10-10 (article queue investigation): the article assumed eight public repositories were unconfirmed private repositories and the constraint was undocumented; core #509 explicitly records 24/24 public verification plus 27 private repositories pending. Preserved those separate populations and retained the private-policy choice as a human-only issue rather than repeating the false premise.
- 2026-10-10 (merged-PR grounding): initial inspection found a 400-character collector cutoff; article and report drafting also cut merged views at 200. Replaced these with one bounded 6,000-character head/tail policy and an explicit middle-omission marker; each merged body appears only once per article prompt. Existing non-merged previews and list limits remain.
- 2026-10-10 (review correction): preserving the inaccurate narrative under a correction preface still exposed false decision titles through the API; corrected narrative and decisions inline, retained exact suggested-action text for ID audit, and documented source-checked correction attribution. Queue settlement is reviewed in a separate follow-on PR after operator confirmation.
- 2026-10-10 (local API verification): the documented tsx CLI tried to bind an IPC socket denied by the sandbox; ran the same API builder with `pnpm exec node --import tsx src/build-api.ts`, without changing production build commands.
- 2026-10-10 (human-gate settlement): the initial receipt kept the article triage instruction open until an actual ADR disposition; the operator clarified that a prepared packet with the human gate left open is an acceptable day outcome, provided agents direct timely resolution. Retired only the article instruction as transferred, retained core #508/its human-only bead, and recorded an owner, exact response options and requested checkpoint without pretending the ADRs were accepted or a reminder was armed.
