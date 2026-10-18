import { readFileSync, writeFileSync } from 'node:fs'
import { readActionRegistry, readArticleStatuses, ActionRegistrySchema, type ActionSource } from '../src/action-registry.js'
import { reviewArticleActions } from '../src/review-actions.js'

const FIXED_CONTEXT_LIMIT = 320 * 1024
const date = '2026-10-17'

void (async () => {
  const root = process.cwd(), receiptPath = process.argv[2]
  const sources: ActionSource[] = receiptPath
    ? ActionRegistrySchema.parse(JSON.parse(readFileSync(receiptPath, 'utf8')).registry).articles[0].sources
    : [{ id: 'budget-fixture', kind: 'repository', locator: 'check-action-size fixture', content: 'Receipt-free fixed-context budget probe.' }]
  const prompts: number[] = []
  const measured = new Error('Both prompts captured; no provider called')
  try {
    await reviewArticleActions({
      registry: readActionRegistry(root), articleDate: date,
      markdown: readFileSync(`_articles/${date}.md`, 'utf8'),
      feedback: 'Local context-size measurement only', sources, articleStatuses: readArticleStatuses(root),
      agents: {
        propose: async prompt => { prompts.push(Buffer.byteLength(prompt)); return { changes: [], suggestions: [] } },
        verify: async prompt => { prompts.push(Buffer.byteLength(prompt)); throw measured },
      },
    })
  } catch (error) { if (error !== measured) throw error }
  if (prompts.length !== 2) throw new Error('The budget check must capture both real prompt paths')
  const value = {
    schemaVersion: 1,
    method: receiptPath
      ? 'Build current prompts from the previously authorized sources, with an empty proposal for the verifier measurement. No provider calls or article/queue writes.'
      : 'Receipt-free CI fixture measures the actual fixed context in both prompt paths. No network, provider calls or file writes.',
    baselineBytes: Buffer.byteLength(readFileSync('actions/registry.json')),
    articleFileBytes: Buffer.byteLength(readFileSync(`actions/articles/${date}.json`)),
    sourceBytes: sources.reduce((total, source) => total + Buffer.byteLength(source.content), 0),
    proposerPromptBytes: prompts[0], verifierPromptBytes: prompts[1],
    limits: { source: 131072, totalSources: 393216, prompt: 655360, articleFile: 65536, fixedContext: FIXED_CONTEXT_LIMIT },
  }
  console.log(JSON.stringify(value, null, 2))
  if (!receiptPath && Math.max(...prompts) > FIXED_CONTEXT_LIMIT) throw new Error('Fixed action context exceeds 320 KiB; scope prompt records before increasing this budget')
  if (receiptPath) writeFileSync('reviews/action-cutover-size-check.json', JSON.stringify(value, null, 2) + '\n')
})()
