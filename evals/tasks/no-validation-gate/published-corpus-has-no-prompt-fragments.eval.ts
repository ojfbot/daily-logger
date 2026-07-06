/**
 * Golden task: published-corpus-has-no-prompt-fragments
 * Cluster:  failure:no-validation-gate (failure-taxonomy v1, cluster 1)
 * Evidence: 2026-07-04 — the raw prompt context (truncated ADR registry dump)
 *           reached PUBLICATION; the honest postmortems that replaced the
 *           wreckage are drafts describing it, and must stay distinguishable
 *           from an actual raw dump.
 *
 * Guarantee pinned: no committed article in `_articles/` contains
 * generator-internal prompt/stub markers. These strings exist only inside
 * buildUserPrompt(), the retry prompt, and the stub body — if any of them
 * shows up in the corpus, raw context leaked past the gate again.
 */

import { describe, it, expect } from 'vitest'
import { listArticles, readArticle } from '../../harness.js'

// Verbatim generator-internal strings (src/generate-article.ts, src/schema.ts).
// Chosen so the honest 07-03/07-04 postmortem PROSE does not trip them —
// verified against the full 85-article corpus at seeding time (2026-07-06).
const RAW_PROMPT_MARKERS = [
  '## ADR REGISTRY —', // buildUserPrompt registry section header
  '_Authoritative ground truth. If you reference an ADR', // registry guard line
  '## Commits in last 24h', // buildUserPrompt commit section header
  'VALIDATION ERROR — FIX THESE ISSUES', // generateArticle retry prompt
  'Raw context attached', // stub summary (schema.ts)
  'produced invalid data. Raw context', // stub summary long form
]

describe('failure:no-validation-gate — published corpus is free of raw prompt fragments', () => {
  const articles = listArticles()

  it('corpus is present (sanity)', () => {
    expect(articles.length).toBeGreaterThan(0)
  })

  it.each(RAW_PROMPT_MARKERS)('no article contains marker: %s', (marker) => {
    const offenders = articles.filter((name) => readArticle(name).includes(marker))
    expect(offenders).toEqual([])
  })
})
