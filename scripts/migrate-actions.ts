import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CanonicalActionArraySchema } from '../src/action-model.js'
import { projectActionIntake } from '../src/action-intake.js'
import { actionKey, normalizeWorkKey, REGISTRY_PATH, registryBytes, sha256, type ActionRegistry } from '../src/action-registry.js'

export function migrateActions(repoRoot: string): ActionRegistry {
  if (existsSync(join(repoRoot, REGISTRY_PATH))) throw new Error('Registry already exists; migration never overwrites canonical state')
  const openBytes = readFileSync(join(repoRoot, 'api/actions.json'), 'utf8')
  const doneBytes = readFileSync(join(repoRoot, 'api/done-actions.json'), 'utf8')
  const actions = [...CanonicalActionArraySchema.parse(JSON.parse(openBytes)), ...CanonicalActionArraySchema.parse(JSON.parse(doneBytes))]
  const articles = readdirSync(join(repoRoot, '_articles')).filter(file => file.endsWith('.md')).map(file => ({ path: `_articles/${file}`, date: file.slice(0, -3), content: readFileSync(join(repoRoot, '_articles', file), 'utf8') }))
  const intake = projectActionIntake({ repoRoot, articles })
  const registry: ActionRegistry = {
    schemaVersion: 1,
    baseline: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(), openSha256: sha256(openBytes), doneSha256: sha256(doneBytes), articleActions: Object.fromEntries([...intake.byArticlePath].map(([path, actions]) => [path.slice('_articles/'.length, -3), [...actions]])), heldSuggestions: intake.heldSuggestions.map(held => ({ ...held, suggestion: readFileSync(join(repoRoot, held.articlePath), 'utf8').split('\n')[held.line - 1] })) },
    records: actions.map(original => ({ key: actionKey(original), original, origin: 'imported', workKey: normalizeWorkKey(original.repo, original.command, original.description), state: original.status, introducedBy: original.sourceDate, includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] })),
    articles: [],
  }
  mkdirSync(join(repoRoot, 'actions'), { recursive: true })
  writeFileSync(join(repoRoot, REGISTRY_PATH), registryBytes(registry), { flag: 'wx' })
  return registry
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = migrateActions(resolve(process.argv[2] ?? '.'))
  console.log(`Imported ${registry.records.length} unchanged action records; ${registry.baseline.heldSuggestions.length} suggestions remain held.`)
}
