import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { detachArticleTime } from './article-time-frontmatter.js'
import { isReviewedAction, legacyActionKey, type CanonicalAction } from './action-model.js'
import { renderArticle } from './render-article.js'

export const REGISTRY_PATH = 'actions/registry.json'
export const ACTIONS_START = '<!-- ACTIONS_START -->'
export const ACTIONS_END = '<!-- ACTIONS_END -->'
export * from './action-registry-schema.js'
import { ActionRegistrySchema, ArticleActionFileSchema, splitActionRegistry, hydrateActionRegistry, articleActionFileBytes, actionArticlePath, type ActionRegistry } from './action-registry-schema.js'

export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function registryBytes(registry: ActionRegistry): string { return JSON.stringify(ActionRegistrySchema.parse(registry), null, 2) + '\n' }
export function registryRevision(registry: ActionRegistry): string { return sha256(registryBytes(registry)) }
export function actionStateDigest(registry: ActionRegistry, keys: readonly string[]): string { return sha256(JSON.stringify(registry.records.filter(record => keys.includes(record.key)).map(record => ({ key: record.key, state: record.state, history: record.history })))) }
export function actionKey(action: CanonicalAction): string { return action.id ?? `legacy-${sha256(legacyActionKey(action))}` }
export function normalizeWorkKey(repo: string, target: string, outcome: string): string { return [repo, target, outcome].map(value => value.toLowerCase().replace(/\s+/g, ' ').trim()).join('|') }

export function readActionRegistry(repoRoot: string): ActionRegistry {
  const path = join(repoRoot, REGISTRY_PATH)
  if (!existsSync(path)) throw new Error('Action registry is missing. Run the explicit migration; markdown is never an admission fallback.')
  const directory = join(repoRoot, 'actions/articles')
  const files = existsSync(directory) ? readdirSync(directory).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).map(file => { const bytes = readFileSync(join(directory, file), 'utf8'); if (Buffer.byteLength(bytes) > 64 * 1024) throw new Error(`Oversized article action file: ${file}`); const parsed = ArticleActionFileSchema.parse(JSON.parse(bytes)); if (file !== `${parsed.date}.json`) throw new Error('Article action filename and date disagree'); return parsed }) : []
  return hydrateActionRegistry(ActionRegistrySchema.parse(JSON.parse(readFileSync(path, 'utf8'))), files)
}

export function writeActionRegistry(repoRoot: string, registry: ActionRegistry, expectedRevision: string, article?: { path: string; expected: string | null; next: string; publish: () => void }): void {
  const path = join(repoRoot, REGISTRY_PATH)
  const lock = `${path}.lock`
  const descriptor = openSync(lock, 'wx')
  const temporary: string[] = []
  const oldFiles = new Map<string, string | null>()
  let published = false
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + '\n')
    const before = readActionRegistry(repoRoot)
    if (registryRevision(before) !== expectedRevision) throw new Error('Action registry changed during review; refresh before retrying')
    if (article && (existsSync(article.path) ? readFileSync(article.path, 'utf8') : null) !== article.expected) throw new Error('Article changed during action review; refresh before retrying')
    const split = splitActionRegistry(registry)
    if (registryBytes(split.baseline) !== registryBytes(splitActionRegistry(before).baseline)) throw new Error('The imported action baseline cannot change during an article review')
    if (before.articles.some(snapshot => !registry.articles.some(next => next.date === snapshot.date))) throw new Error('An article review cannot delete another article snapshot')
    mkdirSync(join(repoRoot, 'actions/articles'), { recursive: true })
    for (const file of split.files) {
      const target = join(repoRoot, actionArticlePath(file.date)), bytes = articleActionFileBytes(file)
      const old = existsSync(target) ? readFileSync(target, 'utf8') : null
      if (old === bytes) continue
      if (article && !article.path.endsWith(`/${file.date}.md`)) throw new Error('An article review cannot write another date')
      const temp = `${target}.${randomUUID()}.tmp`
      writeFileSync(temp, bytes, { flag: 'wx' }); temporary.push(temp); oldFiles.set(target, old)
    }
    if (article) { published = true; article.publish(); if (readFileSync(article.path, 'utf8') !== article.next) throw new Error('Article publication did not match its verified content') }
    for (const [index, target] of [...oldFiles.keys()].entries()) renameSync(temporary[index], target)
  } catch (error) {
    for (const [target, old] of oldFiles) { if (old === null) { if (existsSync(target)) unlinkSync(target) } else writeFileSync(target, old) }
    if (article && published) {
      if (article.expected === null) { if (existsSync(article.path)) unlinkSync(article.path) }
      else writeFileSync(article.path, article.expected)
    }
    throw error
  } finally {
    for (const temp of temporary) if (existsSync(temp)) unlinkSync(temp)
    closeSync(descriptor)
    unlinkSync(lock)
  }
}

export function readArticleStatuses(repoRoot: string): Map<string, string> {
  return new Map(readdirSync(join(repoRoot, '_articles')).filter(file => file.endsWith('.md')).map(file => [file.slice(0, -3), readFileSync(join(repoRoot, '_articles', file), 'utf8').match(/^status:\s*"?(\w+)/m)?.[1] ?? 'draft']))
}

export function acceptedActionState(record: ActionRegistry['records'][number], statuses: ReadonlyMap<string, string>, registry: ActionRegistry) {
  return record.history.filter(item => statuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.roundId === item.roundId)).at(-1)?.state ?? (record.origin === 'imported' ? record.original.status : 'proposed')
}

export function stripManagedActions(markdown: string): string {
  const start = markdown.indexOf(ACTIONS_START)
  const end = markdown.indexOf(ACTIONS_END)
  if (start === -1 && end === -1) return markdown
  if (start === -1 || end < start || markdown.indexOf(ACTIONS_START, start + 1) !== -1) throw new Error('Invalid managed action block')
  return markdown.slice(0, start) + markdown.slice(end + ACTIONS_END.length)
}
export function articleActionDigest(markdown: string): string {
  const prose = detachArticleTime(stripManagedActions(markdown)).markdown
  return sha256(prose.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, header => header.replace(/^(?:status|outcome|provenance):.*\n?/gm, '')).trim())
}

export function setActionInclusion(registry: ActionRegistry, key: string, include: boolean, actor: string, instruction: string, articleStatuses: ReadonlyMap<string, string>): ActionRegistry {
  const next = structuredClone(registry)
  const record = next.records.find(item => item.key === key)
  if (!record || record.origin !== 'suggested') throw new Error('Only a new suggestion has an admission checkbox; existing work requires a disposition')
  if (registry.articles.some(article => articleStatuses.get(article.date) === 'accepted' && article.actionKeys.includes(key))) throw new Error('An accepted suggestion requires a disposition; its admission checkbox cannot close existing work')
  if (!actor.trim() || !instruction.trim()) throw new Error('Inclusion changes require an identified operator instruction')
  record.includeInIndex = include
  record.inclusionOverride = { include, actor, instruction }
  return ActionRegistrySchema.parse(next)
}

export function projectRegistry(registry: ActionRegistry, articleStatuses: ReadonlyMap<string, string>) {
  const open: CanonicalAction[] = [], done: CanonicalAction[] = []
  const proposed: Array<{ id: string; command: string; description: string; repo: string; sourceDate: string; status: 'proposed'; includeInIndex: boolean }> = []
  const dispositions: Array<{ id: string; description: string; repo: string; sourceDate: string; state: string; reason: string }> = []
  for (const record of registry.records) {
    const original = record.original
    const decision = record.history.filter(item => articleStatuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.roundId === item.roundId)).at(-1)
    const state = decision?.state ?? (record.origin === 'imported' ? original.status : 'proposed')
    if (record.origin === 'suggested' && !record.includeInIndex && decision) continue
    if (state === 'done') {
      if (isReviewedAction(original)) throw new Error('Reviewed actions require an exact-ID settlement receipt')
      done.push(original.status === 'done' ? original : { ...original, status: 'done', closedDate: decision?.articleDate ?? record.introducedBy, resolution: decision?.reason ?? '' })
      continue
    }
    if (state === 'dismissed' || state === 'superseded' || state === 'deferred') {
      dispositions.push({ id: record.key, description: original.description, repo: original.repo, sourceDate: original.sourceDate, state, reason: decision?.reason ?? '' })
      continue
    }
    const description = [decision?.description ?? original.description, record.doneWhen ? `Done when: ${record.doneWhen}` : '', record.gates.length ? `Conditions: ${record.gates.join(' ')}` : ''].filter(Boolean).join(' ')
    const active = description !== original.description ? { ...original, currentDescription: description } : original
    if (record.origin === 'imported') { open.push(active); continue }
    const accepted = registry.articles.some(article => article.status === 'accepted' && articleStatuses.get(article.date) === 'accepted' && article.actionKeys.includes(record.key) && record.history.some(decision => decision.roundId === article.roundId && decision.articleDate === article.date))
    const status = articleStatuses.get(record.introducedBy)
    if (accepted && record.includeInIndex) open.push(active)
    else if (status === 'draft') {
      const own = registry.articles.find(article => article.date === record.introducedBy)
      const ownState = record.history.filter(item => item.articleDate === own?.date && item.roundId === own.roundId).at(-1)?.state
      if (ownState === 'open' || ownState === 'proposed') proposed.push({ id: record.key, command: original.command, description: original.description, repo: original.repo, sourceDate: original.sourceDate, status: 'proposed', includeInIndex: record.includeInIndex })
    }
  }
  return { open, done, proposed, dispositions }
}

function escaped(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)) }
function oneLine(value: string): string { return escaped(value.replace(/\s*[\r\n]+\s*/g, ' ')) }
export function articleActionRecords(registry: ActionRegistry, articleDate: string, statuses: ReadonlyMap<string, string>) {
  const snapshot = registry.articles.find(article => article.date === articleDate)
  return (snapshot?.actionKeys ?? []).map(key => {
    const record = registry.records.find(item => item.key === key)
    if (!record || !snapshot) throw new Error(`Missing action ${key}`)
    const history = record.history.filter(item => (item.articleDate === articleDate && item.roundId === snapshot.roundId) || (statuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.roundId === item.roundId)))
    return { ...record, history, state: history.at(-1)?.state ?? (record.origin === 'imported' ? record.original.status : 'proposed' as const) }
  })
}
export function renderArticleActions(markdown: string, registry: ActionRegistry, articleDate: string, statuses: ReadonlyMap<string, string>): string {
  const snapshot = registry.articles.find(article => article.date === articleDate)
  if (!snapshot) {
    if (!Object.hasOwn(registry.baseline.articleActions, articleDate)) throw new Error(`Action review is missing for ${articleDate}; reconcile before publishing`)
    return markdown
  }
  if (managedArticleDigest(markdown) !== snapshot.articleDigest) throw new Error(`Action review is stale for ${articleDate}; reconcile before publishing`)
  if (snapshot.status !== statuses.get(articleDate)) throw new Error(`Action review status is stale for ${articleDate}; reconcile before publishing`)
  if (snapshot.review.state === 'pending') {
    if (snapshot.status !== 'draft') throw new Error(`Action review is pending for ${articleDate}; acceptance is blocked`)
    return `${unmanagedArticleProse(markdown).trimEnd()}\n\n${ACTIONS_START}\n> **Suggested actions**\n> Action review pending. No new action or disposition has been admitted. Reconcile before accepting this article.\n${ACTIONS_END}\n`
  }
  const visible = articleActionRecords(registry, articleDate, statuses).map(record => ({ record, decision: record.history.at(-1), state: record.state }))
  const active = visible.filter(item => item.state === 'open' || item.state === 'proposed')
  const resolved = visible.filter(item => item.state !== 'open' && item.state !== 'proposed')
  const lines = [ACTIONS_START, '> **Suggested actions**', ...active.flatMap(({ record, decision }) => [`> - \`${oneLine(record.original.command)}\` — ${oneLine(decision?.description ?? record.original.description)} (${oneLine(record.original.repo)})${record.includeInIndex ? '' : ' · Article only'}`, ...(record.doneWhen ? [`>   Done when: ${oneLine(record.doneWhen)}`] : []), ...(record.gates.length ? [`>   Conditions: ${record.gates.map(oneLine).join(' ')}`] : [])])]
  if (active.length === 0) lines.push('> No new verified suggestion. Existing work retains its documented next checkpoints.')
  if (resolved.length) {
    lines.push('', '<section class="action-history-card" aria-label="Resolved suggestions">', '<h3>Resolved suggestions</h3>')
    for (const { record, decision, state } of resolved) {
      const label = { done: 'Completed', dismissed: 'Dismissed', superseded: 'Superseded', deferred: 'Deferred', open: 'Open', proposed: 'Proposed' }[state]
      const evidence = decision?.citations.map(citation => registry.articles.flatMap(article => article.sources).find(source => source.id === citation.sourceId)).filter(source => source && source.kind !== 'report') ?? []
      const links = [...new Map(evidence.map(source => [source?.id, source])).values()].map(source => source ? `<li>${/^https:\/\//.test(source.locator) ? `<a href="${escaped(source.locator)}">${escaped(source.locator)}</a>` : escaped(source.locator)}</li>` : '').join('')
      lines.push(`<article><strong>${escaped(record.original.command)} · ${label}</strong><p>${escaped(decision?.description ?? '')}</p><details><summary>Original suggestion and evidence</summary><p>${escaped(record.original.description)}</p><p>${escaped((decision?.reason ?? '').replace(/\(s\d+(?:,\s*s\d+)*(?:\s+L\d+(?:-\d+)?)?\)/g, '').replace(/\bs\d+(?:\s+L\d+(?:-\d+)?)?/g, 'the cited source').replace(/ {2,}/g, ' ').trim())}</p><ul>${links}</ul></details></article>`)
    }
    lines.push('</section>')
  }
  lines.push(ACTIONS_END)
  const prose = unmanagedArticleProse(markdown).trimEnd()
  const footer = prose.match(/\n---\n(?=\n?\*Generated by \[daily-logger\])/)?.index
  return footer === undefined ? `${prose}\n\n${lines.join('\n')}\n` : `${prose.slice(0, footer).trimEnd()}\n\n${lines.join('\n')}\n\n${prose.slice(footer).trimStart()}\n`
}

export function normalizeLegacyActionProse(markdown: string): string {
  return stripManagedActions(markdown)
    .replace(/^> \*\*Suggested actions\*\*[^\n]*\n(?:>[^\n]*(?:\n|$))*/gm, '')
    .replace(/^The following block retains the original generator suggestions verbatim[^\n]*(?:\n|$)/gm, '')
    .replace(/^\*\*Disposition of suggested actions:\*\*[^\n]*(?:\n|$)/gm, '')
    .replace(/\n{2,}---\n(?=\n?\*Generated by \[daily-logger\])/g, '\n\n---\n')
}
function unmanagedArticleProse(markdown: string): string { return stripManagedActions(markdown).replace(/\n{2,}---\n(?=\n?\*Generated by \[daily-logger\])/g, '\n\n---\n') }
export function managedArticleDigest(markdown: string): string {
  return articleActionDigest(unmanagedArticleProse(markdown))
}

export function rebindArticleSnapshot(registry: ActionRegistry, input: { date: string; beforeMarkdown: string; afterMarkdown: string; expectedRoundId: string; actor: string; instruction: string }): ActionRegistry {
  const next = structuredClone(registry), snapshot = next.articles.find(article => article.date === input.date)
  if (!snapshot || snapshot.roundId !== input.expectedRoundId || snapshot.articleDigest !== managedArticleDigest(input.beforeMarkdown) || snapshot.review.state !== 'verified') throw new Error('The prior action review binding must be verified before an editorial rebind')
  if (!input.actor.trim() || !input.instruction.trim()) throw new Error('An editorial rebind requires an explicit identified instruction')
  if ((input.beforeMarkdown.match(/^status:.*$/m)?.[0]) !== input.afterMarkdown.match(/^status:.*$/m)?.[0]) throw new Error('An editorial rebind cannot change acceptance status')
  const block = (value: string) => value.slice(value.indexOf(ACTIONS_START), value.indexOf(ACTIONS_END) + ACTIONS_END.length)
  if (!input.beforeMarkdown.includes(ACTIONS_START) || !input.beforeMarkdown.includes(ACTIONS_END)) throw new Error('An editorial rebind requires the canonical managed block')
  if (block(input.beforeMarkdown) !== block(input.afterMarkdown)) throw new Error('An editorial rebind cannot change managed action decisions')
  snapshot.binding = { mode: 'editorial-rebind', fromDigest: snapshot.articleDigest, actor: input.actor, instructionSha256: sha256(input.instruction) }
  snapshot.articleDigest = managedArticleDigest(input.afterMarkdown)
  return ActionRegistrySchema.parse(next)
}

export function renderArticleActionHtml(markdown: string, registry: ActionRegistry, date: string, statuses: ReadonlyMap<string, string>): string {
  const rendered = renderArticleActions(markdown, registry, date, statuses).replace(/^---[\s\S]*?---\n/, '')
  if (!registry.articles.some(article => article.date === date)) return renderArticle(rendered)
  // Only the escaped card freshly constructed from registry records bypasses
  // Markdown's raw-HTML escaping. Authored HTML still goes through renderArticle.
  const blockStart = rendered.indexOf(ACTIONS_START)
  const end = rendered.indexOf(ACTIONS_END, blockStart)
  const start = rendered.lastIndexOf('\n<section class="action-history-card"', end)
  if (blockStart === -1 || end === -1 || start <= blockStart || start >= end) return renderArticle(rendered)
  return renderArticle(rendered.slice(0, start)) + rendered.slice(start, end) + renderArticle(rendered.slice(end + ACTIONS_END.length))
}

export function readRegistryProjection(repoRoot: string) {
  const statuses = readArticleStatuses(repoRoot)
  const registry = readActionRegistry(repoRoot)
  for (const [date] of statuses) renderArticleActions(readFileSync(join(repoRoot, '_articles', `${date}.md`), 'utf8'), registry, date, statuses)
  return projectRegistry(registry, statuses)
}
