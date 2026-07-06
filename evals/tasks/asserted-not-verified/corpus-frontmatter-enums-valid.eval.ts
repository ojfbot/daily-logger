/**
 * Golden task: corpus-frontmatter-enums-valid
 * Cluster:  failure:asserted-not-verified (failure-taxonomy v1, cluster 7)
 * Evidence: hand-asserted records nothing machine-checks (oracle H0.3,
 *           F6.1/F10.1); the S18 `outcome` enum and the article `status`
 *           lane are only trustworthy if the committed corpus actually
 *           conforms — this makes that conformance a standing machine check.
 *
 * Guarantee pinned: every committed article's `status` is a legal
 * ARTICLE_STATUSES value, every `outcome` (when stamped) is a legal
 * ARTICLE_OUTCOMES value, and `tags` is a well-formed JSON string array.
 */

import { describe, it, expect } from 'vitest'
import { ARTICLE_STATUSES, ARTICLE_OUTCOMES } from '../../../src/schema.js'
import { listArticles, readArticle, parseFrontmatter } from '../../harness.js'

describe('failure:asserted-not-verified — corpus frontmatter enums are valid', () => {
  const articles = listArticles()

  it.each(articles)('%s: status/outcome/tags conform to the schema enums', (name) => {
    const parsed = parseFrontmatter(readArticle(name))
    expect(parsed, `${name}: frontmatter block missing`).not.toBeNull()
    if (!parsed) return

    const { status, outcome, tags } = parsed.fields

    if (status !== undefined) {
      expect(ARTICLE_STATUSES, `${name}: illegal status "${status}"`).toContain(status)
    }
    if (outcome !== undefined) {
      expect(ARTICLE_OUTCOMES, `${name}: illegal outcome "${outcome}"`).toContain(outcome)
    }

    expect(tags, `${name}: tags line missing`).toBeDefined()
    const parsedTags: unknown = JSON.parse(tags)
    expect(Array.isArray(parsedTags), `${name}: tags is not an array`).toBe(true)
    for (const t of parsedTags as unknown[]) {
      expect(typeof t, `${name}: non-string tag ${JSON.stringify(t)}`).toBe('string')
    }
  })
})
