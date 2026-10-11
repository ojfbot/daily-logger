import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('October 10 source-checked correction', () => {
  const article = readFileSync(new URL('../../_articles/2026-10-10.md', import.meta.url), 'utf8')
  const narrative = article.split('> **Suggested actions**')[0]

  it('keeps the four article sections and attributes the correction', () => {
    expect([...article.matchAll(/^## (.+)$/gm)].map((match) => match[1])).toEqual(['What shipped', 'The decisions', 'Roadmap pulse', "What's next"])
    expect(article).toContain('Source-checked editorial correction prepared by Codex')
    expect(article).toContain('c7b3b9c52e2d4917e6371b32efe6914881a8a80d/_articles/2026-10-10.md')
  })

  it('corrects the narrative while labeling original action premises as historical', () => {
    expect(narrative).toContain('24 of 24 public defaults')
    expect(narrative).toContain('27 active private repositories pending')
    expect(narrative).toContain('existing `GH_PAT` only at the final push')
    expect(narrative).toContain('Reverting a tooling commit does not remove them')
    expect(narrative).toContain('not as authority for its incorrect premises')
    for (const falseClaim of ['gate now fires on the PR head regardless, overriding', '8 remaining repositories are unconfirmed', 'credential is a GitHub App installation token', '`git revert 163f77a` removes all 16']) {
      expect(narrative).not.toContain(falseClaim)
    }
  })
})
