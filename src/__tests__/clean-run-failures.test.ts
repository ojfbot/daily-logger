import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'fs'
import { join } from 'path'

// The cleaner CLI must not end "✓ Done" with exit 0 after a real failure.
// Everything external is a test double: no GitHub, no git remote, no model.

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('child_process', () => ({ execSync: vi.fn() }))
vi.mock('../collect-context.js', () => ({ collectContext: vi.fn() }))
vi.mock('../check-anthropic-credits.js', () => ({ checkAnthropicCredits: vi.fn(async () => {}) }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

import { execSync } from 'child_process'
import { collectContext } from '../collect-context.js'
import { main } from '../clean.js'
import { GH_API_RETRY, resetGhApiBudget } from '../gh-api.js'

// Transient gh failures are retried with backoff; no real waiting in tests.
GH_API_RETRY.baseDelayMs = 0

const README = '# Shell\n\nThe shell app hosts every sub-app in the ojfbot fleet. Long enough to sweep.\n'

function commandError(cmd: string, stderr: string): Error {
  return Object.assign(new Error(`Command failed: ${cmd}\n${stderr}`), { status: 1, stderr })
}

type Overrides = Partial<Record<'readme' | 'push' | 'prCreate', (cmd: string) => string>> & {
  /** Checked first: [substring of the command, answer]. */
  routes?: Array<[string, (cmd: string) => string]>
}

const base64 = (text: string) => Buffer.from(text).toString('base64')

function router(overrides: Overrides = {}) {
  return (cmd: string): string => {
    for (const [match, answer] of overrides.routes ?? []) if (cmd.includes(match)) return answer(cmd)
    if (cmd.includes('repos/ojfbot/shell/contents/README.md')) {
      if (overrides.readme) return overrides.readme(cmd)
      return JSON.stringify({ encoding: 'base64', content: Buffer.from(README).toString('base64') })
    }
    if (cmd.includes('/contents/')) throw commandError(cmd, 'gh: Not Found (HTTP 404)')
    if (cmd.includes('/git/ref/heads/')) throw commandError(cmd, 'gh: Not Found (HTTP 404)')
    if (cmd.includes('repos/ojfbot/shell/commits?')) return '[]'
    if (cmd.startsWith('gh repo clone')) {
      const dir = cmd.split(' ').at(-1)!
      writeFileSync(join(dir, 'README.md'), README)
      return ''
    }
    if (cmd.includes(' push ')) return overrides.push ? overrides.push(cmd) : ''
    if (cmd.startsWith('gh pr create')) {
      return overrides.prCreate ? overrides.prCreate(cmd) : 'https://github.com/ojfbot/shell/pull/1\n'
    }
    if (cmd.startsWith('git ')) return ''
    throw new Error(`unexpected command in test: ${cmd}`)
  }
}

const staleEdit = [{ startLine: 1, endLine: 1, original: '# Shell', replacement: '# Shell app', rationale: 'Renamed in a recent commit.', confidence: 'high' }]

let logs: string[]
let errors: string[]

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-no-provider-call')
  vi.stubEnv('GH_TOKEN', 'synthetic-no-github-call')
  vi.stubEnv('DATE_OVERRIDE', '2026-11-20')
  vi.stubEnv('DRY_RUN', 'false')
  vi.stubEnv('TARGET_REPO', '')
  vi.stubEnv('OJFBOT_ORG', 'ojfbot')
  logs = []
  errors = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')) })
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')) })
  vi.mocked(collectContext).mockResolvedValue({
    date: '2026-11-20',
    repos: ['shell'],
    commits: [{ hash: 'abc1234', fullHash: 'abc1234'.padEnd(40, '0'), message: 'rename shell', author: 'a', date: '2026-11-20T01:00:00Z', repo: 'shell', url: 'https://github.com/ojfbot/shell/commit/abc1234' }],
  } as never)
  create.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(staleEdit) }] })
  vi.mocked(execSync).mockImplementation(router() as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  create.mockReset()
})

describe('cleaner run outcome', () => {
  it('exits 0 and reports done when every step succeeds', async () => {
    expect(await main()).toBe(0)
    expect(logs.join('\n')).toContain('✓ PR opened: https://github.com/ojfbot/shell/pull/1')
    expect(logs.join('\n')).toContain('✓ Done.')
    expect(errors).toEqual([])
  })

  it('exits non-zero and names the repo and git error when the push fails', async () => {
    vi.mocked(execSync).mockImplementation(router({
      push: (cmd) => { throw commandError(cmd, "remote: Permission to ojfbot/shell.git denied to cleaner-bot.\nfatal: unable to access 'https://github.com/ojfbot/shell.git/': The requested URL returned error: 403") },
    }) as never)
    expect(await main()).toBe(1)
    const report = errors.join('\n')
    expect(report).toContain('ojfbot/shell')
    expect(report).toMatch(/push/i)
    expect(report).toContain('Permission to ojfbot/shell.git denied')
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })

  it('exits non-zero instead of printing "PR opened: undefined" when gh pr create fails', async () => {
    vi.mocked(execSync).mockImplementation(router({
      prCreate: (cmd) => { throw commandError(cmd, 'pull request create failed: GraphQL: Resource not accessible by personal access token (createPullRequest)') },
    }) as never)
    expect(await main()).toBe(1)
    expect(logs.join('\n')).not.toContain('PR opened: undefined')
    const report = errors.join('\n')
    expect(report).toContain('ojfbot/shell')
    expect(report).toContain('Resource not accessible by personal access token')
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })

  it('exits non-zero and names the file and model error when doc validation fails', async () => {
    create.mockRejectedValue(new Error('529 overloaded_error'))
    expect(await main()).toBe(1)
    const report = errors.join('\n')
    expect(report).toContain('shell/README.md')
    expect(report).toContain('529 overloaded_error')
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })

  it('exits non-zero when a doc validation reply is not valid JSON', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }] })
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toContain('shell/README.md')
  })

  it('exits non-zero instead of "no candidates" when the sweep cannot read a file from GitHub', async () => {
    vi.mocked(execSync).mockImplementation(router({
      readme: (cmd) => { throw commandError(cmd, 'gh: Server Error (HTTP 502)') },
    }) as never)
    expect(await main()).toBe(1)
    const report = errors.join('\n')
    expect(report).toContain('repos/ojfbot/shell/contents/README.md')
    expect(report).toContain('HTTP 502')
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })
})

describe('cleaner run outcome — reruns, replies and reads', () => {
  const branchExists: [string, () => string] = ['/git/ref/heads/clean/2026-11-20', () => JSON.stringify({ ref: 'refs/heads/clean/2026-11-20' })]

  it('records a failure when today\'s branch already exists but has no PR', async () => {
    vi.mocked(execSync).mockImplementation(router({ routes: [branchExists, ['/pulls?head=', () => '[]']] }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toMatch(/ojfbot\/shell.*branch clean\/2026-11-20 exists but has no PR/)
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })

  it('skips the repo and exits 0 when today\'s branch already has its PR', async () => {
    vi.mocked(execSync).mockImplementation(router({
      routes: [branchExists, ['/pulls?head=', () => JSON.stringify([{ html_url: 'https://github.com/ojfbot/shell/pull/9' }])]],
    }) as never)
    expect(await main()).toBe(0)
    expect(logs.join('\n')).toContain('pull/9')
  })

  it('records a failure when the PR lookup for an existing branch fails', async () => {
    vi.mocked(execSync).mockImplementation(router({
      routes: [branchExists, ['/pulls?head=', (cmd) => { throw commandError(cmd, 'gh: Bad credentials (HTTP 401)') }]],
    }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toContain('Bad credentials (HTTP 401)')
  })

  it.each([
    ['a doc edit with no fields', { content: [{ type: 'text', text: '[{}]' }] }],
    ['a doc reply that is an object, not a list', { content: [{ type: 'text', text: '{"edits":[]}' }] }],
    ['a doc reply with no text block', { content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] }],
    ['a doc edit with an unknown confidence', { content: [{ type: 'text', text: JSON.stringify([{ ...staleEdit[0], confidence: 'certain' }]) }] }],
  ])('records a validation failure for %s', async (_label, reply) => {
    create.mockResolvedValue(reply)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toMatch(/\[validate\] shell\/README\.md: model reply/)
  })

  describe('TODO validation', () => {
    const source = 'export const x = 1\n// TODO: remove the legacy shell bootstrap once routing ships\n'
    const todoRoutes: Array<[string, (cmd: string) => string]> = [
      ['repos/ojfbot/shell/contents/README.md', (cmd) => { throw commandError(cmd, 'gh: Not Found (HTTP 404)') }],
      ['repos/ojfbot/shell/commits?', () => JSON.stringify([{ sha: 'c1' }])],
      ['repos/ojfbot/shell/commits/c1', () => JSON.stringify({ files: [{ filename: 'src/boot.ts', status: 'modified' }] })],
      ['contents/src%2Fboot.ts', () => JSON.stringify({ type: 'file', encoding: 'base64', content: base64(source) })],
    ]

    it.each([
      ['an empty object', '{}'],
      ['a resolved verdict without evidence', '{"resolved":true,"confidence":"high","replacement":""}'],
      ['a resolved verdict without a replacement', '{"resolved":true,"confidence":"high","evidence":"Shipped in #12."}'],
    ])('records a validation failure for %s', async (_label, text) => {
      vi.mocked(execSync).mockImplementation(router({ routes: todoRoutes }) as never)
      create.mockResolvedValue({ content: [{ type: 'text', text }] })
      expect(await main()).toBe(1)
      expect(errors.join('\n')).toMatch(/\[validate\] shell\/src\/boot\.ts:2: model reply/)
    })

    it('accepts a well-formed "not resolved" verdict as nothing stale', async () => {
      vi.mocked(execSync).mockImplementation(router({ routes: todoRoutes }) as never)
      create.mockResolvedValue({ content: [{ type: 'text', text: '{"resolved":false,"confidence":"high"}' }] })
      expect(await main()).toBe(0)
      expect(logs.join('\n')).toContain('✓ Done (nothing stale).')
    })
  })

  it('records a failure when the commit list 404s on a repo with activity', async () => {
    vi.mocked(execSync).mockImplementation(router({
      routes: [['repos/ojfbot/shell/commits?', (cmd) => { throw commandError(cmd, 'gh: Not Found (HTTP 404)') }]],
    }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toMatch(/repos\/ojfbot\/shell\/commits\?.*HTTP 404/)
  })

  it('reads a file over 1 MB through the blob API instead of skipping it', async () => {
    vi.mocked(execSync).mockImplementation(router({
      readme: () => JSON.stringify({ type: 'file', encoding: 'none', content: '', sha: 'bigblob', size: 2_000_000 }),
      routes: [['repos/ojfbot/shell/git/blobs/bigblob', () => JSON.stringify({ encoding: 'base64', content: base64(README) })]],
    }) as never)
    expect(await main()).toBe(0)
    expect(create).toHaveBeenCalled()
    expect(logs.join('\n')).toContain('✓ PR opened')
  })

  it('records a failure when a file over 1 MB cannot be read through the blob API', async () => {
    vi.mocked(execSync).mockImplementation(router({
      readme: () => JSON.stringify({ type: 'file', encoding: 'none', content: '', sha: 'bigblob', size: 2_000_000 }),
      routes: [['repos/ojfbot/shell/git/blobs/bigblob', (cmd) => { throw commandError(cmd, 'gh: Server Error (HTTP 500)') }]],
    }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toMatch(/git\/blobs\/bigblob.*HTTP 500.*after 3 attempts/)
  })

  it('retries a transient 502 on a sweep read and finishes normally', async () => {
    let calls = 0
    vi.mocked(execSync).mockImplementation(router({
      readme: (cmd) => {
        if (++calls === 1) throw commandError(cmd, 'gh: Bad Gateway (HTTP 502)')
        return JSON.stringify({ type: 'file', encoding: 'base64', content: base64(README) })
      },
    }) as never)
    expect(await main()).toBe(0)
    expect(calls).toBe(2)
  })
})

describe('cleaner run outcome — orphan branches and the gh api budget', () => {
  const orphan: Array<[string, () => string]> = [
    ['/git/ref/heads/clean/2026-11-20', () => JSON.stringify({ ref: 'refs/heads/clean/2026-11-20' })],
    ['/pulls?head=', () => '[]'],
  ]

  it('exits non-zero when validation finds nothing stale but an orphan branch is left from an earlier run', async () => {
    vi.mocked(execSync).mockImplementation(router({ routes: orphan }) as never)
    create.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] })
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toMatch(/ojfbot\/shell.*branch clean\/2026-11-20 exists but has no PR/)
    expect(logs.join('\n')).not.toMatch(/✓ Done/)
  })

  it('exits non-zero on a day with no activity when an orphan branch is left', async () => {
    vi.mocked(collectContext).mockResolvedValue({ date: '2026-11-20', repos: ['shell'], commits: [] } as never)
    vi.mocked(execSync).mockImplementation(router({ routes: orphan }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toContain('exists but has no PR')
  })

  it('exits non-zero with no candidates when an orphan branch is left', async () => {
    vi.mocked(execSync).mockImplementation(router({
      readme: (cmd) => { throw commandError(cmd, 'gh: Not Found (HTTP 404)') },
      routes: orphan,
    }) as never)
    expect(await main()).toBe(1)
    expect(errors.join('\n')).toContain('exists but has no PR')
  })

  it('checks only today\'s branch name and passes when no branch is left', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] })
    vi.mocked(execSync).mockClear()
    expect(await main()).toBe(0)
    const calls = vi.mocked(execSync).mock.calls.map((call) => String(call[0]))
    expect(calls.some((call) => call.includes('repos/ojfbot/shell/git/ref/heads/clean/2026-11-20'))).toBe(true)
  })

  it('stops calling gh when the budget is used up, then prints the summary and exits 1', async () => {
    const realNow = GH_API_RETRY.now
    let clock = 0
    GH_API_RETRY.now = () => clock
    resetGhApiBudget(30_000)
    try {
      vi.mocked(execSync).mockImplementation(router({
        readme: () => { clock += 30_000; return JSON.stringify({ type: 'file', encoding: 'base64', content: base64(README) }) },
      }) as never)
      expect(await main()).toBe(1)
      const report = errors.join('\n')
      expect(report).toMatch(/Cleaner finished with \d+ failure/)
      expect(report).toContain("gh api time budget (30 s, GH_API_BUDGET_SECONDS) is used up")
    } finally {
      GH_API_RETRY.now = realNow
      resetGhApiBudget()
    }
  })
})
