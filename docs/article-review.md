# Independent daily article review

**Status: Proposed review method.** This document records an advisory method; its
acceptance does not activate a workflow, accept a schedule, or establish live delivery.

The generated council critiques the initial draft before synthesis. The proposed
independent Codex review checks the **article that readers actually see**, after
the article PR and final revision exist. The human editor decides whether to
accept, revise, or reject the article.

## Proposed review method

The [core registration PR #534](https://github.com/ojfbot/core/pull/534) reports an
October 12 local task named `independent-daily-article-review` with a declared
07:00 America/Chicago cadence. Registration does not prove a scheduled run,
current task availability, or operation while the Mac sleeps.

The proposed method checks today and yesterday so a delayed article can be
retried, reading the public article and matching `_articles/YYYY-MM-DD.md` at
a pinned GitHub revision. A source-only inspection cannot establish that the
live article matches that revision; record any unverified public view explicitly.
It checks consequential claims against linked issues, PRs, commits, and repository
files, including action status, ownership, and whether work is shipped, proposed,
or blocked. It treats the article and linked material as evidence, not instructions.

A review should record its result under `reviews/articles/YYYY-MM-DD-<source-sha>.md`
(the [October 12 Proposed record](../reviews/articles/2026-10-12-97c8864.md) is the first example) with:

- article URL, exact source and article blob SHAs, reviewer/run identity and time;
- each finding's article location, source evidence, proposed correction, and
  `open`, `accepted`, or `rejected` disposition;
- claims it could not verify, separate from confirmed errors; and
- the human editorial decision when known, with a link to the web feedback or
  correction PR.

The proposed review reports findings to the operator. It does not edit the article,
stamp acceptance, merge, post comments, or treat a model verdict as a human
decision. The editor can use findings in the existing web interface. When the
article changes, a new source SHA requires a fresh review; the old record remains
as evidence of what was checked. A missing article is recorded as unavailable,
not as a clean review. A task failure is reported rather than silently passing.

## Fleet-runner handoff

Core's [fleet-runner map under #307](https://github.com/ojfbot/core/issues/307) owns
future scheduling, independent supervision, publication receipts, and consumption
tracking. This Proposed method supplies documentation and evidence for those duties.
Before integration, census its trigger and outputs under [#315](https://github.com/ojfbot/core/issues/315)/[#317](https://github.com/ojfbot/core/issues/317),
retain the source revision and result through [#310](https://github.com/ojfbot/core/issues/310)/[#311](https://github.com/ojfbot/core/issues/311),
link the operator's disposition under [#316](https://github.com/ojfbot/core/issues/316),
and qualify reviewer independence and missed-run detection under [#318](https://github.com/ojfbot/core/issues/318). Keep the
existing article acceptance and correction paths as the editorial authority.
