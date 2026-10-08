import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatMessage } from '../ChatMessage.tsx'

describe.each([
  { label: 'completed', isStreaming: false },
  { label: 'streaming', isStreaming: true },
])('ChatMessage $label assistant content', ({ isStreaming }) => {
  function render(content: string) {
    return renderToStaticMarkup(createElement(ChatMessage, { role: 'assistant', content, isStreaming }))
  }

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    'Before <img src=x onerror=alert(1)> after',
  ])('escapes raw HTML: %s', (content) => {
    const html = render(content)

    expect(html).toContain('&lt;')
    expect(html).not.toMatch(/<(script|img|svg|iframe)\b/i)
  })

  it.each([
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](java\tscript:alert(1))',
    '[click](data:text/html,hello)',
    '[click](vbscript:hello)',
    '<javascript:alert(1)>',
  ])('renders a disallowed link as text: %s', (content) => {
    const html = render(content)

    expect(html).toMatch(/click|alert/)
    expect(html).not.toContain('<a ')
  })

  it.each([
    '![image](javascript:alert(1))',
    '![image](data:image/svg+xml,test)',
    '![image](data:text/html,hello)',
  ])('renders a disallowed image as text: %s', (content) => {
    const html = render(content)

    expect(html).toContain('image')
    expect(html).not.toContain('<img ')
  })

  it('preserves normal Markdown links, images, lists, and code', () => {
    const html = render([
      '[Web](https://example.com) [Email](mailto:test@example.com) [Section](#next) [Local](/next)',
      '',
      '![Photo](https://example.com/photo.png)',
      '',
      '- **First**',
      '- Second with `a < b`',
      '',
      '```html',
      '<script>example</script>',
      '```',
    ].join('\n'))

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="mailto:test@example.com"')
    expect(html).toContain('href="#next"')
    expect(html).toContain('href="/next"')
    expect(html).toContain('src="https://example.com/photo.png"')
    expect(html).toContain('<li><strong>First</strong></li>')
    expect(html).toContain('<code>a &lt; b</code>')
    expect(html).toContain('<code class="language-html">&lt;script&gt;example&lt;/script&gt;')
    expect(html.includes('chat-streaming-cursor')).toBe(isStreaming)
  })

  it('escapes attribute content without turning encoded schemes into active URLs', () => {
    const html = render('[click](java&#x73;cript:alert(1)) [Web](https://example.com \'a" onmouseover="alert(1)\')')

    expect(html).toContain('href="java&amp;#x73;cript:alert(1)"')
    expect(html).not.toContain('href="java&#x73;cript:')
    expect(html).toContain('title="a&quot; onmouseover=&quot;alert(1)"')
    expect(html).not.toContain(' onmouseover="')
  })

  it('keeps article-specific formatting out of chat messages', () => {
    const html = render('- `abcdef1`\n- `abcdef2`\n\nLiteral \\n and \\n in prose.')

    expect(html).not.toContain('commit-list')
    expect(html).toContain('Literal \\n and \\n in prose.')
  })

  it('stays safe as partial Markdown and HTML arrive', () => {
    const content = '<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n![image](data:text/html,hello)'

    for (let end = 1; end <= content.length; end++) {
      const html = render(content.slice(0, end))
      expect(html).not.toMatch(/<(img|script|svg|iframe)\b/i)
      expect(html).not.toMatch(/href="(?:javascript|data):/i)
    }
  })

  it('keeps nested formatting when unsafe links become text', () => {
    const html = render('[**click**](javascript:alert(1)) before <!-- hidden --> after')

    expect(html).toContain('<strong>click</strong>')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('hidden')
  })
})

it('keeps user messages as escaped text', () => {
  const html = renderToStaticMarkup(createElement(ChatMessage, {
    role: 'user', content: '<img src=x onerror=alert(1)> [click](javascript:alert(1))',
  }))

  expect(html).toContain('&lt;img')
  expect(html).toContain('[click](javascript:alert(1))')
  expect(html).not.toMatch(/<(img|a)\b/)
})
