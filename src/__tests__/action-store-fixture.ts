import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitActionRegistry, articleActionFileBytes, registryBytes, managedArticleDigest, sha256, type ActionRegistry, type ArticleActionFile } from '../action-registry.js'
export function emptyActionFile(date: string, markdown = ''): ArticleActionFile {
  return { schemaVersion: 1, date, suggestions: [], decisions: [], snapshot: { date, status: 'accepted', review: { state: 'verified' }, articleDigest: managedArticleDigest(markdown), roundId: sha256('fixture'), stateDigest: sha256('[]'), actionKeys: [], verification: { proposer: 'fixture', verifier: 'fixture', promptVersion: 'fixture', proposalSha256: sha256('fixture'), verdicts: [] }, sources: [], rejected: [] } }
}
export function actionFile(registry: ActionRegistry, date: string): ArticleActionFile { return splitActionRegistry(registry).files.find(file => file.date === date) ?? emptyActionFile(date) }
export function writeActionStore(root: string, registry: ActionRegistry): void {
  const split = splitActionRegistry(registry)
  mkdirSync(join(root, 'actions/articles'), { recursive: true })
  writeFileSync(join(root, 'actions/registry.json'), registryBytes(split.baseline))
  for (const file of split.files) writeFileSync(join(root, `actions/articles/${file.date}.json`), articleActionFileBytes(file))
}
