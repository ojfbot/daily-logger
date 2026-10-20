import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { assertArticleReferenceContract } from '../src/article-references.js'
import { readActionRegistry, readArticleStatuses, renderArticleActionHtml, stripManagedActions } from '../src/action-registry.js'
import { readArticleTime } from '../src/article-time-metadata.js'

const base = process.env.BASE_SHA
const head = process.env.HEAD_SHA
if (!base || !head || !/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) throw new Error('BASE_SHA and HEAD_SHA must be commit SHAs')
const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', base, head, '--', '_articles'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const repoRoot = process.cwd()
const registry = readActionRegistry(repoRoot)
const statuses = readArticleStatuses(repoRoot)
for (const path of changed) {
  if (!/^_articles\/\d{4}-\d{2}-\d{2}\.md$/.test(path)) continue
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Changed article must be a regular file: ${path}`)
  const markdown = readFileSync(path, 'utf8')
  const date = path.slice('_articles/'.length, -'.md'.length)
  const renderedHtml = renderArticleActionHtml(markdown, registry, date, statuses)
  const evidence = readArticleTime({ repoRoot, date, markdown: stripManagedActions(markdown), bindingMarkdown: markdown, renderedHtml })
  const audit = assertArticleReferenceContract(markdown, evidence.referenceKinds, renderedHtml)
  console.log(`Article references valid: ${path} (${audit.verified} source-verified, ${audit.unknown} identity-unknown)`)
}
