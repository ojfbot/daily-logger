import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { z } from 'zod'
import { createLangSmithOtelSink } from '../../src/langsmith-otel.js'

const SpanEvidence = z.object({
  name: z.string(), traceId: z.string(), spanId: z.string(), parentSpanId: z.string().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), statusCode: z.number(),
})
export const SegmentEvidence = z.object({
  phase: z.enum(['start', 'resume']), status: z.enum(['paused', 'complete']),
  spans: z.array(SpanEvidence),
  diagnostics: z.object({ starts: z.number(), ends: z.number(), events: z.number(), duplicateStarts: z.number(), missingStarts: z.number(), missingParents: z.number(), openSpans: z.number() }),
})
export type Segment = z.infer<typeof SegmentEvidence>

export function inMemoryMapping() {
  const exporter = new InMemorySpanExporter()
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] })
  const mapper = createLangSmithOtelSink(provider.getTracer('dailylogger-fixture-oracle', '1'))
  return {
    mapper, provider,
    async spans() {
      await provider.forceFlush()
      return exporter.getFinishedSpans().map(span => SpanEvidence.parse({
        name: span.name, traceId: span.spanContext().traceId, spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanContext?.spanId, attributes: span.attributes, statusCode: span.status.code,
      }))
    },
  }
}

// Written from the fixture's acceptance sequence, never derived from emitted spans.
const EXPECTED = {
  start: { delivery: 'paused', collect_fixture: 'succeeded', draft_fixture: 'succeeded', review_fixture: 'succeeded', human_gate: 'paused' },
  resume: { delivery: 'succeeded', human_gate: 'succeeded', write_shadow_artifacts: 'succeeded' },
} as const

export function fixtureTraceFailures(segments: readonly Segment[], runId: string): string[] {
  const failures: string[] = []
  const seenSpans = new Set<string>(), seenObservations = new Set<string>(), roots = new Set<string>()
  for (const phase of ['start', 'resume'] as const) {
    const matches = segments.filter(segment => segment.phase === phase)
    if (matches.length !== 1) { failures.push(`${phase}:segment-count`); continue }
    const segment = matches[0]
    if (segment.status !== (phase === 'start' ? 'paused' : 'complete')) failures.push(`${phase}:state`)
    const rootSpans = segment.spans.filter(span => span.name === 'dailylogger.delivery')
    const root = rootSpans.length === 1 ? rootSpans[0] : undefined
    if (!root || root.parentSpanId) failures.push(`${phase}:root`)
    if (root) {
      if (roots.has(root.traceId)) failures.push(`${phase}:reused-trace`)
      roots.add(root.traceId)
    }
    for (const [role, outcome] of Object.entries(EXPECTED[phase])) {
      const spans = segment.spans.filter(span => role === 'delivery' ? span.name === 'dailylogger.delivery' : span.attributes['langsmith.metadata.dailylogger_node'] === role)
      if (spans.length !== 1) { failures.push(`${phase}:${role}:count`); continue }
      if (spans[0].attributes['langsmith.metadata.dailylogger_outcome'] !== outcome) failures.push(`${phase}:${role}:outcome`)
    }
    if (segment.spans.length !== Object.keys(EXPECTED[phase]).length) failures.push(`${phase}:span-count`)
    for (const span of segment.spans) {
      const observationId = String(span.attributes['langsmith.metadata.dailylogger_observation_id'])
      if (seenSpans.has(span.spanId) || seenObservations.has(observationId)) failures.push(`${phase}:duplicate-identity`)
      seenSpans.add(span.spanId); seenObservations.add(observationId)
      if (!/^[a-f0-9]{32}$/.test(span.traceId) || !/^[a-f0-9]{16}$/.test(span.spanId)) failures.push(`${phase}:native-id`)
      if (span.attributes['langsmith.trace.session_id'] !== runId) failures.push(`${phase}:thread`)
      if (span !== root && (!root || span.traceId !== root.traceId || span.parentSpanId !== root.spanId || span.name !== 'dailylogger.node')) failures.push(`${phase}:parent`)
      if (span.statusCode !== 0) failures.push(`${phase}:status`)
    }
    const d = segment.diagnostics
    if (d.openSpans || d.missingParents || d.missingStarts || d.duplicateStarts || d.starts !== segment.spans.length || d.ends !== d.starts || d.events !== 0) failures.push(`${phase}:diagnostics`)
  }
  if (segments.length !== 2) failures.push('segment-count')
  return failures
}
