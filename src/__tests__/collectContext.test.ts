import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- fixtures ------------------------------------------------------------------

const openPRFixture = [
  {
    number: 10,
    title: 'Open PR one',
    html_url: 'https://github.com/ojfbot/shell/pull/10',
    body: 'PR body text',
    created_at: '2026-02-27T12:00:00Z',
    draft: false,
  },
]

const openIssueFixture = [
  {
    number: 5,
    title: 'Open issue one',
    labels: [{ name: 'bug' }],
    html_url: 'https://github.com/ojfbot/shell/issues/5',
    body: null,
    created_at: '2026-02-20T00:00:00Z',
  },
]

// Route fixture responses by repo+endpoint — scope fixtures to 'shell' only
// so dedup-by-URL doesn't overwrite them with data from later repos in the loop.
function mockExecSync(cmd: string): string {
  const forShell = cmd.includes('ojfbot/shell')
  if (forShell && cmd.includes('/pulls?state=open')) return JSON.stringify(openPRFixture)
  if (forShell && cmd.includes('/issues?state=open')) return JSON.stringify(openIssueFixture)
  if (cmd.includes('/pulls?state=open')) return JSON.stringify([])
  if (cmd.includes('/pulls?state=closed')) return JSON.stringify([])
  if (cmd.includes('/commits?')) return JSON.stringify([])
  if (cmd.includes('/issues?state=closed')) return JSON.stringify([])
  if (cmd.includes('/issues?state=open')) return JSON.stringify([])
  return JSON.stringify([])
}

// --- mock child_process --------------------------------------------------------

vi.mock('child_process', () => ({
  execSync: vi.fn(mockExecSync),
}))

import { collectContext } from '../collect-context.js'
import { execSync } from 'child_process'

// --- tests --------------------------------------------------------------------

describe('collectContext — shape', () => {
  it('returns a BlogContext with the required openPRs field', async () => {
    const ctx = await collectContext('2026-02-28')
    expect(ctx).toHaveProperty('openPRs')
    expect(Array.isArray(ctx.openPRs)).toBe(true)
  })

  it('includes date in context', async () => {
    const ctx = await collectContext('2026-02-28')
    expect(ctx.date).toBe('2026-02-28')
  })

  it('includes repos array', async () => {
    const ctx = await collectContext('2026-02-28')
    expect(Array.isArray(ctx.repos)).toBe(true)
    expect(ctx.repos.length).toBeGreaterThan(0)
  })
})

describe('collectContext — open PR mapping', () => {
  it('maps createdAt from created_at', async () => {
    const ctx = await collectContext('2026-02-28')
    const pr = ctx.openPRs.find((p) => p.number === 10 && p.repo === 'shell')
    expect(pr).toBeDefined()
    expect(pr?.createdAt).toBe('2026-02-27T12:00:00Z')
  })

  it('maps draft flag', async () => {
    const ctx = await collectContext('2026-02-28')
    const pr = ctx.openPRs.find((p) => p.number === 10 && p.repo === 'shell')
    expect(pr?.draft).toBe(false)
  })

  it('maps title, repo, url, body', async () => {
    const ctx = await collectContext('2026-02-28')
    const pr = ctx.openPRs.find((p) => p.number === 10)
    expect(pr?.title).toBe('Open PR one')
    expect(pr?.url).toBe('https://github.com/ojfbot/shell/pull/10')
    expect(pr?.body).toBe('PR body text')
  })
})

describe('collectContext — open issue createdAt mapping', () => {
  it('maps createdAt on open issues', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 5 && i.repo === 'shell')
    expect(issue).toBeDefined()
    expect(issue?.createdAt).toBe('2026-02-20T00:00:00Z')
  })

  it('filters out pull_request entries from issues endpoint', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('/issues?state=open')) {
        return JSON.stringify([
          { number: 1, title: 'Real issue', labels: [], html_url: 'https://...', body: null, created_at: '2026-02-01T00:00:00Z' },
          { number: 2, title: 'A PR disguised as issue', labels: [], html_url: 'https://...', body: null, created_at: '2026-02-01T00:00:00Z', pull_request: {} },
        ])
      }
      return JSON.stringify([])
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.openIssues.every((i) => i.number !== 2)).toBe(true)
  })
})

describe('collectContext — resilience', () => {
  it('returns empty arrays when API calls fail', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('gh: authentication required')
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.commits).toEqual([])
    expect(ctx.openPRs).toEqual([])
    expect(ctx.mergedPRs).toEqual([])
    expect(ctx.openIssues).toEqual([])
    expect(ctx.closedIssues).toEqual([])
  })

  it('returns empty arrays when API returns malformed JSON', async () => {
    vi.mocked(execSync).mockReturnValue('not valid json' as unknown as Buffer)
    const ctx = await collectContext('2026-02-28')
    expect(ctx.openPRs).toEqual([])
  })

  afterEach(() => {
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })
})
