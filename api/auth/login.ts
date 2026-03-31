import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { safeReturnTo } from '../_lib/security.js'

const CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? ''
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN ?? ''
const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * GET /api/auth/login
 *
 * Generates a random state parameter (CSRF protection), stores it in a
 * short-lived httpOnly cookie, then redirects to GitHub's OAuth authorize URL.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!CLIENT_ID) {
    return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' })
  }

  // Generate cryptographically random state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')

  // Store state in a short-lived httpOnly cookie (10 min)
  const stateCookieFlags = [
    `oauth_state=${state}`,
    'HttpOnly',
    IS_PROD ? 'Secure' : '',
    'SameSite=Lax',
    'Path=/api/auth',
    'Max-Age=600',
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : '',
  ].filter(Boolean).join('; ')

  // Where to send the user after OAuth completes — validated against open redirect
  const returnTo = safeReturnTo(typeof req.query.returnTo === 'string' ? req.query.returnTo : '/')

  // Store returnTo in a separate cookie so callback can redirect properly
  const returnCookieFlags = [
    `oauth_return=${encodeURIComponent(returnTo)}`,
    'HttpOnly',
    IS_PROD ? 'Secure' : '',
    'SameSite=Lax',
    'Path=/api/auth',
    'Max-Age=600',
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : '',
  ].filter(Boolean).join('; ')

  // GitHub OAuth authorize URL
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/api/auth/callback`,
    scope: 'public_repo',
    state,
  })

  // Set both cookies
  res.setHeader('Set-Cookie', [stateCookieFlags, returnCookieFlags])
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`)
}

function getBaseUrl(req: VercelRequest): string {
  const proto = req.headers['x-forwarded-proto'] ?? 'https'
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000'
  return `${proto}://${host}`
}
