import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({ execSync: vi.fn() }))

import { execSync } from 'child_process'
import { GH_API_RETRY, ghApiOutcome } from '../gh-api.js'

const OPTIONS = { timeout: 1_000, maxBuffer: 1024 * 1024 }

function ghError(stderr: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`Command failed: gh api\n${stderr}`), { status: 1, stderr, ...extra })
}

/** execSync double: each call takes the next answer; an Error is thrown. */
function answers(...replies: Array<string | Error>) {
  vi.mocked(execSync).mockImplementation((() => {
    const reply = replies.shift()
    if (reply === undefined) throw new Error('no more answers')
    if (reply instanceof Error) throw reply
    return reply
  }) as never)
}

const realSleep = GH_API_RETRY.sleep
let delays: number[]

beforeEach(() => {
  vi.mocked(execSync).mockReset()
  delays = []
  GH_API_RETRY.sleep = (ms: number) => { delays.push(ms) }
})

afterEach(() => {
  GH_API_RETRY.sleep = realSleep
})

describe('ghApiOutcome retries', () => {
  it('succeeds when a 5xx clears on retry, with backoff between attempts', () => {
    answers(ghError('gh: Bad Gateway (HTTP 502)'), ghError('HTTP 503: Service Unavailable'), '{"ok":true}')
    expect(ghApiOutcome('repos/o/r/commits', OPTIONS)).toEqual({ status: 'ok', data: { ok: true } })
    expect(execSync).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([GH_API_RETRY.baseDelayMs, GH_API_RETRY.baseDelayMs * 2])
  })

  it('fails with gh error text after the last attempt when the 5xx persists', () => {
    answers(...Array.from({ length: GH_API_RETRY.attempts }, () => ghError('gh: Bad Gateway (HTTP 502)')))
    const outcome = ghApiOutcome('repos/o/r/commits', OPTIONS)
    expect(outcome).toEqual({ status: 'failed', detail: `gh: Bad Gateway (HTTP 502) (after ${GH_API_RETRY.attempts} attempts)` })
    expect(execSync).toHaveBeenCalledTimes(GH_API_RETRY.attempts)
  })

  it.each([
    ['a 429', ghError('gh: Too Many Requests (HTTP 429)')],
    ['a secondary rate limit 403', ghError('gh: You have exceeded a secondary rate limit. Please wait a few minutes before you try again. (HTTP 403)')],
    ['a command timeout', Object.assign(new Error('spawnSync /bin/sh ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ['a network timeout', ghError('Get "https://api.github.com/repos/o/r": net/http: TLS handshake timeout')],
  ])('retries %s', (_label, first) => {
    answers(first, '[]')
    expect(ghApiOutcome('repos/o/r/commits', OPTIONS)).toEqual({ status: 'ok', data: [] })
    expect(execSync).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['bad credentials', ghError('gh: Bad credentials (HTTP 401)'), 'failed'],
    ['a permission 403', ghError('gh: Resource not accessible by personal access token (HTTP 403)'), 'failed'],
    ['a primary rate limit 403', ghError('gh: API rate limit exceeded for user ID 1. (HTTP 403)'), 'failed'],
    ['a 422', ghError('gh: Validation Failed (HTTP 422)'), 'failed'],
    ['a 404', ghError('gh: Not Found (HTTP 404)'), 'not-found'],
    ['an empty repository', ghError('gh: Git Repository is empty. (HTTP 409)'), 'empty-repository'],
  ])('never retries %s', (_label, error, status) => {
    answers(error, '[]')
    expect(ghApiOutcome('repos/o/r/commits', OPTIONS).status).toBe(status)
    expect(execSync).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })
})
