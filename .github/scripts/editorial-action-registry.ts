import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { ArticleActionFileSchema, isArticleFileInclusionChange, actionArticlePath } from '../../src/action-registry-schema.js'
import { createReviewSource, ReviewError, type GitHub } from '../../api/_lib/article-review-sources.js'
import { decodeEditorial } from '../../api/_lib/editorial-continuation.js'
import { verifyEditorialProof } from '../../shared/editorial-action-proof.js'
import { sha } from '../../shared/article-review.js'
import { ACTION_REVIEW_PROMPT_VERSION, acceptanceActionCycle, revisionActionCycle } from '../../src/action-review-cycle.js'

export async function admitActionRegistry(input: { workspace: string; base: string; head: string; date: string; actor: string; pullRequest: number; github: GitHub }) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: input.workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const actionPath = actionArticlePath(input.date)
  const registryAt = (ref: string) => {
    if (!git('ls-tree', ref, '--', actionPath).startsWith('100644 ')) throw new ReviewError(409, 'A regular canonical registry is required; rebase pre-cutover branches.')
    return ArticleActionFileSchema.parse(JSON.parse(git('show', `${ref}:${actionPath}`)))
  }
  const ancestors = git('merge-base', '--all', input.base, input.head).split('\n'), ancestor = ancestors[0]
  if (ancestors.length !== 1 || !ancestor) throw new ReviewError(409, 'A unique trusted common ancestor is required.')
  const articlePath = `_articles/${input.date}.md`
  if (!git('ls-tree', input.head, '--', articlePath).startsWith('100644 ') || git('diff', '--no-renames', '--name-only', ancestor, input.head).split('\n').filter(Boolean).some(path => ![articlePath, actionPath].includes(path))) throw new ReviewError(409, 'Editorial heads may change only the regular dated article and canonical registry.')
  const proposed = registryAt(input.head)
  const allowed = (ref: string) => { const trusted = registryAt(ref); return JSON.stringify(trusted) === JSON.stringify(proposed) || isArticleFileInclusionChange(trusted, proposed, input.actor) }
  if (allowed(ancestor)) return
  const source = createReviewSource(input.github), comments = await source.comments(input.pullRequest)
  for (const comment of [...comments].reverse()) {
    if (comment.user.login !== 'github-actions[bot]' || comment.created_at !== comment.updated_at) continue
    const initial = comment.body.startsWith('## Verified action registry\n'), continuation = comment.body.startsWith('## Editorial execution receipt\n')
    if (!initial && !continuation) continue
    const value = z.object({ runId: z.number().int().positive(), policySha: sha, outputCommit: sha, outputRegistryBlob: sha, inputHead: sha.optional(), date: z.string().optional(), requestCommentId: z.number().optional(), requestDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), actionReviewMode: z.enum(['clean-acceptance', 'revision']).optional(), outcome: z.string().optional() }).passthrough().safeParse(JSON.parse(comment.body.slice(comment.body.indexOf('\n') + 1)))
    if (!value.success) continue
    const receipt = value.data
    if (!await verifyEditorialProof(input.github, receipt) || receipt.pullRequest !== input.pullRequest || receipt.date !== input.date) continue
    if (initial ? receipt.date !== input.date : receipt.outcome !== 'changed') continue
    if (continuation) {
      const request = comments.find(item => item.id === receipt.requestCommentId)
      if (!request || request.user.login !== input.actor || request.created_at !== request.updated_at || decodeEditorial(request.body)?.date !== input.date) continue
    }
    const response = await input.github(`/repos/ojfbot/daily-logger/actions/runs/${receipt.runId}`)
    if (!response.ok) throw new ReviewError(503, 'Action registry receipt provenance unavailable.')
    const run = z.object({ id: z.number(), run_attempt: z.literal(1), event: z.string(), head_branch: z.string(), head_sha: sha, display_title: z.string(), path: z.string().regex(/^\.github\/workflows\/editorial-revise\.yml(?:@(?:main|refs\/heads\/main))?$/),
      pull_requests: z.array(z.object({ number: z.number(), base: z.object({ sha }), head: z.object({ sha }) })).default([]) }).parse(await response.json())
    if (run.id !== receipt.runId || run.event !== (initial ? 'pull_request_target' : 'issue_comment')) continue
    if (initial ? run.head_branch !== `accept/${input.date}` || run.head_sha !== receipt.inputHead || !run.pull_requests.some(pr => pr.number === input.pullRequest && pr.base.sha === receipt.policySha && pr.head.sha === receipt.inputHead)
      : run.head_branch !== 'main' || run.head_sha !== receipt.policySha || run.display_title !== `Editorial continuation comment ${receipt.requestCommentId}`) continue
    try {
      if (proposed.snapshot.reviewCycle || proposed.suggestions.some(record => record.admission)) {
        if (!receipt.inputHead || !receipt.actionReviewMode || continuation && (!receipt.requestCommentId || !receipt.requestDigest || receipt.actionReviewMode !== 'revision')) continue
        const before = registryAt(receipt.inputHead), output = registryAt(receipt.outputCommit)
        const expectedCycle = initial && receipt.actionReviewMode === 'clean-acceptance'
          ? acceptanceActionCycle(`pull-request:${input.pullRequest}:clean-acceptance`, before.snapshot)
          : revisionActionCycle(initial ? `pull-request:${input.pullRequest}:revision` : `comment:${receipt.requestCommentId}:${receipt.requestDigest}`)
        if (output.snapshot.verification.promptVersion !== ACTION_REVIEW_PROMPT_VERSION || JSON.stringify(output.snapshot.reviewCycle) !== JSON.stringify(expectedCycle)) continue
        // The immutable artifact binds this entire dated file. Phase and births
        // must also match the trusted callsite's logical request, never v5 output.
        if (before.suggestions.some(prior => !output.suggestions.some(record => record.key === prior.key && JSON.stringify(record.original) === JSON.stringify(prior.original) && record.workKey === prior.workKey && JSON.stringify(record.admission) === JSON.stringify(prior.admission)))) continue
        if (output.suggestions.some(record => !before.suggestions.some(prior => prior.key === record.key) && JSON.stringify(record.admission) !== JSON.stringify(expectedCycle))) continue
      }
      if (receipt.inputHead && (receipt.outcome === 'no_change' ? receipt.outputCommit !== receipt.inputHead : git('rev-parse', `${receipt.outputCommit}^`) !== receipt.inputHead)) continue
      git('merge-base', '--is-ancestor', receipt.policySha, input.base)
      git('merge-base', '--is-ancestor', receipt.outputCommit, input.head)
      if (git('rev-parse', `${receipt.outputCommit}:${actionPath}`) === receipt.outputRegistryBlob && allowed(receipt.outputCommit)) return
    } catch { /* An unrelated or missing output cannot authorize this registry. */ }
  }
  throw new ReviewError(409, 'Registry changes require an exact trusted editorial output receipt or this article’s explicit inclusion choice. Reconcile or rebase before continuing.')
}
