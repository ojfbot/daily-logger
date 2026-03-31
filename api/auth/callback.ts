import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

const CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? ''
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET ?? ''
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN ?? ''
const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * GET /api/auth/callback
 *
 * GitHub redirects here after user authorizes. Validates state parameter
 * against the cookie (CSRF check), exchanges code for access token,
 * stores token in an encrypted httpOnly cookie, and redirects to the SPA.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, state } = req.query

  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).json({ error: 'Missing code or state parameter' })
  }

  // ── CSRF validation ──────────────────────────────────────────────────────
  const cookies = parseCookies(req.headers.cookie ?? '')
  const storedState = cookies['oauth_state']

  if (!storedState || !timingSafeEqual(state, storedState)) {
    return res.status(403).json({ error: 'State mismatch — possible CSRF attack' })
  }

  // ── Token exchange ───────────────────────────────────────────────────────
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenResponse.ok) {
    return res.status(502).json({ error: 'GitHub token exchange failed' })
  }

  const tokenData = await tokenResponse.json() as { access_token?: string; error?: string }

  if (!tokenData.access_token) {
    return res.status(502).json({ error: tokenData.error ?? 'No access token returned' })
  }

  // ── Encrypt token for cookie storage ─────────────────────────────────────
  const encrypted = encrypt(tokenData.access_token, AUTH_COOKIE_SECRET)

  // Cookie flags: httpOnly, secure (prod), sameSite=Lax, 30-day expiry
  const authCookie = [
    `gh_token=${encrypted}`,
    'HttpOnly',
    IS_PROD ? 'Secure' : '',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=2592000', // 30 days
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : '',
  ].filter(Boolean).join('; ')

  // Clear the state + return cookies (they served their purpose)
  const clearState = 'oauth_state=; HttpOnly; Path=/api/auth; Max-Age=0'
  const clearReturn = 'oauth_return=; HttpOnly; Path=/api/auth; Max-Age=0'

  // Determine redirect target
  const returnTo = cookies['oauth_return']
    ? decodeURIComponent(cookies['oauth_return'])
    : '/'

  res.setHeader('Set-Cookie', [authCookie, clearState, clearReturn])
  res.redirect(302, returnTo)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key) cookies[key] = rest.join('=')
  }
  return cookies
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * AES-256-GCM encryption for the access token.
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
function encrypt(plaintext: string, secret: string): string {
  // Derive a 32-byte key from the secret
  const key = crypto.createHash('sha256').update(secret).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}
