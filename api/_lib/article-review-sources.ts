import { z } from 'zod'
import { sha } from '../../shared/article-review.js'

const repo = '/repos/ojfbot/daily-logger'
export class ReviewError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}
export type GitHub = (path: string, options?: RequestInit) => Promise<Response>
const user = z.object({ login: z.string().min(1) })
const githubUrl = z.url().refine((value) => value.startsWith('https://github.com/ojfbot/daily-logger/'))
export const githubPullRequestSchema = z.object({
  number: z.number().int().positive(), html_url: githubUrl, state: z.enum(['open', 'closed']),
  user, author_association: z.string(), body: z.string().nullable(),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(), merged_at: z.iso.datetime().nullable(),
  head: z.object({ sha, ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
  base: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }) }),
})
export type GitHubPullRequest = z.infer<typeof githubPullRequestSchema>
const changedFile = z.object({ filename: z.string(), status: z.string() })
export const githubCommentSchema = z.object({
  id: z.number().int().positive(), body: z.string(), html_url: githubUrl, user, author_association: z.string(),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
})
const submittedReview = z.object({
  id: z.number().int().positive(), body: z.string().nullable(), html_url: githubUrl, user,
  submitted_at: z.iso.datetime().nullable(), state: z.string(),
})
const inlineComment = githubCommentSchema.extend({ path: z.string(), line: z.number().int().nullable(), in_reply_to_id: z.number().int().positive().optional() })
export function trustedPullRequest(pr: GitHubPullRequest) {
  return pr.head.repo?.full_name === 'ojfbot/daily-logger' && pr.base.repo.full_name === 'ojfbot/daily-logger' &&
    pr.base.ref === 'main' && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pr.author_association)
}
export function trustedAssociation(association: string) {
  return ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(association)
}

export async function boundedMap<T, U>(items: T[], work: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item !== undefined) results[index] = await work(item)
    }
  }))
  return results
}

// Request-scoped promises share identical immutable reads; every new load gets a
// fresh source. Mutable PR/main rechecks deliberately bypass this cache.
export function createReviewSource(github: GitHub) {
  const cache = new Map<string, Promise<unknown>>()
  let issued = 0
  let active = 0
  const waiting: Array<() => void> = []
  async function request(path: string, options?: RequestInit) {
    if (++issued > 120) throw new ReviewError(503, 'Incomplete review history: request budget reached. Refresh after narrowing the source queue.')
    if (active < 8) active++
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try { return await github(`${repo}${path}`, options) }
    finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
  async function json(path: string, options?: RequestInit, fresh = false): Promise<unknown> {
    const method = options?.method ?? 'GET'
    if (method === 'GET' && !fresh) {
      const existing = cache.get(path)
      if (existing) return existing
    }
    const pending = (async () => {
      const response = await request(path, options)
      if (!response.ok) throw new ReviewError(503, `Review source unavailable (${response.status}). Retry after checking GitHub access.`)
      return response.json()
    })()
    if (method === 'GET' && !fresh) cache.set(path, pending)
    return pending
  }
  async function list<T>(path: string, schema: z.ZodType<T>, maxPages = 3, pageSize = 100): Promise<T[]> {
    const found: T[] = []
    for (let page = 1; page <= maxPages; page++) {
      const pagePath = `${path}${path.includes('?') ? '&' : '?'}per_page=${pageSize}&page=${page}`
      // Cache both the values and pagination completeness, not just one JSON page.
      const key = `list:${pagePath}`
      let pending = cache.get(key)
      if (!pending) {
        pending = (async () => {
          const response = await request(pagePath)
          if (!response.ok) throw new ReviewError(503, `Correspondence/discovery source unavailable (${response.status}): ${path}`)
          return { values: await response.json(), next: !!response.headers.get('link')?.includes('rel="next"') }
        })()
        cache.set(key, pending)
      }
      const result = z.object({ values: z.array(schema), next: z.boolean() }).parse(await pending)
      found.push(...result.values)
      if (!result.next) return found
    }
    throw new ReviewError(503, `Incomplete history: reader limit reached for ${path}. Absence is not established.`)
  }
  async function file(path: string, ref: string) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    let data = z.object({ sha, content: z.string(), encoding: z.enum(['base64', 'none']), type: z.literal('file') })
      .parse(await json(`/contents/${encodedPath}?ref=${ref}`))
    if (data.encoding === 'none') {
      const blob = z.object({ sha, content: z.string(), encoding: z.literal('base64') }).parse(await json(`/git/blobs/${data.sha}`))
      if (blob.sha !== data.sha) throw new ReviewError(409, 'File blob identity changed.')
      data = { ...data, ...blob }
    }
    if (data.content.length > (path === 'actions/registry.json' ? 16000000 : 700000)) throw new ReviewError(503, 'Review record exceeds the bounded reader limit.')
    return { blobSha: data.sha, text: Buffer.from(data.content, 'base64').toString('utf8') }
  }
  async function regularFile(path: string, ref: string) {
    let treeSha = z.object({ tree: z.object({ sha }) }).parse(await json(`/git/commits/${ref}`)).tree.sha
    const parts = path.split('/')
    for (const [index, part] of parts.entries()) {
      const tree = z.object({ truncated: z.literal(false), tree: z.array(z.object({ path: z.string(), mode: z.string(), sha })) }).parse(await json(`/git/trees/${treeSha}`))
      const entry = tree.tree.find(entry => entry.path === part)
      if (!entry || entry.mode !== (index === parts.length - 1 ? '100644' : '040000')) throw new ReviewError(409, 'Editorial inputs must be regular data files.')
      treeSha = entry.sha
    }
    const result = await file(path, ref)
    if (result.blobSha !== treeSha) throw new ReviewError(409, 'Editorial file disagrees with its pinned tree.')
    return result
  }
  async function onlyFileChanged(path: string, before: string, after: string) {
    let left = z.object({ tree: z.object({ sha }) }).parse(await json(`/git/commits/${before}`)).tree.sha
    let right = z.object({ tree: z.object({ sha }) }).parse(await json(`/git/commits/${after}`)).tree.sha
    const treeSchema = z.object({ truncated: z.literal(false), tree: z.array(z.object({ path: z.string(), mode: z.string(), sha })) })
    for (const [index, part] of path.split('/').entries()) {
      const [a, b] = await Promise.all([json(`/git/trees/${left}`), json(`/git/trees/${right}`)]).then(values => values.map(value => treeSchema.parse(value).tree))
      if (!a || !b || JSON.stringify(a.filter(entry => entry.path !== part)) !== JSON.stringify(b.filter(entry => entry.path !== part))) return false
      const nextA = a.find(entry => entry.path === part), nextB = b.find(entry => entry.path === part)
      const mode = index === path.split('/').length - 1 ? '100644' : '040000'
      if (!nextA || !nextB || nextA.mode !== mode || nextB.mode !== mode) return false
      left = nextA.sha; right = nextB.sha
    }
    return true
  }
  return {
    file,
    regularFile,
    onlyFileChanged,
    main: async (fresh = false) => z.object({ object: z.object({ sha }) }).parse(await json('/git/ref/heads/main', undefined, fresh)).object.sha,
    pull: async (number: number, fresh = false) => githubPullRequestSchema.parse(await json(`/pulls/${number}`, undefined, fresh)),
    openPulls: () => list('/pulls?state=open&base=main&sort=updated&direction=desc', githubPullRequestSchema),
    reviewPulls: (date: string) => list(`/pulls?state=all&base=main&head=ojfbot%3Acodex%2Freview-article-${date}`, githubPullRequestSchema),
    acceptPulls: (date: string) => list(`/pulls?state=all&base=main&head=ojfbot%3Aaccept%2F${date}`, githubPullRequestSchema),
    files: (number: number) => list(`/pulls/${number}/files`, changedFile),
    pathCommits: (path: string, ref: string) => list(`/commits?path=${encodeURIComponent(path)}&sha=${ref}`, z.object({ sha }), 1, 20),
    associatedPulls: (commit: string) => list(`/commits/${commit}/pulls`, githubPullRequestSchema),
    comments: (number: number) => list(`/issues/${number}/comments`, githubCommentSchema, 10),
    reviews: (number: number) => list(`/pulls/${number}/reviews`, submittedReview, 10),
    inlineComments: (number: number) => list(`/pulls/${number}/comments`, inlineComment, 10),
    postComment: async (number: number, body: string) => githubCommentSchema.parse(await json(`/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) })),
  }
}
