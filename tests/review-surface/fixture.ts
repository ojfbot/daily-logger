import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { readArticleSnapshot } from './article-snapshots.js'
import { registrySchema, reviewSchema } from '../../shared/article-review.js'
import { githubCommentSchema, githubPullRequestSchema } from '../../api/_lib/article-review-sources.js'

export const source = 'ce04d6762fa5a8e5dff59388849e3ea164aff940'
export const today = '2026-10-14'
export const recordPath = `reviews/registered/${today}-${source}.json`
export const review = reviewSchema.parse(JSON.parse(readFileSync(recordPath, 'utf8')))
export const blob = review.article.blobSha
const bodySchema = z.object({ body: z.string() })
export function makePullRequest(number = 367) {
  return githubPullRequestSchema.parse({ number, html_url: `https://github.com/ojfbot/daily-logger/pull/${number}`, state: 'open',
    user: { login: 'ojfbot' }, author_association: 'OWNER', body: 'Independent article review; article remains draft.',
    created_at: '2026-10-16T14:00:00.000Z', updated_at: '2026-10-16T14:00:00.000Z', merged_at: null,
    head: { sha: 'a'.repeat(40), ref: `codex/review-article-${today}`, repo: { full_name: 'ojfbot/daily-logger' } },
    base: { ref: 'main', repo: { full_name: 'ojfbot/daily-logger' } } })
}
export function makeComment(body: string, id = 1, login = 'editor', issueNumber = 357, authorAssociation = 'OWNER') {
  return githubCommentSchema.parse({ id, body, html_url: `https://github.com/ojfbot/daily-logger/issues/${issueNumber}#issuecomment-${id}`,
    user: { login }, author_association: authorAssociation, created_at: '2026-10-16T14:01:00.000Z', updated_at: '2026-10-16T14:01:00.000Z' })
}
export function createFixture() {
  const registry = registrySchema.parse(JSON.parse(readFileSync('reviews/registry.json', 'utf8')))
  const comments: z.infer<typeof githubCommentSchema>[] = []
  const calls: string[] = []
  const files = new Map<string, string>()
  const openPullNumbers: number[] = []
  const acceptPullNumbers: number[] = []
  const reviewPullNumbers: number[] = []
  const state = { source, login: 'editor', outage: false, prHead: 'a'.repeat(40), registry, comments, calls, files,
    refFiles: new Map<string, string>(), pullRequests: new Map<number, z.infer<typeof githubPullRequestSchema>>(),
    pullFiles: new Map<number, Array<{ filename: string; status: string }>>(),
    openPullNumbers, acceptPullNumbers, reviewPullNumbers, pathCommits: new Map<string, string[]>(),
    associatedPullNumbers: new Map<string, number[]>(), prComments: new Map<number, z.infer<typeof githubCommentSchema>[]>(),
    prReviews: new Map<number, unknown[]>(), prInlineComments: new Map<number, unknown[]>(),
    failRoutes: new Set<string>(), nextPageRoutes: new Set<string>(),
  }
  function pr(number: number) {
    return state.pullRequests.get(number) ?? { ...makePullRequest(number), head: { ...makePullRequest(number).head, sha: state.prHead } }
  }
  async function github(path: string, options?: RequestInit): Promise<Response> {
    const method = options?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    if (state.outage) return Response.json({ message: 'Unavailable' }, { status: 503 })
    if (path === '/user') return Response.json({ login: state.login })
    const url = new URL(path, 'https://api.github.com')
    const route = url.pathname.replace('/repos/ojfbot/daily-logger', '')
    if (state.failRoutes.has(route)) return Response.json({ message: 'Unavailable' }, { status: 503 })
    const headers: HeadersInit = state.nextPageRoutes.has(route) ? { link: '<https://api.github.com/next>; rel="next"' } : {}
    if (method === 'GET' && route === '/git/ref/heads/main') return Response.json({ object: { sha: state.source } })
    if (method === 'GET' && route.startsWith('/contents/')) {
      const path = decodeURIComponent(route.slice('/contents/'.length))
      const ref = url.searchParams.get('ref') ?? ''
      try {
        const text = state.refFiles.get(`${ref}:${path}`) ?? (path === 'reviews/registry.json' ? JSON.stringify(state.registry) : state.files.get(path) ??
          (path.startsWith('_articles/') ? readArticleSnapshot(ref, path.slice('_articles/'.length).replace(/\.md$/, '')).content : readFileSync(path, 'utf8'))
        )
        const hash = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
        return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64'), sha: hash })
      } catch { return Response.json({ message: 'Not found' }, { status: 404 }) }
    }
    if (method === 'GET' && route === '/pulls') {
      const head = url.searchParams.get('head')
      const numbers = head === `ojfbot:codex/review-article-${today}` ? state.reviewPullNumbers : head ? state.acceptPullNumbers : state.openPullNumbers
      return Response.json(numbers.map(pr), { headers })
    }
    const pull = route.match(/^\/pulls\/(\d+)(?:\/(files|reviews|comments))?$/)
    if (method === 'GET' && pull) {
      const number = Number(pull[1])
      if (pull[2] === 'files') return Response.json(state.pullFiles.get(number) ?? [], { headers })
      if (pull[2] === 'reviews') return Response.json(state.prReviews.get(number) ?? [], { headers })
      if (pull[2] === 'comments') return Response.json(state.prInlineComments.get(number) ?? [], { headers })
      return Response.json(pr(number))
    }
    if (method === 'GET' && route === '/commits') return Response.json((state.pathCommits.get(url.searchParams.get('path') ?? '') ?? []).map((sha) => ({ sha })), { headers })
    const associated = route.match(/^\/commits\/([a-f0-9]{40})\/pulls$/)
    if (method === 'GET' && associated) return Response.json((state.associatedPullNumbers.get(associated[1] ?? '') ?? []).map(pr), { headers })
    const issue = route.match(/^\/issues\/(\d+)\/comments$/)
    if (issue && method === 'GET') return Response.json(Number(issue[1]) === 357 ? state.comments : state.prComments.get(Number(issue[1])) ?? [], { headers })
    if (issue && method === 'POST') {
      const { body } = bodySchema.parse(JSON.parse(String(options?.body)))
      const number = Number(issue[1])
      const comments = number === 357 ? state.comments : state.prComments.get(number) ?? []
      const comment = makeComment(body, comments.length + 1, state.login, number)
      comments.push(comment)
      if (number !== 357) state.prComments.set(number, comments)
      return Response.json(comment, { status: 201 })
    }
    throw new Error(`Unexpected external request ${method} ${path}`)
  }
  return { state, github }
}

// A source record exists only in an OPEN review PR; no trusted-main proposal or
// date route is added. This is the missing production path, not the old fixture.
export function seedOpenReview(state: ReturnType<typeof createFixture>['state'], number = 367) {
  const pr = makePullRequest(number)
  state.pullRequests.set(number, pr)
  state.openPullNumbers.push(number)
  state.reviewPullNumbers.push(number)
  const manifest = { ...state.registry, records: [...state.registry.records.filter((record) => record.date !== today), { date: today, path: recordPath }] }
  state.refFiles.set(`${pr.head.sha}:reviews/registry.json`, JSON.stringify(manifest))
  state.registry.records = state.registry.records.filter((record) => record.date !== today)
  state.registry.requestTargets = state.registry.requestTargets.filter((target) => target.date !== today)
  state.pullFiles.set(number, [
    { filename: recordPath, status: 'added' }, { filename: review.fullRecordPath, status: 'added' }, { filename: 'reviews/registry.json', status: 'modified' },
  ])
  return pr
}
