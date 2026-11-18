# DailyLogger service delivery plan

DailyLogger will become a public engineering journal with a persistent agent backend and a web application in this repository. The journal should explain meaningful CircusGreen fleet progress, use current human-confirmed priorities, and preserve useful follow-up work without repeating it into every article.

The owner selected LangSmith as the primary observability and evaluation platform on 2026-11-18, superseding the 2026-11-17 Langfuse selection. The target is a TypeScript LangGraph application running on owner-controlled infrastructure, with the existing public website continuing to serve readers independently of that infrastructure. Protected journal sections are a separate, later delivery phase.

## Plan and architecture

- [Delivery roadmap](delivery-roadmap.md) defines milestones, implementation slices, acceptance evidence, dependencies, and rollback.
- [Application architecture](architecture.md) defines package boundaries, deployment, persistence, workflow behavior, observability, and fleet interfaces.
- [Review reconciliation](review-reconciliation.md) records Yuri's findings, attributed delivery choices, and the corrections to initial acceptance, failover, timing, and Cleaner admission.
- [M1A verification](m1a-verification-2026-11-17.md) records the offline checkpoint and existing-reader proof, with its limits.

This is an implementation proposal. LangSmith, the public-journal purpose, and keeping the web app and backend together are owner direction; package names and the supporting technology choices below are proposed implementation decisions. No service deployment, runtime migration, schedule change, or shared fleet contract acceptance is recorded by these documents.

## Delivery outcomes

| Milestone | Observable outcome |
| --- | --- |
| M0 | A recorded baseline and a small, approved priority snapshot replace ambiguous product assumptions in the service design. |
| M1 | M1A first proves an offline persisted workflow through the existing reader; M1B adds authenticated controls, production-target storage integration, and LangSmith qualification. |
| M2 | A real collected day produces a reviewed journal draft through the service, with bounded model usage and a human checkpoint. |
| M3 | The service produces a passing public Draft by the 04:00 Chicago readback target, with exact-version acceptance through the existing editor and fenced manual failover. Cleaner qualifies after Publisher. |
| M4 | A weekly human check-in updates journal priorities; additional reviewers and follow-up planners demonstrate measurable value. |
| M5 | Existing action and decision records participate in qualified FleetRunner, HelpDesk, and MorningCockpit integrations without losing identity or authority. |
| M6 | Authenticated owner-only journal content becomes available after its security and recovery requirements are demonstrated. |

M1 starts alongside M0 editorial work. M3 is the first unattended operating service; M1 and M2 are working application milestones before that cutover. Full fleet integration and protected content do not block M1–M3.

## Baseline and existing work

The original planning checkout is `e91cf6b2d66f752c92bb5d3bcfdc599f45a3d027`; it was 95 commits behind its then-stale tracking branch. On review pickup, `origin/main` was refreshed to [`8b6263a`](https://github.com/ojfbot/daily-logger/tree/8b6263ad9a798eae20b3573546cf0ae762bff661) and an isolated `codex/dailylogger-service-m1` worktree was created there. Source-backed reconciliation and the offline slice use that refreshed baseline; the original working changes are preserved.

- [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) already includes `packages/*`; the existing frontend is [`packages/frontend`](../../packages/frontend/package.json). The old instruction prohibiting a monorepo was inconsistent with that layout and is superseded by the owner's requested direction.
- [`src/index.ts`](../../src/index.ts), [`src/council.ts`](../../src/council.ts), and the [daily workflow](../../.github/workflows/daily-blog.yml) implement the current generation path. Extract and reuse their domain behavior rather than recreating it from prompts.
- [PR #549](https://github.com/ojfbot/daily-logger/pull/549) was open and non-draft on inspection. It improves roadmap framing and the initiatives snapshot; it is not yet an implementation of weekly context maintenance. Reconcile it as existing work rather than opening a duplicate prompt rewrite.
- [Action intake](../action-intake.md), [action recovery](../action-recovery.md), and [ADR-0040](../../decisions/adr/0040-verified-article-action-registry.md) govern current action identities, independent verification, holds, and canonical storage.
- The [golden evaluation suite](../../evals/README.md) already contains real-failure regression cases and has an advisory promotion policy. Preserve that policy.
- Core's [July integration plan](https://github.com/ojfbot/core/blob/main/docs/audits/AGENTIC-INTEGRATION-PLAN-2026-07-04.md) is prior work on telemetry identities and feedback. Its historical gap assessments must be rechecked before reuse.
- Core's [MC-UX-01 crosswalk](https://github.com/ojfbot/core/blob/main/decisions/fleet-runner/mc-ux-01-domain-crosswalk.md) is a proposed source-preserving profile, not an accepted universal event schema. [ADR-0108](https://github.com/ojfbot/core/blob/main/decisions/adr/0108-fleet-runner-in-core.md) establishes ownership boundaries; qualify actual integration interfaces against current core work.

The root [`ROADMAP.md`](../../ROADMAP.md) is currently consumed as generation context. This delivery plan lives separately so its future architecture is not accidentally presented as shipped fleet progress. M0 explicitly addresses replacing that truncated narrative input with a versioned context contract.
