import { z } from 'zod'
import { ActionRegistrySchema, CitationSchema, encodeActionEvidenceViewSourceReceipt, sha256, type ActionSource, type ActionRegistry, type ActionEvidenceViewReceipt } from './action-registry.js'
import { trustedActionSourceLineNumbers } from './action-evidence-retrieval.js'
import { factorGithubMetadata, GITHUB_METADATA_VIEW_POLICY_SHA256, type GithubMetadataRow, type PreparedGithubMetadataView } from './github-metadata-view.js'
import { coverageModelView, COVERAGE_MODEL_VIEW_POLICY_SHA256 } from './action-evidence-coverage.js'
export type { PreparedGithubMetadataView } from './github-metadata-view.js'

type Citation = z.infer<typeof CitationSchema>

export const ACTION_EVIDENCE_VIEW_VERSION = 'action-evidence-view-v1'
// Only API-generated account/repository transport links are incidental. Unknown
// keys, identity, permissions, lifecycle facts and all authored text stay visible.
const ACCOUNT_LINKS = new Set(['avatar_url', 'gravatar_id', 'url', 'followers_url', 'following_url', 'gists_url', 'starred_url', 'subscriptions_url', 'organizations_url', 'repos_url', 'events_url', 'received_events_url'])
const REPOSITORY_LINKS = new Set(['forks_url', 'keys_url', 'collaborators_url', 'teams_url', 'hooks_url', 'issue_events_url', 'events_url', 'assignees_url', 'branches_url', 'tags_url', 'blobs_url', 'git_tags_url', 'git_refs_url', 'trees_url', 'statuses_url', 'languages_url', 'stargazers_url', 'contributors_url', 'subscribers_url', 'subscription_url', 'commits_url', 'git_commits_url', 'comments_url', 'issue_comment_url', 'contents_url', 'compare_url', 'merges_url', 'archive_url', 'downloads_url', 'issues_url', 'pulls_url', 'milestones_url', 'notifications_url', 'labels_url', 'releases_url', 'deployments_url', 'git_url', 'ssh_url', 'clone_url', 'svn_url'])
const ACCOUNT_FIELDS = new Set(['user', 'owner', 'assignee', 'assignees', 'requested_reviewers', 'merged_by'])
const POLICY = sha256(JSON.stringify({ version: ACTION_EVIDENCE_VIEW_VERSION, account: [...ACCOUNT_LINKS], repository: [...REPOSITORY_LINKS], requiredGithubMetadata: 'complete-original-under-source-limit-or-lossless-factor-v2', factoring: GITHUB_METADATA_VIEW_POLICY_SHA256, coverage: COVERAGE_MODEL_VIEW_POLICY_SHA256 }))
type MetadataRow = { line: number; raw: string; context: string; omitted: readonly string[] }

function compactMetadata(value: unknown): { context: string; omitted: string[] } {
  const omitted: string[] = []
  const visit = (item: unknown, path: string[], role?: 'root' | 'branch' | 'account' | 'repository'): unknown => {
    if (Array.isArray(item)) return item.map((entry, index) => visit(entry, [...path, String(index)], role))
    if (item === null || typeof item !== 'object') return item
    const record = item as Record<string, unknown>
    if (role === 'account' && (typeof record.login !== 'string' || typeof record.id !== 'number')) role = undefined
    if (role === 'repository' && (typeof record.id !== 'number' || typeof record.full_name !== 'string')) role = undefined
    const result: Array<[string, unknown]> = []
    for (const [key, child] of Object.entries(item)) {
      const incidental = role === 'account' ? ACCOUNT_LINKS.has(key) : role === 'repository' && REPOSITORY_LINKS.has(key)
      // Type mismatches are unknown API shapes and default-retain.
      if (incidental && (typeof child === 'string' || child === null)) { omitted.push([...path, key].join('.')); continue }
      const nextRole = role === 'root' && ACCOUNT_FIELDS.has(key) || role === 'branch' && key === 'user' || role === 'repository' && key === 'owner' ? 'account' : role === 'root' && (key === 'head' || key === 'base') ? 'branch' : role === 'branch' && key === 'repo' ? 'repository' : undefined
      result.push([key, visit(child, [...path, key], nextRole)])
    }
    return Object.fromEntries(result)
  }
  return { context: JSON.stringify(visit(value, [], 'root')), omitted }
}

/** Instances can only be minted while the collector renders structured API data. */
class GithubSourceCapture {
  readonly #source: ActionSource
  readonly #rows: readonly MetadataRow[]
  readonly #metadata: readonly GithubMetadataRow[]
  #modelView: PreparedGithubMetadataView | null | undefined
  constructor(input: { id: string; locator: string; observation: string; responses: readonly string[]; trustedContent: string[] }) {
    let content = input.observation
    const rows: MetadataRow[] = []
    const metadataRows: GithubMetadataRow[] = []
    const append = (text: string) => { content += text }
    const render = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach((entry, index) => { if (index) append('\n\n'); render(entry) }); return }
      if (value === null || typeof value !== 'object') { append(String(value)); return }
      const { body, diff_hunk: diff, ...metadata } = value as Record<string, unknown>
      const raw = JSON.stringify(metadata)
      const knownRecord = typeof metadata.id === 'number' && typeof metadata.html_url === 'string' && typeof metadata.author_association === 'string'
      const compact = knownRecord ? compactMetadata(metadata) : { context: raw, omitted: [] }
      const line = content.split('\n').length
      append(raw)
      metadataRows.push(Object.freeze({ line, raw }))
      if (compact.omitted.length) rows.push({ line, raw, ...compact })
      if (typeof body === 'string' && body) append(`\n${body}`)
      if (typeof diff === 'string' && diff) append(`\n${diff}`)
    }
    for (const response of input.responses) { append('\n'); render(JSON.parse(response)) }
    this.#source = { id: input.id, kind: 'github', locator: input.locator, content, trustedContent: [...input.trustedContent] }
    this.#rows = Object.freeze(rows.map(row => Object.freeze({ ...row, omitted: Object.freeze([...row.omitted]) })))
    this.#metadata = Object.freeze(metadataRows)
  }
  get source(): ActionSource { return structuredClone(this.#source) }
  rowsFor(source: ActionSource): readonly MetadataRow[] {
    if (source.id.replace(/@[a-f0-9]{64}$/, '') !== this.#source.id) return []
    const expectedId = `${this.#source.id}@${sha256(this.#source.content)}`
    if (source.projection || source.response || source.kind !== this.#source.kind || source.content !== this.#source.content || source.locator !== this.#source.locator
      || JSON.stringify(source.trustedContent) !== JSON.stringify(this.#source.trustedContent)
      || source.fullContentSha256 && source.fullContentSha256 !== sha256(this.#source.content)
      || source.id !== this.#source.id && source.id !== expectedId) {
      throw new ActionEvidenceVisibilityError(`Collector provenance changed for ${source.id}; review pending`)
    }
    return this.#rows
  }
  modelViewFor(source: ActionSource): PreparedGithubMetadataView | undefined {
    if (source.id.replace(/@[a-f0-9]{64}$/, '') !== this.#source.id) return undefined
    this.rowsFor(source)
    if (this.#modelView === undefined) this.#modelView = factorGithubMetadata({ content: this.#source.content, rows: this.#metadata }) ?? null
    return this.#modelView ?? undefined
  }
}

export function captureGithubActionSource(input: ConstructorParameters<typeof GithubSourceCapture>[0]): GithubSourceCapture { return new GithubSourceCapture(input) }

/** Raw-array compatibility is deliberate: copying/serializing loses compaction authority. */
export class ActionSourceCollection extends Array<ActionSource> {
  readonly #captures: readonly GithubSourceCapture[]
  static get [Symbol.species]() { return Array }
  constructor(sources: readonly ActionSource[], captures: readonly GithubSourceCapture[] = []) {
    super(...sources)
    this.#captures = Object.freeze(captures.filter(capture => capture instanceof GithubSourceCapture))
  }
  appendRaw(sources: readonly ActionSource[]): ActionSourceCollection { return new ActionSourceCollection([...this, ...sources], this.#captures) }
  rowsFor(source: ActionSource): readonly MetadataRow[] { return this.#captures.flatMap(capture => capture.rowsFor(source)) }
  modelViewFor(source: ActionSource): PreparedGithubMetadataView | undefined {
    const views = this.#captures.flatMap(capture => capture.modelViewFor(source) ?? [])
    if (views.some(view => view.content !== views[0]?.content)) throw new ActionEvidenceVisibilityError('Conflicting collector metadata views; review pending')
    return views[0]
  }
}

export function actionEvidenceRegistryDigest(registry: ActionRegistry, articleDate: string): string {
  const normalized = ActionRegistrySchema.parse(registry)
  return sha256(JSON.stringify({ baseline: normalized.baseline, records: normalized.records, articles: [...normalized.articles].sort((left, right) => left.date.localeCompare(right.date)).map(article => {
    if (article.date !== articleDate) return article
    // Only these two output hashes refer to this projection itself. All consumed
    // current-snapshot memory, duties, context, sources and verdicts remain bound.
    const { stateDigest: _stateDigest, verification, ...snapshot } = article
    const { evidenceViewOutputSha256: _outputSha256, ...review } = verification
    return { ...snapshot, verification: review }
  }) }))
}

type EvidenceLineLocation = { viewRoundId: string; policySha256: string; sourceId: string; sourceLocator: string; collectedSha256: string; fullContentSha256: string; startLine: number; endLine: number }
export class ActionEvidenceVisibilityError extends Error {
  readonly location?: Readonly<EvidenceLineLocation>
  constructor(message: string, location?: EvidenceLineLocation) { super(message); this.location = location && Object.freeze({ ...location }) }
}

export class PreparedActionEvidenceView {
  readonly receipt: ActionEvidenceViewReceipt
  readonly roundId: string
  readonly #modelSources: Array<Omit<ActionSource, 'trustedContent'> & { authoritativeLines: number[] | string }>
  readonly #sources: readonly ActionSource[]
  readonly #hidden: ReadonlyMap<string, ReadonlySet<number>>
  readonly #rawIdentity: string
  private constructor(sources: readonly ActionSource[], rawCaseDigest: string, inputStateSha256: string, collection?: ActionSourceCollection, requiredGithubReferences: readonly string[] = []) {
    if (new Set(sources.map(source => source.id)).size !== sources.length) throw new ActionEvidenceVisibilityError('Duplicate source identity in prepared evidence view')
    for (const source of sources) if (source.fullContentSha256 && source.fullContentSha256 !== sha256(source.content) && !source.projection && !source.response) throw new ActionEvidenceVisibilityError(`Retained excerpt ${source.id} is not a complete raw source; recollect full evidence or use the explicit source-view protocol`)
    this.#sources = structuredClone(sources)
    this.#rawIdentity = sha256(JSON.stringify(sources))
    const hidden = new Map<string, ReadonlySet<number>>()
    const receipts: ActionEvidenceViewReceipt['sources'] = []
    const required = new Set(requiredGithubReferences)
    this.#modelSources = sources.map((source, index) => {
      const capturedRows = collection?.rowsFor(source) ?? []
      const reference = /^github:([\w-]+#\d+)(?:@[a-f0-9]{64})?$/.exec(source.id)?.[1]
      // A required primary source should expose its original rows when that
      // complete labeled source fits the unchanged per-source budget. A
      // lossless model codec does not make hidden metadata citable.
      const completeContent = source.content.split('\n').map((line, offset) => `L${offset + 1}: ${line}`).join('\n')
      const completeRequired = !!reference && required.has(reference) && Buffer.byteLength(completeContent) <= 128 * 1024
      const rows = reference && required.has(reference) ? [] : capturedRows
      const byLine = new Map(rows.map(row => [row.line, row]))
      const { trustedContent, ...rest } = source
      if (trustedContent?.some(text => !source.content.includes(text))) throw new ActionEvidenceVisibilityError(`Trusted text is absent from raw source ${source.id}`)
      const legacyContent = source.content.split('\n').map((line, offset) => {
        const row = byLine.get(offset + 1)
        if (row && row.raw !== line) throw new ActionEvidenceVisibilityError('Collector metadata offset no longer matches the raw source')
        return row ? `CONTEXT ONLY (original L${offset + 1} is NOT citable; omitted transport links cannot establish absence): ${row.context}` : `L${offset + 1}: ${line}`
      }).join('\n')
      const candidateView = completeRequired ? undefined : coverageModelView(source) ?? collection?.modelViewFor(source)
      const factored = candidateView && Buffer.byteLength(candidateView.content) < Buffer.byteLength(legacyContent) ? candidateView : undefined
      const hiddenLines = factored ? [...factored.hiddenLines] : rows.map(row => row.line)
      hidden.set(source.id, new Set(hiddenLines))
      const content = factored?.content ?? legacyContent
      const authoritativeLines = source.kind === 'github' ? [...trustedActionSourceLineNumbers(source)].filter(line => !hidden.get(source.id)?.has(line)) : source.kind === 'repository' ? 'repository source' : source.kind === 'instruction' ? 'operator instruction' : 'context only'
      const modelSource = { ...rest, id: `s${index + 1}`, authoritativeLines, content }
      receipts.push(encodeActionEvidenceViewSourceReceipt({ sourceId: source.id, rawSha256: sha256(source.content), viewSha256: sha256(JSON.stringify(modelSource)), hiddenLines,
        omittedPathsSha256: sha256(JSON.stringify(factored ? { policy: factored.policySha256, metadataRows: factored.hiddenLines, omittedPaths: [] } : rows.map(row => ({ line: row.line, paths: row.omitted })))) }))
      return modelSource
    })
    this.#hidden = hidden
    this.receipt = { version: ACTION_EVIDENCE_VIEW_VERSION, sourceEncoding: 'source-tuples-v1', policySha256: sha256(JSON.stringify({ policy: POLICY, requiredGithubReferences: [...required].sort() })), rawCaseDigest, inputStateSha256, sources: receipts }
    this.roundId = sha256(JSON.stringify({ rawCaseDigest, evidenceView: this.receipt }))
    for (const receipt of this.receipt.sources) { Object.freeze(receipt[3]); Object.freeze(receipt) }
    Object.freeze(this.receipt.sources)
    Object.freeze(this.receipt)
    Object.freeze(this)
  }
  static prepare(sources: readonly ActionSource[], rawCaseDigest: string, inputStateSha256: string, collection?: ActionSourceCollection, requiredGithubReferences: readonly string[] = []): PreparedActionEvidenceView { return new PreparedActionEvidenceView(sources, rawCaseDigest, inputStateSha256, collection, requiredGithubReferences) }
  assertBinding(sources: readonly ActionSource[], roundId: string, inputStateSha256: string): void {
    if (inputStateSha256 !== this.receipt.inputStateSha256 || roundId !== this.roundId || sha256(JSON.stringify(sources)) !== this.#rawIdentity) throw new ActionEvidenceVisibilityError('Evidence view does not match the consumed review round and raw sources')
  }
  rawSources(aliases = false): ActionSource[] { return this.#sources.map((source, index) => ({ ...structuredClone(source), ...(aliases ? { id: `s${index + 1}` } : {}) })) }
  promptSources() { return structuredClone(this.#modelSources) }

  resolve(sourceId: string, startLine: number, endLine: number): Citation {
    const alias = /^s([1-9]\d*)$/.exec(sourceId)
    const source = alias ? this.#sources[Number(alias[1]) - 1] : this.#sources.find(source => source.id === sourceId)
    if (!source) throw new ActionEvidenceVisibilityError(`Unknown citation source: ${sourceId}`)
    const location = { viewRoundId: this.roundId, policySha256: this.receipt.policySha256, sourceId: source.id, sourceLocator: source.locator, collectedSha256: sha256(source.content), fullContentSha256: source.fullContentSha256 ?? sha256(source.content), startLine, endLine }
    const lines = source.content.split('\n')
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) throw new ActionEvidenceVisibilityError(`Invalid citation range for ${sourceId}`)
    for (let line = startLine; line <= endLine; line++) if (this.#hidden.get(source.id)?.has(line)) throw new ActionEvidenceVisibilityError(`Unseen or partial metadata line ${line} in ${source.id}; request full-row evidence instead`, location)
    const quote = lines.slice(startLine - 1, endLine).join('\n')
    if (quote.length > 16000) throw new ActionEvidenceVisibilityError(`Evidence selection for ${source.id} is too broad; select at most 16000 characters of relevant source lines`, location)
    return { sourceId, quote, sourceLineStart: startLine, sourceLineEnd: endLine }
  }
  assertCitation(citation: Citation): void {
    if (citation.sourceLineStart === undefined || citation.sourceLineEnd === undefined) throw new ActionEvidenceVisibilityError('A current review citation needs fully visible original line endpoints')
    const expected = this.resolve(citation.sourceId, citation.sourceLineStart, citation.sourceLineEnd)
    if (expected.quote !== citation.quote) throw new ActionEvidenceVisibilityError('Citation quote differs from the fully visible original line range')
  }
}

/** Legacy renderer retains exactly the historical bytes; no provenance is minted. */
export function renderGithubEvidence(json: string): string {
  const capture = captureGithubActionSource({ id: 'render', locator: 'render', observation: '', responses: [json], trustedContent: [] })
  return capture.source.content.slice(1)
}
