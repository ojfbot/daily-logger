import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderArticle } from '../render-article.js'

describe('renderArticle', () => {
  it('keeps article structure when prose contains angle bracket placeholders', () => {
    const html = renderArticle('A path is /canvas/<section>/chat and a host is localhost:<port>.\n\n## Next\n\n- First item')

    expect(html).toContain('&lt;section&gt;')
    expect(html).toContain('&lt;port&gt;')
    expect(html).not.toContain('<section>')
    expect(html).not.toContain('<port>')
    expect(html).toContain('<h2>Next</h2>')
    expect(html).toContain('<li>First item</li>')
  })

  it('restores escaped prose breaks while retaining literal escapes in code', () => {
    const html = renderArticle('Intro.\\n\\n**Completed**\\n- First\\n- Second with `"a\\nb"`.')

    expect(html).toContain('<p>Intro.</p>')
    expect(html).toContain('<p><strong>Completed</strong></p>')
    expect(html).toContain('<li>First</li>')
    expect(html).toContain('<li>Second with <code>&quot;a\\nb&quot;</code>.</li>')
  })

  it('hides source comments and escapes raw HTML without changing fenced code', () => {
    const html = renderArticle('<!-- verification: review -->\n\n<script>alert(1)</script>\n\n```html\n<section>\n```')

    expect(html).not.toContain('verification: review')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<code class="language-html">&lt;section&gt;')
  })

  it('renders the October 2 roadmap as paragraphs and lists', () => {
    const article = readFileSync(new URL('../../_articles/2026-10-02.md', import.meta.url), 'utf8')
    const body = article.replace(/^---[\s\S]*?---\n/, '')
    const html = renderArticle(body)

    expect(html).toContain('<h2>Roadmap pulse</h2>')
    expect(html).toContain('<h2>What&#39;s next</h2>')
    expect(html).toContain('<ol>')
    expect(html).toContain('&lt;section&gt;')
    expect(html).not.toContain('<section>')
  })
})
