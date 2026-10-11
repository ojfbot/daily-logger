---
id: 20261011-0125-brief-automate-editorial-browser-regression
type: brief
title: "Automate the editorial add/reload/remove browser regression"
actor: code-codex
to: ojfbot
session_id: "2026-10-11T01:25:56Z"
refs:
  - github:ojfbot/daily-logger#341
  - url:https://github.com/ojfbot/daily-logger/pull/337#pullrequestreview-5481437222
  - bead:dail-task-1873c78c
hook: github:ojfbot/daily-logger#341
status: live
created_at: "2026-10-11T01:25:56Z"
labels:
  project: daily-logger
  autonomy: human_only
  autonomy_gate: gate-0
  owner: ojfbot
---

## Context

Claude Code's final October 10 review recommended this non-blocking follow-up. Canonical issue #341 is assigned to ojfbot; existing Dolt task dail-task-1873c78c was read back as created/Available, human-only gate-0. No claim or dispatch.

## Goal

Add a repeatable authenticated browser add-two-notes/reload/remove-one test with intercepted submission, without a live editorial PR.

## Acceptance criteria

- [ ] Test independently editable notes, persistence, removal and exact ordered HTTP payload.
- [ ] Demonstrate relevant failure before the fix and success after it; provide local/CI command.
- [ ] Keep production credentials and live PR creation out of the test.

## References

- github:ojfbot/daily-logger#341
- url:https://github.com/ojfbot/daily-logger/pull/337#pullrequestreview-5481437222
- bead:dail-task-1873c78c

## Flag back

Human-only gate-0. Operator authorization to merge #337/#338/#340 does not authorize autonomous future implementation/merge of this follow-up. Request a review by October 11 17:00 America/Chicago or an explicit next-review date; this is not an agreed deadline, expiry is not closure, and no reminder is armed.
