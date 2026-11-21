import { SpanKind, SpanStatusCode, type Attributes, type HrTime, type SpanContext } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { projectObservation } from './telemetry-schema.js'

const prefix = 'langfuse.observation.metadata.dailylogger.'
const fields = ['kind', 'phase', 'traceId', 'observationId', 'at', 'runId', 'commandId', 'attemptId', 'parentId', 'node', 'operation', 'outcome', 'retryCount', 'durationMs', 'runState', 'workflowVersion'] as const
const resource = resourceFromAttributes({ 'service.name': 'dailylogger-exporter' })
const nativeContext = (input: SpanContext): SpanContext | undefined => /^[a-f0-9]{32}$/.test(input.traceId) && !/^0+$/.test(input.traceId) && /^[a-f0-9]{16}$/.test(input.spanId) && !/^0+$/.test(input.spanId)
  ? { traceId: input.traceId, spanId: input.spanId, traceFlags: 1 } : undefined
const time = (input: HrTime): HrTime | undefined => input.length === 2 && Number.isSafeInteger(input[0]) && input[0] >= 0 && input[0] <= 8.64e12 && Number.isInteger(input[1]) && input[1] >= 0 && input[1] < 1e9 ? [input[0], input[1]] : undefined

/** Final defense after SDK enrichment: rebuild EVERY public OTLP span surface. */
export function projectWireSpan(input: ReadableSpan): ReadableSpan | null {
  try {
    const candidate: Record<string, unknown> = {}
    for (const key of fields) {
      const value = input.attributes[prefix + key]
      if (typeof value === 'string' && value.length <= 128) candidate[key] = JSON.parse(value)
    }
    const metadata = projectObservation(candidate)
    const spanContext = nativeContext(input.spanContext())
    const parentSpanContext = input.parentSpanContext ? nativeContext(input.parentSpanContext) : undefined
    const startTime = time(input.startTime), endTime = time(input.endTime), duration = time(input.duration)
    if (!metadata || !spanContext || !startTime || !endTime || !duration || (input.parentSpanContext && !parentSpanContext)) return null
    const attributes: Attributes = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [prefix + key, JSON.stringify(value)]))
    attributes['langfuse.observation.type'] = metadata.phase === 'event' ? 'event' : 'span'
    attributes['langfuse.release'] = 's05b.1'
    const environment = input.attributes['langfuse.environment']
    if (environment !== 'production' && environment !== 'qualification') return null
    attributes['langfuse.environment'] = environment
    if (metadata.runId) attributes['langfuse.session.id'] = metadata.runId
    if (!parentSpanContext) attributes['langfuse.internal.is_app_root'] = true
    return {
      name: metadata.kind === 'node' ? `dailylogger.node.${metadata.node ?? 'unknown'}` : `dailylogger.${metadata.kind}`,
      kind: SpanKind.INTERNAL, spanContext: () => spanContext, parentSpanContext,
      startTime, endTime, duration, ended: true, attributes,
      status: { code: metadata.outcome === 'failed' ? SpanStatusCode.ERROR : SpanStatusCode.UNSET },
      events: [], links: [], resource, instrumentationScope: { name: 'langfuse-sdk', version: '6.1.1' },
      droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
    }
  } catch { return null }
}
