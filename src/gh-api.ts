/**
 * One `gh api` call with an honest outcome.
 *
 * "Not found" (HTTP 404, or an empty repository's 409) means nothing is there.
 * Anything else (rate limit, 5xx, lost access, timeout, bad JSON) is a failure
 * and carries gh's own error text, so a caller can never mistake a broken call
 * for an empty answer (#604).
 */

import { execSync } from 'child_process'

export type GhApiOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'failed'; detail: string }

const DETAIL_MAX_CHARS = 500

/** The failing command's own error text: stderr when present, else the error message. */
export function commandErrorDetail(err: unknown): string {
  const { stderr, message } = (err ?? {}) as { stderr?: unknown; message?: unknown }
  const stderrText = typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf-8') : ''
  const text = stderrText.trim() || (typeof message === 'string' ? message : String(err))
  return text.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX_CHARS)
}

export function ghApiOutcome<T>(endpoint: string, options: { timeout: number; maxBuffer: number }): GhApiOutcome<T> {
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
    if (/\bHTTP 404\b/.test(detail) || /Git Repository is empty/i.test(detail)) return { status: 'not-found' }
    return { status: 'failed', detail }
  }
  try {
    return { status: 'ok', data: JSON.parse(raw) as T }
  } catch {
    return { status: 'failed', detail: `response was not valid JSON (${raw.length} bytes)` }
  }
}
