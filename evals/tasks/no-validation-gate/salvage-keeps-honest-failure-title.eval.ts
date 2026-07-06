/**
 * Golden task: salvage-keeps-honest-failure-title
 * Cluster:  failure:no-validation-gate (failure-taxonomy v1, cluster 1)
 * Evidence: origin/article/2026-07-03 decision — "'Invalid data' is a symptom,
 *           not a diagnosis; the error branch must capture where in the
 *           pipeline validation failed" — the failure must stay NAMED, not be
 *           dressed up as a normal post.
 *
 * Guarantee pinned: the salvage path (partial object, some fields usable)
 * must self-identify as a partial failure when it has no real title — it may
 * rescue fields, but it may not fabricate a healthy-looking article.
 *
 * Known open hole (documented, NOT asserted — see evals/README.md "Honest
 * gaps"): salvage trusts any string `title`, so a prompt-fragment title would
 * survive. The structural fix (staged runners) is deliberately deferred per
 * the taxonomy's root-cause note.
 */

import { describe, it, expect } from 'vitest'
import { validateArticleOutput } from '../../../src/schema.js'

describe('failure:no-validation-gate — salvage names the failure instead of faking health', () => {
  it('empty object salvages to a v2 record titled as a partial failure', () => {
    const result = validateArticleOutput({}, '2026-07-04')
    expect(result.version).toBe(2)
    if (result.version !== 2) return
    expect(result.data.title).toBe('Generation partially failed — 2026-07-04')
    expect(result.data.summary).toContain('invalid structured data')
  })

  it('salvage does not invent activity: counts zeroed, lists empty', () => {
    const result = validateArticleOutput({}, '2026-07-04')
    if (result.version !== 2) throw new Error('expected salvaged v2')
    expect(result.data.commitCount).toBe(0)
    expect(result.data.whatShipped).toEqual([])
    expect(result.data.decisions).toEqual([])
    expect(result.data.suggestedActions).toEqual([])
    expect(result.data.reposActive).toEqual([])
  })

  it('real scalar fields survive salvage unchanged', () => {
    const result = validateArticleOutput(
      { title: 'Pipeline failure — Friday, 2026-07-04', summary: 'Honest incident summary.' },
      '2026-07-04',
    )
    if (result.version !== 2) throw new Error('expected salvaged v2')
    expect(result.data.title).toBe('Pipeline failure — Friday, 2026-07-04')
    expect(result.data.summary).toBe('Honest incident summary.')
  })

  it('salvage discards malformed collections rather than passing them through', () => {
    const result = validateArticleOutput(
      { tags: 'not-an-array', whatShipped: { repo: 'x' }, decisions: 42 },
      '2026-07-04',
    )
    if (result.version !== 2) throw new Error('expected salvaged v2')
    expect(result.data.tags).toEqual([])
    expect(result.data.whatShipped).toEqual([])
    expect(result.data.decisions).toEqual([])
  })
})
