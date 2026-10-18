import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readActionRegistry, rebindArticleSnapshot, registryRevision, writeActionRegistry } from '../src/action-registry.js'
const root = resolve(process.env.ACTION_REPO_ROOT ?? '.')
const date = process.env.ARTICLE_DATE
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('ARTICLE_DATE must be YYYY-MM-DD')
const path = `_articles/${date}.md`, absolute = resolve(root, path)
const beforeMarkdown = execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })
const afterMarkdown = readFileSync(absolute, 'utf8')
const registry = readActionRegistry(root), snapshot = registry.articles.find(article => article.date === date)
if (!snapshot) throw new Error('No prior article review to rebind')
const next = rebindArticleSnapshot(registry, { date, beforeMarkdown, afterMarkdown, expectedRoundId: process.env.EXPECTED_ROUND_ID ?? snapshot.roundId, actor: process.env.ACTION_ACTOR ?? '', instruction: process.env.EDITORIAL_FEEDBACK ?? '' })
writeActionRegistry(root, next, registryRevision(registry), { path: absolute, expected: afterMarkdown, next: afterMarkdown, publish: () => writeFileSync(absolute, afterMarkdown) })
console.log(JSON.stringify({ date, roundId: snapshot.roundId, binding: next.articles.find(article => article.date === date)?.binding }))
