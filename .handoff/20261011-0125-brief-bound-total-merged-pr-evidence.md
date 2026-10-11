---
id: 20261011-0125-brief-bound-total-merged-pr-evidence
type: brief
title: "Bound total merged-PR evidence across article and report prompts"
actor: code-codex
to: ojfbot
session_id: "2026-10-11T01:25:56Z"
refs:
  - github:ojfbot/daily-logger#342
  - url:https://github.com/ojfbot/daily-logger/pull/338#pullrequestreview-5481437254
  - bead:dail-task-668d8882
hook: github:ojfbot/daily-logger#342
status: live
created_at: "2026-10-11T01:25:56Z"
labels:
  project: daily-logger
  autonomy: human_only
  autonomy_gate: gate-0
  owner: ojfbot
---

## Context

Claude Code's final October 10 review recommended this non-blocking follow-up. Canonical issue #342 is assigned to ojfbot; existing Dolt task dail-task-668d8882 was read back as created/Available, human-only gate-0. No claim or dispatch.

## Goal

Choose and enforce a total merged-evidence character budget in both article and report drafting, with deterministic title-only fallbacks and declared omissions.

## Acceptance criteria

- [ ] Record named budget and ordering rationale; preserve source/title links after exhaustion.
- [ ] Test disjoint maximum-size weekly/recent cohorts, duplicate identities, missing/short bodies and exact bounds in both drafters.
- [ ] Report character budgets as characters, not measured token usage; claim neither semantic completeness nor injection prevention.

## References

- github:ojfbot/daily-logger#342
- url:https://github.com/ojfbot/daily-logger/pull/338#pullrequestreview-5481437254
- bead:dail-task-668d8882

## Flag back

Human-only gate-0. Operator authorization to merge #337/#338/#340 does not authorize autonomous future implementation/merge of this follow-up. Request a review by October 11 17:00 America/Chicago or an explicit next-review date; this is not an agreed deadline, expiry is not closure, and no reminder is armed.
