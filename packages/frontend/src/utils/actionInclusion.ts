import { z } from 'zod'
import { ActionRegistrySchema, type ActionRegistry } from '../../../../src/action-registry-schema.ts'
import { ghFetch } from './stampDraft.ts'

const repo = 'repos/ojfbot/daily-logger'
const fileSchema = z.object({ content: z.string(), sha: z.string() })
const refSchema = z.object({ object: z.object({ sha: z.string() }) })
function decode(content: string): string { return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\n/g, '')), char => char.charCodeAt(0))) }
function encode(content: string): string { return btoa(Array.from(new TextEncoder().encode(content), byte => String.fromCharCode(byte)).join('')) }
const sameProse = (content: string) => content.replace(/^(?:status|outcome):.*\n?/gm, '')
export interface EditorialActions { registry: ActionRegistry; sha: string; branchExists: boolean; draft: boolean }

export async function loadEditorialActions(date: string, visibleBlobSha: string): Promise<EditorialActions> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid article date')
  const branch = `accept/${date}`
  const branchResponse = await ghFetch(`${repo}/git/refs/heads/${branch}`)
  if (!branchResponse.ok && branchResponse.status !== 404) throw new Error('Could not check editorial branch')
  const ref = branchResponse.ok ? encodeURIComponent(branch) : 'main'
  const articleResponse = await ghFetch(`${repo}/contents/_articles/${date}.md?ref=${ref}`)
  if (!articleResponse.ok) throw new Error('Article source unavailable')
  const article = fileSchema.parse(await articleResponse.json())
  if (article.sha !== visibleBlobSha) {
    const mainResponse = await ghFetch(`${repo}/contents/_articles/${date}.md?ref=main`)
    if (!mainResponse.ok) throw new Error('Article source unavailable')
    const main = fileSchema.parse(await mainResponse.json())
    if (main.sha !== visibleBlobSha || sameProse(decode(main.content)) !== sameProse(decode(article.content))) throw new Error('The editorial branch contains a different article version. Refresh its preview before changing actions.')
  }
  const response = await ghFetch(`${repo}/contents/actions/registry.json?ref=${ref}`)
  if (!response.ok) throw new Error('Canonical action state unavailable')
  const file = fileSchema.parse(await response.json())
  return { registry: ActionRegistrySchema.parse(JSON.parse(decode(file.content))), sha: file.sha, branchExists: branchResponse.ok, draft: /^status:\s*"?draft"?\s*$/m.test(decode(article.content)) }
}

export async function saveActionInclusion(input: { date: string; visibleBlobSha: string; expectedSha: string; key: string; include: boolean; login: string }): Promise<EditorialActions> {
  let current = await loadEditorialActions(input.date, input.visibleBlobSha)
  if (!current.draft) throw new Error('Article acceptance is already staged. Refresh the editorial preview before changing actions.')
  if (current.sha !== input.expectedSha) throw new Error('Action choices changed. Refresh before saving.')
  const branch = `accept/${input.date}`
  if (!current.branchExists) {
    const response = await ghFetch(`${repo}/git/refs/heads/main`)
    if (!response.ok) throw new Error('Could not read the current branch')
    const ref = refSchema.parse(await response.json())
    const created = await ghFetch(`${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) })
    if (!created.ok && created.status !== 422) throw new Error('Could not stage editorial choices')
    current = await loadEditorialActions(input.date, input.visibleBlobSha)
    if (!current.draft) throw new Error('Article acceptance is already staged. Refresh before changing actions.')
    if (current.sha !== input.expectedSha) throw new Error('Action choices changed while creating the editorial branch. Refresh before saving.')
  }
  const record = current.registry.records.find(record => record.key === input.key)
  const snapshot = current.registry.articles.find(article => article.date === input.date)
  if (!record || record.origin !== 'suggested' || !snapshot?.actionKeys.includes(input.key) || record.introducedBy !== input.date) throw new Error('This is existing work; changing its admission checkbox cannot close it')
  record.includeInIndex = input.include
  record.inclusionOverride = { include: input.include, actor: input.login, instruction: 'Explicit editorial inclusion checkbox' }
  const registry = ActionRegistrySchema.parse(current.registry)
  const response = await ghFetch(`${repo}/contents/actions/registry.json`, { method: 'PUT', body: JSON.stringify({ branch, sha: current.sha, content: encode(JSON.stringify(registry, null, 2) + '\n'), message: `editorial: ${input.include ? 'include' : 'exclude'} action ${input.key}` }) })
  if (!response.ok) throw new Error('Action choice was not confirmed. Reload before retrying.')
  return loadEditorialActions(input.date, input.visibleBlobSha)
}
