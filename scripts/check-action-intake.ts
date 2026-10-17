import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CanonicalActionArraySchema, isReviewedAction } from '../src/action-model.js'
import { actionKey, readActionRegistry, sha256 } from '../src/action-registry.js'
import { buildApi } from '../src/build-api.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const registry = readActionRegistry(repoRoot)
const baselineFile = (path: string) => execFileSync('git', ['show', `${registry.baseline.commit}:${path}`], { cwd: repoRoot, encoding: 'utf8' })
const openBytes = baselineFile('api/actions.json')
const doneBytes = baselineFile('api/done-actions.json')
if (sha256(openBytes) !== registry.baseline.openSha256 || sha256(doneBytes) !== registry.baseline.doneSha256) throw new Error('Migration baseline does not match its Git source')
const baselineOpen = CanonicalActionArraySchema.parse(JSON.parse(openBytes))
const baselineDone = CanonicalActionArraySchema.parse(JSON.parse(doneBytes))
for (const original of [...baselineOpen, ...baselineDone]) {
  const record = registry.records.find(record => record.key === actionKey(original))
  if (!record || record.origin !== 'imported' || JSON.stringify(record.original) !== JSON.stringify(original)) throw new Error(`Historical action changed: ${actionKey(original)}`)
}
if (registry.records.filter(record => record.origin === 'imported').length !== baselineOpen.length + baselineDone.length) throw new Error('Unexplained historical admission')
if (registry.baseline.commit !== 'faac3c9bb310bc0fc1c1ec445433e310e0498558' || sha256(JSON.stringify(registry.baseline.heldSuggestions)) !== 'cdc1a342eb80c6bda38df66f85bdcb920dbc190716615dd4fc1c041adbb02676' || sha256(JSON.stringify(registry.baseline.articleActions)) !== '17c1e8e03c48100c95486d3f9fb1cf68a40702504cbdc0f8c1ddc439d1205eae') throw new Error('Historical holds changed without a separate admission decision')
if (registry.records.filter(record => isReviewedAction(record.original)).length !== 3) throw new Error('Restricted reviewed action set changed')
for (const record of registry.records) {
  for (const decision of record.history) {
    const snapshot = registry.articles.find(article => article.date === decision.articleDate)
    if (!snapshot || !snapshot.actionKeys.includes(record.key)) throw new Error(`Disposition has no article receipt: ${record.key}`)
    for (const citation of decision.citations) {
      const source = snapshot.sources.find(source => source.id === citation.sourceId)
      if (!source?.content.includes(citation.quote)) throw new Error(`Disposition evidence is missing: ${record.key}`)
      if (!source.id.endsWith(`@${sha256(source.content)}`)) throw new Error(`Disposition source digest does not match: ${record.key}`)
    }
  }
}

buildApi(repoRoot)
const paths = ['api/actions.json', 'api/done-actions.json', 'api/proposed-actions.json', 'api/action-dispositions.json', 'api/entries.json', 'api/articles/2026-10-15.json']
const first = new Map(paths.map(path => [path, readFileSync(join(repoRoot, path), 'utf8')]))
buildApi(repoRoot)
for (const [path, bytes] of first) if (readFileSync(join(repoRoot, path), 'utf8') !== bytes) throw new Error(`Retry changed ${path}`)
console.log(`Action registry verified: ${baselineOpen.length} original open + ${baselineDone.length} original completed records conserved; 3 restricted actions; 138 held suggestions; projections byte-identical on retry.`)
