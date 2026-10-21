import { afterEach, describe, expect, it, vi } from 'vitest'
import { execSync } from 'child_process'
import { activityWindow } from '../activity-window.js'
import { collectContext } from '../collect-context.js'
import { buildUserPrompt } from '../generate-article.js'
import { buildReportUserPrompt } from '../generate-report.js'

vi.mock('child_process', () => ({ execSync: vi.fn() }))
vi.mock('../fleet.js', () => ({ discoverRepos: () => ['shell'], reportSurfaceDrift: () => [] }))
vi.mock('../collect-telemetry.js', () => ({ collectTelemetry: () => null }))
afterEach(() => vi.restoreAllMocks())

describe('collector activity versus current context', () => {
  it('does not query GitHub for an interval whose cutoff has not arrived', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T08:29:59Z'))
    vi.mocked(execSync).mockClear()
    await expect(collectContext('2026-10-19')).rejects.toThrow('Reporting interval has not closed')
    expect(execSync).not.toHaveBeenCalled()
  })

  it('bounds every event category and never promotes a later merge from an earlier opening', async () => {
    const window = activityWindow('2026-10-19')
    const stamps = [window.start - 1, window.start, window.end - 1, window.end, window.end + 1]
      .map((time) => new Date(time).toISOString())
    const prs = stamps.map((ts, index) => ({
      number: index + 1, title: `PR ${index + 1}`, html_url: `https://github.com/ojfbot/shell/pull/${index + 1}`,
      body: 'Current description', state: 'closed', created_at: '2026-01-01T00:00:00Z',
      updated_at: ts, merged_at: ts, closed_at: ts, additions: 1, deletions: 0,
      draft: false, user: { login: 'test' }, head: { sha: 'head', ref: 'feature' },
    }))
    prs.push({ ...prs[0], number: 99, title: 'Opened before cutoff, merged later',
      html_url: 'https://github.com/ojfbot/shell/pull/99', created_at: stamps[1],
      updated_at: stamps[4], merged_at: stamps[4], closed_at: stamps[4],
    })
    const issues = stamps.map((ts, index) => ({
      number: index + 1, title: `Issue ${index + 1}`, html_url: `https://github.com/ojfbot/shell/issues/${index + 1}`,
      labels: [], body: 'Current issue description', created_at: ts, updated_at: ts, closed_at: ts,
    }))
    vi.mocked(execSync).mockImplementation((command) => {
      const cmd = String(command)
      if (cmd.includes('/commits?')) return JSON.stringify(stamps.map((ts, index) => ({
        sha: `${index}`.repeat(40), commit: { message: `Commit ${index}`, author: { name: 'fixture', date: ts } },
        html_url: `https://github.com/ojfbot/shell/commit/${index}`,
      })))
      if (cmd.includes('/pulls?state=all') || cmd.includes('/pulls?state=closed')) return JSON.stringify(prs)
      if (cmd.includes('/pulls?state=open')) return '[]'
      if (cmd.includes('/comments?')) return JSON.stringify([
        ...stamps.map((created_at) => ({
          created_at, updated_at: created_at, body: '<!-- skill-usage-report --> `/validate` ran. 1 offered, 1 followed',
        })),
        { created_at: stamps[0], updated_at: stamps[1], body: '<!-- skill-usage-update --> `/validate` ran. 1 offered, 1 followed' },
        { created_at: stamps[1], updated_at: stamps[4], body: '<!-- skill-usage-report --> `/validate` ran. 999 offered, 999 followed' },
      ])
      if (cmd.includes('/issues?state=')) return JSON.stringify(issues)
      if (cmd.includes('/commits/head')) return JSON.stringify({ commit: { committer: { date: stamps[4] } } })
      return '[]'
    })
    const ctx = await collectContext('2026-10-19')
    expect(ctx.commits.map((c) => c.message)).toEqual(['Commit 2', 'Commit 1'])
    expect(ctx.mergedPRs.map((pr) => pr.number).sort()).toEqual([1, 2, 3]) // Seven-period context includes yesterday's last event.
    expect(ctx.closedIssues.map((issue) => issue.number)).toEqual([1, 2, 3])
    expect(ctx.closedIssues.filter((issue) => issue.createdInWindow).map((issue) => issue.number)).toEqual([2, 3])
    expect(ctx.recentPRs.map((pr) => pr.number).sort((a, b) => a - b)).toEqual([2, 3, 99])
    expect(ctx.recentPRs.find((pr) => pr.number === 99)?.mergedAt).toBe(stamps[4]) // Preserve observed state, never invent historical state.
    expect(ctx.recentPRs[0].skillUsage).toMatchObject({ commentCount: 3, suggestionsGiven: 3 })
    expect(ctx.openIssues.filter((issue) => issue.isNew).map((issue) => issue.number).sort()).toEqual([2, 3])
    expect(ctx.openIssues.filter((issue) => issue.createdInWindow).map((issue) => issue.number).sort()).toEqual([2, 3])
    expect(ctx.openIssues.some((issue) => issue.number === 5)).toBe(true) // Current queue context remains available.
    expect(ctx.previousArticles.every((article) => article.date < ctx.date)).toBe(true)
    const command = vi.mocked(execSync).mock.calls.find(([cmd]) => String(cmd).includes('/commits?'))?.[0]
    expect(String(command)).toContain(`until=${encodeURIComponent(new Date(window.end).toISOString())}`)
    const prompt = buildUserPrompt(ctx)
    const mergedSection = prompt.split('### MERGED IN REPORTING WINDOW')[1].split('### OTHER PR ACTIVITY')[0]
    expect(mergedSection).toContain('#2: PR 2')
    expect(mergedSection).not.toContain('#99')
    expect(prompt).toContain('#99: Opened before cutoff, merged later. Recorded events: created')
    expect(prompt).toContain('Current status: merged.')
    expect(prompt).toContain('not reconstructed cutoff snapshots')
    expect(prompt).not.toContain(`MERGED ${stamps[4]}`)
    const report = buildReportUserPrompt(ctx)
    expect(report).not.toContain('#99: Opened before cutoff, merged later')
    expect(report).toContain('2026-10-18T08:30:00.000Z inclusive to 2026-10-19T08:30:00.000Z exclusive')
  })
})
