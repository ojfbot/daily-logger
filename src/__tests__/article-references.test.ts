import { describe, expect, it } from 'vitest'
import { assertArticleReferenceContract, normalizeArticleResourceLinks } from '../article-references.js'

describe('emitted GitHub references', () => {
  it('rejects the malformed PR label and URL shape from the accepted article', () => {
    const malformed = '### daily-logger ([#https://github.com/ojfbot/daily-logger/pull/389](https://github.com/ojfbot/daily-logger/pull/https://github.com/ojfbot/daily-logger/pull/389))'
    expect(() => assertArticleReferenceContract(malformed)).toThrow(/nested GitHub reference label/i)
  })

  it('repairs issue links when collected identity or explicit prose identifies the issue', () => {
    const prose = [
      '## What shipped',
      'The open issue [#386](https://github.com/ojfbot/daily-logger/pull/386) tracks the budget.',
      '## Roadmap pulse',
      '**Open issues:**',
      '[issue #357](https://github.com/ojfbot/daily-logger/pull/357) remains active.',
    ].join('\n')
    expect(() => assertArticleReferenceContract(prose)).toThrow(/issue.*links to a pull request/i)
    const repaired = normalizeArticleResourceLinks(prose, new Map([['daily-logger#386', 'issues']]))
    expect(repaired).toContain('/issues/386')
    expect(repaired).toContain('/issues/357')
    expect(() => assertArticleReferenceContract(repaired)).not.toThrow()
  })

  it('allows an issue and its implementation PR in the Open issues section', () => {
    const prose = [
      '**Open issues:**',
      '- Track [issue #386](https://github.com/ojfbot/daily-logger/issues/386); implementation is [PR #391](https://github.com/ojfbot/daily-logger/pull/391).',
    ].join('\n')
    const kinds = new Map([['daily-logger#386', 'issues' as const], ['daily-logger#391', 'pull' as const]])
    expect(normalizeArticleResourceLinks(prose, kinds)).toBe(prose)
    expect(() => assertArticleReferenceContract(prose, kinds)).not.toThrow()
    const mislabeled = prose.replace('[PR #391]', '[issue #391]')
    expect(() => normalizeArticleResourceLinks(mislabeled, kinds)).toThrow(/collected source says PR/i)
    expect(() => assertArticleReferenceContract(mislabeled, kinds)).toThrow(/issue.*links to a pull request/i)
  })

  it('does not infer an unknown link kind from the section heading alone', () => {
    const prose = '**Open issues:**\n- Context [daily-logger #999](https://github.com/ojfbot/daily-logger/pull/999).'
    expect(normalizeArticleResourceLinks(prose, new Map())).toBe(prose)
    expect(() => assertArticleReferenceContract(prose)).not.toThrow()
    const knownIssue = new Map([['daily-logger#999', 'issues' as const]])
    expect(normalizeArticleResourceLinks(prose, knownIssue)).toContain('/issues/999')
    expect(() => assertArticleReferenceContract(prose, knownIssue)).toThrow(/wrong GitHub resource kind/i)
    const mixed = '[known](https://github.com/ojfbot/daily-logger/issues/999) [unknown](https://github.com/ojfbot/daily-logger/pull/1000)'
    expect(assertArticleReferenceContract(mixed, knownIssue)).toEqual({ verified: 1, unknown: 1 })
  })

  it('keeps valid GitHub correspondence and review fragments on their original resource', () => {
    const links = [
      '[supervised correction request](https://github.com/ojfbot/daily-logger/pull/402#issuecomment-6295372166)',
      '[review](https://github.com/ojfbot/daily-logger/pull/402#pullrequestreview-123456)',
      '[discussion](https://github.com/ojfbot/daily-logger/pull/402#discussion_r987654)',
      '[issue comment](https://github.com/ojfbot/daily-logger/issues/357#issuecomment-123456)',
    ].join('\n')
    const kinds = new Map([['daily-logger#402', 'pull' as const], ['daily-logger#357', 'issues' as const]])
    expect(normalizeArticleResourceLinks(links, kinds)).toBe(links)
    expect(() => assertArticleReferenceContract(links, kinds)).not.toThrow()
  })

  it('preserves a comment fragment when correcting a known issue and rejects fragment bypasses', () => {
    const kinds = new Map([['daily-logger#386', 'issues' as const]])
    const wrong = '[issue #386](https://github.com/ojfbot/daily-logger/pull/386#issuecomment-123456)'
    expect(() => assertArticleReferenceContract(wrong, kinds)).toThrow(/wrong GitHub resource kind/i)
    const corrected = normalizeArticleResourceLinks(wrong, kinds)
    expect(corrected).toBe('[issue #386](https://github.com/ojfbot/daily-logger/issues/386#issuecomment-123456)')
    expect(() => assertArticleReferenceContract(corrected, kinds)).not.toThrow()
    for (const url of [
      'https://github.com/ojfbot/daily-logger/pull/402#https://github.com/ojfbot/core/issues/386',
      'https://github.com/ojfbot/daily-logger/pull/402?redirect=https://github.com/ojfbot/core/issues/386#issuecomment-123456',
      'https://github.com/ojfbot/daily-logger/issues/386#pullrequestreview-123456',
    ]) expect(() => assertArticleReferenceContract(`[source](${url})`)).toThrow(/non-canonical GitHub resource URL/i)
  })

  it('checks emitted HTML anchors, including action evidence links', () => {
    const kinds = new Map([['daily-logger#386', 'issues' as const], ['daily-logger#402', 'pull' as const]])
    const valid = '<li><a class="source" href="https://github.com/ojfbot/daily-logger/pull/402#issuecomment-6295372166">Correction request</a></li>'
    expect(() => assertArticleReferenceContract('', kinds, valid)).not.toThrow()
    const malformed = '<a href="https://github.com/ojfbot/daily-logger/pull/https://github.com/ojfbot/daily-logger/pull/401">#401</a>'
    expect(() => assertArticleReferenceContract('', kinds, malformed)).toThrow(/non-canonical GitHub resource URL/i)
    const wrongKind = '<a href="https://github.com/ojfbot/daily-logger/pull/386#issuecomment-123456">issue #386</a>'
    expect(() => assertArticleReferenceContract('', kinds, wrongKind)).toThrow(/wrong GitHub resource kind/i)
    const nestedLabel = '<a href="https://github.com/ojfbot/daily-logger/pull/402">#https://github.com/ojfbot/daily-logger/pull/402</a>'
    expect(() => assertArticleReferenceContract('', kinds, nestedLabel)).toThrow(/nested GitHub reference label/i)
  })

  it('checks only anchors in the actual rendered article', () => {
    const invalid = 'https://github.com/ojfbot/daily-logger/pull/garbage'
    expect(() => assertArticleReferenceContract(`\`<a href="${invalid}">example</a>\``)).not.toThrow()
    expect(() => assertArticleReferenceContract(`\`\`\`html\n<a href="${invalid}">example</a>\n\`\`\``)).not.toThrow()
    expect(() => assertArticleReferenceContract(`<${invalid}>`)).toThrow(/non-canonical GitHub resource URL/i)
    expect(() => assertArticleReferenceContract(invalid)).toThrow(/non-canonical GitHub resource URL/i)
    const generatedCard = `<section><a\n href="${invalid}">#401</a></section>`
    expect(() => assertArticleReferenceContract('## What shipped', new Map(), generatedCard)).toThrow(/non-canonical GitHub resource URL/i)
  })

  it('preserves literal link examples while correcting adjacent rendered links', () => {
    const known = new Map([['daily-logger#391', 'pull' as const], ['daily-logger#386', 'issues' as const]])
    const prose = [
      '`[issue #391](https://github.com/ojfbot/daily-logger/pull/391)` is a literal example.',
      '`[issue #998](https://github.com/ojfbot/daily-logger/pull/998)` is also literal.',
      '`[issue #997](https://github.com/ojfbot/daily-logger/pull/997)',
      '[issue #996](https://github.com/ojfbot/daily-logger/pull/996)` spans lines.',
      '',
      '    [issue #995](https://github.com/ojfbot/daily-logger/pull/995)',
      '',
      '~~~md',
      '[issue #999](https://github.com/ojfbot/daily-logger/pull/999)',
      '~~~',
      'The tracked [issue #386](https://github.com/ojfbot/daily-logger/pull/386) is open.',
    ].join('\n')
    const corrected = normalizeArticleResourceLinks(prose, known)
    expect(corrected).toContain('`[issue #391](https://github.com/ojfbot/daily-logger/pull/391)`')
    expect(corrected).toContain('`[issue #998](https://github.com/ojfbot/daily-logger/pull/998)`')
    expect(corrected).toContain('`[issue #997](https://github.com/ojfbot/daily-logger/pull/997)\n[issue #996](https://github.com/ojfbot/daily-logger/pull/996)`')
    expect(corrected).toContain('    [issue #995](https://github.com/ojfbot/daily-logger/pull/995)')
    expect(corrected).toContain('~~~md\n[issue #999](https://github.com/ojfbot/daily-logger/pull/999)\n~~~')
    expect(corrected).toContain('[issue #386](https://github.com/ojfbot/daily-logger/issues/386)')
    expect(assertArticleReferenceContract(corrected, known)).toEqual({ verified: 1, unknown: 0 })
  })

  it('does not carry an issue claim across a paragraph into a PR link', () => {
    const known = new Map([['daily-logger#391', 'pull' as const]])
    const prose = 'This remains an issue\n\n[PR #391](https://github.com/ojfbot/daily-logger/pull/391) describes the implementation.'
    const normalized = normalizeArticleResourceLinks(prose, known)
    expect(normalized).toBe(prose)
    expect(assertArticleReferenceContract(normalized, known)).toEqual({ verified: 1, unknown: 0 })
    const localClaim = 'This issue [PR #391](https://github.com/ojfbot/daily-logger/pull/391) is misidentified.'
    expect(() => normalizeArticleResourceLinks(localClaim, known)).toThrow(/collected source says PR/i)
    expect(() => assertArticleReferenceContract(localClaim, known)).toThrow(/issue.*links to a pull request/i)
  })
})
