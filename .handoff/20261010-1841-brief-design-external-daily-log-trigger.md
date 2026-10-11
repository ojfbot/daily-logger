---
id: 20261010-1841-brief-design-external-daily-log-trigger
type: brief
title: "Design external daily-log trigger"
actor: code-codex
to: ojfbot
session_id: "2026-10-10T18:41:38Z"
refs:
  - github:ojfbot/core#521
  - github:ojfbot/daily-logger#332
hook: github:ojfbot/core#521
status: live
created_at: "2026-10-10T18:41:38Z"
labels:
  project: core
  stage: design
  autonomy: human_only
  autonomy_gate: gate-0
---

## Context

Origin: User request for a forked external workflow_dispatch design session. Canonical evidence and scope: https://github.com/ojfbot/core/issues/521. This is a retained obligation, not completed delivery.

## Goal

Continue the core design discussion linked from issue #521; design reliable 03:30 America/Chicago dispatch without changing the live schedule here.

## Acceptance criteria

- [ ] Separate scheduled, created, started, finished and published timing using actual runs.
- [ ] Specify DST, credentials, hosting, retries, fallback/idempotence, SLO and rollback.
- [ ] No live dispatch, purchase or deployment before reviewed design and explicit implementation authority.

## References

- github:ojfbot/core#521
- github:ojfbot/daily-logger#332

## Flag back

Human-only gate-0. Do not convert this brief to an autonomous claim, accept an ADR, merge, spend money, mutate administration, or expand scope without the operator's applicable authority. Report contradictory evidence or missing decisions.
