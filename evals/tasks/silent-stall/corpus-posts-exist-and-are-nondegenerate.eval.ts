/**
 * Golden task: corpus-posts-exist-and-are-nondegenerate
 * Cluster:  failure:silent-stall (failure-taxonomy v1, cluster 4)
 * Evidence: "Twenty-two green runs, zero articles" (_articles/2026-06-10.md)
 *           — green measured "job ran", not "post exists"; 82 unmerged
 *           article/* branches while on-disk _articles/ ended 2026-06-11.
 *
 * Guarantee pinned: "post exists" is machine-checked, not inferred from a
 * green run. Every committed article is a real post — parseable frontmatter,
 * a title, a date that matches its filename, and a non-degenerate body —
 * so a zero-byte or husk article can never sit in the corpus reading green.
 */

import { describe, it, expect } from 'vitest'
import { listArticles, readArticle, parseFrontmatter } from '../../harness.js'

// Smallest real post in the corpus at seeding time was ~5000 chars of body;
// 500 is a loose floor that still catches husks without gating short rest-day posts.
const MIN_BODY_CHARS = 500

describe('failure:silent-stall — every committed post exists and is non-degenerate', () => {
  const articles = listArticles()

  it('the corpus is non-empty — "ran" without "post exists" reads red here', () => {
    expect(articles.length).toBeGreaterThan(0)
  })

  it.each(articles)('%s parses, is dated correctly, and has a real body', (name) => {
    const raw = readArticle(name)
    const parsed = parseFrontmatter(raw)
    expect(parsed, `${name}: frontmatter block missing`).not.toBeNull()
    if (!parsed) return

    expect(parsed.fields.title, `${name}: empty title`).toBeTruthy()
    expect(parsed.fields.date, `${name}: date/filename mismatch`).toBe(name.replace(/\.md$/, ''))
    expect(
      parsed.body.trim().length,
      `${name}: degenerate body (${parsed.body.trim().length} chars)`,
    ).toBeGreaterThanOrEqual(MIN_BODY_CHARS)
  })
})
