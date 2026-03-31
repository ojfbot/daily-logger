import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractToken } from '../_lib/cookies.js'

const ALLOWED_USERS = (process.env.ALLOWED_USERS ?? '')
  .split(',')
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean)

// Only proxy requests to the daily-logger repo
const ALLOWED_REPO_PREFIX = '/repos/ojfbot/daily-logger/'

/**
 * /api/github/[...path]
 *
 * Proxies authenticated requests to the GitHub API. The access token is
 * read from the encrypted httpOnly cookie — it never touches the browser.
 *
 * Security layers:
 * 1. Token extracted from httpOnly cookie (no XSS token theft)
 * 2. Mutating requests require X-Requested-With header (CSRF prevention)
 * 3. ALLOWED_USERS gate for write operations (fail-closed if empty)
 * 4. Request path restricted to ojfbot/daily-logger repo only
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Extract and validate token ───────────────────────────────────────────
  const token = extractToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  // ── Construct GitHub API path ────────────────────────────────────────────
  const pathSegments = req.query.path
  if (!pathSegments || !Array.isArray(pathSegments)) {
    return res.status(400).json({ error: 'Missing path' })
  }

  const githubPath = '/' + pathSegments.join('/')

  // ── Path restriction: only allow requests to our repo ────────────────────
  if (!githubPath.startsWith(ALLOWED_REPO_PREFIX)) {
    return res.status(403).json({ error: 'Request path not allowed — only ojfbot/daily-logger is permitted' })
  }

  // ── CSRF check for mutating methods ──────────────────────────────────────
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    const xrw = req.headers['x-requested-with']
    if (xrw !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Missing X-Requested-With header — CSRF protection' })
    }
  }

  // ── Authorization check for write operations ─────────────────────────────
  // Fail-closed: if ALLOWED_USERS is not configured, deny all writes
  if (method !== 'GET' && method !== 'HEAD') {
    if (ALLOWED_USERS.length === 0) {
      return res.status(403).json({ error: 'ALLOWED_USERS not configured — write operations disabled' })
    }

    const userLogin = await getAuthenticatedLogin(token)
    if (!userLogin) {
      return res.status(401).json({ error: 'Could not verify GitHub identity' })
    }
    if (!ALLOWED_USERS.includes(userLogin.toLowerCase())) {
      return res.status(403).json({ error: 'User not authorized for write operations' })
    }
  }

  // ── Proxy to GitHub API ──────────────────────────────────────────────────
  const githubUrl = `https://api.github.com${githubPath}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'daily-logger-editorial',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // Forward content-type and body for mutating requests
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type']
  }

  const fetchOptions: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD' && req.body) {
    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  const ghResponse = await fetch(githubUrl, fetchOptions)

  // Forward rate limit headers for observability
  const rateLimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']
  for (const h of rateLimitHeaders) {
    const val = ghResponse.headers.get(h)
    if (val) res.setHeader(h, val)
  }

  // If GitHub says unauthorized, clear the cookie
  if (ghResponse.status === 401) {
    res.setHeader('Set-Cookie', 'gh_token=; HttpOnly; Path=/; Max-Age=0')
  }

  const responseBody = await ghResponse.text()

  res.status(ghResponse.status)
  res.setHeader('Content-Type', ghResponse.headers.get('content-type') ?? 'application/json')
  return res.send(responseBody)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthenticatedLogin(token: string): Promise<string | null> {
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'daily-logger-editorial',
      },
    })
    if (!resp.ok) return null
    const data = await resp.json() as { login: string }
    return data.login
  } catch {
    return null
  }
}
