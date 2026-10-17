import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { ActionRegistrySchema, isArticleInclusionChange } from '../../src/action-registry-schema.js'
import { createReviewSource, ReviewError, type GitHub } from '../../api/_lib/article-review-sources.js'
import { decodeEditorial } from '../../api/_lib/editorial-continuation.js'
import { sha } from '../../shared/article-review.js'

export async function admitActionRegistry(input: { workspace: string; base: string; head: string; date: string; actor: string; pullRequest: number; github: GitHub }) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: input.workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const registryAt = (ref: string) => {
    if (!git('ls-tree', ref, '--', 'actions/registry.json').startsWith('100644 ')) throw new ReviewError(409, 'A regular canonical registry is required; rebase pre-cutover branches.')
    return ActionRegistrySchema.parse(JSON.parse(git('show', `${ref}:actions/registry.json`)))
  }
  const ancestors = git('merge-base', '--all', input.base, input.head).split('\n'), ancestor = ancestors[0]
  if (ancestors.length !== 1 || !ancestor) throw new ReviewError(409, 'A unique trusted common ancestor is required.')
  const articlePath = `_articles/${input.date}.md`
  if (!git('ls-tree', input.head, '--', articlePath).startsWith('100644 ') || git('diff', '--no-renames', '--name-only', ancestor, input.head).split('\n').filter(Boolean).some(path => ![articlePath, 'actions/registry.json'].includes(path))) throw new ReviewError(409, 'Editorial heads may change only the regular dated article and canonical registry.')
  const proposed = registryAt(input.head)
  const allowed = (ref: string) => { const trusted = registryAt(ref); return JSON.stringify(trusted) === JSON.stringify(proposed) || isArticleInclusionChange(trusted, proposed, input.date, input.actor) }
  if (allowed(ancestor)) return
  const source = createReviewSource(input.github), comments = await source.comments(input.pullRequest)
  for (const comment of [...comments].reverse()) {
    if (comment.user.login !== 'github-actions[bot]' || comment.created_at !== comment.updated_at) continue
    const initial = comment.body.startsWith('## Verified action registry\n'), continuation = comment.body.startsWith('## Editorial execution receipt\n')
    if (!initial && !continuation) continue
    const value = z.object({ runId: z.number().int().positive(), policySha: sha, outputCommit: sha, outputRegistryBlob: sha, inputHead: sha.optional(), date: z.string().optional(), requestCommentId: z.number().optional(), outcome: z.string().optional() }).passthrough().safeParse(JSON.parse(comment.body.slice(comment.body.indexOf('\n') + 1)))
    if (!value.success) continue
    const receipt = value.data
    if (initial ? receipt.date !== input.date : receipt.outcome !== 'changed') continue
    if (continuation) {
      const request = comments.find(item => item.id === receipt.requestCommentId)
      if (!request || request.user.login !== input.actor || request.created_at !== request.updated_at || decodeEditorial(request.body)?.date !== input.date) continue
    }
    const response = await input.github(`/repos/ojfbot/daily-logger/actions/runs/${receipt.runId}`)
    if (!response.ok) throw new ReviewError(503, 'Action registry receipt provenance unavailable.')
    const run = z.object({ id: z.number(), event: z.string(), head_branch: z.string(), head_sha: sha, display_title: z.string(), path: z.string().regex(/^\.github\/workflows\/editorial-revise\.yml(?:@(?:main|refs\/heads\/main))?$/),
      pull_requests: z.array(z.object({ number: z.number(), base: z.object({ sha }), head: z.object({ sha }) })).default([]) }).parse(await response.json())
    if (run.id !== receipt.runId || run.event !== (initial ? 'pull_request_target' : 'issue_comment')) continue
    if (initial ? run.head_branch !== `accept/${input.date}` || run.head_sha !== receipt.inputHead || !run.pull_requests.some(pr => pr.number === input.pullRequest && pr.base.sha === receipt.policySha && pr.head.sha === receipt.inputHead)
      : run.head_branch !== 'main' || run.head_sha !== receipt.policySha || run.display_title !== `Editorial continuation comment ${receipt.requestCommentId}`) continue
    try {
      git('merge-base', '--is-ancestor', receipt.policySha, input.base)
      git('merge-base', '--is-ancestor', receipt.outputCommit, input.head)
      if (git('rev-parse', `${receipt.outputCommit}:actions/registry.json`) === receipt.outputRegistryBlob && allowed(receipt.outputCommit)) return
    } catch { /* An unrelated or missing output cannot authorize this registry. */ }
  }
  throw new ReviewError(409, 'Registry changes require an exact trusted editorial output receipt or this article’s explicit inclusion choice. Reconcile or rebase before continuing.')
}
