import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'fs'
import { join, resolve, sep } from 'path'
import { z } from 'zod'
import {
  ActionEvidenceSchema,
  CanonicalActionArraySchema,
  CanonicalActionSchema,
  ReviewedActionDispositionSchema,
  type CanonicalAction,
  type ReviewedCanonicalAction,
} from './action-model.js'
import { actionId } from './schema.js'

const gitSha = z.string().regex(/^[a-f0-9]{40}$/)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

const admissionItemSchema = z.object({
  id: z.string().min(1),
  allocatedAt: z.string().min(1),
  previousProductionActionId: z.null(),
  sourceLine: z.number().int().positive(),
  suggestionLineSha256: sha256,
  command: z.string().regex(/^\/\w[\w-]*$/),
  invocation: z.string().regex(/^\/\w[\w-]*\s+.+$/),
  description: z.string().min(1),
  repo: z.string().min(1),
  disposition: ReviewedActionDispositionSchema,
}).strict()

const admissionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('reviewed-action-admission'),
  admissionId: z.string().min(1),
  recordedAt: z.string().min(1),
  baseline: z.object({
    commitSha: gitSha,
    openActionCount: z.number().int().nonnegative(),
    openActionsSha256: sha256,
    doneActionCount: z.number().int().nonnegative(),
    doneActionsSha256: sha256,
  }).strict(),
  source: z.object({
    repository: z.literal('ojfbot/daily-logger'),
    articlePath: z.string().min(1),
    articleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    commitSha: gitSha,
    blobSha: gitSha,
    articleSha256: sha256,
  }).strict(),
  historicalHold: z.object({
    parserVersion: z.literal('argument-bearing-v1'),
    throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedCount: z.number().int().nonnegative(),
    reason: z.string().min(1),
  }).strict(),
  authority: z.object({
    admissionApproved: z.literal(true),
    executionAuthorityGranted: z.literal(false),
    settlementAuthorityGranted: z.literal(false),
    broadHistoricalBackfillApproved: z.literal(false),
  }).strict(),
  items: z.array(admissionItemSchema).min(1),
}).strict()

type AdmissionRecord = z.infer<typeof admissionRecordSchema>
type AdmissionItem = z.infer<typeof admissionItemSchema>

const REQUIRED_ADMISSION_FILE = '2026-10-15.json'
const REQUIRED_ADMISSION_ID = 'reviewed-actions-2026-10-15'
const REQUIRED_ACTION_IDS = [
  'act-2026-10-15-investigate-66e04675dca0',
  'act-2026-10-15-validate-bf0fbc1d6c71',
  'act-2026-10-15-orient-a778b3b2c5af',
] as const
const REQUIRED_DISPOSITION_KINDS = [
  'deferred',
  'completed-existing-evidence',
  'pending-receipt',
] as const

export interface ActionArticleSource {
  path: string
  date: string
  content: string
}

export interface HeldActionSuggestion {
  articlePath: string
  sourceDate: string
  line: number
  invocation: string
  suggestionLineSha256: string
}

export interface ActionIntakeProjection {
  byArticlePath: ReadonlyMap<string, readonly CanonicalAction[]>
  allActions: readonly CanonicalAction[]
  reviewedActions: readonly ReviewedCanonicalAction[]
  heldSuggestions: readonly HeldActionSuggestion[]
  historicalHeldCount: number
}

interface ParsedSuggestion {
  command: string
  invocation: string
  description: string
  repo: string
  exactLine: string
  line: number
  argumentBearing: boolean
  suggestionLineSha256: string
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function sourceKey(articlePath: string, line: number): string {
  return `${articlePath}:${line}`
}

function checkedRepoPath(repoRoot: string, relativePath: string): string {
  if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    throw new Error(`Action admission path escapes the repository: ${relativePath}`)
  }
  const root = realpathSync(repoRoot)
  const candidate = resolve(root, relativePath)
  if (!candidate.startsWith(`${root}${sep}`)) {
    throw new Error(`Action admission path escapes the repository: ${relativePath}`)
  }
  return candidate
}

function git(repoRoot: string, args: readonly string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Action admission Git proof failed for ${args.join(' ')}: ${message}`)
  }
}

function gitFile(repoRoot: string, commitSha: string, path: string): string {
  try {
    return execFileSync('git', ['show', `${commitSha}:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Action admission baseline file is unavailable at ${commitSha}:${path}: ${message}`)
  }
}

function assertBaseline(repoRoot: string, record: AdmissionRecord): void {
  const resolved = git(repoRoot, ['rev-parse', '--verify', `${record.baseline.commitSha}^{commit}`])
  if (resolved !== record.baseline.commitSha) {
    throw new Error(`Action admission baseline did not resolve exactly: ${record.baseline.commitSha}`)
  }
  const openBytes = gitFile(repoRoot, record.baseline.commitSha, 'api/actions.json')
  const doneBytes = gitFile(repoRoot, record.baseline.commitSha, 'api/done-actions.json')
  const open = CanonicalActionArraySchema.parse(JSON.parse(openBytes))
  const done = CanonicalActionArraySchema.parse(JSON.parse(doneBytes))
  if (open.length !== record.baseline.openActionCount || digest(openBytes) !== record.baseline.openActionsSha256) {
    throw new Error('Action admission open-action baseline does not match its recorded count and digest')
  }
  if (done.length !== record.baseline.doneActionCount || digest(doneBytes) !== record.baseline.doneActionsSha256) {
    throw new Error('Action admission completion-ledger baseline does not match its recorded count and digest')
  }
}

function parseArgumentSuggestionLine(exactLine: string, line: number): ParsedSuggestion | null {
  const prefix = '> - `'
  const separator = '` — '
  if (!exactLine.startsWith(prefix)) return null
  const separatorIndex = exactLine.indexOf(separator, prefix.length)
  if (separatorIndex < 0) return null

  const invocation = exactLine.slice(prefix.length, separatorIndex)
  const invocationMatch = invocation.match(/^(\/\w[\w-]*)\s+(.+)$/)
  if (!invocationMatch) return null

  const remainder = exactLine.slice(separatorIndex + separator.length)
  const repoMatch = remainder.match(/^(.*?)(?:\s+\(([\w-]+)\))$/)
  const description = (repoMatch?.[1] ?? remainder).trim()
  if (description.length === 0) return null

  return {
    command: invocationMatch[1],
    invocation,
    description,
    repo: repoMatch?.[2] ?? 'daily-logger',
    exactLine,
    line,
    argumentBearing: true,
    suggestionLineSha256: digest(exactLine),
  }
}

function parseLegacySuggestionLine(exactLine: string, line: number): ParsedSuggestion | null {
  const match = exactLine.match(/^> - `(\/\w[\w-]*)` — (.+?)(?:\s*\((\w[\w-]*)\))?$/)
  if (!match) return null
  return {
    command: match[1],
    invocation: match[1],
    description: match[2].trim(),
    repo: match[3] ?? 'daily-logger',
    exactLine,
    line,
    argumentBearing: false,
    suggestionLineSha256: digest(exactLine),
  }
}

function loadAdmissionRecords(repoRoot: string): AdmissionRecord[] {
  const directory = join(repoRoot, 'action-admissions')
  if (!existsSync(directory)) {
    throw new Error(`Required action admission directory is missing: action-admissions`)
  }

  const admissionFiles = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
  if (!admissionFiles.includes(REQUIRED_ADMISSION_FILE)) {
    throw new Error(`Required action admission is missing: action-admissions/${REQUIRED_ADMISSION_FILE}`)
  }
  if (admissionFiles.length !== 1) {
    throw new Error(`This bounded action-intake repair accepts exactly one admission record: ${REQUIRED_ADMISSION_FILE}`)
  }

  const path = join(directory, REQUIRED_ADMISSION_FILE)
  const bytes = readFileSync(path, 'utf8')
  if (bytes.trim().length === 0) {
    throw new Error(`Required action admission is empty: action-admissions/${REQUIRED_ADMISSION_FILE}`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(bytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid action admission ${REQUIRED_ADMISSION_FILE}: ${message}`)
  }
  const parsed = admissionRecordSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid action admission ${REQUIRED_ADMISSION_FILE}: ${z.prettifyError(parsed.error)}`)
  }
  if (parsed.data.admissionId !== REQUIRED_ADMISSION_ID) {
    throw new Error(`Required action admission identity changed: ${parsed.data.admissionId}`)
  }
  const observedIds = parsed.data.items.map((item) => item.id)
  if (JSON.stringify(observedIds) !== JSON.stringify(REQUIRED_ACTION_IDS)) {
    throw new Error(`Required action admission IDs changed: ${observedIds.join(', ')}`)
  }
  const observedDispositionKinds = parsed.data.items.map((item) => item.disposition.kind)
  if (JSON.stringify(observedDispositionKinds) !== JSON.stringify(REQUIRED_DISPOSITION_KINDS)) {
    throw new Error(`Required action admission dispositions changed: ${observedDispositionKinds.join(', ')}`)
  }
  return [parsed.data]
}

function assertPortableEvidence(repoRoot: string, item: AdmissionItem): void {
  if (item.disposition.kind !== 'completed-existing-evidence') return
  for (const evidence of item.disposition.evidence) {
    const parsed = ActionEvidenceSchema.parse(evidence)
    if (parsed.kind !== 'repository-file') continue
    const resolvedCommit = git(repoRoot, ['rev-parse', '--verify', `${parsed.commitSha}^{commit}`])
    if (resolvedCommit !== parsed.commitSha) {
      throw new Error(`Required action evidence commit did not resolve exactly: ${parsed.commitSha}`)
    }
    const resolvedBlob = git(repoRoot, ['rev-parse', `${parsed.commitSha}:${parsed.path}`])
    if (resolvedBlob !== parsed.blobSha) {
      throw new Error(`Required action evidence commit/blob mismatch: ${parsed.path}`)
    }
    const evidenceBytes = execFileSync('git', ['cat-file', 'blob', parsed.blobSha], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (digest(evidenceBytes) !== parsed.sha256) {
      throw new Error(`Required action evidence Git digest mismatch: ${parsed.path}`)
    }
    const path = checkedRepoPath(repoRoot, parsed.path)
    if (!existsSync(path)) {
      throw new Error(`Required action evidence is missing: ${parsed.path}`)
    }
    const observed = digest(readFileSync(path, 'utf8'))
    if (observed !== parsed.sha256) {
      throw new Error(`Required action evidence digest mismatch: ${parsed.path}`)
    }
  }
}

function assertSource(
  repoRoot: string,
  record: AdmissionRecord,
  item: AdmissionItem,
  currentArticle: ActionArticleSource,
): ParsedSuggestion {
  const resolvedCommit = git(repoRoot, ['rev-parse', '--verify', `${record.source.commitSha}^{commit}`])
  if (resolvedCommit !== record.source.commitSha) {
    throw new Error(`Action admission commit did not resolve exactly: ${record.source.commitSha}`)
  }
  const resolvedBlob = git(repoRoot, ['rev-parse', `${record.source.commitSha}:${record.source.articlePath}`])
  if (resolvedBlob !== record.source.blobSha) {
    throw new Error(`Action admission commit/blob mismatch for ${record.source.articlePath}`)
  }

  const sourceBytes = execFileSync('git', ['cat-file', 'blob', record.source.blobSha], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (digest(sourceBytes) !== record.source.articleSha256) {
    throw new Error(`Action admission article digest mismatch for ${record.source.articlePath}`)
  }
  const sourceLine = sourceBytes.split('\n')[item.sourceLine - 1]
  if (sourceLine === undefined) {
    throw new Error(`Action admission source line is missing: ${sourceKey(record.source.articlePath, item.sourceLine)}`)
  }
  const parsed = parseArgumentSuggestionLine(sourceLine, item.sourceLine)
  if (!parsed) {
    throw new Error(`Action admission source is not an argument-bearing suggestion: ${sourceKey(record.source.articlePath, item.sourceLine)}`)
  }

  const currentLine = currentArticle.content.split('\n')[item.sourceLine - 1]
  if (currentLine !== sourceLine) {
    throw new Error(`Action admission source drifted in the current article: ${sourceKey(record.source.articlePath, item.sourceLine)}`)
  }

  const expected = {
    command: item.command,
    invocation: item.invocation,
    description: item.description,
    repo: item.repo,
    suggestionLineSha256: item.suggestionLineSha256,
  }
  const observed = {
    command: parsed.command,
    invocation: parsed.invocation,
    description: parsed.description,
    repo: parsed.repo,
    suggestionLineSha256: parsed.suggestionLineSha256,
  }
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`Action admission source fields do not match ${sourceKey(record.source.articlePath, item.sourceLine)}`)
  }
  return parsed
}

export function projectActionIntake(args: {
  repoRoot: string
  articles: readonly ActionArticleSource[]
}): ActionIntakeProjection {
  const records = loadAdmissionRecords(args.repoRoot)
  const articlesByPath = new Map(args.articles.map((article) => [article.path, article]))
  const admissions = new Map<string, { record: AdmissionRecord; item: AdmissionItem }>()
  const allocatedIds = new Set<string>()

  for (const record of records) {
    assertBaseline(args.repoRoot, record)
    const article = articlesByPath.get(record.source.articlePath)
    if (!article || article.date !== record.source.articleDate) {
      throw new Error(`Action admission article is unavailable: ${record.source.articlePath}`)
    }
    for (const item of record.items) {
      const key = sourceKey(record.source.articlePath, item.sourceLine)
      if (admissions.has(key)) throw new Error(`Duplicate action admission source: ${key}`)
      if (allocatedIds.has(item.id)) throw new Error(`Duplicate allocated action ID: ${item.id}`)
      assertSource(args.repoRoot, record, item, article)
      assertPortableEvidence(args.repoRoot, item)
      admissions.set(key, { record, item })
      allocatedIds.add(item.id)
    }
  }

  const byArticlePath = new Map<string, readonly CanonicalAction[]>()
  const allActions: CanonicalAction[] = []
  const reviewedActions: ReviewedCanonicalAction[] = []
  const heldSuggestions: HeldActionSuggestion[] = []
  const usedAdmissions = new Set<string>()

  for (const article of args.articles) {
    const actions: CanonicalAction[] = []
    const lines = article.content.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const parsed = parseLegacySuggestionLine(lines[index], index + 1)
        ?? parseArgumentSuggestionLine(lines[index], index + 1)
      if (!parsed) continue
      if (!parsed.argumentBearing) {
        const legacy = CanonicalActionSchema.parse({
          command: parsed.command,
          description: parsed.description,
          repo: parsed.repo,
          status: 'open',
          sourceDate: article.date,
          id: actionId({
            command: parsed.command,
            description: parsed.description,
            sourceDate: article.date,
          }),
        })
        actions.push(legacy)
        allActions.push(legacy)
        continue
      }

      const key = sourceKey(article.path, parsed.line)
      const admission = admissions.get(key)
      if (!admission) {
        heldSuggestions.push({
          articlePath: article.path,
          sourceDate: article.date,
          line: parsed.line,
          invocation: parsed.invocation,
          suggestionLineSha256: parsed.suggestionLineSha256,
        })
        continue
      }
      const reviewed = CanonicalActionSchema.parse({
        id: admission.item.id,
        command: admission.item.command,
        invocation: admission.item.invocation,
        description: admission.item.description,
        repo: admission.item.repo,
        status: 'open',
        sourceDate: admission.record.source.articleDate,
        review: {
          source: {
            repository: admission.record.source.repository,
            articlePath: admission.record.source.articlePath,
            articleCommitSha: admission.record.source.commitSha,
            articleBlobSha: admission.record.source.blobSha,
            line: admission.item.sourceLine,
            suggestionLineSha256: admission.item.suggestionLineSha256,
            url: `https://github.com/ojfbot/daily-logger/blob/${admission.record.source.commitSha}/${admission.record.source.articlePath}#L${admission.item.sourceLine}`,
          },
          disposition: admission.item.disposition,
          executionAuthority: 'none',
          settlementAuthority: 'none',
        },
      })
      if (!('review' in reviewed) || reviewed.review === undefined) {
        throw new Error(`Reviewed action did not construct a reviewed variant: ${admission.item.id}`)
      }
      actions.push(reviewed)
      allActions.push(reviewed)
      reviewedActions.push(reviewed)
      usedAdmissions.add(key)
    }
    byArticlePath.set(article.path, actions)
  }

  for (const key of admissions.keys()) {
    if (!usedAdmissions.has(key)) throw new Error(`Action admission was not projected: ${key}`)
  }

  const allIds = new Set<string>()
  for (const action of allActions) {
    if (!action.id) continue
    if (allIds.has(action.id)) throw new Error(`Canonical action ID collision: ${action.id}`)
    allIds.add(action.id)
  }

  const historicalHold = records.at(0)?.historicalHold
  const historicalHeldCount = historicalHold
    ? heldSuggestions.filter((item) => item.sourceDate <= historicalHold.throughDate).length
    : heldSuggestions.length
  if (historicalHold && historicalHeldCount !== historicalHold.expectedCount) {
    throw new Error(
      `Historical action hold changed: expected ${historicalHold.expectedCount}, observed ${historicalHeldCount}`,
    )
  }

  return {
    byArticlePath,
    allActions,
    reviewedActions,
    heldSuggestions,
    historicalHeldCount,
  }
}
