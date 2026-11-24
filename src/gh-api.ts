/**
 * One `gh api` GET with an honest outcome.
 *
 * - `ok`: parsed JSON.
 * - `empty-repository`: HTTP 409 "Git Repository is empty"; nothing there.
 * - `not-found`: HTTP 404. GitHub also answers 404 for a private resource the
 *   token cannot read, so only the caller can decide whether 404 means
 *   "nothing there" for its endpoint (#604).
 * - `failed`: anything else (rate limit, 5xx, lost access, timeout, bad JSON),
 *   carrying gh's own error text, so a broken call never reads as empty.
 *
 * Transient failures (5xx, timeouts) are retried a bounded number of times
 * with backoff. A rate limit (secondary-limit 403, or 429) is retried after
 * the server's Retry-After when it fits the budget; a secondary-limit 403
 * without Retry-After is not retried. Auth, permission and other 4xx errors
 * are never retried.
 *
 * Every call in one process shares one gh api time budget (attempts and
 * waits together). It caps each attempt's timeout and every wait; once it is
 * used up, calls fail at once without running gh, so a run reaches its
 * failure summary before the job's timeout-minutes cancels it.
 */

import { execSync } from 'child_process'

export type GhApiOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'empty-repository' }
  | { status: 'not-found'; detail: string }
  | { status: 'failed'; detail: string }

const DETAIL_MAX_CHARS = 500

/** Retry policy. Mutable only so tests can drop the backoff and fake the clock. */
export const GH_API_RETRY = {
  attempts: 3,
  baseDelayMs: 1_000,
  now: (): number => Date.now(),
  sleep(ms: number): void {
    if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  },
}

// ─── Run-wide time budget ─────────────────────────────────────────────────────

export const GH_API_BUDGET_ENV = 'GH_API_BUDGET_SECONDS'
/** 6 minutes: leaves room in daily-blog's 10-minute generate job for the rest of the run. */
export const DEFAULT_GH_API_BUDGET_SECONDS = 360

const budget = { limitMs: 0, spentMs: 0 }

function budgetLimitFromEnv(): number {
  const raw = process.env[GH_API_BUDGET_ENV]?.trim()
  const seconds = raw ? Number(raw) : NaN
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_GH_API_BUDGET_SECONDS) * 1000
}

/** Starts a fresh budget: `limitMs`, else GH_API_BUDGET_SECONDS, else the default. */
export function resetGhApiBudget(limitMs: number = budgetLimitFromEnv()): void {
  budget.limitMs = limitMs
  budget.spentMs = 0
}
resetGhApiBudget()

export function ghApiBudgetRemainingMs(): number {
  return Math.max(0, budget.limitMs - budget.spentMs)
}

function budgetUsedUpDetail(): string {
  return `not attempted: this run's gh api time budget (${Math.round(budget.limitMs / 1000)} s, ${GH_API_BUDGET_ENV}) is used up`
}

/** Waits `ms` and charges it to the budget. */
function wait(ms: number): void {
  GH_API_RETRY.sleep(ms)
  budget.spentMs += ms
}

// ─── Error classification ─────────────────────────────────────────────────────

/** The failing command's own error text: stderr when present, else the error message. */
export function commandErrorDetail(err: unknown): string {
  const { stderr, message } = (err ?? {}) as { stderr?: unknown; message?: unknown }
  const stderrText = typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf-8') : ''
  const text = stderrText.trim() || (typeof message === 'string' ? message : String(err))
  return text.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX_CHARS)
}

type FailureKind = 'transient' | 'rate-limit-429' | 'secondary-rate-limit' | 'permanent'

function classify(err: unknown, detail: string): FailureKind {
  if ((err as { code?: unknown } | null)?.code === 'ETIMEDOUT') return 'transient'
  if (/\bHTTP 5\d\d\b/.test(detail)) return 'transient'
  if (/\bHTTP 429\b/.test(detail)) return 'rate-limit-429'
  if (/\bHTTP 403\b/.test(detail) && /secondary rate limit/i.test(detail)) return 'secondary-rate-limit'
  if (/\b(i\/o timeout|context deadline exceeded|TLS handshake timeout)\b/i.test(detail)) return 'transient'
  return 'permanent'
}

/** `gh api --include` output: status line and headers, a blank line, then the body. */
function splitIncluded(raw: string): { headers: string; body: string } {
  if (!/^HTTP\/[\d.]+ \d{3}/.test(raw)) return { headers: '', body: raw }
  const match = /\r?\n\r?\n/.exec(raw)
  return match ? { headers: raw.slice(0, match.index), body: raw.slice(match.index + match[0].length) } : { headers: raw, body: '' }
}

/** Retry-After from a failed call's response headers, in ms; null when absent or unreadable. */
function retryAfterMs(err: unknown): number | null {
  const { stdout } = (err ?? {}) as { stdout?: unknown }
  const text = typeof stdout === 'string' ? stdout : Buffer.isBuffer(stdout) ? stdout.toString('utf-8') : ''
  const value = /^retry-after:[ \t]*(.+?)[ \t]*\r?$/im.exec(splitIncluded(text).headers)?.[1]
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value) * 1000
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - GH_API_RETRY.now())
}

// ─── The call ─────────────────────────────────────────────────────────────────

export function ghApiOutcome<T>(endpoint: string, options: { timeout: number; maxBuffer: number }): GhApiOutcome<T> {
  const attempts = Math.max(1, GH_API_RETRY.attempts)
  for (let attempt = 1; ; attempt++) {
    const remaining = ghApiBudgetRemainingMs()
    if (remaining <= 0) return { status: 'failed', detail: budgetUsedUpDetail() }
    const after = (detail: string) => (attempt > 1 ? `${detail} (after ${attempt} attempts)` : detail)

    let raw: string
    const started = GH_API_RETRY.now()
    try {
      // --include puts the status line and headers first, so a rate-limited
      // failure carries Retry-After. The endpoint stays right after `gh api`.
      raw = execSync(`gh api "${endpoint}" --include`, {
        encoding: 'utf-8',
        env: { ...process.env },
        timeout: Math.min(options.timeout, remaining),
        maxBuffer: options.maxBuffer,
        // Capture stderr so the caller can show gh's reason, instead of /dev/null.
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      budget.spentMs += Math.max(0, GH_API_RETRY.now() - started)
      const detail = commandErrorDetail(err)
      if (/Git Repository is empty/i.test(detail)) return { status: 'empty-repository' }
      if (/\bHTTP 404\b/.test(detail)) return { status: 'not-found', detail }

      const kind = classify(err, detail)
      if (kind === 'permanent' || attempt >= attempts) return { status: 'failed', detail: after(detail) }
      const left = ghApiBudgetRemainingMs()

      if (kind === 'secondary-rate-limit' || kind === 'rate-limit-429') {
        const retryAfter = retryAfterMs(err)
        if (retryAfter === null && kind === 'secondary-rate-limit') {
          return { status: 'failed', detail: after(`${detail} (secondary rate limit with no Retry-After; not retried)`) }
        }
        if (retryAfter !== null) {
          if (retryAfter >= left) {
            return { status: 'failed', detail: after(`${detail} (Retry-After ${Math.ceil(retryAfter / 1000)} s does not fit the remaining gh api time budget; not retried)`) }
          }
          wait(retryAfter)
          continue
        }
      }

      const delay = GH_API_RETRY.baseDelayMs * 2 ** (attempt - 1)
      if (delay >= left) return { status: 'failed', detail: after(`${detail} (no gh api time budget left to retry)`) }
      wait(delay)
      continue
    }
    budget.spentMs += Math.max(0, GH_API_RETRY.now() - started)
    const { body } = splitIncluded(String(raw))
    try {
      return { status: 'ok', data: JSON.parse(body) as T }
    } catch {
      return { status: 'failed', detail: `response was not valid JSON (${body.length} bytes)` }
    }
  }
}
