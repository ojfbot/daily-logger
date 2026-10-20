import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACTIONS_END,
  ACTIONS_START,
  articleActionCard,
  readActionRegistry,
  readArticleStatuses,
  renderArticleActions,
} from '../action-registry.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const articleDate = '2026-10-19'

describe('accepted October 19 closing options', () => {
  it('renders its verified ranked shortlist without creating new action identities', () => {
    const article = readFileSync(resolve(repoRoot, `_articles/${articleDate}.md`), 'utf8')
    const registry = readActionRegistry(repoRoot)
    const identitiesBefore = registry.records.map(record => record.key)
    const snapshot = registry.articles.find(snapshot => snapshot.date === articleDate)
    if (snapshot?.closing?.kind !== 'shortlist') throw new Error('Missing current verified shortlist')
    expect(snapshot).toMatchObject({ status: 'accepted', review: { state: 'verified' } })
    expect(snapshot.closing.options).toHaveLength(3)
    expect(snapshot.closing.options.map(option => option.rank)).toEqual([1, 2, 3])
    expect(new Set(snapshot.closing.options.map(option => option.identity)).size).toBe(3)
    expect(articleActionCard(registry, articleDate, readArticleStatuses(repoRoot))?.closing).toEqual(snapshot.closing)

    expect(article).not.toContain("## What's next")

    const rendered = renderArticleActions(article, registry, articleDate, readArticleStatuses(repoRoot))
    const closing = rendered.slice(rendered.indexOf(ACTIONS_START), rendered.indexOf(ACTIONS_END))

    expect(closing.match(/<section class="suggested-actions-card"/g)).toHaveLength(1)
    expect(closing.match(/data-recommendation-id=/g)).toHaveLength(3)
    for (const option of snapshot.closing.options) expect(closing).toContain(`data-recommendation-id="${option.identity}"`)
    expect(closing).toContain('<summary>Article draft context</summary>')
    expect(closing).toContain('<summary>Suggestions handled at draft')
    expect(closing).not.toMatch(/<details\b[^>]*\bopen(?:\s|>|=)/)
    expect(closing).not.toContain('Choose a supported next step')
    expect(closing).not.toContain('No new verified suggestion')
    expect(closing.indexOf('Suggestions handled at draft')).toBeGreaterThan(closing.lastIndexOf('data-recommendation-id='))
    expect(registry.records.map(record => record.key)).toEqual(identitiesBefore)
    expect(registry.records.filter(record => record.introducedBy === articleDate)).toHaveLength(0)
  })
})
