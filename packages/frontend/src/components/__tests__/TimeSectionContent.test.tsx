// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { attachTimeReferences } from '../../utils/timeReferences.ts'
import { useSectionContent } from '../../hooks/useSectionContent.ts'
import type { TimeExpression } from '../../../../../src/time-reference-schema.ts'

it.each([['<code>09:10–09:20Z</code>', ['09:10–09:20Z']], ['09:10–09:<code>20Z, then followup()</code>', ['20Z, then followup()']], ['<code>09:10–09:</code>20Z', ['09:10–09:']]])('retains source code references while %s has active timestamp controls', async (formatted, expectedCodeRefs) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const expression: TimeExpression = {
    kind: 'interval', text: '09:10–09:20Z', occurrence: 0, relation: 'unestablished',
    start: { text: '09:10', precision: 'minute', certainty: 'exact', resolution: { kind: 'supported', at: '2026-10-14T09:10:00.000Z', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:10Z' } } },
    end: { text: '09:20Z', precision: 'minute', certainty: 'exact', resolution: { kind: 'supported', at: '2026-10-14T09:20:00.000Z', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:20Z' } } },
  }
  const bodyHtml = `<h2>What shipped</h2><p>Run: ${formatted}.</p>`
  let result: ReturnType<ReturnType<typeof useSectionContent>['extractSection']> | undefined
  function Harness() {
    const ref = useRef<HTMLDivElement>(null)
    const { extractSection } = useSectionContent(bodyHtml)
    useEffect(() => {
      if (!ref.current) return
      const { restore } = attachTimeReferences(ref.current, [expression])
      return restore
    }, [])
    return <><div ref={ref} dangerouslySetInnerHTML={{ __html: bodyHtml }} /><button id="capture" onClick={() => { result = extractSection('What shipped') }}>Capture</button></>
  }
  const node = document.createElement('div'); document.body.append(node)
  const root = createRoot(node)
  try {
    await act(async () => root.render(<Harness />))
    expect(node.querySelector('.time-ref')).not.toBeNull()
    await act(async () => node.querySelector<HTMLButtonElement>('#capture')?.click())
    expect(result?.heading).toBe('What shipped')
    expect(result?.content).toBe(node.querySelector('p')?.textContent)
    expect(result?.codeRefs).toEqual(expectedCodeRefs)
  } finally { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals() }
})
