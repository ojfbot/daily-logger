# Implementation notes

## Deviations

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
