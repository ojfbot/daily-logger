# Shared journal rules

This package contains the existing reporting-window, run-gate and article-schema
definitions. Root compatibility modules preserve current CLI imports, validation
fallbacks, action IDs and the `BlogContext` signature. The service's recorded-draft
adapter uses the same V2 definitions without the CLI's salvage ladder. Journal
graph wiring remains separate.

The public subpaths under `@ojfbot/daily-logger-journal` are `activity-window`,
`eligibility`, `article-schema`, `action-item-schema` and `shipment-reference`.
They export source TypeScript for the repository's existing `tsx` runtime. The
only package dependency is the already-resolved Zod 4.3.6. No provider client,
environment configuration, filesystem access or separate package build is needed.

Eligibility accepts only the observed fields it reads. This structural interface
does not validate a captured context or grant authority. The rules preserve the
consecutive Chicago 03:30 cutoffs, inclusive start/exclusive end, DST behavior,
generated article/editorial exclusions and cleaner merge treatment. The caller
still owns `DRY_RUN`/`FORCE_RUN` bypasses and retains all collected context.

Article schema definitions are unchanged. They strip unknown object fields and
retain existing defaults and optional status/outcome fields. Parsing a V2 object
does not establish truthful content, a valid reporting interval, human approval,
publication permission or action admission. The legacy `validateArticleOutput`
still tries V2, V1 and salvage before producing a stub; it remains in `src/schema.ts`.

Run `pnpm type-check:journal`, `pnpm lint:journal` and `pnpm test:journal` from the
repository root. Tests cover unchanged CLI behavior and shared schema identity.
Final-image smoke imports all installed subpaths and validates a synthetic
recorded draft with no network or host-source mounts. Runtime context includes
only the committed manifest and five explicit source files; tests, host output
and unrelated files stay outside that boundary.
