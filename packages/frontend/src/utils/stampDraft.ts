import { editorialProjectionSchema } from '../../../../shared/article-review.ts'

/**
 * Stamp a draft article as accepted by:
 * 1. Getting the current article file from the repo
 * 2. Creating a new branch
 * 3. Committing the status change (draft → accepted)
 * 4. Opening a PR for manual merge
 *
 * All GitHub API calls go through /api/github/[...path] proxy.
 * The token is never in the browser — it lives in an httpOnly cookie.
 */

const REPO = 'repos/ojfbot/daily-logger'

interface StampResult {
  prNumber: number
  prUrl: string
}

export interface EditorialFeedback {
  version: 2
  notes: Array<
    | { kind: 'root'; content: string }
    | { kind: 'section'; section: string; content: string }
  >
}

function encodeFeedback(feedback: EditorialFeedback): string {
  const bytes = new TextEncoder().encode(JSON.stringify(feedback))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function ghFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = `/api/github/${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> ?? {}),
  }

  // Add CSRF header for mutating requests
  const method = (options?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-Requested-With'] = 'XMLHttpRequest'
  }

  return fetch(url, {
    cache: 'no-store',
    ...options,
    headers,
    credentials: 'same-origin',
  })
}

export async function stampDraft(date: string, articleTitle: string, userLogin: string, editorialFeedback?: EditorialFeedback): Promise<StampResult> {
  const branch = `accept/${date}`
  const filePath = `_articles/${date}.md`

  // ── 1. Check if a PR/branch already exists ─────────────────────────────
  const existingBranch = await ghFetch(`${REPO}/git/refs/heads/${branch}`)
  let existingPr: { number: number; html_url: string } | undefined
  if (existingBranch.ok) {
    // Branch exists — check for open PR
    const prsRes = await ghFetch(`${REPO}/pulls?head=ojfbot:${branch}&state=open`)
    if (prsRes.ok) {
      const prs = await prsRes.json() as Array<{ number: number; html_url: string }>
      if (prs.length > 0) {
        existingPr = prs[0]
      }
    }
  } else if (existingBranch.status !== 404) {
    throw new Error(`Could not check editorial branch: ${existingBranch.status}`)
  }
  if (existingPr) throw new Error('Acceptance PR already exists. Refresh to continue its review.')
  const discovery = await fetch(`/api/article-reviews?view=editorial&date=${date}`, { credentials: 'same-origin', cache: 'no-store' })
  if (!discovery.ok) throw new Error('Could not verify acceptance history. Refresh before accepting.')
  const admitted = editorialProjectionSchema.parse(await discovery.json())
  if (admitted.status !== 'none') throw new Error('Acceptance history changed. Refresh before accepting.')
  const existingHead = existingBranch.ok ? (await existingBranch.json() as { object: { sha: string } }).object.sha : null
  if (existingHead && admitted.stagedHeadSha !== existingHead) throw new Error('Staged action choices changed. Refresh before accepting.')

  // ── 2. Get current article content from main ───────────────────────────
  const mainRefRes = await ghFetch(`${REPO}/git/refs/heads/main`)
  if (!mainRefRes.ok) throw new Error(`Could not get main branch ref: ${mainRefRes.status}`)
  const mainRef = await mainRefRes.json() as { object: { sha: string } }
  const parentHead = existingHead ?? mainRef.object.sha
  const fileRes = await ghFetch(`${REPO}/contents/${filePath}?ref=${parentHead}`)
  if (!fileRes.ok) {
    throw new Error(`Could not read article: ${fileRes.status}`)
  }

  const fileData = await fileRes.json() as { content: string; sha: string; encoding: string }
  const content = new TextDecoder().decode(Uint8Array.from(atob(fileData.content.replace(/\n/g, '')), char => char.charCodeAt(0)))

  // ── 3. Update status in frontmatter ────────────────────────────────────
  const updated = content.replace(
    /^status:\s*"?draft"?\s*$/m,
    'status: "accepted"',
  )

  if (updated === content && !/^status:\s*"?accepted"?\s*$/m.test(content)) {
    throw new Error('Article is not in draft status')
  }

  // ── 5. Create the accept branch ────────────────────────────────────────
  const createBranchRes = existingBranch.ok ? existingBranch : await ghFetch(`${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: mainRef.object.sha,
    }),
  })

  if (!createBranchRes.ok) {
    const err = await createBranchRes.json() as { message?: string }
    throw new Error(`Could not create branch: ${err.message ?? createBranchRes.status}`)
  }

  // ── 6. Commit the status change ────────────────────────────────────────
  const parentResponse = await ghFetch(`${REPO}/git/commits/${parentHead}`)
  if (!parentResponse.ok) throw new Error('Could not read the pinned editorial tree')
  const parent = await parentResponse.json() as { tree: { sha: string } }
  const treeResponse = await ghFetch(`${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: [{ path: filePath, mode: '100644', type: 'blob', content: updated }] }) })
  if (!treeResponse.ok) throw new Error('Could not prepare acceptance')
  const tree = await treeResponse.json() as { sha: string }
  const commitResponse = await ghFetch(`${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `editorial: accept ${date} draft`, tree: tree.sha, parents: [parentHead] }) })
  if (!commitResponse.ok) throw new Error('Could not prepare acceptance commit')
  const commit = await commitResponse.json() as { sha: string }
  const commitRes = await ghFetch(`${REPO}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
  if (!commitRes.ok) throw new Error('Editorial branch moved. Refresh before accepting; no acceptance was published.')

  // ── 7. Open PR ─────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const hasRevisions = !!editorialFeedback
  const prBody = [
    `## Editorial: ${hasRevisions ? 'Accept with revisions' : 'Accept'} ${date} Draft`,
    '',
    `**Article:** ${articleTitle}`,
    `**Stamped by:** @${userLogin}`,
    `**Date accepted:** ${now}`,
    '',
    '### Changes',
    '- Updated article status from `draft` to `accepted`',
    ...(hasRevisions
      ? [
          '- **Editorial feedback attached** — CI will apply revisions via LLM',
          '',
          '### Editorial Feedback',
          '',
          '<!-- EDITORIAL_FEEDBACK_V2_START -->',
          encodeFeedback(editorialFeedback!),
          '<!-- EDITORIAL_FEEDBACK_V2_END -->',
          '',
          '### Notes for review',
          '',
          '```json',
          JSON.stringify(editorialFeedback, null, 2),
          '```',
        ]
      : []),
    '',
    '### Review',
    'This PR was created by the daily-logger editorial UI.',
    hasRevisions
      ? 'CI will process the editorial feedback and push revised content to this branch.'
      : 'Manual merge required.',
    '',
    '---',
    'Generated by daily-logger editorial stamper',
  ].join('\n')

  const prRes = await ghFetch(`${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `editorial: accept ${date} draft`,
      body: prBody,
      head: branch,
      base: 'main',
    }),
  })

  if (!prRes.ok) {
    const err = await prRes.json() as { message?: string }
    throw new Error(`Could not create PR: ${err.message ?? prRes.status}`)
  }

  const pr = await prRes.json() as { number: number; html_url: string }
  return { prNumber: pr.number, prUrl: pr.html_url }
}
