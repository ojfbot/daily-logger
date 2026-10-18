// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionsPage } from '../ActionsPage.tsx'

vi.mock('../../hooks/useEntries.ts', () => ({
  useEntries: () => ({
    actions: [{
      id: 'act-reviewed',
      command: '/validate',
      invocation: '/validate core#537 exact byte gate',
      description: 'Validate the exact byte gate.',
      repo: 'core',
      status: 'open',
      sourceDate: '2026-10-15',
      review: {
        source: {
          repository: 'ojfbot/daily-logger',
          articlePath: '_articles/2026-10-15.md',
          articleCommitSha: 'a'.repeat(40),
          articleBlobSha: 'b'.repeat(40),
          line: 97,
          suggestionLineSha256: 'c'.repeat(64),
          url: 'https://github.com/ojfbot/daily-logger/blob/a/_articles/2026-10-15.md#L97',
        },
        disposition: {
          kind: 'completed-existing-evidence',
          evidence: [{
            kind: 'repository-file',
            path: 'reviews/proof.md',
            commitSha: 'd'.repeat(40),
            blobSha: 'e'.repeat(40),
            sha256: 'f'.repeat(64),
            qualification: 'Portable bounded proof.',
          }],
          qualification: 'The replay is complete but the action is unsettled.',
          nextSafeRetry: 'Only after source changes.',
        },
        executionAuthority: 'none',
        settlementAuthority: 'none',
      },
    }],
    doneActions: [],
    proposedActions: [],
    loading: false,
    error: null,
  }),
}))

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(ActionsPage)))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('ActionsPage reviewed actions', () => {
  it('renders reviewed disposition, full invocation, evidence and source outside open/stale buckets', () => {
    expect(container.textContent).toContain('Reviewed (1)')
    expect(container.textContent).toContain('Evidence complete · unsettled')
    expect(container.textContent).toContain('/validate core#537 exact byte gate')
    expect(container.textContent).toContain('reviews/proof.md')
    expect(container.textContent).toContain('Open (0)')
    expect(container.textContent).toContain('Stale (>5 days) (0)')
  })
})
