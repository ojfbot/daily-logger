import type { VercelRequest, VercelResponse } from '@vercel/node'

const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN ?? ''
const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * GET /api/auth/logout
 *
 * Clears the auth cookie and redirects to the SPA root.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const clearCookie = [
    'gh_token=',
    'HttpOnly',
    IS_PROD ? 'Secure' : '',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : '',
  ].filter(Boolean).join('; ')

  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/'

  res.setHeader('Set-Cookie', clearCookie)
  res.redirect(302, returnTo)
}
