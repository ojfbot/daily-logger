import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { z } from 'zod'
import { editorialProofSchema, editorialProofName } from '../shared/editorial-action-proof.js'
import { ArticleActionFileSchema, articleCompletionOutcome } from '../src/action-registry-schema.js'
const root = process.env.ACTION_REPO_ROOT ?? process.cwd()
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const path = `${root}/.git/editorial-output.json`
if (process.argv[2] === 'continuation' && !existsSync(path)) process.exit(0)
const mode = process.argv[2] === 'continuation' ? undefined : z.enum(['clean-acceptance', 'revision']).parse(process.argv[2])
let manifest = process.argv[2] === 'continuation' ? editorialProofSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) : editorialProofSchema.parse({ repository: 'ojfbot/daily-logger', actionReviewMode: mode, ...(mode === 'revision' ? { requestDigest: z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.REQUEST_DIGEST) } : {}), date: process.env.ARTICLE_PATH?.match(/([0-9-]+)\.md$/)?.[1], pullRequest: Number(process.env.PR_NUMBER), runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), policySha: process.env.GITHUB_SHA, inputHead: process.env.INPUT_HEAD, outputCommit: git('rev-parse', 'HEAD'), outputRegistryBlob: git('rev-parse', `HEAD:actions/articles/${process.env.ARTICLE_PATH?.match(/([0-9-]+)\.md$/)?.[1]}.json`), outcome: git('rev-parse', 'HEAD') === process.env.INPUT_HEAD ? 'no_change' : 'changed' })
if (mode === 'clean-acceptance') {
  const datedPath = `actions/articles/${manifest.date}.json`
  const before = ArticleActionFileSchema.parse(JSON.parse(git('show', `${manifest.inputHead}:${datedPath}`)))
  const after = ArticleActionFileSchema.parse(JSON.parse(git('show', `${manifest.outputCommit}:${datedPath}`)))
  if (after.snapshot.review.state === 'pending') {
    const actionReview = articleCompletionOutcome(before, after)
    if (!actionReview || actionReview.state !== 'pending') throw new Error('Article-only output is not bound to its pristine native input')
    manifest = editorialProofSchema.parse({ ...manifest, articleCompletion: 'accepted', actionReview })
  }
}
writeFileSync(path, JSON.stringify(manifest))
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `artifact_name=${editorialProofName(manifest)}\n`, { flag: 'a' })
