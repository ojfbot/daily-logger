import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACTIONS_END,
  ACTIONS_START,
  readActionRegistry,
  readArticleStatuses,
  renderArticleActions,
} from '../action-registry.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const articleDate = '2026-10-19'

describe('accepted October 19 closing options', () => {
  it('ends with its two supported existing checkpoints without creating new action identities', () => {
    const article = readFileSync(resolve(repoRoot, `_articles/${articleDate}.md`), 'utf8')
    const registry = readActionRegistry(repoRoot)
    const identitiesBefore = registry.records.map(record => record.key)

    expect(article).toContain('Priority 1 — Token-budget qualification under daily-logger #386')
    expect(article).toContain('Priority 2 — Move daily-logger #385 through visual acceptance')

    const rendered = renderArticleActions(article, registry, articleDate, readArticleStatuses(repoRoot))
    const closing = rendered.slice(rendered.indexOf(ACTIONS_START), rendered.indexOf(ACTIONS_END))

    expect(closing).toContain('Choose a supported next step')
    expect(closing).toContain('https://github.com/ojfbot/daily-logger/issues/386')
    expect(closing).toContain('https://github.com/ojfbot/daily-logger/pull/385')
    expect(closing).not.toContain('No new verified suggestion')
    expect(closing.indexOf('Resolved suggestions')).toBeLessThan(closing.indexOf('Choose a supported next step'))
    expect(registry.records.map(record => record.key)).toEqual(identitiesBefore)
    expect(registry.records.filter(record => record.introducedBy === articleDate)).toHaveLength(0)
  })
})
