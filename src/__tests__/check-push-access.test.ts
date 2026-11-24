import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// The cleaner's pre-flight must prove push rights, not just read access.
// Every remote here is local: a bare repository on disk (writable) and a
// `git daemon` on 127.0.0.1 that serves reads only. Nothing leaves the machine.

const SCRIPT = resolve('.github/scripts/check-push-access.sh')
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }

function git(args: string[], cwd?: string) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf-8' })
}

let root: string
let bare: string
let daemon: ChildProcess | undefined
let readOnlyUrl: string

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'push-access-'))
  bare = join(root, 'remote.git')
  expect(git(['init', '-q', '--bare', bare]).status).toBe(0)
  const seed = join(root, 'seed')
  expect(git(['init', '-q', seed]).status).toBe(0)
  expect(git(['-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'seed'], seed).status).toBe(0)
  expect(git(['push', '-q', bare, 'HEAD:refs/heads/main'], seed).status).toBe(0)

  // Read-only remote: git daemon enables upload-pack (fetch/ls-remote) by
  // default and refuses receive-pack (push) unless it is explicitly enabled.
  const port = 20000 + Math.floor(Math.random() * 30000)
  readOnlyUrl = `git://127.0.0.1:${port}/remote.git`
  daemon = spawn('git', ['daemon', '--export-all', `--base-path=${root}`, '--listen=127.0.0.1', `--port=${port}`, '--reuseaddr', root], { env, stdio: 'ignore' })
  const deadline = Date.now() + 10_000
  while (git(['ls-remote', readOnlyUrl]).status !== 0) {
    if (Date.now() > deadline) throw new Error('local git daemon did not start')
    await new Promise((done) => setTimeout(done, 100))
  }
}, 20_000)

afterAll(() => {
  daemon?.kill()
  rmSync(root, { recursive: true, force: true })
})

function check(remote: string) {
  return spawnSync('bash', [SCRIPT, remote], { env, encoding: 'utf-8' })
}

describe('push access pre-flight', () => {
  it('reproduces the gap: ls-remote succeeds on a remote that refuses pushes', () => {
    expect(git(['ls-remote', readOnlyUrl, 'HEAD']).status).toBe(0)
  })

  it('fails, naming the remote, when the remote serves reads but refuses pushes', () => {
    const result = check(readOnlyUrl)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(readOnlyUrl)
  })

  it('passes on a writable remote without creating any branch there', () => {
    const before = git(['for-each-ref', '--format=%(refname)'], bare).stdout
    const result = check(bare)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('nothing was pushed')
    expect(git(['for-each-ref', '--format=%(refname)'], bare).stdout).toBe(before)
  })
})
