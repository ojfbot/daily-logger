import crypto from 'crypto'

/**
 * Validates that a returnTo URL is a safe relative path.
 * Blocks open redirect attacks via absolute URLs or protocol-relative URLs.
 */
export function safeReturnTo(raw: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

/**
 * Constant-time string comparison. Does not leak string length.
 * If lengths differ, crypto.timingSafeEqual throws — caught and returned as false.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}
