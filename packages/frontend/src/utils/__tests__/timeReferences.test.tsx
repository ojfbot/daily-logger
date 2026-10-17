// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { attachTimeReferences } from '../timeReferences.ts'
import type { TimeReference } from '../../../../../src/time-reference-schema.ts'

const secondArticleClock: TimeReference = {
  text: '09:10Z', occurrence: 1, at: '2026-10-14T09:10:41.000Z', precision: 'minute',
  evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359' },
}

describe('article time references beside mobile section discussion', () => {
  it('counts only article clocks and restores article and portal text unchanged', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p id="first-article-clock">09:10Z</p>'
      + '<div class="section-chat-inline-portal"><article><p id="thread-clock">09:10Z</p></article></div>'
      + '<p id="second-article-clock">09:10Z</p>'
    const original = root.innerHTML
    const { attached, restore } = attachTimeReferences(root, [secondArticleClock])

    expect(attached).toHaveLength(1)
    expect(root.querySelector('#second-article-clock button time')?.getAttribute('datetime')).toBe(secondArticleClock.at)
    expect(root.querySelector('.section-chat-inline-portal button')).toBeNull()
    expect(root.querySelector('#first-article-clock button')).toBeNull()
    expect(root.querySelector('#thread-clock')?.textContent).toBe('09:10Z')

    restore()
    expect(root.innerHTML).toBe(original)
  })
})
