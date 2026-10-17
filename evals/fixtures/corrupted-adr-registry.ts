/**
 * Fixture: the corrupted ADR-registry slice that broke the drafter in July.
 *
 * Replayed from the real failure (`origin/article/2026-07-03` and `-04`
 * postmortems, failure-taxonomy v1 cluster `failure:no-validation-gate`):
 * the injected registry carried one asset-foundry entry cut mid-word
 * (`0004-narrow-su` — the real file is 0004-narrow-subagent-boundaries.md)
 * and three entries (0005–0007) with file paths only: no title, no status.
 *
 * This is a representative SLICE with the real truncation patterns, not the
 * full 162-entry dump (fixture-hygiene rule, evals/README.md). Healthy
 * entry 0012 keeps its actual asset-foundry title/status. This small slice
 * keeps all corruption examples inside the 1,500-character diagnostic prefix.
 */

import type { ADRRegistryEntry, BlogContext } from '../../src/types.js'

export const CORRUPTED_ADR_REGISTRY: ADRRegistryEntry[] = [
  // ── the corruption, verbatim patterns from the July failure ──
  {
    repo: 'asset-foundry',
    path: 'decisions/adr/0004-narrow-su', // cut mid-word, extension lost
    name: '0004-narrow-su',
    number: 4,
  },
  {
    repo: 'asset-foundry',
    path: 'decisions/adr/0005-langgraph-pattern-from-cv-builder.md',
    name: '0005-langgraph-pattern-from-cv-builder.md',
    number: 5,
    // title-less, status-less — exactly how ingestion emitted it
  },
  {
    repo: 'asset-foundry',
    path: 'decisions/adr/0006-target-workspace-model.md',
    name: '0006-target-workspace-model.md',
    number: 6,
  },
  {
    repo: 'asset-foundry',
    path: 'decisions/adr/0007-game-agnostic-contract.md',
    name: '0007-game-agnostic-contract.md',
    number: 7,
  },
  // One healthy entry keeps the real title/status control.
  {
    repo: 'asset-foundry',
    path: 'decisions/adr/0012-research-curator-subagent.md',
    name: '0012-research-curator-subagent.md',
    number: 12,
    title: 'ResearchCurator — vision-driven design brief sub-agent',
    status: 'Proposed',
  },
]

/**
 * A BlogContext replaying the failed 2026-07-03 run: a normal commit window
 * plus the corrupted registry injected the way collect-context injected it.
 */
export function corruptedRegistryContext(date = '2026-07-03'): BlogContext {
  return {
    date,
    repos: ['daily-logger', 'asset-foundry'],
    commits: [
      {
        hash: 'a1b2c3d',
        message: 'feat: work from the failed window',
        author: 'yuri',
        date: `${date}T09:00:00Z`,
        repo: 'asset-foundry',
        url: 'https://github.com/ojfbot/asset-foundry/commit/a1b2c3d',
      },
    ],
    mergedPRs: [],
    openPRs: [],
    recentPRs: [],
    closedIssues: [],
    openIssues: [],
    openActions: [],
    projectVision: '',
    previousArticles: [],
    adrRegistry: CORRUPTED_ADR_REGISTRY,
  }
}
