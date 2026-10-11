---
id: 20261010-2223-brief-reproduce-editorial-feedback-delimiters
type: brief
title: "Reproduce editorial feedback delimiters"
actor: code-codex
to: ojfbot
session_id: "2026-10-10T22:23:15Z"
refs:
  - github:ojfbot/daily-logger#339
  - github:ojfbot/daily-logger#334
  - github:ojfbot/daily-logger#337
hook: github:ojfbot/daily-logger#339
status: live
created_at: "2026-10-10T22:23:15Z"
labels:
  project: daily-logger
  autonomy: human_only
  autonomy_gate: gate-0
  owner: ojfbot
---

## Context

Claude's #337 review identifies a preexisting raw-Markdown boundary risk. Issue #339 is assigned to ojfbot; Available human-only gate-0 Dolt bead dail-task-0382914e retains it. This is not a proven production exploit and is not fixed by the storage change.

## Goal

Reproduce delimiter/heading/marker-like notes through the real stamper and editorial revision parser, then choose the smallest compatible representation preserving literal content and attribution.

## Acceptance criteria

- Parser-level positive and counterexample evidence for separators, headings and feedback markers.
- Backward-compatible editorial payload, with exact note/section attribution retained.
- Existing trusted-base article-only validation remains intact; normal CI and deployed verification precede closure.

## References

- github:ojfbot/daily-logger#339
- url:https://github.com/ojfbot/daily-logger/pull/337#pullrequestreview-5480607203

## Flag back

No autonomous claim, dispatch, live revision or merge. Owner review needed for a new representation. Requested checkpoint October 11 17:00 America/Chicago or explicit next-review date, not an agreed deadline.
