/** Closed S05a application metadata. Never serialize arbitrary application objects. */
export const OBSERVATION_KINDS = ['admission_response_observed', 'delivery', 'operation', 'node', 'reconciliation'] as const
export const OBSERVATION_OUTCOMES = ['admitted_response', 'rejected_response', 'idempotency_conflict_response', 'admitted', 'rejected', 'returned', 'succeeded', 'failed', 'paused', 'complete', 'recoverable', 'awaiting_approval', 'inspection', 'retrying', 'stale', 'cancelled'] as const
export const OBSERVATION_NODES = ['collect_fixture', 'draft_fixture', 'review_fixture', 'human_gate', 'write_shadow_artifacts', 'draft', 'review', 'revise'] as const
export type ObservationKind = typeof OBSERVATION_KINDS[number]
export type ObservationOutcome = typeof OBSERVATION_OUTCOMES[number]
export type ObservationNode = typeof OBSERVATION_NODES[number]
export interface Observation {
  schemaVersion: 1
  instrumentationVersion: 's05a-offline-v1'
  kind: ObservationKind
  phase: 'start' | 'end' | 'event'
  traceId: string
  observationId: string
  at: number
  runId?: string
  commandId?: string
  attemptId?: string
  parentId?: string
  node?: ObservationNode
  operation?: 'start' | 'status' | 'resume' | 'recover' | 'cancel'
  outcome?: ObservationOutcome
  retryCount?: number
  durationMs?: number
  runState?: 'admitted' | 'recoverable' | 'awaiting_approval' | 'complete'
  workflowVersion?: 'm1a-recorded-artifact-replay-v1' | 's03a-recorded-artifact-replay-v1' | 'private-journal-v1'
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const includes = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value)
const number = (value: unknown, maximum: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum

/** Access only own data fields: getters, nested attributes, events and links are not capture surfaces. */
export function projectObservation(input: unknown): Readonly<Observation> | null {
  try {
    if (!input || typeof input !== 'object') return null
    const get = (key: string): unknown => Object.getOwnPropertyDescriptor(input, key)?.value
    const kind = get('kind'), phase = get('phase'), traceId = get('traceId'), observationId = get('observationId'), at = get('at')
    if (!includes(OBSERVATION_KINDS, kind) || !includes(['start', 'end', 'event'], phase)
      || typeof traceId !== 'string' || traceId.length !== 36 || !UUID.test(traceId) || typeof observationId !== 'string' || observationId.length !== 36 || !UUID.test(observationId)
      || !number(at, 8.64e15) || !Number.isSafeInteger(at)) return null
    const projected: Observation = { schemaVersion: 1, instrumentationVersion: 's05a-offline-v1', kind, phase, traceId, observationId, at }
    for (const key of ['runId', 'commandId', 'attemptId', 'parentId'] as const) {
      const value = get(key)
      if (typeof value === 'string' && value.length === 36 && UUID.test(value)) projected[key] = value
    }
    const node = get('node'), operation = get('operation'), outcome = get('outcome'), retryCount = get('retryCount'), durationMs = get('durationMs')
    if (includes(OBSERVATION_NODES, node)) projected.node = node
    if (includes(['start', 'status', 'resume', 'recover', 'cancel'], operation)) projected.operation = operation
    if (includes(OBSERVATION_OUTCOMES, outcome)) projected.outcome = outcome
    if (number(retryCount, 1_000_000) && Number.isSafeInteger(retryCount)) projected.retryCount = retryCount
    if (number(durationMs, 86_400_000)) projected.durationMs = durationMs
    const runState = get('runState')
    if (includes(['admitted', 'recoverable', 'awaiting_approval', 'complete'], runState)) projected.runState = runState
    const workflowVersion = get('workflowVersion')
    if (includes(['m1a-recorded-artifact-replay-v1', 's03a-recorded-artifact-replay-v1', 'private-journal-v1'], workflowVersion)) projected.workflowVersion = workflowVersion
    return Object.freeze(projected)
  } catch { return null } // Proxy/getter failures cannot escape into application work.
}
