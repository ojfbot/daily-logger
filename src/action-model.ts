import { z } from 'zod'

export const BareActionCommandSchema = z.string().regex(/^\/\w[\w-]*$/)
export const ActionCommandSchema = z.string().regex(/^\/\w[\w-]*(?: +\S[^\r\n]*)?$/)
  .refine(command => !/[\x00-\x1f\x7f\u2028\u2029]/.test(command), 'Action command must be a single line without control characters')

const gitSha = z.string().regex(/^[a-f0-9]{40}$/)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

const taskReferenceSchema = z.object({
  threadId: z.string().min(1),
  title: z.string().min(1),
}).strict()

const repositoryEvidenceSchema = z.object({
  kind: z.literal('repository-file'),
  path: z.string().min(1),
  commitSha: gitSha,
  blobSha: gitSha,
  sha256,
  qualification: z.string().min(1),
}).strict()

const externalEvidenceSchema = z.object({
  kind: z.literal('external-local-receipt'),
  locator: z.string().min(1),
  sha256,
  qualification: z.string().min(1),
  verification: z.literal('external-not-verified'),
}).strict()

export const ActionEvidenceSchema = z.discriminatedUnion('kind', [
  repositoryEvidenceSchema,
  externalEvidenceSchema,
])

export const ReviewedActionDispositionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('deferred'),
    owner: taskReferenceSchema,
    reason: z.string().min(1),
    nextSafeRetry: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('completed-existing-evidence'),
    evidence: z.array(ActionEvidenceSchema).min(1),
    qualification: z.string().min(1),
    nextSafeRetry: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('pending-receipt'),
    owner: taskReferenceSchema,
    acceptanceCriteria: z.array(z.string().min(1)).min(1),
    acceptedReceipt: z.null(),
    nextSafeRetry: z.string().min(1),
  }).strict(),
])

export const ReviewedActionSourceSchema = z.object({
  repository: z.literal('ojfbot/daily-logger'),
  articlePath: z.string().min(1),
  articleCommitSha: gitSha,
  articleBlobSha: gitSha,
  line: z.number().int().positive(),
  suggestionLineSha256: sha256,
  url: z.string().url(),
}).strict()

export const LegacyCanonicalActionSchema = z.object({
  command: ActionCommandSchema,
  description: z.string().min(1),
  repo: z.string().min(1),
  status: z.enum(['open', 'done']),
  currentDescription: z.string().min(1).optional(),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id: z.string().min(1).optional(),
  closedDate: z.string().optional(),
  resolution: z.string().optional(),
  invocation: z.never().optional(),
  review: z.never().optional(),
}).strict()

const NewlySettledCanonicalActionSchema = LegacyCanonicalActionSchema.extend({
  status: z.literal('done'),
  closedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resolution: z.string().trim().min(1),
})

export const ReviewedCanonicalActionSchema = z.object({
  id: z.string().min(1),
  command: BareActionCommandSchema,
  invocation: z.string().regex(/^\/\w[\w-]*\s+.+$/),
  description: z.string().min(1),
  repo: z.string().min(1),
  status: z.literal('open'),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review: z.object({
    source: ReviewedActionSourceSchema,
    disposition: ReviewedActionDispositionSchema,
    executionAuthority: z.literal('none'),
    settlementAuthority: z.literal('none'),
  }).strict(),
}).strict()

export const CanonicalActionSchema = z.union([
  ReviewedCanonicalActionSchema,
  LegacyCanonicalActionSchema,
])

export const CanonicalActionArraySchema = z.array(CanonicalActionSchema)

export type ActionEvidence = z.infer<typeof ActionEvidenceSchema>
export type ReviewedActionDisposition = z.infer<typeof ReviewedActionDispositionSchema>
export type LegacyCanonicalAction = z.infer<typeof LegacyCanonicalActionSchema>
export type ReviewedCanonicalAction = z.infer<typeof ReviewedCanonicalActionSchema>
export type CanonicalAction = z.infer<typeof CanonicalActionSchema>

export function isReviewedAction(action: CanonicalAction): action is ReviewedCanonicalAction {
  return 'review' in action && action.review !== undefined
}

export function legacyActionKey(action: {
  command: string
  sourceDate: string
  description: string
}): string {
  return `${action.command}|${action.sourceDate}|${action.description.slice(0, 50)}`
}

export interface CanonicalActionHistoryConservation {
  baselineOpenStillOpen: number
  baselineOpenSettled: number
  baselineDonePreserved: number
}

function actionHistoryIdentity(action: CanonicalAction): string {
  return action.id ? `id:${action.id}` : `legacy:${legacyActionKey(action)}`
}

function assertHistoryFieldsUnchanged(
  baseline: CanonicalAction,
  current: CanonicalAction,
  label: string,
): void {
  const fields = ['command', 'description', 'repo', 'sourceDate'] as const
  for (const field of fields) {
    if (current[field] !== baseline[field]) {
      throw new Error(`${label} changed immutable field ${field}`)
    }
  }
  if (baseline.id !== undefined && current.id !== baseline.id) {
    throw new Error(`${label} changed immutable field id`)
  }
}

function assertCompletedHistoryUnchanged(
  baseline: CanonicalAction,
  current: CanonicalAction,
  label: string,
): void {
  if (isReviewedAction(baseline) || isReviewedAction(current)) {
    throw new Error(`${label} must use the ordinary completed-action shape`)
  }
  const fields = [
    'id',
    'command',
    'description',
    'repo',
    'status',
    'sourceDate',
    'closedDate',
    'resolution',
  ] as const
  for (const field of fields) {
    if (current[field] !== baseline[field]) {
      throw new Error(`${label} changed field ${field}`)
    }
  }
}

function assertValidNewSettlement(action: CanonicalAction, label: string): void {
  const parsed = NewlySettledCanonicalActionSchema.safeParse(action)
  if (!parsed.success) {
    throw new Error(`${label} is not a valid completed action: ${z.prettifyError(parsed.error)}`)
  }
}

function findUnusedHistoryMatch(
  baseline: CanonicalAction,
  current: readonly CanonicalAction[],
  used: ReadonlySet<number>,
): number {
  const identity = actionHistoryIdentity(baseline)
  return current.findIndex((candidate, index) => (
    !used.has(index) && actionHistoryIdentity(candidate) === identity
  ))
}

export function assertCanonicalActionHistoryConserved(args: {
  baselineOpen: readonly CanonicalAction[]
  baselineDone: readonly CanonicalAction[]
  currentOpen: readonly CanonicalAction[]
  currentDone: readonly CanonicalAction[]
}): CanonicalActionHistoryConservation {
  const usedOpen = new Set<number>()
  const usedDone = new Set<number>()

  for (const baseline of args.baselineDone) {
    const index = findUnusedHistoryMatch(baseline, args.currentDone, usedDone)
    const label = `Baseline completed action ${actionHistoryIdentity(baseline)}`
    if (index < 0) throw new Error(`${label} is missing from the completion ledger`)
    assertCompletedHistoryUnchanged(baseline, args.currentDone[index], label)
    usedDone.add(index)
  }

  let baselineOpenStillOpen = 0
  let baselineOpenSettled = 0
  for (const baseline of args.baselineOpen) {
    const label = `Baseline open action ${actionHistoryIdentity(baseline)}`
    const openIndex = findUnusedHistoryMatch(baseline, args.currentOpen, usedOpen)
    if (openIndex >= 0) {
      assertHistoryFieldsUnchanged(baseline, args.currentOpen[openIndex], label)
      usedOpen.add(openIndex)
      baselineOpenStillOpen++
      continue
    }

    const doneIndex = findUnusedHistoryMatch(baseline, args.currentDone, usedDone)
    if (doneIndex < 0) throw new Error(`${label} is missing from both the open queue and completion ledger`)
    assertHistoryFieldsUnchanged(baseline, args.currentDone[doneIndex], label)
    assertValidNewSettlement(args.currentDone[doneIndex], label)
    usedDone.add(doneIndex)
    baselineOpenSettled++
  }

  return {
    baselineOpenStillOpen,
    baselineOpenSettled,
    baselineDonePreserved: args.baselineDone.length,
  }
}

export function assertNoReviewedActionClosures(
  closed: ReadonlyArray<{ id?: string; command: string; sourceDate: string; description: string }>,
  open: readonly CanonicalAction[],
): void {
  const reviewed = open.filter(isReviewedAction)
  const reviewedIds = new Set(reviewed.map((action) => action.id))
  const reviewedLegacyKeys = new Set(reviewed.map(legacyActionKey))

  for (const candidate of closed) {
    const matchesId = candidate.id !== undefined && reviewedIds.has(candidate.id)
    if (matchesId || reviewedLegacyKeys.has(legacyActionKey(candidate))) {
      throw new Error(
        `Reviewed action ${candidate.id ?? legacyActionKey(candidate)} requires a separately accepted exact-ID settlement receipt`,
      )
    }
  }
}
