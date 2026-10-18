# Implementation notes

## Deviations
- 2026-10-17 UIK D1 model: the available core renderer would regenerate the legacy compatibility view with 676 lines of unrelated format churn; the repair classifies response failures without changing pipeline inputs, correspondence outputs or steps, so leave both OPM files unchanged and describe the bounded response contract in the existing continuation document.
- 2026-10-17 UIK D1: Claude's status-only rejection release assumed 4xx proved no write; actual handler/service probes returned 400/409 after durable appends and an older append crossed a moved-head/empty-history observation, so use a bound phase-aware failure response and release only a still-live initial invocation's explicit pre-append rejection; retain retry/remount uncertainty.
- 2026-10-17 UIK-03: the design assumed native focus scrolling would keep a growing note visible; the mounted sticky sidebar clipped it to a 0.344 viewport ratio, so height changes now reveal only the active textarea with nearest scrolling; capped keystrokes do not trigger that scroll.
- 2026-10-16 (time pointer formatting): the storage reader accepted CRLF frontmatter while the editorial protection helper recognized LF only. Independent controls showed pointer replacement could cross that gap; aligned stripping, restoration and body hashing across both line endings before publication.
- 2026-10-16 (unqualified time sources): the resolver treated a repository's appearance in a compound heading or clause as a qualifier. With another repository's evidence absent, that manufactured uniqueness; require an independently explicit qualifier or a single repository heading within the project namespace.
- 2026-10-16 (time lifecycle fixture): the end-to-end proof assumed an empty injected repository could build the API, but accepted action intake requires its pinned admission and Git history. Used an isolated checkout of that real baseline rather than weakening the action guard for tests.
- 2026-10-16 (time metadata admission): body fingerprints and clock equality were assumed sufficient to publish stored references; independent controls admitted a different source and year. Retain bounded generation-owned source facts, resolve current prose at publication, and independently validate legacy claims against recorded facts.
- 2026-10-16 (rapid time-hover reentry): retaining the pending anchor let a cancelled hover suppress a quick second entry. Independent timer controls reproduced the gap; clear the pending anchor on leave so the second entry starts a fresh delay while an already-visible map keeps its hover grace.
- 2026-10-16 (combined popover lifecycle): merging the cache repair preserved visible content but switching from a pinned time to a PR left the old clock marked expanded. Clear the previous anchor before selecting another target, guard pending time anchors, and retain the failing accessibility transition as a committed control.
- 2026-10-16 (PR #372 incomplete evidence): source selection assumed available timestamp records enumerated every nearby reference; independent controls showed a missing later PR or commit could borrow an earlier source. Select the closest prose identity before evidence lookup and leave missing or differently qualified sources unresolved.
- 2026-10-16 (time backfill replay): object-equality tests passed, but actual single-worker and merged shard files differed in JSON property order. Normalized both outputs through the shared schema and added a byte-order regression before accepting deterministic replay.
- 2026-10-16 (time popover hover): the plan reused React hover callbacks on the existing portal, but Chrome missed mouseenter when crossing from imperative article markup. Added native hover listeners to the existing popover root and verified movement from the time label into the map.
- 2026-10-16 (time popovers): orientation notes described a standalone package and a seven-day article window; the current source has a pnpm workspace and reads the latest five articles. Used the existing workspace and preserved context selection and model-call counts.
- 2026-10-16 (time occurrence binding): the initial source-token scanner assumed Markdown spelling matched visible text; escaped punctuation and HTML entities can introduce an earlier identical clock. Switched reconstruction to canonical rendered text through parse5, matching the browser's occurrence rules.
- 2026-10-16 (popover refresh): the existing cache invalidated React after GitHub preview data arrived, but the visible popover retained its original loading snapshot. Exposed the cache revision to the article-popover hook and refreshed the open commit or PR entry in place; browser coverage holds the pointer stationary through both transitions.
- 2026-10-16 (multiple-reviewer cycle UI): the repair assumed the existing PR head and workflow receipt could identify each revision cycle, but PR #369's raw receipt named the base commit and Sonnet while the generated article provenance named Opus and the branch later moved again. Grouped current structured PR/review data and labeled body claims unverified; left historical per-event output heads to a future structured producer receipt.
- 2026-10-13 (daily-347 exact content follow-up): prior review treated preexisting root-note trimming as compatible, but issue #339 requires exact literal content; kept raw nonblank strings and trimmed only for blankness, with a real UI HTTP assertion failing on baccf6d before the correction.
- 2026-10-13 (daily-347): preparation assumed the existing extractor and UI checks established the issue #339 boundary; they tested HTTP encoding and parser input separately, so added a native real-stamper HTTP-body → workflow-extractor regression, including typed root/section Unicode literals and malformed-v2 counterexamples.

- 2026-10-13 (PR349 current-main refresh): the prior local patch was expected to replay cleanly, but accepted PR #348 added notes at the same heading; retained both sets of notes and recorded the conflict without changing application or browser-test behavior.

- 2026-10-12 (Codex daily-cycle routing): the paired proposal assumed core's user-scope skill was discoverable to Codex, but this installation exposes it only to Claude. Added a project-local source path for Codex and preserved both branches' notes while rebasing the stale PR onto current main.

- 2026-10-10 (prompt repair): the first proposal interpreted pickup before resolving the user's scheduled worker and duplicated instructions across project docs and saved prompts. Reduced project guidance to an evidence index, structured the two existing saved-task prompts without changing their authority or schedule, and retained the unidentified worker as an explicit evidence gap. Independent review remains pending.

- 2026-10-13 (PR #348 / issue #342): the existing cohort test assumed reports could omit recent-only merged PRs and measured allocator output rather than rendered prompts; native regressions found missing report evidence and 24,044 characters after quote separators. Added recent-only report coverage with shared-body deduplication and reserved separator space inside the named 24,000-character budget. This remains a character heuristic for selected body quotes, not a token or whole-prompt bound.

- 2026-10-13 (PR #348 integration): PR metadata still named base `872a7e7` while the live main endpoint resolved to `457809f`; rebased the owned detached worktree onto the actual main commit and retained source pins rather than integrating against the stale metadata.

- 2026-10-13 (PR349 integration): PR metadata retained base `872a7e7` while the current main ref was `457809f`; integrated only PR349 onto the directly refreshed main tip and retained the remote branch unchanged.

- 2026-10-11 (accepted article deployment): the plan assumed merging a source-only editorial correction would refresh production, but `deploy-vercel.yml` watched frontend and API paths only. Added `_articles/**` and the workflow file itself to push and PR deployment triggers so the existing `vercel.json` build regenerates the static API from article source through CI and this trigger change deploys on merge.

- 2026-10-11 (accepted article contract command): the article assumed a `pnpm test:contracts` script in core, but core has no such script. Replaced the prose instruction with the checker's actual CLI command, retained the historical suggested action for traceability, and added a correction pointing to the open fixture PR.

- 2026-10-11 (accepted article follow-up): the first correction verified telemetry and PR evidence but left the article's #54 missing-section handoff intact. The #54 discussion already contained an October 9 independent review finding no such section was absent, followed by an October 10 amendment. Corrected the article against that receipt, retained the historical action wording for traceability, and retired both misleading action IDs in `api/done-actions.json` rather than posting a duplicate comment.

- 2026-10-11 (editorial correction PR #346): the PR description used a negated closing phrase for #334, but GitHub still auto-closed that issue on merge. Reopened #334 immediately, left a clarification that production verification remains outstanding, and will avoid closing-keyword syntax in future PR descriptions.

- 2026-10-11 (#341 browser regression): the planned feedback journey assumed a section note could be entered normally; the injected chat button changes the heading text, so the section lookup dropped Send before it reached the mocked API. Correct the heading lookup in this slice and use the browser case to verify the full path.

- 2026-10-10 (Codex daily-cycle context): the initial answer treated issue pickup as agent dispatch after loading only article-generation orientation; the operator meant the next scheduled agent pass, and the inspected local tasks cover fallback/cleaner review rather than a proven general issue worker. Added source-backed workflow routing and explicit capture/tracking/execution distinctions without changing task scope or scheduling. The primary checkout is stale and dirty, so isolated the proposal on merged main and preserved its existing instructions.

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

## Deviations — October 14 review pilot

- The October 14 article requested a new design spike, while #357 already specifies a bounded working pilot without separate design sign-off. Prepared a local implementation under that existing issue rather than a duplicate issue or framework.
- The current independent October 13 and 14 review records were local and uncommitted, so the candidate explicitly registers preserved copies; it does not claim those records are already published or automatically discoverable.
- Narrow-screen dogfooding placed independent review below a long article. Added a direct article-header navigation link without changing the article or acceptance controls.

- Cold review proved that literal provider mentions inside displayed feedback match the checked-in comment automation rule. Escaped display-only at-signs and artifact paths, retained exact encoded feedback, and added a predicate-driven regression plus fail-closed body guard.

## Deviations — October 15 review fixture CI repair

- Local review tests assumed historical Git objects were available; hosted CI checks out one commit and returned 404 for those fixture reads. Frozen the four exact article inputs with verified Git blob and SHA-256 identities instead of widening CI history or changing runtime source.
- Browser fixtures relabeled current rebuilt article JSON with a historical blob, and a source-change control overrode a reported SHA without changing source bytes. Rendered the browser fixture from its matching frozen bytes and used the actual corrected October 14 revision for the article-change control.

## Deviations — October 16 review correspondence repair

- The deployed proposed-review path required a proposal already registered on main; an open source-pinned review PR could not reveal itself. Reused artifact validation for bounded GitHub PR discovery while retaining main's separate published-record authority.
- The existing Submit All Feedback control was an alert-only stub, and saved chat history would have been implicitly resubmitted by acceptance. Removed the stub, added explicit save receipts and deliberate current-note inclusion, and kept restored historical correspondence outside acceptance inputs by default.
- Exact-head review showed that an untrusted marker-shaped comment could make all correspondence incomplete, and that closing an auto-discovered review PR would remove its saved history. Decode structured envelopes only for repository-associated or explicitly allowlisted actors, and recover read-only history through the bounded dated review-branch query; closed PRs expose neither proposed findings nor a write target.
- The recommended registry-wide validator could not join review-data PR #367 without making that proposal ineligible under the review-only discovery contract. Carried the test in the existing UI repair PR #368, whose product-and-test scope already permits it.
## Deviations — October 15 canonical action intake

- The first repair assumed a separate advisory projection was sufficient; independent replay showed canonical drafting and the Actions page would still miss the three reviewed suggestions. Replaced it with a bounded canonical admission that preserves all 85 existing rows, holds the other 138 historical omissions, and grants no execution or settlement authority.
- The final conservation replay started from the newly accepted October 16 article commit, whose article changes were not yet reflected in tracked aggregate API files. Verified those incidental entry/repository projections during the build, then excluded them from this intake candidate so the diff contains only the canonical action repair.
- The first canonical check encoded the release snapshot as a permanent queue cardinality. Actual PR smoke ordering plus adversarial next-day and ordinary-settlement controls showed that queue membership evolves. Moved the invariant to baseline-history conservation across open and done, and made the required reviewed admission fail closed inside the production builder.
- The follow-up conservation check treated identity and source fields as sufficient completion history. Independent mutation controls showed that resolution, closed date, and status could drift, and an unchanged open row could masquerade as settled. Preserved every baseline completion field exactly, grandfathered unchanged legacy omissions, and required new settlements to carry `done`, an ISO date, and a non-empty resolution.
- The publication candidate assumed Vercel's automatic preview checkout retained every Git object pinned by the admission record. The hosted build could not resolve source commit `df3a8ec`; a local depth-18 clone ending at evidence commit `68505bb` reproduced the failure. The hosted checkout depth was not independently measured. Guarded only Vercel's build command: shallow repositories must unshallow successfully before API generation, while full-history checkouts remain a no-op and retain the strict Git proofs.
- The first hydration guard assumed a shallow Vercel checkout retained a configured `origin`; the hosted automatic preview reached the shallow guard but had no usable `origin`; a local no-remote clone reproduced the same failure. Kept the same fail-closed shallow guard and fetched from the explicit public `ojfbot/daily-logger` URL, without creating a remote, adding credentials, or changing any source/evidence assertion.

- Exact-head review of PR #370 found two inherited UI state failures on both the candidate and its base: a detached article popover could survive navigation and a selected finding could become accepted while remaining checked and blocking a new request. Added failing base controls, invalidated detached anchors and unavailable selections, and kept the remote candidate frozen while the local repair is re-reviewed.
- The exact Vercel branch preview rendered the public article, but its GitHub OAuth callback URI was not registered. Treat authenticated preview behavior as unproven until a valid preview auth environment exists; controlled browser checks and prior production evidence remain separate claims.
- The owner-posted exact-head review showed that selection absence during a partial source outage is not evidence that the finding became invalid, and that pruning during a pending request breaks retry deduplication. Preserve missing selections while any source is unavailable, freeze pruning during submission, and commit the previously handoff-only pending-timer control; prune and rotate identity only when complete or present evidence proves the selection is no longer current and open.
- The partial-outage repair assumed a retained missing selection could safely wait for source recovery, but an actor/state census showed it could invisibly block a still-visible selection with no editor escape path. Keep unknown intent by default, expose a deliberate Clear selections action that preserves feedback, and rotate the request identity only when the editor uses that control.
- The explicit-clear repair assumed the existing persistence effect's empty-state no-op was equivalent to clearing storage, but an empty-feedback clear left the prior actor/source draft intact and restored it on remount. Remove that exact keyed draft when the cleared state is empty, or overwrite it synchronously when feedback remains, so the deliberate clear survives reload without crossing actor/source boundaries.

## Deviations

- UIK-01 owner-only continuation assumed an offline dependency install; one tarball was absent, so the isolated candidate uses a local dependency copy from a checkout with an identical SHA-256 pnpm lockfile. No dependency files changed.
- UIK-01 native consumer testing found the tsx CLI IPC socket unavailable in the sandbox; the consumer runs the same native revision script with `pnpm exec node --import tsx`, preserving trusted code and MOCK_LLM behavior.
- UIK-01 found no core OPM renderer executable in the skill's specified instructions; the local receipt includes a deterministic renderer for the appended in-zoom, checks pinned prior OPL is unchanged, and preserves its existing generated diagrams.
- UIK-01 production browser fixtures assumed generated `api/articles/` assets were present; the clone lacks them, so builds use an ignored non-article placeholder while all article endpoints are intercepted. No article/action-data builder was run.

- UIK-01 continuation-focused browser proof did not cover the hosted aggregate runner's legacy editorial test, which still selected the removed `.chat-send-btn`. Keep its exact save/literal/once assertions, address the accessible `Save note` action, and verify the complete default ten-test browser suite.
- The local CI-mode browser control could not launch the pinned Chromium1248 runtime from the existing cache. Use the unchanged default Playwright configuration's local Chrome channel for the full before/after command; retain the setup failure and leave hosted Chromium execution to CI.
- The post-#370 rebase assumed the historical time-overlay commits would replay cleanly onto the accepted UI. Intermediate integration commits carried older action, API and UI snapshots, producing conflicts unrelated to the final reviewed tree. Rebuilt the unchanged overlay by domain as three commits on merged main, dropped the carrier merges and duplicate #370 patch, and retained the old head under a local backup ref for byte comparison.
- Final merge preflight assumed the reviewed base could merge after its checks passed; strict branch protection required the eight newer editorial commits on main. Rebased the four approved time-overlay commits onto current main without conflicts, preserved the newer article, review and action data, and reran checks instead of bypassing protection.

- UIK-01 integration assumed the previously accepted base remained current; timezone PR #372 merged during review, so merge its accepted main without rewriting published UI history and reverify the combined product, model and dependency graph.

- UIK-01 consumer fixtures assumed acceptance branches shared the current policy tip; independent Claude controls showed normal main advancement both rejected valid article-only work and could hide a shared nonarticle change, so validate the PR change set from a unique trusted common ancestor and retain exact file/blob/output guards.
- UIK-01 immediate refresh mocks batched over a real child unmount; delayed refresh with storage denied lost confirmation and frozen retry state. Retain the context projection while marking it unavailable, preserve receipts/in-memory identity, and reconcile only explicit same-submission retries against fresh matching history.
## Deviations — action registry cutover (2026-10-17)

- The migration assumed all historical completions had public IDs; 64 do not. Preserved those public rows and assigned internal keys instead of rewriting historical IDs.
- The approved loop must resume after human revision inputs; removing the bot guard was rejected by automatic approval review. Retained the guard and added a tested exception only for changed feedback from a human sender.
- The live model check initially lacked specific egress authority; automatic approval review blocked it. The operator then authorized the October 17 article, history, relevant documents, and linked GitHub discussions going to Anthropic for a dry run. No canonical state was written.
- Full evidence fetching found an expired GITHUB_TOKEN in the local .env. The authorized test used the working gh login while retaining the existing Anthropic configuration; no credentials were changed or printed.
- Independent review found that draft dispositions could leak into older published articles and become prematurely terminal during acceptance. Bound promotion and rendering to accepted round receipts, required a verdict for every carried identity, and added cross-day lifecycle tests.
- Regenerating the existing static API also refreshes stale committed article metadata from already accepted source articles. Kept this derived output; no historical article prose or action membership was changed.
- Multi-file filesystem renames cannot provide crash atomicity. Added input checks under a lock and rollback for ordinary write failures; Git commit consistency and stale receipt checks remain the publication boundary.
- The first citation design assumed a model could copy exact quotations reliably. Repeated bounded failures disproved that assumption; a per-role census identified the proposer as the quote writer in both failures. Replaced copying with source-line selection resolved by code before independent verification, and enabled strict provider tool decoding.
- The reporting-window handoffs described #372 as draft, but fresh GitHub metadata showed it merged at 19:58:13Z. Bare repository/PR references were missing from collection. Added reference parsing and current-state summaries; the current review completes #372 rather than carrying a stale open instruction.
- The initial October 17 oracle expected the repeated ADR suggestion to be superseded. Independent review correctly distinguishes the earlier formal supersession from this newly repeated disproved premise; dismissed retires the repeat without changing the original historical resolution or counting new completed work.
- Rendering real review evidence exposed raw API metadata and inflated heuristic commit/time counts in the article projection. Kept exact evidence in the registry, displayed concise outcomes and source links in the folded history card, and excluded the managed tracking block from narrative activity/time extraction. A browser regression checks the actual October 17 artifact and its original 26-commit count.
- Browser interception assumed the deployed GitHub proxy preserved query filters. Direct source inspection found that it dropped ref/head/state and inherited public cache headers. Forwarded those filters, disabled proxy/client caching, and added real handler tests that return a different registry SHA for the editorial branch versus main.

- PR #378 merged during the cutover, adding a separate editorial continuation consumer and richer feedback UI. Rebased onto the accepted main and migrated that consumer in the same delivery, including registry-only revisions and deployment triggers.
- Checkbox persistence creates a branch before an acceptance PR exists; #378 treated every such branch as an orphan. Added a complete immutable-tree and inclusion-only proof, then bound acceptance to the proven parent with a non-force Git update.
- Schema-valid current-date history did not establish that either agent ran and could poison the review cache. Replaced that admission predicate with exact trusted workflow output receipts or identified inclusion-only changes, and checked every acceptance head in the existing required CI job. Trusted main remains the human-reviewed authority for ordinary source/data PRs.
- Live GitHub run metadata showed pull_request_target head_sha identifies the PR head, whereas issue_comment identifies the policy head. Bound initial receipts to the recorded PR/base pair and continued receipts to their explicit request and policy, and tested both shapes.
- The growing canonical evidence exceeded the prior Contents-reader bound and will eventually exceed GitHub's inline-content threshold. Added an exact immutable Git-blob read for encoding=none while retaining one canonical registry and SHA-based writes.
- The inherited viewport browser test captured scroll state before pending resize layout settled; waited for the viewport layout before asserting caret and scroll preservation. The production preview also requires building with VITE_BASE_PATH=/, which is now recorded in the proof commands.

- Claude's independent review reproduced a card-shaped HTML escape gap and evidence collection outside the private-repository opt-in policy that earlier tests missed. Added the missing render/proxy and visibility boundary cases before proceeding.
- A required carried-action hold and an unrelated optional closure shared the same fatal path. Optional non-passing changes and bad identity links are now rejected without losing the article; provider failures keep a zero-admission pending draft, and semantic holds do not renegotiate with a second model pair.
- The original monolithic registry stored complete discussions and repeated every history in both prompts. The operator approved replacing growing shared state with a frozen baseline plus bounded article files, within the same cutover.
