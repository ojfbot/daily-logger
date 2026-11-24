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

const README = '# Shell\n\nThe shell app hosts every sub-app in the ojfbot fleet. Long enough to sweep.\n'

function commandError(cmd: string, stderr: string): Error {
  return Object.assign(new Error(`Command failed: ${cmd}\n${stderr}`), { status: 1, stderr })
}

type Overrides = Partial<Record<'readme' | 'push' | 'prCreate', (cmd: string) => string>>

function router(overrides: Overrides = {}) {
  return (cmd: string): string => {
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
