import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({ execSync: vi.fn() }))

import { execSync } from 'child_process'
import { DEFAULT_GH_API_BUDGET_SECONDS, GH_API_RETRY, ghApiBudgetRemainingMs, ghApiOutcome, resetGhApiBudget } from '../gh-api.js'

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
const realNow = GH_API_RETRY.now
let delays: number[]
/** Fake clock: waits and (in budget tests) slow calls advance it. */
let clock: number

beforeEach(() => {
  vi.mocked(execSync).mockReset()
  delays = []
  clock = 0
  GH_API_RETRY.now = () => clock
  GH_API_RETRY.sleep = (ms: number) => { delays.push(ms); clock += ms }
  resetGhApiBudget(10 * 60_000)
})

afterEach(() => {
  GH_API_RETRY.sleep = realSleep
  GH_API_RETRY.now = realNow
  vi.unstubAllEnvs()
  resetGhApiBudget()
})

/** A rate-limited failure whose `gh api --include` stdout carries headers. */
function rateLimited(status: 403 | 429, retryAfter?: string): Error {
  const message = status === 403 ? 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' : 'Too Many Requests'
  const headers = [`HTTP/2.0 ${status} ${status === 403 ? 'Forbidden' : 'Too Many Requests'}`, 'Content-Type: application/json', ...(retryAfter ? [`Retry-After: ${retryAfter}`] : [])]
  return ghError(`gh: ${message} (HTTP ${status})`, { stdout: `${headers.join('\r\n')}\r\n\r\n{"message":"${message}"}` })
}

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
    ['a 429 without Retry-After', ghError('gh: Too Many Requests (HTTP 429)')],
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

describe('ghApiOutcome rate limits', () => {
  it('waits the Retry-After seconds on a secondary rate limit, then succeeds', () => {
    answers(rateLimited(403, '30'), '[]')
    expect(ghApiOutcome('repos/o/r/commits', OPTIONS)).toEqual({ status: 'ok', data: [] })
    expect(delays).toEqual([30_000])
  })

  it('honours an HTTP-date Retry-After on a 429', () => {
    answers(rateLimited(429, new Date(clock + 45_000).toUTCString()), '[]')
    expect(ghApiOutcome('repos/o/r/commits', OPTIONS).status).toBe('ok')
    expect(delays).toEqual([45_000])
  })

  it('does not retry a secondary rate limit that has no Retry-After', () => {
    answers(rateLimited(403), '[]')
    const outcome = ghApiOutcome('repos/o/r/commits', OPTIONS)
    expect(outcome).toMatchObject({ status: 'failed', detail: expect.stringContaining('no Retry-After; not retried') })
    expect(execSync).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('does not wait a Retry-After that does not fit the remaining budget', () => {
    resetGhApiBudget(60_000)
    answers(rateLimited(403, '120'), '[]')
    const outcome = ghApiOutcome('repos/o/r/commits', OPTIONS)
    expect(outcome).toMatchObject({ status: 'failed', detail: expect.stringContaining('Retry-After 120 s does not fit') })
    expect(execSync).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })
})

describe('ghApiOutcome run-wide time budget', () => {
  /** Every call hangs until its (capped) timeout, as a stuck network would. */
  function hangUntilTimeout() {
    const timeouts: number[] = []
    vi.mocked(execSync).mockImplementation(((_cmd: string, opts: { timeout: number }) => {
      timeouts.push(opts.timeout)
      clock += opts.timeout
      throw Object.assign(new Error('spawnSync /bin/sh ETIMEDOUT'), { code: 'ETIMEDOUT' })
    }) as never)
    return timeouts
  }

  it('caps attempt timeouts and backoff so all calls together stay inside the budget', () => {
    resetGhApiBudget(100_000)
    const timeouts = hangUntilTimeout()
    const outcomes = [1, 2, 3, 4].map(() => ghApiOutcome('repos/o/r/commits', { timeout: 30_000, maxBuffer: 1024 }))
    // Call 1: three 30 s attempts with 1 s and 2 s backoff (93 s). Call 2: the
    // last 7 s, no time left to retry. Calls 3-4: never run gh.
    expect(timeouts).toEqual([30_000, 30_000, 30_000, 7_000])
    expect(delays).toEqual([1_000, 2_000])
    expect(clock).toBe(100_000)
    expect(ghApiBudgetRemainingMs()).toBe(0)
    expect(outcomes[1]).toMatchObject({ status: 'failed', detail: expect.stringContaining('no gh api time budget left to retry') })
    for (const outcome of outcomes.slice(2)) {
      expect(outcome).toEqual({ status: 'failed', detail: "not attempted: this run's gh api time budget (100 s, GH_API_BUDGET_SECONDS) is used up" })
    }
  })

  it('does not sleep a backoff longer than the budget left', () => {
    resetGhApiBudget(30_500)
    hangUntilTimeout()
    ghApiOutcome('repos/o/r/commits', { timeout: 30_000, maxBuffer: 1024 })
    expect(delays).toEqual([])
    expect(clock).toBe(30_000)
  })

  it.each([
    ['5', 5_000],
    ['abc', DEFAULT_GH_API_BUDGET_SECONDS * 1000],
    ['0', DEFAULT_GH_API_BUDGET_SECONDS * 1000],
    ['-3', DEFAULT_GH_API_BUDGET_SECONDS * 1000],
    ['', DEFAULT_GH_API_BUDGET_SECONDS * 1000],
  ])('reads GH_API_BUDGET_SECONDS=%j with a safe default', (value, expected) => {
    vi.stubEnv('GH_API_BUDGET_SECONDS', value)
    resetGhApiBudget()
    expect(ghApiBudgetRemainingMs()).toBe(expected)
  })

  it('defaults to 6 minutes', () => {
    expect(DEFAULT_GH_API_BUDGET_SECONDS).toBe(360)
  })
})

describe('ghApiOutcome response parsing', () => {
  it('asks gh for headers and parses the body after them', () => {
    answers('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"a":1}')
    expect(ghApiOutcome('repos/o/r', OPTIONS)).toEqual({ status: 'ok', data: { a: 1 } })
    expect(String(vi.mocked(execSync).mock.calls[0][0])).toBe('gh api "repos/o/r" --include')
  })
})
