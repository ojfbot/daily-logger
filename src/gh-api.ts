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
 * Transient failures (5xx, timeouts, secondary rate limits / 429) are retried
 * a bounded number of times with backoff. Auth, permission and other 4xx
 * errors are never retried.
 */

import { execSync } from 'child_process'

export type GhApiOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'empty-repository' }
  | { status: 'not-found'; detail: string }
  | { status: 'failed'; detail: string }

const DETAIL_MAX_CHARS = 500

/** Retry policy. Mutable only so tests can drop the backoff to zero. */
export const GH_API_RETRY = {
  attempts: 3,
  baseDelayMs: 1_000,
  sleep(ms: number): void {
    if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  },
}

/** The failing command's own error text: stderr when present, else the error message. */
export function commandErrorDetail(err: unknown): string {
  const { stderr, message } = (err ?? {}) as { stderr?: unknown; message?: unknown }
  const stderrText = typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf-8') : ''
  const text = stderrText.trim() || (typeof message === 'string' ? message : String(err))
  return text.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX_CHARS)
}

/** Worth another attempt: server errors, timeouts, and secondary rate limits. */
export function isTransientGhFailure(err: unknown, detail: string): boolean {
  if ((err as { code?: unknown } | null)?.code === 'ETIMEDOUT') return true
  if (/\bHTTP 5\d\d\b/.test(detail)) return true
  if (/\bHTTP 429\b/.test(detail)) return true
  if (/\bHTTP 403\b/.test(detail) && /secondary rate limit/i.test(detail)) return true
  return /\b(i\/o timeout|context deadline exceeded|TLS handshake timeout)\b/i.test(detail)
}

export function ghApiOutcome<T>(endpoint: string, options: { timeout: number; maxBuffer: number }): GhApiOutcome<T> {
  const attempts = Math.max(1, GH_API_RETRY.attempts)
  for (let attempt = 1; ; attempt++) {
    let raw: string
    try {
      raw = execSync(`gh api "${endpoint}"`, {
        encoding: 'utf-8',
        env: { ...process.env },
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        // Capture stderr so the caller can show gh's reason, instead of /dev/null.
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const detail = commandErrorDetail(err)
      if (/Git Repository is empty/i.test(detail)) return { status: 'empty-repository' }
      if (/\bHTTP 404\b/.test(detail)) return { status: 'not-found', detail }
      if (attempt < attempts && isTransientGhFailure(err, detail)) {
        GH_API_RETRY.sleep(GH_API_RETRY.baseDelayMs * 2 ** (attempt - 1))
        continue
      }
      return { status: 'failed', detail: attempt > 1 ? `${detail} (after ${attempt} attempts)` : detail }
    }
    try {
      return { status: 'ok', data: JSON.parse(raw) as T }
    } catch {
      return { status: 'failed', detail: `response was not valid JSON (${raw.length} bytes)` }
    }
  }
}
