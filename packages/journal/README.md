# Shared journal rules

This dependency-free package contains the existing reporting-window and run-gate
logic. The compatibility modules at `src/activity-window.ts` and
`src/should-skip-run.ts` keep the current CLI imports and `BlogContext` signature.
The CLI is the existing operational consumer; service-image qualification proves
the backend can import the same package. Journal graph wiring remains separate.

The public entry points are `@ojfbot/daily-logger-journal/activity-window` and
`@ojfbot/daily-logger-journal/eligibility`. They export source TypeScript for the
repository's existing `tsx` runtime. No compiled package build, provider client,
environment configuration or filesystem access is required.

Eligibility accepts only the observed fields it reads. This structural interface
does not validate a captured context or grant authority. The rules preserve the
consecutive Chicago 03:30 cutoffs, inclusive start/exclusive end, DST behavior,
generated article/editorial exclusions and cleaner merge treatment. The caller
still owns `DRY_RUN`/`FORCE_RUN` bypasses and retains all collected context.

Run `pnpm type-check:journal`, `pnpm lint:journal` and `pnpm test:journal` from the
repository root. The last command runs the existing unchanged window and gate
tests through the compatibility imports. The final-image smoke independently
imports both installed package entry points with no network or host-source
mounts. Runtime context includes only the committed manifest and two explicit
source files; tests, host output and unrelated files stay outside that boundary.
