/**
 * Golden task: prompt-echo-string-never-salvaged
 * Cluster:  failure:no-validation-gate (failure-taxonomy v1, cluster 1)
 * Evidence: origin/article/2026-07-04 — "the raw prompt context, including a
 *           truncated ADR registry dump, was surfaced instead of a rendered
 *           article"; on 07-04 that output reached publication.
 *
 * Guarantee pinned: when the raw output IS the prompt (a string echo — the
 * exact 07-04 failure shape), validation must refuse to treat it as an
 * article at any schema version. The only legal exit is the failure stub.
 */

import { describe, it, expect } from 'vitest'
import { validateArticleOutput } from '../../../src/schema.js'
import { buildUserPrompt } from '../../../src/generate-article.js'
import { corruptedRegistryContext } from '../../fixtures/corrupted-adr-registry.js'

describe('failure:no-validation-gate — a prompt echo is never salvaged into an article', () => {
  const promptEcho = buildUserPrompt(corruptedRegistryContext('2026-07-04'))

  it('string output (the prompt itself) lands on the stub, not v2', () => {
    const result = validateArticleOutput(promptEcho, '2026-07-04')
    expect(result.version).toBe('stub')
  })

  it('the stub declares failure instead of masquerading as prose', () => {
    const result = validateArticleOutput(promptEcho, '2026-07-04')
    if (result.version !== 'stub') throw new Error('expected stub')
    expect(result.data.title).toContain('Generation failed')
    expect(result.data.summary).toContain('2026-07-04')
  })

  it('an array echo cannot masquerade as a healthy article', () => {
    // Arrays enter the salvage branch (typeof [] === 'object') — legal, but
    // the salvaged record must carry the partial-failure title, no echo.
    const result = validateArticleOutput([promptEcho], '2026-07-04')
    expect(result.version).toBe(2)
    if (result.version !== 2) return
    expect(result.data.title).toBe('Generation partially failed — 2026-07-04')
    expect(result.data.whatShipped).toEqual([])
  })

  it('undefined output is also refused', () => {
    const result = validateArticleOutput(undefined, '2026-07-04')
    expect(result.version).toBe('stub')
  })
})
