/**
 * Golden task: null-tool-output-yields-stub
 * Cluster:  failure:no-validation-gate (failure-taxonomy v1, cluster 1)
 * Evidence: origin/article/2026-07-03 — generator fed the corrupted 162-entry
 *           ADR registry produced no valid `write_article` tool output; what
 *           routed onward was raw prompt context, not an article.
 *
 * Guarantee pinned: when the model returns no usable tool output (null), the
 * validation ladder must land on the HONEST FAILURE STUB — date-stamped title
 * naming the failure, raw context attached and capped — never a v1/v2 article.
 */

import { describe, it, expect } from 'vitest'
import { validateArticleOutput } from '../../../src/schema.js'
import { buildUserPrompt } from '../../../src/generate-article.js'
import { corruptedRegistryContext } from '../../fixtures/corrupted-adr-registry.js'

describe('failure:no-validation-gate — null tool output yields the honest stub', () => {
  const ctx = corruptedRegistryContext('2026-07-03')
  const promptSnippet = buildUserPrompt(ctx).slice(0, 1500)

  it('routes null output to the stub branch, never v1/v2', () => {
    const result = validateArticleOutput(null, '2026-07-03', promptSnippet)
    expect(result.version).toBe('stub')
  })

  it('stub names the failure and the date in title and summary', () => {
    const result = validateArticleOutput(null, '2026-07-03', promptSnippet)
    if (result.version !== 'stub') throw new Error('expected stub')
    expect(result.data.title).toBe('Generation failed — 2026-07-03')
    expect(result.data.summary).toContain('invalid data')
    expect(result.data.date).toBe('2026-07-03')
  })

  it('stub preserves the raw context for diagnosis (the corrupted registry is visible)', () => {
    const result = validateArticleOutput(null, '2026-07-03', promptSnippet)
    if (result.version !== 'stub') throw new Error('expected stub')
    // the real truncation pattern from the July failure must be diagnosable
    expect(result.data.rawContext).toContain('0004-narrow-su')
  })

  it('stub raw context is capped, never the wholesale dump', () => {
    const result = validateArticleOutput(null, '2026-07-03', buildUserPrompt(ctx).slice(0, 1500))
    if (result.version !== 'stub') throw new Error('expected stub')
    expect(result.data.rawContext.length).toBeLessThanOrEqual(2000)
  })
})
