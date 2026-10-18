/** October 17 regression oracle for an explicitly authorized, no-write model test. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ActionRegistrySchema, ACTIONS_START, readActionRegistry, registryRevision, renderArticleActionHtml, readArticleStatuses } from '../src/action-registry.js'

if (process.argv[2] === '--failures') {
  const log = readFileSync(process.argv[3], 'utf8')
  const invalidQuotes = log.split('\n').filter(line => /^(?:Action review needs its one repair:|Error: Disposition).*Invalid citations:/.test(line)).length
  console.log(JSON.stringify({ premise: 'The proposer must reproduce evidence text exactly.', proposer: { calls: (log.match(/^Action proposer:/gm) ?? []).length, invalidCitationRounds: invalidQuotes }, verifier: { calls: (log.match(/^Action verifier:/gm) ?? []).length }, code: { rejectedCitationRounds: invalidQuotes } }, null, 2))
  process.exit(0)
}
const path = process.argv[2]
if (!path) throw new Error('Pass the --receipt JSON from the October 17 dry run')
const receipt = z.object({ articleDate: z.literal('2026-10-17'), beforeRevision: z.string(), dryRun: z.literal(true), registry: ActionRegistrySchema, markdown: z.string() }).parse(JSON.parse(readFileSync(path, 'utf8')))
const before = readActionRegistry(resolve('.'))
const canonicalUnchanged = registryRevision(before) === receipt.beforeRevision
const receiptApplied = registryRevision(before) === registryRevision(receipt.registry)
const historicalExtension = before.baseline.commit === 'd540e2c5d7aa21b3916c3db1527e993e66c705bd' && before.records.filter(record => !receipt.registry.records.some(old => old.key === record.key)).every(record => record.origin === 'imported' && record.original.sourceDate > receipt.articleDate)
if (!canonicalUnchanged && !receiptApplied && !historicalExtension) throw new Error('Canonical registry changed independently of the reviewed receipt')
for (const original of before.records) {
  const after = receipt.registry.records.find(record => record.key === original.key)
  if (!after && historicalExtension && original.original.sourceDate > receipt.articleDate) continue
  if (after && historicalExtension && JSON.stringify(original.history) !== JSON.stringify(after.history)) throw new Error(`Verified action decisions changed during storage conversion: ${original.key}`)
  if (!after || JSON.stringify(original.original) !== JSON.stringify(after.original)) throw new Error(`Original identity changed: ${original.key}`)
}
const states = {
  'act-2026-10-17-adr-761b78': 'dismissed',
  'act-2026-10-17-pr-review-a34469': 'done',
  'act-2026-10-17-close-pr-ebb20f': 'dismissed',
}
for (const [key, state] of Object.entries(states)) if (receipt.registry.records.find(record => record.key === key)?.state !== state || before.records.find(record => record.key === key)?.state !== state) throw new Error(`Incorrect reviewed disposition: ${key}`)
const active = receipt.markdown.slice(receipt.markdown.indexOf(ACTIONS_START)).split('<section class="action-history-card"')[0]
if (/Nothing is documented as blocking|prioritization lag|\/adr|\/close-pr/.test(active)) throw new Error('Disproved original wording remains in the active block')
if (/\/pr-review[^\n]*#372/.test(active)) throw new Error('The merged #372 review remains in the active block')
if (!receipt.registry.articles.flatMap(article => article.sources).some(source => source.id.startsWith('github:daily-logger#372@') && source.content.startsWith('CURRENT API STATE daily-logger#372: state=merged;'))) throw new Error('Fresh #372 merge evidence was not collected')
const snapshot = receipt.registry.articles.find(article => article.date === receipt.articleDate)
if (!snapshot || snapshot.verification.proposer !== 'claude-sonnet-4-6' || snapshot.verification.verifier !== 'claude-opus-4-6') throw new Error('The live independent model receipt is missing')
const html = renderArticleActionHtml(receipt.markdown, receipt.registry, receipt.articleDate, readArticleStatuses(resolve('.')))
if (!html.includes('<section class="action-history-card"') || html.includes('&lt;section class=&quot;action-history-card')) throw new Error('Resolved history is not a rendered card')
console.log(JSON.stringify({ result: 'pass', articleDate: receipt.articleDate, canonicalUnchanged, receiptApplied, originalRecords: before.records.length, newIdentities: receipt.registry.records.filter(record => record.origin === 'suggested' && record.introducedBy === receipt.articleDate).length, roundId: snapshot.roundId, verification: snapshot.verification, states, currentReview: receipt.registry.records.find(record => record.key === 'act-2026-10-17-pr-review-a34469')?.history.at(-1)?.description, sources: snapshot.sources.map(source => ({ id: source.id, kind: source.kind, locator: source.locator })) }, null, 2))
