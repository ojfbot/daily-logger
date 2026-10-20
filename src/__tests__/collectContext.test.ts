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

const metadataOnlyPRFixture = [
  {
    number: 11,
    title: 'Old PR with a new comment',
    html_url: 'https://github.com/ojfbot/shell/pull/11',
    body: 'No new code in this window',
    state: 'open',
    created_at: '2026-02-01T12:00:00Z',
    updated_at: '2026-02-27T23:00:00Z',
    closed_at: null,
    merged_at: null,
    draft: false,
    user: { login: 'ojfbot' },
    head: { sha: 'old-head-sha', ref: 'feat/old-pr' },
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
  { name: 'foundry-recipes', pushedAt: '2026-02-25T00:00:00Z', isArchived: false, isFork: false, visibility: 'PRIVATE' },
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
  if (forShell && cmd.includes('/pulls?state=all')) return JSON.stringify(metadataOnlyPRFixture)
  if (forShell && cmd.includes('/commits/old-head-sha')) {
    return JSON.stringify({ commit: { committer: { date: '2026-02-20T12:00:00Z' } } })
  }
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
import { buildUserPrompt } from '../generate-article.js'
import { buildReportUserPrompt } from '../generate-report.js'
import { MERGED_PR_EVIDENCE_CHARS } from '../pr-body.js'

describe('collectContext — merged PR outcomes reach the drafter', () => {
  afterEach(() => vi.mocked(execSync).mockImplementation(mockExecSync))

  it('preserves rollout outcomes and constraints after both former truncation boundaries', async () => {
    const body = `${'Rollout inspection details. '.repeat(30)}\nAll 24 public defaults verified.\n27 active private repositories remain pending: current GitHub plan rejects private rulesets.`
    const pr = {
      ...metadataOnlyPRFixture[0], number: 509, title: 'Enforce no-bypass PR gates', body,
      state: 'closed', merged_at: '2026-02-27T23:00:00Z', closed_at: '2026-02-27T23:00:00Z',
      html_url: 'https://github.com/ojfbot/core/pull/509', additions: 20, deletions: 0,
    }
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh repo list')) return JSON.stringify([...repoListFixture, { name: 'core', isArchived: false, isFork: false, visibility: 'PUBLIC' }])
      if (cmd.includes('ojfbot/core/pulls?state=closed') || cmd.includes('ojfbot/core/pulls?state=all')) return JSON.stringify([pr])
      return mockExecSync(cmd)
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.mergedPRs.find((candidate) => candidate.number === 509)?.body).toBe(body)
    expect(ctx.recentPRs.find((candidate) => candidate.number === 509)?.body).toBe(body)
    const prompt = buildUserPrompt(ctx)
    const mergedWeek = prompt.split('## PRs merged in last 7 days')[1].split('## Open PRs')[0]
    const mergedDay = prompt.split('### MERGED IN LAST 24H')[1].split('### OPEN')[0]
    for (const section of [mergedWeek, buildReportUserPrompt(ctx)]) {
      expect(section).toContain('All 24 public defaults verified.')
      expect(section).toContain('27 active private repositories remain pending: current GitHub plan rejects private rulesets.')
    }
    expect(mergedDay).toContain('[#509: Enforce no-bypass PR gates](https://github.com/ojfbot/core/pull/509) MERGED')
    expect(mergedDay).not.toContain('All 24 public defaults verified.')
    expect(prompt.match(/All 24 public defaults verified\./g)).toHaveLength(1)
    for (const buildPrompt of [buildUserPrompt, buildReportUserPrompt]) {
      const recentOnly = buildPrompt({ ...ctx, mergedPRs: [] })
      expect(recentOnly).toContain('All 24 public defaults verified.')
      expect(recentOnly.match(/All 24 public defaults verified\./g)).toHaveLength(1)
      const missingWeeklyBody = buildPrompt({ ...ctx, mergedPRs: ctx.mergedPRs.map((pr) => ({ ...pr, body: undefined })) })
      expect(missingWeeklyBody.match(/All 24 public defaults verified\./g)).toHaveLength(1)
    }
  })

  it('bounds large merged bodies with an omission marker while preserving their conclusion', async () => {
    const body = `${'Audit detail. '.repeat(5000)}\nRollout: 24 public verified; 27 private pending.`
    const pr = { ...metadataOnlyPRFixture[0], body, state: 'closed', merged_at: '2026-02-27T23:00:00Z', closed_at: '2026-02-27T23:00:00Z', additions: 20, deletions: 0 }
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('ojfbot/shell/pulls?state=closed') || cmd.includes('ojfbot/shell/pulls?state=all')) return JSON.stringify([pr])
      return mockExecSync(cmd)
    })
    const ctx = await collectContext('2026-02-28')
    for (const collected of [ctx.mergedPRs[0], ctx.recentPRs[0]]) {
      expect(collected.body?.length).toBeLessThanOrEqual(6000)
      expect(collected.body).toMatch(/\[\.\.\.truncated \d+ chars/)
      expect(collected.body).toContain('Rollout: 24 public verified; 27 private pending.')
    }
    for (const prompt of [buildUserPrompt(ctx), buildReportUserPrompt(ctx)]) {
      expect(prompt).toContain('Rollout: 24 public verified; 27 private pending.')
      expect(prompt.match(/Rollout: 24 public verified/g)).toHaveLength(1)
    }
  })

  it('keeps the non-merged recent body preview at 400 characters', async () => {
    const body = 'x'.repeat(1000)
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('ojfbot/shell/pulls?state=all')) return JSON.stringify([{ ...metadataOnlyPRFixture[0], body }])
      return mockExecSync(cmd)
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.recentPRs[0].body).toBe('x'.repeat(400))
  })

  it('retains explicit merged false for a currently closed PR and leaves failed confirmation unknown', async () => {
    const closed = {
      ...metadataOnlyPRFixture[0],
      number: 12,
      state: 'closed',
      closed_at: '2026-02-27T23:00:00Z',
      merged_at: null,
      updated_at: '2026-02-27T23:00:00Z',
    }
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('ojfbot/shell/pulls?state=all')) return JSON.stringify([closed])
      if (cmd.includes('ojfbot/shell/pulls/12')) return JSON.stringify({ merged: false })
      return mockExecSync(cmd)
    })
    expect((await collectContext('2026-02-28')).recentPRs[0].merged).toBe(false)

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('ojfbot/shell/pulls?state=all')) return JSON.stringify([closed])
      if (cmd.includes('ojfbot/shell/pulls/12')) throw new Error('provider unavailable')
      return mockExecSync(cmd)
    })
    expect((await collectContext('2026-02-28')).recentPRs[0].merged).toBeUndefined()
  })

  it.each(['maximum bodies', 'short and missing bodies'])('bounds disjoint 15-weekly/30-recent cohorts with %s in both prompts', async (cohort) => {
    const mixed = cohort === 'short and missing bodies'
    const weekly = Array.from({ length: 15 }, (_, index) => ({
      ...metadataOnlyPRFixture[0], number: index + 1, title: `Weekly ${index + 1}`,
      html_url: `https://github.com/ojfbot/shell/pull/${index + 1}`,
      body: mixed && index === 0 ? 'Short weekly body' : mixed && index === 1 ? null : `WEEKLY-${index + 1}\n${'w'.repeat(65000)}\nWEEKLY-END-${index + 1}`,
      state: 'closed', merged_at: '2026-02-25T12:00:00Z', closed_at: '2026-02-25T12:00:00Z',
      updated_at: '2026-02-25T12:00:00Z', additions: 1, deletions: 0,
    }))
    const recent = Array.from({ length: 30 }, (_, index) => ({
      ...weekly[0], number: index + 100, title: `Recent ${index + 100}`,
      html_url: `https://github.com/ojfbot/shell/pull/${index + 100}`,
      body: mixed && index === 0 ? null : mixed && index === 1 ? 'Short recent body' : `RECENT-${index + 100}\n${'r'.repeat(65000)}\nRECENT-END-${index + 100}`,
      merged_at: '2026-02-27T23:00:00Z', closed_at: '2026-02-27T23:00:00Z',
      updated_at: '2026-02-27T23:00:00Z',
    }))
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('ojfbot/shell/pulls?state=closed')) return JSON.stringify(weekly)
      if (cmd.includes('ojfbot/shell/pulls?state=all')) return JSON.stringify(recent)
      return mockExecSync(cmd)
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.mergedPRs).toHaveLength(15)
    expect(ctx.recentPRs).toHaveLength(30)
    for (const buildPrompt of [buildUserPrompt, buildReportUserPrompt]) {
      const prompt = buildPrompt(ctx)
      const mergedSections = prompt.split(/(?=^#{2,3} )/m).filter((section) => /^## PRs merged|^### MERGED IN LAST 24H/.test(section)).join('\n')
      const quotes = mergedSections.split('\n').filter((line) => line.startsWith('  > ')).join('\n')
      expect(quotes.length).toBeLessThanOrEqual(24000)
      expect(MERGED_PR_EVIDENCE_CHARS).toBe(24000)
      expect(quotes.length).toBeGreaterThan(22000)
      for (const pr of [...weekly, ...recent]) {
        expect(prompt).toContain(`[#${pr.number}: ${pr.title}](${pr.html_url})`)
        if (pr.body && pr.body.length > 6000) {
          const prefix = pr.number < 100 ? 'WEEKLY' : 'RECENT'
          expect(prompt.match(new RegExp(`${prefix}-${pr.number}\\n`, 'g'))).toHaveLength(1)
          expect(prompt).toContain(`${prefix}-END-${pr.number}`)
        }
      }
      expect(prompt).toMatch(/truncated \d+ chars from middle/)
      if (mixed) {
        expect(prompt).toContain('Short weekly body')
        expect(prompt).toContain('Short recent body')
      }
      expect(buildPrompt(ctx)).toBe(prompt)
    }
  })
})

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

describe('collectContext — recent PR change classification', () => {
  it('records the head commit time for an old PR with a metadata-only update', async () => {
    const ctx = await collectContext('2026-02-28')
    const pr = ctx.recentPRs.find((candidate) => candidate.number === 11 && candidate.repo === 'shell')
    expect(pr?.headCommitAt).toBe('2026-02-20T12:00:00Z')
    expect(pr?.headRef).toBe('feat/old-pr')
  })

  it('keeps collecting when an old PR head commit cannot be resolved', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('/commits/old-head-sha')) throw new Error('HTTP 503')
      return mockExecSync(cmd)
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ctx = await collectContext('2026-02-28')
      const pr = ctx.recentPRs.find((candidate) => candidate.number === 11 && candidate.repo === 'shell')
      expect(pr?.headCommitAt).toBeUndefined()
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('Could not classify head commit for shell#11'))
    } finally {
      warning.mockRestore()
      vi.mocked(execSync).mockImplementation(mockExecSync)
    }
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

  it('marks newly created closed issues using the activity window, while retaining older closures', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('gh repo list')) return JSON.stringify(repoListFixture)
      if (cmd.includes('ojfbot/shell/issues?state=closed')) return JSON.stringify([
        { number: 999, title: 'New and closed', labels: [], html_url: 'https://github.com/ojfbot/shell/issues/999', body: null, created_at: '2026-02-27T10:00:00Z', updated_at: '2026-02-27T10:05:00Z', closed_at: '2026-02-27T10:05:00Z' },
        { number: 998, title: 'Old and closed', labels: [], html_url: 'https://github.com/ojfbot/shell/issues/998', body: null, created_at: '2026-02-20T10:00:00Z', updated_at: '2026-02-27T10:05:00Z', closed_at: '2026-02-27T10:05:00Z' },
      ])
      return mockExecSync(cmd)
    })
    const ctx = await collectContext('2026-02-28')
    expect(ctx.closedIssues.find((issue) => issue.number === 999)?.createdInWindow).toBe(true)
    expect(ctx.closedIssues.find((issue) => issue.number === 998)?.createdInWindow).toBe(false)
    expect(ctx.closedIssues).toHaveLength(2)
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
    expect(issue?.createdInWindow).toBe(true)
    expect(issue?.updatedAt).toBe('2026-02-27T23:00:00Z')
  })

  it('marks issue as isNew when updated_at is within 24h even if created_at is old', async () => {
    const ctx = await collectContext('2026-02-28')
    const issue = ctx.openIssues.find((i) => i.number === 7)
    expect(issue?.isNew).toBe(true)
    expect(issue?.createdInWindow).toBe(false)
    expect(issue?.updatedAt).toBe('2026-02-27T22:00:00Z')
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
    expect(ctx.repos).toEqual(['shell', 'BlogEngine', 'foundry-recipes'])
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
