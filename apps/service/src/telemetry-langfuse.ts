import { context, ROOT_CONTEXT, SpanStatusCode, type SpanContext } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { setLangfuseTracerProvider, startObservation, type LangfuseSpan } from '@langfuse/tracing'
import { projectObservation, type Observation } from './telemetry-schema.js'
import { EXPORT_LIMITS, readExportFile, type ExportConfig } from './telemetry-export-config.js'
import { createHttpsTransport, createQueuedExporter } from './telemetry-transport.js'

interface Pair { start?: Readonly<Observation>; end?: Readonly<Observation>; event?: Readonly<Observation> }
interface Segment { born: number; count: number; pairs: Map<string, Pair> }
export interface CompletedObservation { data: Readonly<Observation>; start: number; end: number }

/** No SDK object exists until a whole, structurally valid segment has completed. */
export function createSegmentAssembler(emit: (records: readonly CompletedObservation[]) => void, now: () => number = () => performance.now()) {
  const segments = new Map<string, Segment>()
  let records = 0, dropped = 0
  const remove = (id: string, discarded: boolean) => {
    const segment = segments.get(id)
    if (segment) { records -= segment.count; if (discarded) dropped += segment.count; segments.delete(id) }
  }
  const expire = () => { for (const [id, segment] of segments) if (now() - segment.born >= EXPORT_LIMITS.segmentMs) remove(id, true) }
  const finish = (id: string, segment: Segment) => {
    const completed: CompletedObservation[] = []
    const pending = new Map(segment.pairs)
    const seen = new Set<string>()
    let roots = 0
    while (pending.size) {
      let progress = false
      for (const [observationId, pair] of pending) {
        const end = pair.event ?? pair.end, start = pair.event ?? pair.start
        if (!start || !end || start.kind !== end.kind || start.parentId !== end.parentId || (!pair.event && (start.phase !== 'start' || end.phase !== 'end'))) { remove(id, true); return }
        if (start.parentId && !seen.has(start.parentId)) continue
        if (!start.parentId && ++roots !== 1) { remove(id, true); return }
        // Wall-clock jumps cannot create negative durations. Keep observed at and
        // monotonic duration in metadata; display interval uses start + duration.
        const duration = pair.event ? 0 : end.durationMs ?? Math.min(86_400_000, Math.max(0, end.at - start.at))
        const data = Object.freeze({ ...start, ...end })
        completed.push({ data, start: start.at, end: Math.min(8.64e15, start.at + duration) })
        pending.delete(observationId); seen.add(observationId); progress = true
      }
      if (!progress) { remove(id, true); return } // Orphan/cycle: do not invent a root.
    }
    remove(id, false)
    emit(completed)
  }
  return {
    accept(batch: readonly unknown[]) {
      expire()
      for (const input of batch) {
        const value = projectObservation(input)
        if (!value || Buffer.byteLength(JSON.stringify(value)) > 1024) { dropped++; continue }
        if (value.phase === 'event' && !value.parentId) { emit([{ data: value, start: value.at, end: value.at }]); continue }
        let segment = segments.get(value.traceId)
        if (records >= EXPORT_LIMITS.records || (!segment && segments.size >= EXPORT_LIMITS.segments)) { dropped++; continue }
        if (!segment) { segment = { born: now(), count: 0, pairs: new Map() }; segments.set(value.traceId, segment) }
        const pair = segment.pairs.get(value.observationId) ?? {}
        if (pair[value.phase] || (value.phase === 'event' && (pair.start || pair.end)) || (value.phase !== 'event' && pair.event)) { remove(value.traceId, true); dropped++; continue }
        pair[value.phase] = value; segment.pairs.set(value.observationId, pair); records++; segment.count++
        if (value.phase === 'end' && !value.parentId) finish(value.traceId, segment)
      }
    },
    expire,
    clear() { for (const id of segments.keys()) remove(id, true) },
    diagnostics: () => ({ records, segments: segments.size, dropped }),
  }
}

/** Only the dedicated exporter worker imports or creates the real SDK. */
export function createLangfuseWriter(config: Readonly<ExportConfig>) {
  const publicKey = readExportFile(config.publicKeyFile, true)
  const secretKey = readExportFile(config.secretKeyFile, true)
  if (publicKey.includes(':')) throw new Error('export_key')
  const transport = createHttpsTransport({ endpoint: config.endpoint, ca: readExportFile(config.caFile, false), authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}` })
  const exporter = createQueuedExporter(transport)
  const processor = new LangfuseSpanProcessor({
    publicKey, secretKey, baseUrl: new URL(config.endpoint).origin,
    exporter, exportMode: 'immediate', mediaUploadEnabled: false,
    environment: config.environment, release: 's05b.1',
    shouldExportSpan: ({ otelSpan }) => otelSpan.name.startsWith('dailylogger.'),
  })
  const provider = new BasicTracerProvider({ resource: resourceFromAttributes({ 'service.name': 'dailylogger-exporter' }), spanProcessors: [processor], spanLimits: { attributeCountLimit: 40, attributeValueLengthLimit: 128, eventCountLimit: 0, linkCountLimit: 0 } })
  setLangfuseTracerProvider(provider)
  const assembler = createSegmentAssembler(records => context.with(ROOT_CONTEXT, () => {
    const parents = new Map<string, SpanContext>()
    const created: { span: LangfuseSpan; record: CompletedObservation }[] = []
    try {
      for (const record of records) {
        const { data } = record
        const metadata = Object.fromEntries(Object.entries(data).map(([key, value]) => [`dailylogger.${key}`, value]))
        const name = data.kind === 'node' ? `dailylogger.node.${data.node ?? 'unknown'}` : `dailylogger.${data.kind}`
        // Manual spans never wrap business functions or capture thrown objects.
        const span = startObservation(name, { metadata }, { asType: 'span', startTime: new Date(record.start), ...(data.parentId ? { parentSpanContext: parents.get(data.parentId) } : {}) })
        if (data.runId) span.otelSpan.setAttribute('langfuse.session.id', data.runId)
        if (data.outcome === 'failed') span.otelSpan.setStatus({ code: SpanStatusCode.ERROR })
        parents.set(data.observationId, span.otelSpan.spanContext()); created.push({ span, record })
      }
    } finally {
      for (const { span, record } of created.reverse()) span.end(new Date(record.end))
    }
  }))
  return {
    accept: assembler.accept,
    expire: assembler.expire,
    diagnostics: () => ({ ...assembler.diagnostics(), ...exporter.diagnostics() }),
    async shutdown() { assembler.clear(); await exporter.shutdown(); await provider.shutdown() },
  }
}
