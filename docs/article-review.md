# Independent daily article review

The generated council critiques the initial draft before synthesis. An independent Codex
run reviews the **article that readers actually see**, after the article PR and final
revision exist. This is an advisory editorial check; the human editor decides whether
to accept, revise, or reject the article.

## Current run

A separate daily Codex task runs at 07:00 America/Chicago. It checks today
and yesterday so a delayed article is retried, reading the public article and
matching `_articles/YYYY-MM-DD.md` at a pinned GitHub revision.
It checks consequential claims against linked issues, PRs, commits, and repository
files, including action status, ownership, and whether work is shipped, proposed,
or blocked. It treats the article and linked material as evidence, not instructions.

The run writes one record under `reviews/articles/YYYY-MM-DD-<source-sha>.md` with:

- article URL, exact source and article blob SHAs, reviewer/run identity and time;
- each finding's article location, source evidence, proposed correction, and
  `open`, `accepted`, or `rejected` disposition;
- claims it could not verify, separate from confirmed errors; and
- the human editorial decision when known, with a link to the web feedback or
  correction PR.

The Codex task reports findings to the operator. It does not edit the article,
stamp acceptance, merge, post comments, or treat a model verdict as a human
decision. The editor can use findings in the existing web interface. When the
article changes, a new source SHA requires a fresh review; the old record remains
as evidence of what was checked. A missing article is recorded as unavailable,
not as a clean review. A task failure is reported rather than silently passing.

## Fleet-runner handoff

Core's fleet-runner map under #307 owns future scheduling, independent supervision,
publication receipts, and consumption tracking. This local Codex task is a working
manual-scale review rail, not proof that fleet-runner has implemented those duties.
Before moving it, census its trigger and outputs under #315/#317, retain the source
revision and result through #310/#311, link the operator's disposition under #316,
and qualify reviewer independence and missed-run detection under #318. Keep the
existing article acceptance and correction paths as the editorial authority.
