import type { VercelRequest } from '@vercel/node'
import { decrypt } from './crypto.js'

const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET ?? ''

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key) cookies[key] = rest.join('=')
  }
  return cookies
}

export function extractToken(req: VercelRequest): string | null {
  const cookies = parseCookies(req.headers.cookie ?? '')
  const encrypted = cookies['gh_token']
  if (!encrypted || !AUTH_COOKIE_SECRET) return null

  try {
    return decrypt(encrypted, AUTH_COOKIE_SECRET)
  } catch {
    return null
  }
}
