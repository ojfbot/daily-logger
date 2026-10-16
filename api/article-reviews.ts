import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { extractToken } from './_lib/cookies.js'
import { createReviewService, ReviewError } from './_lib/article-review-service.js'
import { date, postSchema, sha } from '../shared/article-review.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Vary', 'Cookie')
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (method === 'POST' && req.headers['x-requested-with'] !== 'XMLHttpRequest') return res.status(403).json({ error: 'Missing X-Requested-With header' })
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const allowed = (process.env.ALLOWED_USERS ?? '').split(',').map((user) => user.trim().toLowerCase()).filter(Boolean)
  if (allowed.length === 0) return res.status(403).json({ error: 'Editorial review access is not configured' })
  const github = (path: string, options?: RequestInit) => fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'daily-logger-editorial', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  })
  try {
    const identity = await github('/user')
    if (!identity.ok) return res.status(401).json({ error: 'Could not verify GitHub identity' })
    const { login } = z.object({ login: z.string().min(1) }).parse(await identity.json())
    if (!allowed.includes(login.toLowerCase())) return res.status(403).json({ error: 'Not authorized for editorial reviews' })
    const service = createReviewService(github)
    if (method === 'GET') {
      const query = z.object({ date, visibleBlobSha: sha.optional() }).parse(req.query)
      return res.status(200).json(await service.load(query.date, query.visibleBlobSha ?? null))
    }
    const request = postSchema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
    return res.status(200).json(request.intent === 'request_changes' ? await service.requestChanges(request, login) : await service.comment(request, login))
  } catch (error) {
    if (error instanceof ReviewError) return res.status(error.status).json({ error: error.message })
    if (error instanceof z.ZodError || error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid review request or source record. Submission is not confirmed; refresh request history before retrying.' })
    return res.status(503).json({ error: 'Review source unavailable. A write response may be uncertain; refresh request history before retrying.' })
  }
}
