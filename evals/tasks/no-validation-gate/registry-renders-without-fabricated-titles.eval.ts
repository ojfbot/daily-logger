/**
 * Golden task: registry-renders-without-fabricated-titles
 * Cluster:  failure:no-validation-gate (failure-taxonomy v1, cluster 1)
 * Evidence: origin/article/2026-07-03 — "ADR-0004 through ADR-0007 have no
 *           titles or status in the registry — only file paths"; -04 — "ADR
 *           registry ingestion emitting title-less partial records".
 *
 * Guarantee pinned: prompt assembly is FAITHFUL to its input. Corrupted
 * entries render exactly as ingested — truncated path verbatim, no invented
 * title/status — and the guard instruction that makes the registry
 * authoritative ground truth is always attached. (The upstream ingestion
 * gate itself is the deferred structural fix; this pins that the prompt
 * layer at least never compounds corruption by fabricating data.)
 */

import { describe, it, expect } from 'vitest'
import { buildUserPrompt } from '../../../src/generate-article.js'
import {
  CORRUPTED_ADR_REGISTRY,
  corruptedRegistryContext,
} from '../../fixtures/corrupted-adr-registry.js'

describe('failure:no-validation-gate — registry renders without fabricated titles', () => {
  const prompt = buildUserPrompt(corruptedRegistryContext('2026-07-03'))

  it('registry section header carries the true entry count', () => {
    expect(prompt).toContain(
      `## ADR REGISTRY — every ADR file in every swept repo (${CORRUPTED_ADR_REGISTRY.length} total)`,
    )
  })

  it('the mid-word truncation renders verbatim — never silently repaired', () => {
    expect(prompt).toContain('`decisions/adr/0004-narrow-su`')
    // and the repaired form must NOT appear — that would be fabrication
    expect(prompt).not.toContain('0004-narrow-subagent-boundaries')
  })

  it('title-less entries render with path only — no invented title or status', () => {
    const adr5 = prompt.split('\n').find((l) => l.startsWith('- ADR-0005'))
    expect(adr5).toBeDefined()
    expect(adr5).not.toContain(' — ') // no title separator
    expect(adr5).not.toContain('[') // no status bracket
    expect(adr5).toContain('`decisions/adr/0005-langgraph-pattern-from-cv-builder.md`')
  })

  it('healthy entries keep their real title and status', () => {
    expect(prompt).toContain(
      '- ADR-0012 [Proposed] — ResearchCurator — vision-driven design brief sub-agent',
    )
  })

  it('the ground-truth guard instruction is attached to the registry', () => {
    expect(prompt).toContain('_Authoritative ground truth. If you reference an ADR, it MUST appear here.')
  })
})
