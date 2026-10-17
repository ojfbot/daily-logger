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
    refs: new Map<string, string>(), fileModes: new Map<string, string>(), missingFiles: new Set<string>(), largeFiles: new Set<string>(),
  }
  const gitTrees = new Map<string, unknown[]>()
  const hash = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
  const actionRegistry = JSON.stringify({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  function contentAt(ref: string, path: string) {
    if (state.missingFiles.has(`${ref}:${path}`)) throw new Error('Missing file')
    return state.refFiles.get(`${ref}:${path}`) ?? (path === 'reviews/registry.json' ? JSON.stringify(state.registry) : state.files.get(path) ??
      (path === 'actions/registry.json' ? actionRegistry : path.startsWith('_articles/') ? readArticleSnapshot(ref, path.slice('_articles/'.length).replace(/\.md$/, '')).content : readFileSync(path, 'utf8')))
  }
  function treeFor(ref: string, directory = ''): string {
    const paths = new Set([`_articles/${today}.md`, 'actions/registry.json', ...state.files.keys(), ...[...state.refFiles.keys()].filter(key => key.startsWith(`${ref}:`)).map(key => key.slice(ref.length + 1))])
    const entries: Array<{ path: string; mode: string; sha: string }> = []
    for (const name of [...new Set([...paths].filter(path => path.startsWith(directory)).map(path => path.slice(directory.length).split('/')[0]))].sort()) {
      if (!name) continue
      const path = `${directory}${name}`
      if ([...paths].some(file => file.startsWith(`${path}/`))) entries.push({ path: name, mode: '040000', sha: treeFor(ref, `${path}/`) })
      else {
        try { entries.push({ path: name, mode: state.fileModes.get(`${ref}:${path}`) ?? '100644', sha: hash(contentAt(ref, path)) }) } catch { /* Missing fixture paths stay absent. */ }
      }
    }
    const treeSha = hash(JSON.stringify(entries)); gitTrees.set(treeSha, entries); return treeSha
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
    if (method === 'GET' && route.startsWith('/git/ref/heads/')) {
      const ref = state.refs.get(route.slice('/git/ref/heads/'.length))
      return Response.json(ref ? { object: { sha: ref } } : {}, { status: ref ? 200 : 404 })
    }
    if (method === 'GET' && route.startsWith('/git/commits/')) return Response.json({ tree: { sha: treeFor(route.slice('/git/commits/'.length)) } })
    if (method === 'GET' && route.startsWith('/git/trees/')) return Response.json({ truncated: false, tree: gitTrees.get(route.slice('/git/trees/'.length)) ?? [] })
    if (method === 'GET' && route.startsWith('/compare/')) return Response.json({ status: 'ahead', ahead_by: 1, total_commits: 1, commits: [{}], merge_base_commit: { sha: state.source }, files: [{ filename: 'actions/registry.json', status: 'modified' }] })
    if (method === 'GET' && route.startsWith('/git/blobs/')) {
      for (const [key, text] of state.refFiles) if (hash(text) === route.slice('/git/blobs/'.length)) return Response.json({ sha: hash(text), encoding: 'base64', content: Buffer.from(text).toString('base64') })
      return Response.json({}, { status: 404 })
    }
    if (method === 'GET' && route.startsWith('/contents/')) {
      const path = decodeURIComponent(route.slice('/contents/'.length))
      const ref = url.searchParams.get('ref') ?? ''
      try {
        const text = contentAt(ref, path)
        const hash = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
        return Response.json({ type: 'file', encoding: state.largeFiles.has(path) ? 'none' : 'base64', content: state.largeFiles.has(path) ? '' : Buffer.from(text).toString('base64'), sha: hash })
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
