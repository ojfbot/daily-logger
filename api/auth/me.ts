import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET ?? ''
const ALLOWED_USERS = (process.env.ALLOWED_USERS ?? '')
  .split(',')
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean)

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's info by decrypting the token from the
 * httpOnly cookie and calling GitHub's /user endpoint. Returns 401 if
 * not authenticated. Includes `authorized` field indicating whether the
 * user is in the ALLOWED_USERS list.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = extractToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'daily-logger-editorial',
    },
  })

  if (!userResponse.ok) {
    // Token may be revoked — clear cookie
    if (userResponse.status === 401) {
      const clearCookie = 'gh_token=; HttpOnly; Path=/; Max-Age=0'
      res.setHeader('Set-Cookie', clearCookie)
    }
    return res.status(401).json({ error: 'GitHub token invalid or revoked' })
  }

  const user = await userResponse.json() as { login: string; avatar_url: string; name: string | null }

  const authorized = ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(user.login.toLowerCase())

  // Cache for 5 minutes to reduce GitHub API calls
  res.setHeader('Cache-Control', 'private, max-age=300')

  return res.status(200).json({
    login: user.login,
    avatarUrl: user.avatar_url,
    name: user.name,
    authorized,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(req: VercelRequest): string | null {
  const cookies = parseCookies(req.headers.cookie ?? '')
  const encrypted = cookies['gh_token']
  if (!encrypted || !AUTH_COOKIE_SECRET) return null

  try {
    return decrypt(encrypted, AUTH_COOKIE_SECRET)
  } catch {
    return null
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key) cookies[key] = rest.join('=')
  }
  return cookies
}

function decrypt(encryptedStr: string, secret: string): string {
  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(':')
  if (!ivHex || !authTagHex || !ciphertext) throw new Error('Invalid encrypted format')

  const key = crypto.createHash('sha256').update(secret).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
