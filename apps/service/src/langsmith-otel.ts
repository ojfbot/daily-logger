import { context, SpanStatusCode, trace, type Attributes, type Span, type Tracer } from '@opentelemetry/api'
import type { Observation, ObservationKind, ObservationOutcome } from './telemetry-schema.js'
import type { ObservationSink } from './telemetry.js'

/**
 * Maps the closed S05a observation projection to standard OTel spans that LangSmith
 * recognizes. It accepts no endpoint, credentials, resources, baggage, or content.
 */
export interface LangSmithOtelDiagnostics {
  starts: number
  ends: number
  events: number
  duplicateStarts: number
  missingStarts: number
  missingParents: number
  openSpans: number
}

export interface LangSmithOtelSink extends ObservationSink {
  diagnostics(): Readonly<LangSmithOtelDiagnostics>
}

const NAMES: Record<ObservationKind, string> = Object.freeze({
  admission_response_observed: 'dailylogger.admission_response',
  delivery: 'dailylogger.delivery',
  operation: 'dailylogger.operation',
  node: 'dailylogger.node',
  reconciliation: 'dailylogger.reconciliation',
})

const FAILURE_OUTCOMES = new Set<ObservationOutcome>(['failed', 'rejected', 'cancelled'])

/** Only fields that survived S05a's closed projection become OTel/LangSmith metadata. */
function attributes(record: Readonly<Observation>): Attributes {
  const result: Attributes = {
    'langsmith.span.kind': 'chain',
    'langsmith.trace.name': NAMES[record.kind],
    'langsmith.metadata.dailylogger_observation_id': record.observationId,
    'langsmith.metadata.dailylogger_segment_id': record.traceId,
    'langsmith.metadata.dailylogger_phase': record.phase,
    'langsmith.metadata.dailylogger_instrumentation_version': record.instrumentationVersion,
  }
  if (record.runId) {
    // LangSmith requires this on every child run for thread filtering/aggregation.
    result['langsmith.trace.session_id'] = record.runId
    result['langsmith.metadata.dailylogger_run_id'] = record.runId
  }
  if (record.commandId) result['langsmith.metadata.dailylogger_command_id'] = record.commandId
  if (record.attemptId) result['langsmith.metadata.dailylogger_attempt_id'] = record.attemptId
  if (record.node) result['langsmith.metadata.dailylogger_node'] = record.node
  if (record.operation) result['langsmith.metadata.dailylogger_operation'] = record.operation
  if (record.outcome) result['langsmith.metadata.dailylogger_outcome'] = record.outcome
  if (record.retryCount !== undefined) result['langsmith.metadata.dailylogger_retry_count'] = record.retryCount
  if (record.durationMs !== undefined) result['langsmith.metadata.dailylogger_duration_ms'] = record.durationMs
  if (record.runState) result['langsmith.metadata.dailylogger_run_state'] = record.runState
  if (record.workflowVersion) result['langsmith.metadata.dailylogger_workflow_version'] = record.workflowVersion
  return result
}

function isFailure(outcome: ObservationOutcome | undefined): boolean {
  return outcome !== undefined && FAILURE_OUTCOMES.has(outcome)
}

/**
 * Creates an in-process ObservationSink only. Transport belongs to the configured
 * OTel provider; this mapper never reads process environment or sends network data.
 */
export function createLangSmithOtelSink(tracer: Tracer): LangSmithOtelSink {
  const spans = new Map<string, Span>()
  const counters = { starts: 0, ends: 0, events: 0, duplicateStarts: 0, missingStarts: 0, missingParents: 0 }
  const diagnostics = (): Readonly<LangSmithOtelDiagnostics> => Object.freeze({ ...counters, openSpans: spans.size })
  const parentContext = (record: Readonly<Observation>) => {
    if (!record.parentId) return context.active()
    const parent = spans.get(record.parentId)
    if (!parent) return undefined
    return trace.setSpan(context.active(), parent)
  }
  const start = (record: Readonly<Observation>, parent = parentContext(record)): Span | undefined => {
    if (!parent) {
      counters.missingParents++
      return undefined
    }
    const span = tracer.startSpan(NAMES[record.kind], { startTime: record.at }, parent)
    span.setAttributes(attributes(record))
    return span
  }
  const finish = (span: Span, record: Readonly<Observation>) => {
    span.setAttributes(attributes(record))
    if (isFailure(record.outcome)) span.setStatus({ code: SpanStatusCode.ERROR })
    span.end(record.at)
  }
  return Object.freeze({
    export(batch: readonly Readonly<Observation>[]) {
      for (const record of batch) {
        if (record.phase === 'start') {
          if (spans.has(record.observationId)) { counters.duplicateStarts++; continue }
          const span = start(record)
          if (!span) continue
          spans.set(record.observationId, span)
          counters.starts++
          continue
        }
        if (record.phase === 'end') {
          const span = spans.get(record.observationId)
          if (!span) { counters.missingStarts++; continue }
          finish(span, record)
          spans.delete(record.observationId)
          counters.ends++
          continue
        }
        const span = start(record)
        if (!span) continue
        finish(span, record)
        counters.events++
      }
    },
    diagnostics,
  })
}
