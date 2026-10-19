/** Offline boundary probe. Input is an explicit local collector capture, never fetched here. */
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { ActionSourceSchema, readActionRegistry, readArticleStatuses, sha256, type ActionSource } from '../src/action-registry.js'
import type { ActionAgents, ActionProposal } from '../src/review-actions.js'

const capsule = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Pass a frozen evidence capsule with sources, source-article.md and editorial-feedback.txt')
const policyRoot = resolve(process.argv[3] ?? '.')
const policy = await import(pathToFileURL(join(policyRoot, 'src/review-actions.ts')).href)
const sourceBytes = readFileSync(join(capsule, 'frozen-collected-action-sources.json'), 'utf8')
const sources = z.array(ActionSourceSchema).parse(JSON.parse(sourceBytes))
const markdown = readFileSync(join(capsule, 'source-article.md'), 'utf8')
const feedback = readFileSync(join(capsule, 'editorial-feedback.txt'), 'utf8')
const date = markdown.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})/m)?.[1]
if (!date) throw new Error('Article has no date')
const input = { registry: readActionRegistry(policyRoot), articleDate: date, markdown, feedback, sources, articleStatuses: readArticleStatuses(policyRoot) }
const measurements: Array<{ scenario: string; calls: Array<{ role: string; promptBytes: number }>; result: string }> = []
for (const scenario of ['empty', 'two-meaningful', 'oversized-proposal']) {
  const calls: Array<{ role: string; promptBytes: number }> = []
  const agents: ActionAgents = {
    propose: async (prompt, selected) => {
      calls.push({ role: 'proposer', promptBytes: Buffer.byteLength(prompt) })
      if (scenario === 'empty') return { changes: [], suggestions: [] }
      const goal = selected.find(source => source.kind === 'goal')
      if (!goal) throw new Error('Probe needs actual selected goal evidence')
      const goalQuote = goal.content.split('\n').find(line => line.trim().length >= 20)
      if (!goalQuote) throw new Error('Probe goal has no usable exact line')
      const suggestions: ActionProposal['suggestions'] = [385, 386].map(number => {
        const fact = selected.find(source => source.locator.includes(`/daily-logger/${number === 385 ? 'pull' : 'issues'}/${number}`))
        if (!fact) throw new Error(`Required probe source missing: ${number}`)
        const quote = fact.content.split('\n')[0]
        return { command: number === 385 ? '/pr-review' : '/implement', description: number === 385 ? 'Review the clustered-clock preview, retaining human visual acceptance and explicit merge gates.' : 'Prepare evidence selection and a scoped token-budget proposal for independent owner review.',
          repo: 'daily-logger', target: `daily-logger#${number}`, outcome: number === 385 ? 'Human-reviewed clustered clock behavior' : 'Auditable bounded evidence selection', goal: 'Reliable evidence-backed article and queue review',
          factCitations: [{ sourceId: fact.id, quote }], goalCitations: [{ sourceId: goal.id, quote: goalQuote }],
          doneWhen: number === 385 ? 'Human accepts the reviewed visual preview and explicitly decides publication.' : 'Independent review confirms boundary controls and the owner accepts the scoped repair; token fit remains unqualified.',
          gates: ['No automatic merge, dispatch, execution or settlement authority.', 'Independent review and explicit owner acceptance remain required.'], existingKey: null }
      })
      if (scenario === 'oversized-proposal') suggestions[0].description += '🙂'.repeat(170 * 1024)
      return { changes: [], suggestions }
    },
    verify: async prompt => { calls.push({ role: 'verifier', promptBytes: Buffer.byteLength(prompt) }); throw new Error('OFFLINE_PROBE_STOP: no verdict, no admission, no provider called') },
  }
  let result = 'unexpected success'
  try { await policy.reviewArticleActions({ ...input, agents }) } catch (error) { result = error instanceof Error ? error.message : String(error) }
  measurements.push({ scenario, calls, result })
}
console.log(JSON.stringify({ qualification: 'Offline replay of a saved collector output without original generation context. Fake agents measure real prompt paths; no provider, verdict, write or original-run reconstruction.',
  policyRoot, sourceFixtureSha256: sha256(sourceBytes), markdownSha256: sha256(markdown), feedbackSha256: sha256(feedback),
  collectedSources: sources.length, collectedContentBytes: sources.reduce((sum: number, source: ActionSource) => sum + Buffer.byteLength(source.content), 0),
  tokenCount: null, tokenQualification: 'No tokenizer/provider token measurement; byte fit does not qualify model context-window fit.', measurements }, null, 2))
