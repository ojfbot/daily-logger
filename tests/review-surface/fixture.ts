import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { readArticleSnapshot } from './article-snapshots.js'
import { registrySchema, reviewSchema } from '../../shared/article-review.js'

export const source = 'ce04d6762fa5a8e5dff59388849e3ea164aff940'
export const today = '2026-10-14'
export const recordPath = `reviews/registered/${today}-${source}.json`
export const review = reviewSchema.parse(JSON.parse(readFileSync(recordPath, 'utf8')))
export const blob = review.article.blobSha
const bodySchema = z.object({ body: z.string() })
export function createFixture() {
  const registry = registrySchema.parse(JSON.parse(readFileSync('reviews/registry.json', 'utf8')))
  const comments: Array<{ body: string; html_url: string; user: { login: string } }> = []
  const calls: string[] = []
  const files = new Map<string, string>()
  const state = { source, login: 'editor', outage: false, prHead: 'a'.repeat(40), registry, comments, calls, files }
  async function github(path: string, options?: RequestInit): Promise<Response> {
    const method = options?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    if (state.outage) return Response.json({ message: 'Unavailable' }, { status: 503 })
    if (path === '/user') return Response.json({ login: state.login })
    const url = new URL(path, 'https://api.github.com')
    const route = url.pathname.replace('/repos/ojfbot/daily-logger', '')
    if (method === 'GET' && route === '/git/ref/heads/main') return Response.json({ object: { sha: state.source } })
    if (method === 'GET' && route.startsWith('/contents/')) {
      const path = decodeURIComponent(route.slice('/contents/'.length))
      const ref = url.searchParams.get('ref') ?? ''
      try {
        const text = path === 'reviews/registry.json' ? JSON.stringify(state.registry) : state.files.get(path) ??
          (path.startsWith('_articles/') ? readArticleSnapshot(ref, path.slice('_articles/'.length).replace(/\.md$/, '')).content : readFileSync(path, 'utf8'))
        const hash = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
        return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64'), sha: hash })
      } catch { return Response.json({ message: 'Not found' }, { status: 404 }) }
    }
    if (route.startsWith('/pulls/')) return Response.json({ state: 'open', head: { sha: state.prHead, repo: { full_name: 'ojfbot/daily-logger' } } })
    if (route === '/issues/357/comments' && method === 'GET') return Response.json(state.comments)
    if (route === '/issues/357/comments' && method === 'POST') {
      const { body } = bodySchema.parse(JSON.parse(String(options?.body)))
      const comment = { body, html_url: `https://github.com/ojfbot/daily-logger/issues/357#issuecomment-${state.comments.length + 1}`, user: { login: state.login } }
      state.comments.push(comment)
      return Response.json(comment, { status: 201 })
    }
    throw new Error(`Unexpected external request ${method} ${path}`)
  }
  return { state, github }
}
