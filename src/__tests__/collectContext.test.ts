import { describe, it, expect, vi, afterEach } from 'vitest'

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
    body: 'A'.repeat(1000), // long body to verify truncation behaviour
    created_at: '2026-02-20T00:00:00Z', // old — not within 24h of collectContext('2026-02-28')
    updated_at: '2026-02-20T00:00:00Z',
  },
  {
    number: 6,
    title: 'New issue today',
    labels: [],
    html_url: 'https://github.com/ojfbot/shell/issues/6',
    body: 'B'.repeat(1000), // long body — should NOT be truncated for new issue
    created_at: '2026-02-27T23:00:00Z', // within 24h of collectContext('2026-02-28')
    updated_at: '2026-02-27T23:00:00Z',
  },
  {
    number: 7,
    title: 'Old issue updated today',
    labels: [],
    html_url: 'https://github.com/ojfbot/shell/issues/7',
    body: 'C'.repeat(1000),
    created_at: '2026-01-01T00:00:00Z', // old created_at
    updated_at: '2026-02-27T22:00:00Z', // but updated within 24h
  },
]

// Fleet discovery fixture — the sweep set is derived from `gh repo list` (src/fleet.ts).
const repoListFixture = [
  { name: 'shell', pushedAt: '2026-02-27T20:00:00Z', isArchived: false, isFork: false, visibility: 'PUBLIC' },
  { name: 'BlogEngine', pushedAt: '2026-02-26T00:00:00Z', isArchived: false, isFork: false, visibility: 'PUBLIC' },
  { name: 'dealdesk', pushedAt: '2026-02-25T00:00:00Z', isArchived: false, isFork: false, visibility: 'PRIVATE' },
  { name: 'client-private', pushedAt: '2026-02-28T01:00:00Z', isArchived: false, isFork: false, visibility: 'PRIVATE' },
  { name: 'old-thing', pushedAt: '2025-01-01T00:00:00Z', isArchived: true, isFork: false, visibility: 'PUBLIC' },
  { name: 'upstream-fork', pushedAt: '2026-02-27T00:00:00Z', isArchived: false, isFork: true, visibility: 'PUBLIC' },
  { name: 'selfco', pushedAt: '2026-02-28T00:00:00Z', isArchived: false, isFork: false, visibility: 'PRIVATE' },
]

// Node's execSync throws ENOBUFS when output exceeds maxBuffer (default 1 MB).
// The mock must enforce it, or a buffer regression passes silently.
const EXEC_DEFAULT_MAX_BUFFER = 1024 * 1024
function enforceMaxBuffer(out: string, opts?: { maxBuffer?: number }): string {
  const limit = opts?.maxBuffer ?? EXEC_DEFAULT_MAX_BUFFER
  if (Buffer.byteLength(out) > limit) {
    throw Object.assign(new Error('spawnSync /bin/sh ENOBUFS'), { code: 'ENOBUFS' })
  }
  return out
}

// Route fixture responses by repo+endpoint — scope fixtures to 'shell' only
// so dedup-by-URL doesn't overwrite them with data from later repos in the loop.
function mockExecSync(cmd: string): string {
  if (cmd.includes('gh repo list')) return JSON.stringify(repoListFixture)
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

describe('collectContext — auth preflight', () => {
  afterEach(() => {
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })

  it('throws when the gh token is rejected instead of returning an empty context', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh api rate_limit')) throw new Error('HTTP 401: Bad credentials')
      return mockExecSync(cmd)
    })
    await expect(collectContext('2026-02-28')).rejects.toThrow(/auth preflight failed/)
  })

  it('proceeds with the sweep when the token is valid', async () => {
    const ctx = await collectContext('2026-02-28')
    expect(ctx.date).toBe('2026-02-28')
  })
})

describe('collectContext — open issue createdAt mapping', () => {
  afterEach(() => {
    // Restore the default mock after any test that overrides it
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })

  it('maps createdAt on open issues', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 5 && i.repo === 'shell')
    expect(issue).toBeDefined()
    expect(issue?.createdAt).toBe('2026-02-20T00:00:00Z')
  })

  it('filters out pull_request entries from issues endpoint', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh repo list')) return JSON.stringify(repoListFixture)
      if (cmd.includes('/issues?state=open')) {
        return JSON.stringify([
          { number: 1, title: 'Real issue', labels: [], html_url: 'https://...', body: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
          { number: 2, title: 'A PR disguised as issue', labels: [], html_url: 'https://...', body: null, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', pull_request: {} },
        ])
      }
      return JSON.stringify([])
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.openIssues.every((i) => i.number !== 2)).toBe(true)
  })

  it('marks issue as isNew when created_at is within 24h', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 6)
    expect(issue?.isNew).toBe(true)
  })

  it('marks issue as isNew when updated_at is within 24h even if created_at is old', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 7)
    expect(issue?.isNew).toBe(true)
  })

  it('does not mark issue as isNew when both created_at and updated_at are outside 24h', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 5)
    expect(issue?.isNew).toBe(false)
  })

  it('gives active issues 800-char body and stale issues 200-char body', async () => {
    const ctx = await collectContext('2026-02-28')
    const stale = ctx.openIssues.find((i) => i.number === 5)
    const fresh = ctx.openIssues.find((i) => i.number === 6)
    expect(stale?.body?.length).toBe(200)
    expect(fresh?.body?.length).toBe(800)
  })

  it('sorts active issues before stale ones', async () => {
    const ctx = await collectContext('2026-02-28')
    const shellIssues = ctx.openIssues.filter((i) => i.repo === 'shell')
    const firstIsActive = shellIssues[0]?.isNew === true
    expect(firstIsActive).toBe(true)
  })
})

describe('collectContext — resilience', () => {
  it('returns empty arrays when endpoint calls fail despite valid auth', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      // Preflight passes (token is valid); per-endpoint calls fail.
      if (cmd.includes('gh api rate_limit')) return '{}'
      if (cmd.includes('gh repo list')) return JSON.stringify(repoListFixture)
      throw new Error('gh: HTTP 500')
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.commits).toEqual([])
    expect(ctx.openPRs).toEqual([])
    expect(ctx.mergedPRs).toEqual([])
    expect(ctx.openIssues).toEqual([])
    expect(ctx.closedIssues).toEqual([])
  })

  it('returns empty arrays when API returns malformed JSON', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh repo list')) return JSON.stringify(repoListFixture)
      return Buffer.from('not valid json')
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.openPRs).toEqual([])
  })

  afterEach(() => {
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })
})

describe('collectContext — fleet discovery (derived sweep set)', () => {
  afterEach(() => {
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })

  it('sweeps public + opted-in private repos (minus archived/fork/denylist), most recently pushed first', async () => {
    const ctx = await collectContext('2026-02-28')
    expect(ctx.repos).toEqual(['shell', 'BlogEngine', 'dealdesk'])
  })

  it('never queries a private repo that REPO_NOTES does not opt in', async () => {
    vi.mocked(execSync).mockClear()
    const ctx = await collectContext('2026-02-28')
    expect(ctx.repos).not.toContain('client-private')
    const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('repos/ojfbot/client-private/'))).toBe(false)
  })

  it('never falls back to a hand list: discovery failure throws instead of sweeping nothing', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh api rate_limit')) return '{}'
      if (cmd.includes('gh repo list')) throw new Error('gh: HTTP 403')
      return mockExecSync(cmd)
    })
    await expect(collectContext('2026-02-28')).rejects.toThrow(/Fleet discovery failed/)
  })

  it('throws when discovery returns an empty org', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh repo list')) return '[]'
      return mockExecSync(cmd)
    })
    await expect(collectContext('2026-02-28')).rejects.toThrow(/no repos/)
  })

  it('only queries repos that discovery returned', async () => {
    await collectContext('2026-02-28')
    const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('repos/ojfbot/shell/commits'))).toBe(true)
    expect(calls.some((c) => c.includes('repos/ojfbot/selfco/'))).toBe(false)
    expect(calls.some((c) => c.includes('repos/ojfbot/old-thing/'))).toBe(false)
    expect(calls.some((c) => c.includes('repos/ojfbot/upstream-fork/'))).toBe(false)
  })
})

describe('collectContext — FLEET_REPOS test seam', () => {
  afterEach(() => {
    delete process.env.FLEET_REPOS
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })

  it('pins the sweep set and skips discovery when FLEET_REPOS is set', async () => {
    process.env.FLEET_REPOS = 'shell, BlogEngine'
    vi.mocked(execSync).mockClear() // call history accumulates across tests
    const ctx = await collectContext('2026-02-28')
    expect(ctx.repos).toEqual(['shell', 'BlogEngine'])
    const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('gh repo list'))).toBe(false)
  })
})

describe('collectContext — gh api calls fit in one page (2026-09-24 silent-skip fix)', () => {
  // `--paginate` walked every page of the closed-PR list (core ≈ 5.9 MB) and
  // overflowed execSync's 1 MB default maxBuffer, so the four busiest repos were
  // silently "skipped" on every run. The per_page caps are the whole answer.
  it('does not paginate the capped list endpoints', async () => {
    await collectContext('2026-02-28')
    const apiCalls = vi.mocked(execSync).mock.calls.map((c) => String(c[0])).filter((c) => c.includes('gh api "repos/'))
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(apiCalls.filter((c) => c.includes('--paginate'))).toEqual([])
  })

  it('raises maxBuffer well above the 1 MB default on every gh api call', async () => {
    await collectContext('2026-02-28')
    const optsList = vi.mocked(execSync).mock.calls
      .filter((c) => String(c[0]).includes('gh api "repos/'))
      .map((c) => c[1] as { maxBuffer?: number } | undefined)
    expect(optsList.length).toBeGreaterThan(0)
    for (const opts of optsList) {
      expect(opts?.maxBuffer ?? 0).toBeGreaterThanOrEqual(8 * 1024 * 1024)
    }
  })

  it('parses a closed-PR page larger than the old 1 MB buffer', async () => {
    const bigBody = 'x'.repeat(60_000)
    const bigPage = Array.from({ length: 30 }, (_, i) => ({
      number: 100 + i,
      title: `PR ${i}`,
      merged_at: '2026-02-27T12:00:00Z',
      additions: 1,
      deletions: 1,
      html_url: `https://github.com/ojfbot/shell/pull/${100 + i}`,
      body: bigBody,
      user: { login: 'ojfbot' },
    }))
    const payload = JSON.stringify(bigPage)
    expect(payload.length).toBeGreaterThan(1024 * 1024)
    vi.mocked(execSync).mockImplementation(((cmd: string, opts?: { maxBuffer?: number }) => {
      if (cmd.includes('ojfbot/shell') && cmd.includes('/pulls?state=closed')) return enforceMaxBuffer(payload, opts)
      return mockExecSync(cmd)
    }) as typeof execSync)
    const ctx = await collectContext('2026-02-28')
    expect(ctx.mergedPRs.filter((pr) => pr.repo === 'shell')).toHaveLength(30)
  })

  afterEach(() => {
    vi.mocked(execSync).mockImplementation(mockExecSync)
  })
})
