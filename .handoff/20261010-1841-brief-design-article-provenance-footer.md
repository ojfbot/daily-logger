---
id: 20261010-1841-brief-design-article-provenance-footer
type: brief
title: "Design article provenance footer"
actor: code-codex
to: ojfbot
session_id: "2026-10-10T18:41:38Z"
refs:
  - github:ojfbot/daily-logger#335
  - url:https://github.com/ojfbot/daily-logger/pull/332#issuecomment-6100214121
  - github:ojfbot/core#520
hook: github:ojfbot/daily-logger#335
status: live
created_at: "2026-10-10T18:41:38Z"
labels:
  project: daily-logger
  stage: design
  autonomy: human_only
  autonomy_gate: gate-0
---

## Context

Origin: PR #332 tangent comment 6100214121. Canonical evidence and scope: https://github.com/ojfbot/daily-logger/issues/335. This is a retained obligation, not completed delivery.

## Goal

Define and implement a thin article-provenance slice from actual generation/revision metadata through persisted API to public/authenticated footer.

## Acceptance criteria

- [ ] Agree public/authenticated metadata and authorization contract before implementation.
- [ ] Persist actual authoring model, prompt version and runtime fields; historical unknowns are explicit, never invented.
- [ ] Ship and verify a reviewed end-to-end slice with no credential disclosure.

## References

- github:ojfbot/daily-logger#335
- url:https://github.com/ojfbot/daily-logger/pull/332#issuecomment-6100214121
- github:ojfbot/core#520

## Flag back

Human-only gate-0. Do not convert this brief to an autonomous claim, accept an ADR, merge, spend money, mutate administration, or expand scope without the operator's applicable authority. Report contradictory evidence or missing decisions.
