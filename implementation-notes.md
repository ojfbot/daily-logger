# Implementation notes

## Deviations

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

## Deviations — bounded historical action settlement 2026-10-08

- The first candidate list included f1-doctrine's S1 merge request; its specific compute-boundary ADR is absent at the recorded merge revision. Kept that compound suggestion open rather than using the merge alone to claim its prerequisite was fulfilled. Selected nine additional evidenced suggestions, alongside #319's existing two, for eleven original action IDs total.
- Historical cleaner suggestions name terminal mixed merged/closed PR cohorts and sometimes an ongoing queue-age target. Recorded their bounded batch instruction as superseded, preserving closure reasons and explicitly avoiding a claim that unmerged edits shipped or today's queue meets the old age target.
