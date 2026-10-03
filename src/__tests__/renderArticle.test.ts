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

  it('keeps an escaped backslash beside recovered prose breaks', () => {
    const html = renderArticle(String.raw`Path C:\\new and a\nb\nc`)

    expect(html).toBe('<p>Path C:\\new and a\nb\nc</p>\n')
  })

  it('does not rewrite escaped newlines inside a longer fenced code block', () => {
    const markdown = ['````', 'x', '```', String.raw`inside\n\nmore`, '````'].join('\n')
    const html = renderArticle(markdown)

    expect(html).toBe('<pre><code>x\n```\ninside\\n\\nmore\n</code></pre>\n')
  })

  it.each([
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](java\tscript:alert(1))',
    '[click](data:text/html,hello)',
    '<javascript:alert(1)>',
  ])('renders a disallowed link as text: %s', (markdown) => {
    const html = renderArticle(markdown)

    expect(html).not.toContain('<a ')
  })

  it('keeps an encoded entity from becoming an active URL scheme', () => {
    const html = renderArticle('[click](java&#x73;cript:alert(1))')

    expect(html).toContain('<a href="java&amp;#x73;cript:alert(1)">click</a>')
  })

  it.each([
    '![image](javascript:alert(1))',
    '![image](data:text/html,hello)',
  ])('renders a disallowed image as text: %s', (markdown) => {
    const html = renderArticle(markdown)

    expect(html).not.toContain('<img ')
    expect(html).toContain('image')
  })

  it('keeps ordinary article links and images', () => {
    const html = renderArticle('[Web](https://example.com) [Email](mailto:test@example.com) [Section](#next) [Local](/next) ![Photo](https://example.com/photo.png)')

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="mailto:test@example.com"')
    expect(html).toContain('href="#next"')
    expect(html).toContain('href="/next"')
    expect(html).toContain('src="https://example.com/photo.png"')
  })

  it('hides source comments and escapes raw HTML without changing fenced code', () => {
    const html = renderArticle('<!-- verification: review -->\n\n<script>alert(1)</script>\n\n```html\n<section>\n```')

    expect(html).not.toContain('verification: review')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<code class="language-html">&lt;section&gt;')
  })

  it('escapes inline HTML and removes inline comments', () => {
    const html = renderArticle('Before <img src=x onerror=alert(1)> after <!-- hidden --> done')

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img ')
    expect(html).not.toContain('hidden')
  })

  it('recovers the original escaped roadmap shape', () => {
    const html = renderArticle(String.raw`## Roadmap pulse\n\nFirst.\n- One\n- Two`)

    expect(html).toContain('<h2>Roadmap pulse</h2>')
    expect(html).toContain('<li>One</li>')
    expect(html).toContain('<li>Two</li>')
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
