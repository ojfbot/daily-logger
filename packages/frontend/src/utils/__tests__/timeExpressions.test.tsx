// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { attachTimeReferences } from '../timeReferences.ts'
import type { TimeExpression } from '../../../../../src/time-reference-schema.ts'

const interval: TimeExpression = {
  kind: 'interval', text: 'around 09:10–09:20Z', occurrence: 0, relation: 'elapsed',
  start: { text: '09:10', precision: 'minute', certainty: 'approximate', resolution: { kind: 'supported', at: '2026-10-14T09:10:00.000Z', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:10Z' } } },
  end: { text: '09:20Z', precision: 'minute', certainty: 'approximate', resolution: { kind: 'supported', at: '2026-10-14T09:20:00.000Z', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:20Z' } } },
}

describe('grouped time decoration', () => {
  it('makes each stated time the control and restores original markup and nodes', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>It ran around <strong>09:10</strong>–09:20Z.</p>'
    const original = root.innerHTML
    const { attached, restore } = attachTimeReferences(root, [interval])
    expect(attached).toHaveLength(2)
    expect([...root.querySelectorAll('.time-ref')].map(button => button.textContent)).toEqual(['around 09:10', '09:20Z'])
    expect(root.textContent).toBe('It ran around 09:10–09:20Z.')
    expect(root.textContent).not.toContain('Local times')
    expect(root.querySelector('strong')?.textContent).toBe('09:10')
    restore()
    expect(root.innerHTML).toBe(original)
  })
})

  it('restores several controls sharing one text node, including a separate instant', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>09:00Z. around 09:10–09:20Z; around 09:10–09:20Z.</p>'
    const original = root.innerHTML
    const instant = { text: '09:00Z', occurrence: 0, at: '2026-10-14T09:00:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:00Z' } }
    const { attached, restore } = attachTimeReferences(root, [instant, interval, { ...interval, occurrence: 1 }])
    expect(attached).toHaveLength(5)
    expect(root.querySelectorAll('.time-ref')).toHaveLength(5)
    expect(root.querySelectorAll('button time')).toHaveLength(5)
    restore()
    expect(root.innerHTML).toBe(original)
  })

  it('counts article groups across inline formatting and omits hidden/discussion text', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>around 09:10–09:20Z.</p><div class="section-chat-inline-portal">around 09:10–09:20Z</div><p hidden>around 09:10–09:20Z</p><p>around <em>09:10</em>–09:20Z.</p>'
    const original = root.innerHTML
    const { attached, restore } = attachTimeReferences(root, [{ ...interval, occurrence: 1 }])
    expect(attached).toHaveLength(2)
    expect(root.querySelector('p:last-child .time-ref')).not.toBeNull()
    expect(root.querySelector('.section-chat-inline-portal button')).toBeNull()
    restore()
    expect(root.innerHTML).toBe(original)
  })

  it('does not nest controls in linked or editable expression text', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p><a href="https://example.com">around 09:10–09:20Z</a></p><p contenteditable="true">around 09:10–09:20Z</p>'
    const { attached } = attachTimeReferences(root, [interval, { ...interval, occurrence: 1 }])
    expect(attached).toHaveLength(0)
  })

  it('uses one trigger per member without duplicate flat controls', () => {
    const root = document.createElement('article')
    const text = '2026-10-14T09:10Z–2026-10-14T09:20Z'
    root.innerHTML = `<p>${text}</p>`
    const group: TimeExpression = { ...interval, text, start: { ...interval.start, text: '2026-10-14T09:10Z' }, end: { ...interval.end, text: '2026-10-14T09:20Z' } }
    const flat = { text: '2026-10-14T09:20Z', occurrence: 0, at: '2026-10-14T09:20:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:20Z' } }
    const { attached } = attachTimeReferences(root, [flat, group])
    expect(attached).toHaveLength(2)
    expect(root.querySelectorAll('.time-ref')).toHaveLength(2)
    expect(root.querySelectorAll('button time')).toHaveLength(2)
  })

  it('keeps old flat controls when no grouped display item was supplied', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>2026-10-14T09:10Z and 2026-10-14T09:20Z</p>'
    const flat = { text: '2026-10-14T09:20Z', occurrence: 0, at: '2026-10-14T09:20:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:20Z' } }
    expect(attachTimeReferences(root, [flat]).attached).toHaveLength(1)
  })

  it('rejects malformed group metadata and preserves valid sibling instants', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>09:00Z. around 09:10–09:20Z</p>'
    const flat = { text: '09:00Z', occurrence: 0, at: '2026-10-14T09:00:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:00Z' } }
    const invalid = { ...interval, start: { ...interval.start, resolution: { kind: 'supported', at: '2026-02-30T09:10:00.000Z', evidence: interval.start.resolution } } }
    const { attached } = attachTimeReferences(root, [flat, invalid, { ...interval, kind: 'invented' }])
    expect(attached).toHaveLength(1)
    expect(root.querySelector('.time-ref')?.textContent).toBe('09:00Z')
  })

  it('keeps single-clock occurrences stable before and after decorated members', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>09:20Z. around <em>09:10</em>–09:20Z. 09:20Z.</p>'
    const original = root.innerHTML
    const textNodes: Node[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) textNodes.push(walker.currentNode)
    const flat = { text: '09:20Z', occurrence: 2, at: '2026-10-14T09:20:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:20Z' } }
    const { attached, restore } = attachTimeReferences(root, [flat, interval])
    expect(attached).toHaveLength(3)
    expect(root.querySelector('button:last-child')?.textContent).toBe('09:20Z')
    expect(root.textContent).toBe('09:20Z. around 09:10–09:20Z. 09:20Z.')
    restore()
    expect(root.innerHTML).toBe(original)
    const restoredWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const restoredNodes: Node[] = []
    while (restoredWalker.nextNode()) restoredNodes.push(restoredWalker.currentNode)
    expect(restoredNodes).toEqual(textNodes)
  })

  it('wraps a clock split across emphasis without including adjacent prose', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>It ran around <strong>09:</strong>10–09:<em>20Z, then stopped</em>.</p>'
    const original = root.innerHTML
    const emphasis = root.querySelector('em')
    const { attached, restore } = attachTimeReferences(root, [interval])
    expect(attached).toHaveLength(2)
    expect([...root.querySelectorAll('button')].map(button => button.textContent)).toEqual(['around 09:10', '09:20Z'])
    expect(root.textContent).toBe('It ran around 09:10–09:20Z, then stopped.')
    restore()
    expect(root.innerHTML).toBe(original)
    expect(root.querySelector('em')).toBe(emphasis)
  })

  it('does not wrap an intervening hidden or interactive UI node into a timestamp', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>around 09:<button>Open discussion</button>10–09:20Z.</p>'
    const original = root.innerHTML
    const { attached, restore } = attachTimeReferences(root, [interval])
    expect(attached).toHaveLength(1)
    expect(root.querySelectorAll('button button')).toHaveLength(0)
    expect(root.querySelector('.time-ref')?.textContent).toBe('09:20Z')
    restore()
    expect(root.innerHTML).toBe(original)
  })

  it('preserves discussion UI added after decoration when restoring timestamps', () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>around <em>09:10</em>–09:20Z.</p>'
    const { restore } = attachTimeReferences(root, [interval])
    const ui = document.createElement('span')
    ui.className = 'section-chat-wrapper'
    ui.textContent = 'New discussion'
    root.querySelector('p')?.append(ui)
    restore()
    expect(root.querySelector('.section-chat-wrapper')).toBe(ui)
    expect(root.textContent).toBe('around 09:10–09:20Z.New discussion')
  })
