// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractSectionContent } from '../useSectionContent.ts'

describe('section source binding', () => {
  it('keeps code-supplied shipment controls out of review context', () => {
    const article = document.createElement('article')
    article.innerHTML = '<h2>What shipped<span class="section-chat-wrapper">+</span></h2>'
      + '<p>Shipped <a href="https://github.com/ojfbot/daily-logger/pull/388">#388</a>'
      + '<span class="shipment-time-state" data-article-decoration="shipment-time"> · <button>merged 21:44Z</button></span> using <code>build-api</code>.</p>'
      + '<h2>The decisions</h2><p>Outside.</p>'

    expect(extractSectionContent(article, 'What shipped')).toEqual({
      heading: 'What shipped',
      content: 'Shipped #388 using build-api.',
      codeRefs: ['build-api'],
    })
  })
})
