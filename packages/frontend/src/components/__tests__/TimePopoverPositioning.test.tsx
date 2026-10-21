// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Popover, type PopoverState } from '../Popover.tsx'

it('keeps panel scrolling stable while following ancestor and window scrolling', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const node = document.createElement('div'), anchor = document.createElement('button')
  document.body.append(node, anchor)
  let top = 200
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => new DOMRect(100, top, 20, 10))
  const root = createRoot(node)
  const state: PopoverState = {
    visible: true, anchor, variant: { kind: 'time', tooltipId: 'positioning-time', reference: {
      certainty: 'exact', reference: { text: '09:10Z', occurrence: 0, at: '2026-10-14T09:10:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:10Z' } },
    } },
  }
  try {
    await act(async () => root.render(<Popover state={state} />))
    const panel = document.getElementById('positioning-time')
    expect(panel?.style.top).toBe('192px')
    top = 300
    await act(async () => panel?.dispatchEvent(new Event('scroll', { bubbles: true })))
    expect(panel?.style.top).toBe('192px')
    await act(async () => document.body.dispatchEvent(new Event('scroll', { bubbles: true })))
    expect(panel?.style.top).toBe('292px')
    top = 400
    await act(async () => window.dispatchEvent(new Event('scroll')))
    expect(panel?.style.top).toBe('392px')
  } finally { await act(async () => root.unmount()); node.remove(); anchor.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() }
})
