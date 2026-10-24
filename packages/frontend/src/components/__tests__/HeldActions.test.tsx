// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ActionsPage } from '../ActionsPage.tsx'
const state = vi.hoisted(() => ({ held: true }))
vi.mock('../../hooks/useEntries.ts', () => ({ useEntries: () => ({ actions: [], doneActions: [], loading: false, error: null, proposedActions: state.held ? [{
  id: 'a'.repeat(64), command: '/owner-gate core#561', repo: 'core', description: 'Review the owner decision.', sourceDate: '2026-10-21', status: 'needs-review', includeInIndex: false, dispatchable: false, reason: 'The available evidence did not confirm these suggestions.',
}] : [] }) }))

it('shows held original identities separately and links to the real article route without action controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div'), root = createRoot(container)
  try {
    await act(async () => root.render(createElement(ActionsPage)))
    const group = container.querySelector('.actions-column-needs-review')
    expect(group?.textContent).toContain('Needs review (1)')
    expect(group?.textContent).toContain('Review needed before use')
    expect(group?.querySelector('a')?.getAttribute('href')).toBe('/articles/2026-10-21')
    expect(group?.querySelector('[data-draft-candidate-id]')?.getAttribute('data-draft-candidate-id')).toBe('a'.repeat(64))
    expect(group?.querySelector('button,input')).toBeNull()
    expect(container.textContent).toContain('Open (0)')
    state.held = false
    await act(async () => root.render(createElement(ActionsPage)))
    expect(container.querySelector('.actions-column-needs-review')).toBeNull()
  } finally { await act(async () => root.unmount()); state.held = true; vi.unstubAllGlobals() }
})
