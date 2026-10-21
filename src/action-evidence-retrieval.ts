import { randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  acceptedActionState,
  ActionEvidenceRequestSchema,
  ActionEvidenceRequestReceiptSchema,
  ActionEvidenceResponseSchema,
  ActionSourceSchema,
  managedArticleDigest,
  sha256,
  type ActionEvidenceRequest,
  type ActionEvidenceRequestReceipt,
  type ActionEvidenceResponse,
  type ActionRegistry,
  type ActionSource,
  type DraftCandidateEvidenceRequirements,
  type DraftActionCandidate,
  type DraftRecommendationContext,
} from './action-registry.js'
import type { ActionReviewCycle } from './action-review-cycle.js'

export const ACTION_EVIDENCE_REQUEST_VERSION = 'action-evidence-request-v1'
export const ACTION_EVIDENCE_PROJECTION_VERSION = 'action-evidence-projection-v1'
export const ACTION_EVIDENCE_PER_SOURCE_LIMIT = 128 * 1024
export const ACTION_EVIDENCE_TOTAL_LIMIT = 384 * 1024
export const ACTION_PROVIDER_ENVELOPE_LIMIT = 640 * 1024

const ActionEvidenceClosureSchema = z.object({
  version: z.literal('action-evidence-closure-v1'),
  requestId: z.string().regex(/^[a-f0-9]{64}$/),
  caseDigest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['resolved', 'cancelled', 'expired', 'superseded', 'declined']),
}).strict()
export type ActionEvidenceTerminalStatus = z.infer<typeof ActionEvidenceClosureSchema>['status']

export class ActionEvidenceRequestError extends Error {
  constructor(readonly request: ActionEvidenceRequest, message: string) {
    super(message)
    this.name = 'ActionEvidenceRequestError'
  }
}

export class ActionEvidenceLifecycleError extends Error {
  constructor(readonly receipt: ActionEvidenceRequestReceipt, message: string) {
    super(message)
    this.name = 'ActionEvidenceLifecycleError'
  }
}

function actionEvidenceRequestId(request: Omit<ActionEvidenceRequest, 'id'>): string {
  const canonical = Object.fromEntries(Object.entries({ ...request, status: 'open' }).sort(([left], [right]) => left.localeCompare(right)))
  return sha256(JSON.stringify(canonical))
}

function validateActionEvidenceRequest(value: unknown): ActionEvidenceRequest {
  const request = ActionEvidenceRequestSchema.parse(value)
  const { id, ...body } = request
  if (actionEvidenceRequestId(body) !== id) throw new Error(`Action evidence request ID does not match its immutable body: ${id}`)
  return request
}

export function actionEvidenceCaseDigest(input: {
  articleDate: string
  cycle: ActionReviewCycle
  markdown: string
  feedback: string
  actionKeys: readonly string[]
  registry?: ActionRegistry
  articleStatuses?: ReadonlyMap<string, string>
  draftCandidateEvidence?: DraftCandidateEvidenceRequirements
  draftCandidates?: readonly DraftActionCandidate[]
  draftContext?: DraftRecommendationContext
}): string {
  const articleStatuses = input.articleStatuses ?? new Map(input.registry?.articles.map(article => [article.date, article.status]) ?? [])
  const actionState = input.registry?.records
    .filter(record => input.actionKeys.includes(record.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(record => {
      const history = record.history.filter(decision => decision.articleDate !== input.articleDate
        && articleStatuses.get(decision.articleDate) === 'accepted'
        && input.registry?.articles.some(article => article.date === decision.articleDate
          && article.status === 'accepted' && article.roundId === decision.roundId))
      const state = input.registry ? acceptedActionState(record, articleStatuses, input.registry) : record.origin === 'imported' ? record.original.status : 'proposed'
      return { key: record.key, workKey: record.workKey, state, goal: record.goal,
        doneWhen: record.doneWhen, gates: record.gates, history }
    }) ?? []
  const snapshot = input.registry?.articles.find(article => article.date === input.articleDate)
  const draftCandidateEvidence = input.draftCandidateEvidence ?? snapshot?.draftCandidateEvidence
  const draftContext = input.draftContext ?? snapshot?.draftContext ?? null
  const draftCandidates = (snapshot?.draftCandidates ?? input.draftCandidates ?? []).map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload }))
  return sha256(JSON.stringify({
    version: 'action-evidence-request-v1' as const,
    articleDate: input.articleDate,
    cycle: input.cycle,
    articleDigest: managedArticleDigest(input.markdown),
    feedbackSha256: sha256(input.feedback),
    actionKeys: [...input.actionKeys].sort(),
    actionState,
    draftCandidateEvidenceSha256: draftCandidateEvidence ? sha256(JSON.stringify(draftCandidateEvidence)) : null,
    draftContextSha256: sha256(JSON.stringify(draftContext)),
    candidatePayloadsSha256: sha256(JSON.stringify(draftCandidates)),
  }))
}

export function createActionEvidenceRequest(input: {
  kind: ActionEvidenceRequest['kind']
  caseDigest: string
  articleDate: string
  cycle: ActionReviewCycle
  actionKeys: readonly string[]
  sourceKey: string
  source?: ActionSource
  question: string
  obligations: ActionEvidenceRequest['obligations']
  recipient?: ActionEvidenceRequest['recipient']
}): ActionEvidenceRequest {
  const body = {
    version: 'action-evidence-request-v1' as const,
    kind: input.kind,
    status: 'open' as const,
    caseDigest: input.caseDigest,
    articleDate: input.articleDate,
    cycle: input.cycle,
    actionKeys: [...input.actionKeys].sort(),
    sourceKey: input.sourceKey,
    ...(input.source ? { sourceId: input.source.id, sourceLocator: input.source.locator, sourceFullContentSha256: input.source.fullContentSha256 ?? sha256(input.source.content) } : {}),
    question: input.question,
    obligations: [...new Set(input.obligations)],
    recipient: input.recipient ?? 'source-producer' as const,
    limits: {
      perSourceBytes: ACTION_EVIDENCE_PER_SOURCE_LIMIT,
      aggregateBytes: ACTION_EVIDENCE_TOTAL_LIMIT,
      providerEnvelopeBytes: ACTION_PROVIDER_ENVELOPE_LIMIT,
    },
  }
  return validateActionEvidenceRequest({ ...body, id: actionEvidenceRequestId(body) })
}

export function actionEvidenceRequestReceipt(request: ActionEvidenceRequest | ActionEvidenceRequestReceipt): ActionEvidenceRequestReceipt {
  return ActionEvidenceRequestReceiptSchema.parse({ version: request.version, id: request.id, kind: request.kind, status: request.status,
    caseDigest: request.caseDigest, articleDate: request.articleDate, cycle: request.cycle, actionKeys: request.actionKeys,
    sourceKey: request.sourceKey, sourceId: request.sourceId, sourceFullContentSha256: request.sourceFullContentSha256,
    obligations: request.obligations, recipient: request.recipient })
}

export function trustedActionSourceLineNumbers(source: ActionSource): Set<number> {
  const lines = source.content.split('\n')
  const occurrences = new Map<string, number>()
  for (const line of lines) if (line.trim()) occurrences.set(line, (occurrences.get(line) ?? 0) + 1)
  const trustedLines = new Set((source.trustedContent ?? []).flatMap(text => text.split('\n')).filter(line => line.trim()))
  return new Set(lines.flatMap((line, index) => line.trim() && occurrences.get(line) === 1 && trustedLines.has(line) ? [index + 1] : []))
}

export function buildActionEvidenceProjection(input: {
  request: ActionEvidenceRequest
  source: ActionSource
  ranges: ReadonlyArray<{ startLine: number; endLine: number; role: 'support' | 'counterevidence' | 'context' }>
  coverage: ReadonlyArray<{ obligationId: string; status: 'support' | 'counterevidence' | 'unknown'; rangeIndexes: readonly number[] }>
}): ActionSource {
  const request = validateActionEvidenceRequest(input.request)
  const source = ActionSourceSchema.parse(input.source)
  const fullContentSha256 = source.fullContentSha256 ?? sha256(source.content)
  if (request.status !== 'open' || request.kind !== 'source-view' || request.sourceId !== source.id || request.sourceFullContentSha256 !== fullContentSha256) {
    throw new Error('Evidence projection does not match the requested full-source identity')
  }
  if (sha256(source.content) !== fullContentSha256) throw new Error('Evidence projection requires the immutable complete source artifact')
  const lines = source.content.split('\n')
  const ranges = [...input.ranges]
  if (!ranges.some(range => range.role === 'counterevidence')) throw new Error('Evidence projection must include an independently selected counterevidence range')
  for (const [index, range] of ranges.entries()) {
    if (range.startLine < 1 || range.endLine < range.startLine || range.endLine > lines.length) throw new Error('Evidence projection range is outside the complete source')
    if (index > 0 && ranges[index - 1].endLine >= range.startLine) throw new Error('Evidence projection ranges overlap')
  }
  const coverage = input.coverage.map(item => ({ ...item, rangeIndexes: [...item.rangeIndexes].sort((a, b) => a - b) }))
  const obligationIds = [...request.obligations].sort()
  if (new Set(coverage.map(item => item.obligationId)).size !== coverage.length || JSON.stringify(coverage.map(item => item.obligationId).sort()) !== JSON.stringify(obligationIds)) {
    throw new Error('Evidence projection must account for every request obligation exactly once')
  }
  if (!coverage.some(item => item.status === 'counterevidence')) throw new Error('Evidence projection must map counterevidence to an explicit request obligation')
  for (const item of coverage) {
    if (item.status === 'unknown' && item.rangeIndexes.length) throw new Error('Unknown obligation coverage cannot claim a source range')
    if (item.status !== 'unknown' && !item.rangeIndexes.length) throw new Error('Supported or contradicted obligations require at least one exact source range')
    for (const index of item.rangeIndexes) {
      const range = ranges[index]
      if (!range) throw new Error('Evidence obligation coverage references an unknown source range')
      if (item.status === 'support' && range.role !== 'support') throw new Error('Supporting obligation coverage must reference a support range')
      if (item.status === 'counterevidence' && range.role !== 'counterevidence') throw new Error('Contradicted obligation coverage must reference a counterevidence range')
    }
  }
  const content = [
    `EVIDENCE QUESTION ${JSON.stringify({ requestId: request.id, question: request.question, obligations: request.obligations })}`,
    ...ranges.map(range => [
    `VIEW RANGE ${range.startLine}-${range.endLine} (${range.role}) FROM ${source.id}`,
    lines.slice(range.startLine - 1, range.endLine).map((line, index) => `L${range.startLine + index}: ${line}`).join('\n'),
    ].join('\n')),
  ].join('\n\n')
  if (Buffer.byteLength(content) > ACTION_EVIDENCE_PER_SOURCE_LIMIT) throw new Error('Evidence projection exceeds the unchanged 128 KiB source limit')
  const trustedLineNumbers = trustedActionSourceLineNumbers(source)
  const trustedContent = ranges.flatMap(range => lines.slice(range.startLine - 1, range.endLine)
    .flatMap((line, index) => trustedLineNumbers.has(range.startLine + index) ? [`L${range.startLine + index}: ${line}`] : []))
  const projection = {
    version: ACTION_EVIDENCE_PROJECTION_VERSION,
    requestId: request.id,
    caseDigest: request.caseDigest,
    fullSourceId: source.id,
    fullContentSha256,
    ranges,
    coverage,
  } as const
  return ActionSourceSchema.parse({
    id: `action-evidence-view:${request.id}@${sha256(JSON.stringify({ content, projection }))}`,
    kind: source.kind,
    locator: source.locator,
    content,
    ...(trustedContent?.length ? { trustedContent } : {}),
    fullContentSha256,
    projection,
  })
}

export function validateActionEvidenceProjection(input: {
  request: ActionEvidenceRequest
  source: ActionSource
  projection: ActionSource
}): ActionSource {
  const projection = ActionSourceSchema.parse(input.projection)
  if (!projection.projection) throw new Error('Bounded evidence view lacks projection metadata')
  const rebuilt = buildActionEvidenceProjection({ request: input.request, source: input.source, ranges: projection.projection.ranges, coverage: projection.projection.coverage })
  if (JSON.stringify(rebuilt) !== JSON.stringify(projection)) throw new Error('Bounded evidence view does not match its pinned full-source ranges')
  return projection
}

function writeImmutableJson(path: string, value: unknown): void {
  const content = JSON.stringify(value, null, 2) + '\n'
  if (existsSync(path)) {
    const stats = lstatSync(path)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Action evidence artifact is not a regular private file: ${path}`)
    if (readFileSync(path, 'utf8') !== content) throw new Error(`Immutable action evidence artifact changed: ${path}`)
    chmodSync(path, 0o600)
    return
  }
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, content, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    linkSync(temporary, path)
    chmodSync(path, 0o600)
    const directory = openSync(dirname(path), 'r')
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } catch (error) {
    if (existsSync(path) && readFileSync(path, 'utf8') === content) { chmodSync(path, 0o600); return }
    throw error
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function readPrivateJsonArtifact(path: string): unknown {
  const stats = lstatSync(path)
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Action evidence artifact is not a regular private file: ${path}`)
  chmodSync(path, 0o600)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function actionEvidenceDirectory(repoRoot: string, requestId: string): string {
  const root = join(repoRoot, '.action-evidence')
  if (existsSync(root) && (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())) throw new Error('Action evidence root is not a private directory')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  const directory = join(root, requestId)
  if (existsSync(directory) && (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())) throw new Error(`Action evidence request path is not a private directory: ${requestId}`)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  return directory
}

function actionEvidenceClosure(repoRoot: string, requestId: string): z.infer<typeof ActionEvidenceClosureSchema> | undefined {
  const path = join(repoRoot, '.action-evidence', requestId, 'closure.json')
  return existsSync(path) ? ActionEvidenceClosureSchema.parse(readPrivateJsonArtifact(path)) : undefined
}

function requireOpenActionEvidenceRequest(repoRoot: string, request: ActionEvidenceRequest): void {
  const closure = actionEvidenceClosure(repoRoot, request.id)
  if (closure) throw new Error(`Action evidence request ${request.id} is ${closure.status}; late replies are rejected`)
}

export function closeActionEvidenceRequest(input: { repoRoot: string; request: ActionEvidenceRequest; status: ActionEvidenceTerminalStatus }): ActionEvidenceRequestReceipt {
  const request = validateActionEvidenceRequest(input.request)
  const directory = actionEvidenceDirectory(input.repoRoot, request.id)
  writeImmutableJson(join(directory, 'closure.json'), ActionEvidenceClosureSchema.parse({
    version: 'action-evidence-closure-v1', requestId: request.id, caseDigest: request.caseDigest, status: input.status,
  }))
  return ActionEvidenceRequestReceiptSchema.parse({ ...actionEvidenceRequestReceipt(request), status: input.status })
}

export function persistActionEvidenceRequest(input: { repoRoot: string; request: ActionEvidenceRequest; source?: ActionSource }): string {
  const request = validateActionEvidenceRequest(input.request)
  const directory = actionEvidenceDirectory(input.repoRoot, request.id)
  writeImmutableJson(join(directory, 'request.json'), request)
  if (input.source) {
    const source = ActionSourceSchema.parse(input.source)
    if (source.id !== request.sourceId || (source.fullContentSha256 ?? sha256(source.content)) !== request.sourceFullContentSha256 || sha256(source.content) !== request.sourceFullContentSha256) {
      throw new Error('Cannot retain action evidence artifact with a mismatched full-source identity')
    }
    writeImmutableJson(join(directory, 'source.json'), source)
  }
  return directory
}

export function readActionEvidenceRequest(input: { repoRoot: string; requestId: string }): { request: ActionEvidenceRequest; source?: ActionSource } {
  const directoryPath = join(input.repoRoot, '.action-evidence', input.requestId)
  if (!existsSync(directoryPath)) throw new Error(`Action evidence request is unavailable: ${input.requestId}`)
  const directory = actionEvidenceDirectory(input.repoRoot, input.requestId)
  const request = validateActionEvidenceRequest(readPrivateJsonArtifact(join(directory, 'request.json')))
  if (request.id !== input.requestId) throw new Error('Stored action evidence request does not match its requested identity')
  const sourcePath = join(directory, 'source.json')
  const source = existsSync(sourcePath) ? ActionSourceSchema.parse(readPrivateJsonArtifact(sourcePath)) : undefined
  return { request, ...(source ? { source } : {}) }
}

export function persistActionEvidenceReply(input: { repoRoot: string; projection: ActionSource; resolved?: boolean }): string {
  const projection = ActionSourceSchema.parse(input.projection)
  if (!projection.projection) throw new Error('Cannot retain an action evidence reply without projection metadata')
  const { request } = readActionEvidenceRequest({ repoRoot: input.repoRoot, requestId: projection.projection.requestId })
  const closure = actionEvidenceClosure(input.repoRoot, request.id)
  if (closure && (!input.resolved || closure.status !== 'resolved')) {
    throw new Error(`Action evidence request ${request.id} is ${closure.status}; late replies are rejected`)
  }
  const directory = actionEvidenceDirectory(input.repoRoot, projection.projection.requestId)
  const projectionDigest = projection.id.match(/@([a-f0-9]{64})$/)?.[1] ?? sha256(JSON.stringify(projection))
  writeImmutableJson(join(directory, `reply-${projectionDigest}.json`), projection)
  if (input.resolved) {
    writeImmutableJson(join(directory, `resolution-${projectionDigest}.json`), {
      requestId: projection.projection.requestId,
      caseDigest: projection.projection.caseDigest,
      status: 'resolved',
      projectionId: projection.id,
    })
    closeActionEvidenceRequest({ repoRoot: input.repoRoot, request, status: 'resolved' })
  }
  return directory
}

export function persistValidatedActionEvidenceReply(input: { repoRoot: string; projection: ActionSource }): string {
  const projection = ActionSourceSchema.parse(input.projection)
  if (!projection.projection) throw new Error('Cannot validate an action evidence reply without projection metadata')
  const directory = actionEvidenceDirectory(input.repoRoot, projection.projection.requestId)
  const requestPath = join(directory, 'request.json')
  const sourcePath = join(directory, 'source.json')
  if (!existsSync(requestPath) || !existsSync(sourcePath)) throw new Error('Action evidence reply lacks its retained request or complete source artifact')
  const request = validateActionEvidenceRequest(readPrivateJsonArtifact(requestPath))
  requireOpenActionEvidenceRequest(input.repoRoot, request)
  const source = ActionSourceSchema.parse(readPrivateJsonArtifact(sourcePath))
  const validated = validateActionEvidenceProjection({ request, source, projection })
  return persistActionEvidenceReply({ repoRoot: input.repoRoot, projection: validated })
}

export function persistActionEvidenceResolutions(repoRoot: string, projections: readonly ActionSource[]): void {
  for (const projection of projections) {
    if (projection.projection) persistActionEvidenceReply({ repoRoot, projection, resolved: true })
    else if (projection.response) {
      const { request } = readActionEvidenceRequest({ repoRoot, requestId: projection.response.requestId })
      closeActionEvidenceRequest({ repoRoot, request, status: 'resolved' })
    }
  }
}

function responseActionKeys(request: ActionEvidenceRequest): string[] {
  const action = request.sourceKey.match(/^action:(.+)$/)?.[1]
  if (action) return request.actionKeys.includes(action) ? [action] : []
  const terminalIntent = request.sourceKey.match(/^terminal-intent:(.+)$/)?.[1]
  return terminalIntent ? terminalIntent.split(',').filter(key => request.actionKeys.includes(key)).sort() : []
}

export function persistActionEvidenceResponse(input: { repoRoot: string; request: ActionEvidenceRequest; responder: string; answer: string }): { path: string; response: ActionEvidenceResponse; source: ActionSource } {
  const request = validateActionEvidenceRequest(input.request)
  requireOpenActionEvidenceRequest(input.repoRoot, request)
  if (request.kind === 'source-view') throw new Error('A source-view request requires a bounded range projection, not an owner response')
  const actionKeys = responseActionKeys(request)
  if (request.recipient !== 'coordinator-owner' || !actionKeys.length) throw new Error('An owner response requires an explicit coordinator-owned target action')
  const body = { version: 'action-evidence-response-v1' as const, requestId: request.id, caseDigest: request.caseDigest, responder: input.responder.trim(), answer: input.answer.trim() }
  const response = ActionEvidenceResponseSchema.parse({ ...body, id: sha256(JSON.stringify(body)) })
  const directory = actionEvidenceDirectory(input.repoRoot, request.id)
  const path = join(directory, `response-${response.id}.json`)
  const existing = readdirSync(directory).filter(name => /^response-[a-f0-9]{64}\.json$/.test(name))
  if (existing.some(name => name !== `response-${response.id}.json`)) throw new Error(`Action evidence request ${request.id} already has a distinct owner response; explicit supersession is required`)
  writeImmutableJson(path, response)
  if (readdirSync(directory).filter(name => /^response-[a-f0-9]{64}\.json$/.test(name)).length !== 1) throw new Error(`Action evidence request ${request.id} has contradictory owner responses; review pending`)
  const content = `CORRELATED OWNER RESPONSE ${JSON.stringify({ requestId: request.id, caseDigest: request.caseDigest, responder: response.responder })}\n${response.answer}`
  const source = ActionSourceSchema.parse({ id: `action-evidence-response:${request.id}@${sha256(content)}`, kind: 'instruction', locator: path,
    content, trustedContent: [response.answer], response: { requestId: request.id, caseDigest: request.caseDigest, responseId: response.id, actionKeys } })
  return { path, response, source }
}

export function readActionEvidenceReply(path: string): ActionSource {
  const stats = lstatSync(path)
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('Action evidence reply must be a regular file')
  const source = ActionSourceSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  if (!source.projection) throw new Error('Action evidence reply is not a bounded projection')
  return source
}

export function readActionEvidenceArtifacts(input: { repoRoot: string; requests: readonly ActionEvidenceRequestReceipt[] }): ActionSource[] {
  const sources: ActionSource[] = []
  for (const expected of input.requests) {
    const unresolvedDirectory = join(input.repoRoot, '.action-evidence', expected.id)
    if (!existsSync(unresolvedDirectory)) continue
    const directory = actionEvidenceDirectory(input.repoRoot, expected.id)
    for (const name of readdirSync(directory).filter(name => name.endsWith('.json'))) {
      const path = join(directory, name)
      const stats = lstatSync(path)
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Action evidence artifact is not a regular private file: ${path}`)
      chmodSync(path, 0o600)
    }
    const requestPath = join(directory, 'request.json')
    if (!existsSync(requestPath)) continue
    chmodSync(requestPath, 0o600)
    const stored = validateActionEvidenceRequest(JSON.parse(readFileSync(requestPath, 'utf8')))
    if (JSON.stringify(actionEvidenceRequestReceipt(stored)) !== JSON.stringify({ ...expected, status: 'open' })) throw new Error(`Stored action evidence request does not match pending request ${expected.id}`)
    if (expected.status === 'open') {
      const closure = actionEvidenceClosure(input.repoRoot, stored.id)
      if (closure) throw new ActionEvidenceLifecycleError(
        ActionEvidenceRequestReceiptSchema.parse({ ...expected, status: closure.status }),
        `Action evidence request ${stored.id} is ${closure.status}; late replies are rejected`,
      )
    }
    else {
      const closure = actionEvidenceClosure(input.repoRoot, stored.id)
      if (closure && closure.status !== expected.status) throw new Error(`Stored action evidence request lifecycle does not match ${expected.status}: ${expected.id}`)
      if (!closure && expected.status !== 'resolved') throw new Error(`Stored action evidence request lifecycle does not match ${expected.status}: ${expected.id}`)
      if (expected.status !== 'resolved') continue
    }
    const sourcePath = join(directory, 'source.json')
    const completeSource = existsSync(sourcePath) ? ActionSourceSchema.parse(JSON.parse(readFileSync(sourcePath, 'utf8'))) : undefined
    if (completeSource) { chmodSync(sourcePath, 0o600); sources.push(completeSource) }
    for (const name of readdirSync(directory).filter(name => /^reply-[a-f0-9]{64}\.json$/.test(name)).sort()) {
      if (!completeSource || stored.kind !== 'source-view') throw new Error(`Stored action evidence reply lacks its retained source-view request: ${stored.id}`)
      sources.push(validateActionEvidenceProjection({ request: stored, source: completeSource, projection: readActionEvidenceReply(join(directory, name)) }))
    }
    const responseNames = readdirSync(directory).filter(name => /^response-[a-f0-9]{64}\.json$/.test(name)).sort()
    if (responseNames.length > 1) throw new Error(`Action evidence request ${stored.id} has contradictory owner responses; review pending`)
    for (const name of responseNames) {
      const responsePath = join(directory, name)
      chmodSync(responsePath, 0o600)
      const response = ActionEvidenceResponseSchema.parse(JSON.parse(readFileSync(responsePath, 'utf8')))
      if (response.requestId !== stored.id || response.caseDigest !== stored.caseDigest || sha256(JSON.stringify({ version: response.version, requestId: response.requestId, caseDigest: response.caseDigest, responder: response.responder, answer: response.answer })) !== response.id) throw new Error(`Stored action evidence response does not match request ${stored.id}`)
      const actionKeys = responseActionKeys(stored)
      if (stored.recipient !== 'coordinator-owner' || !actionKeys.length) throw new Error(`Stored owner response lacks an explicit coordinator-owned target action: ${stored.id}`)
      const content = `CORRELATED OWNER RESPONSE ${JSON.stringify({ requestId: stored.id, caseDigest: stored.caseDigest, responder: response.responder })}\n${response.answer}`
      sources.push(ActionSourceSchema.parse({ id: `action-evidence-response:${stored.id}@${sha256(content)}`, kind: 'instruction', locator: join(directory, name), content,
        trustedContent: [response.answer], response: { requestId: stored.id, caseDigest: stored.caseDigest, responseId: response.id, actionKeys } }))
    }
  }
  return sources
}
