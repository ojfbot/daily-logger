import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { projectObservation, type Observation, type ObservationKind, type ObservationOutcome } from './telemetry-schema.js'

export const TELEMETRY_LIMITS = Object.freeze({ sinks: 2, queue: 128, batch: 16, recordBytes: 1024, batchBytes: 8192, exportMs: 100, flushMs: 250 })
export interface ObservationSink { export(batch: readonly Readonly<Observation>[]): void | Promise<void> }
export interface ObservationContext { runId?: string; commandId?: string; attemptId?: string; retryCount?: number; operation?: string; node?: string; runState?: string; workflowVersion?: string }
export interface ObservationSpan {
  bind(context: ObservationContext): void
  child(kind: ObservationKind, context?: ObservationContext): ObservationSpan
  event(kind: ObservationKind, outcome: ObservationOutcome, context?: ObservationContext): void
  end(outcome: ObservationOutcome): void
}
export interface TelemetryDiagnostics { accepted: number; dropped: number; invalid: number; exported: number; sinkFailures: number; sinkTimeouts: number; ignoredSinks: number; queued: number; pendingExports: number; closed: boolean }
export interface Telemetry {
  begin(kind: ObservationKind, context?: ObservationContext): ObservationSpan
  emit(input: unknown): void
  flush(): Promise<Readonly<TelemetryDiagnostics>>
  shutdown(): Promise<Readonly<TelemetryDiagnostics>>
  diagnostics(): Readonly<TelemetryDiagnostics>
}
const emptyDiagnostics = (): TelemetryDiagnostics => ({ accepted: 0, dropped: 0, invalid: 0, exported: 0, sinkFailures: 0, sinkTimeouts: 0, ignoredSinks: 0, queued: 0, pendingExports: 0, closed: true })
export const NOOP_SPAN: ObservationSpan = Object.freeze({ bind: () => {}, child: () => NOOP_SPAN, event: () => {}, end: () => {} })
export const NOOP_TELEMETRY: Telemetry = Object.freeze({ begin: () => NOOP_SPAN, emit: () => {}, flush: async () => emptyDiagnostics(), shutdown: async () => emptyDiagnostics(), diagnostics: emptyDiagnostics })

function consumeRejection(value: unknown): void {
  try {
    if (value && (typeof value === 'object' || typeof value === 'function') && typeof (value as { then?: unknown }).then === 'function') void Promise.resolve(value).catch(() => {})
  } catch { /* malformed thenables are diagnostic failures, never application failures */ }
}

/** Protect application hooks even from an incorrectly supplied adapter. */
export function safeSpan(span: ObservationSpan): ObservationSpan {
  consumeRejection(span)
  return {
    bind: context => { try { consumeRejection(span.bind(context)) } catch { /* no payload diagnostics */ } },
    child: (kind, context) => { try { return safeSpan(span.child(kind, context)) } catch { return NOOP_SPAN } },
    event: (kind, outcome, context) => { try { consumeRejection(span.event(kind, outcome, context)) } catch { /* no application diagnostic payload */ } },
    end: outcome => { try { consumeRejection(span.end(outcome)) } catch { /* observations cannot change application outcomes */ } },
  }
}
export function beginObservation(telemetry: Telemetry, kind: ObservationKind, context: ObservationContext = {}): ObservationSpan {
  try { return safeSpan(telemetry.begin(kind, context)) } catch { return NOOP_SPAN }
}

/** Call only after caller-owned COMMIT succeeds. A response is not proof of a new row. */
export function observeAdmissionResponse(telemetry: Telemetry, admission: { status: number; body: string }): void {
  try {
    if (telemetry === NOOP_TELEMETRY) return
    const body: unknown = JSON.parse(admission.body)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return
    const response = body as Record<string, unknown>
    const outcome = admission.status === 202 && response.admission === 'admitted' ? 'admitted_response'
      : admission.status === 409 && response.error === 'idempotency_conflict' ? 'idempotency_conflict_response'
        : admission.status === 409 && response.admission === 'rejected' ? 'rejected_response' : undefined
    if (!outcome) return
    consumeRejection(telemetry.emit({ kind: 'admission_response_observed', phase: 'event', outcome, traceId: randomUUID(), observationId: randomUUID(), at: Date.now(), commandId: response.commandId, ...(outcome === 'admitted_response' ? { runId: response.runId } : {}) }))
  } catch { /* Never enter the business transaction's catch after a successful commit. */ }
}

/** Fit the optional flush inside, never outside, the worker's existing hard deadline. */
export async function shutdownTelemetry(telemetry: Telemetry): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(() => telemetry.shutdown()).catch(() => {}),
      new Promise<void>(resolve => { timer = setTimeout(resolve, TELEMETRY_LIMITS.flushMs) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

/** No configured endpoint, ambient context, SDK or disk spool. Explicit in-process test sinks only. */
export function createOfflineTelemetry(sinks: readonly ObservationSink[]): Telemetry {
  const queue: Readonly<Observation>[] = []
  const states = sinks.slice(0, TELEMETRY_LIMITS.sinks).map(sink => ({ sink, quarantined: false, pending: false }))
  const counters = { ...emptyDiagnostics(), closed: false, ignoredSinks: Math.max(0, sinks.length - TELEMETRY_LIMITS.sinks) }
  let scheduled = false, draining = false
  const diagnostics = () => Object.freeze({ ...counters, queued: queue.length, pendingExports: states.filter(state => state.pending).length })
  const exportBatch = async (state: typeof states[number], batch: readonly Readonly<Observation>[]) => {
    if (state.quarantined) return
    state.pending = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // One immutable copy per sink; no sink can mutate another sink's input.
    const copy = Object.freeze(batch.map(record => Object.freeze({ ...record })))
    // Sink invocation is deferred off emit()/begin()/end(), never awaited by business work.
    const started = performance.now()
    const exporting = Promise.resolve().then(() => state.sink.export(copy)).then(() => {
      state.pending = false
      return performance.now() - started > TELEMETRY_LIMITS.exportMs ? 'timeout' as const : 'exported' as const
    }, () => { state.pending = false; return 'failed' as const })
    const outcome = await Promise.race([exporting, new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), TELEMETRY_LIMITS.exportMs) })])
    if (timer) clearTimeout(timer)
    if (outcome === 'exported') counters.exported += batch.length
    else {
      state.quarantined = true // Never create replacement exports for a stuck promise.
      if (outcome === 'timeout') counters.sinkTimeouts++
      else counters.sinkFailures++
    }
  }
  const drain = async () => {
    if (draining) return
    draining = true
    try {
      while (queue.length) {
        if (states.every(state => state.quarantined)) { counters.dropped += queue.length; queue.length = 0; break }
        const batch: Readonly<Observation>[] = []
        let bytes = 2 // JSON array brackets, plus each record and separator.
        while (queue.length && batch.length < TELEMETRY_LIMITS.batch) {
          const size = Buffer.byteLength(JSON.stringify(queue[0])) + (batch.length ? 1 : 0)
          if (bytes + size > TELEMETRY_LIMITS.batchBytes) break
          batch.push(queue.shift()!); bytes += size
        }
        await Promise.all(states.map(state => exportBatch(state, batch)))
      }
    } finally { draining = false }
  }
  const schedule = () => {
    if (scheduled || draining) return
    scheduled = true
    setImmediate(() => { scheduled = false; void drain() })
  }
  const emit = (input: unknown) => {
    try {
      if (counters.closed) { counters.dropped++; return }
      const projected = projectObservation(input)
      if (!projected) { counters.invalid++; return }
      if (Buffer.byteLength(JSON.stringify(projected)) > TELEMETRY_LIMITS.recordBytes || queue.length >= TELEMETRY_LIMITS.queue || states.every(state => state.quarantined)) { counters.dropped++; return }
      queue.push(projected); counters.accepted++; schedule()
    } catch { counters.invalid++ }
  }
  const span = (kind: ObservationKind, context: ObservationContext, traceId: string, parentId?: string): ObservationSpan => {
    try {
      const observationId = randomUUID(), started = performance.now()
      let ended = false
      let bound = { ...context }
      const base = () => ({ ...bound, kind, traceId, observationId, parentId })
      emit({ ...base(), phase: 'start', at: Date.now() })
      return Object.freeze({
        bind: (extra: ObservationContext) => { if (!ended) bound = { ...bound, ...extra } },
        child: (childKind: ObservationKind, extra: ObservationContext = {}) => ended ? NOOP_SPAN : span(childKind, { ...bound, ...extra }, traceId, observationId),
        event: (eventKind: ObservationKind, outcome: ObservationOutcome, extra: ObservationContext = {}) => {
          if (!ended) emit({ ...bound, ...extra, kind: eventKind, phase: 'event', outcome, traceId, observationId: randomUUID(), parentId: observationId, at: Date.now() })
        },
        end: (outcome: ObservationOutcome) => {
          if (ended) return
          ended = true
          emit({ ...base(), phase: 'end', outcome, durationMs: Math.min(86_400_000, Math.max(0, performance.now() - started)), at: Date.now() })
        },
      })
    } catch { return NOOP_SPAN }
  }
  const flush = async () => {
    const deadline = performance.now() + TELEMETRY_LIMITS.flushMs
    schedule()
    while ((queue.length || draining || scheduled) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    return diagnostics()
  }
  return Object.freeze({
    emit,
    begin: (kind: ObservationKind, context: ObservationContext = {}) => {
      if (counters.closed) return NOOP_SPAN
      try { return span(kind, context, randomUUID()) } catch { return NOOP_SPAN }
    },
    diagnostics, flush,
    shutdown: async () => {
      counters.closed = true
      await flush()
      counters.dropped += queue.length; queue.length = 0
      for (const state of states) state.quarantined = true
      return diagnostics()
    },
  })
}
