import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { articleManifest, browserArticle, correctedSource, readArticleSnapshot, verifyArticleSnapshot } from './article-snapshots.js'
import { blob, createFixture, source, today } from './fixture.js'

describe('self-contained historical article inputs', () => {
  it('verifies every frozen article against its real Git blob, SHA-256, date and filename', () => {
    expect(articleManifest.articles).toHaveLength(4)
    for (const identity of articleManifest.articles) {
      const article = readArticleSnapshot(identity.sourceCommitSha, identity.date)
      expect(article.blobSha).toBe(identity.blobSha)
      expect(() => verifyArticleSnapshot(identity, Buffer.from(article.content + '\nchanged'))).toThrow('bytes disagree')
      expect(() => verifyArticleSnapshot({ ...identity, sourcePath: '_articles/2000-01-01.md' }, Buffer.from(article.content))).toThrow('source identity')
    }
    expect(() => readArticleSnapshot('a'.repeat(40), today)).toThrow('No unique frozen article')
  })
  it('keeps original and corrected article prose, status and fingerprints paired', () => {
    const original = browserArticle(source, today)
    const corrected = browserArticle(correctedSource, today)
    expect(original.sourceBlobSha).toBe(blob)
    expect(original.status).toBe('draft')
    expect(corrected.status).toBe('draft')
    expect(corrected.sourceBlobSha).toBe('9f355b32d62f6fbeb0698417903cde46a29e0611')
    expect(original.bodyHtml).toContain('Something broke Monday.')
    expect(corrected.bodyHtml).not.toContain('Something broke Monday.')
    expect(original.bodyHtml).not.toBe(corrected.bodyHtml)
    const historical = browserArticle('457809f46579052c829ab8c2abe704ff644bdbf5', '2026-10-13')
    const revised = browserArticle(source, '2026-10-13')
    expect(historical.sourceBlobSha).toBe('31c1ef985938a48d1c3648ee9acb36f81893de74')
    expect(revised.sourceBlobSha).toBe('069636cadb3a468ce9cdee15e461f763c17cb674')
    expect(historical.bodyHtml).not.toBe(revised.bodyHtml)
  })
  it('returns content-derived blob IDs and 404 for an unknown article ref without consulting Git history', async () => {
    const fixture = createFixture()
    for (const article of articleManifest.articles) {
      const response = await fixture.github(`/repos/ojfbot/daily-logger/contents/${article.sourcePath}?ref=${article.sourceCommitSha}`)
      expect(response.status).toBe(200)
      const data: { content: string; sha: string } = await response.json()
      const bytes = Buffer.from(data.content, 'base64')
      expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(data.sha)
      expect(data.sha).toBe(article.blobSha)
    }
    expect((await fixture.github(`/repos/ojfbot/daily-logger/contents/_articles/${today}.md?ref=${'f'.repeat(40)}`)).status).toBe(404)
    expect(fixture.state.calls.every((call) => call.startsWith('GET '))).toBe(true)
  })
})
