import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { ExportResultCode } from '@opentelemetry/core'
import type { ExportResponse, IExporterTransport } from '@opentelemetry/otlp-exporter-base'
import { projectWireSpan } from '../src/telemetry-wire.js'
import { createQueuedExporter, createHttpsTransport } from '../src/telemetry-transport.js'
import { tlsFixture } from './fixtures/telemetry-tls.js'

const CANARY = 'NEVER-IN-WIRE-CONTENT-SECRET-PATH-CANARY'
function enrichedSpan(): ReadableSpan {
  const data = { kind: 'admission_response_observed', phase: 'event', at: 1_700_000_000_000, traceId: randomUUID(), observationId: randomUUID(), runId: randomUUID(), commandId: randomUUID(), outcome: 'admitted_response' }
  return {
    name: CANARY, kind: 2,
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1, traceState: { serialize: () => CANARY } }),
    startTime: [1_700_000_000, 0], endTime: [1_700_000_000, 0], duration: [0, 0], ended: true,
    attributes: { ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`langfuse.observation.metadata.dailylogger.${key}`, JSON.stringify(value)])),
      'langfuse.environment': 'qualification', 'langfuse.release': CANARY, 'langfuse.session.id': CANARY,
      'langfuse.observation.input': CANARY, 'langfuse.observation.output': CANARY, 'langfuse.trace.metadata': CANARY,
      'langfuse.observation.metadata.unrecognized': CANARY, 'host.name': CANARY, baggage: CANARY },
    resource: { attributes: { host: CANARY, secret: CANARY } }, instrumentationScope: { name: CANARY, version: CANARY, attributes: { secret: CANARY } },
    status: { code: 2, message: CANARY }, links: [{ secret: CANARY }], events: [{ secret: CANARY }],
    droppedAttributesCount: 1, droppedEventsCount: 1, droppedLinksCount: 1,
  } as unknown as ReadableSpan
}

test('wire projector reconstructs every SDK-enriched surface and strips trace state', () => {
  const original = enrichedSpan(), projected = projectWireSpan(original)!
  assert.ok(projected)
  assert.equal(JSON.stringify([projected, projected.spanContext()]).includes(CANARY), false)
  assert.equal(projected.spanContext().traceState, undefined)
  assert.equal(projected.name, 'dailylogger.admission_response_observed')
  assert.equal(projected.attributes['langfuse.observation.type'], 'event')
  assert.equal(projected.status.code, 0)
  assert.equal(original.name, CANARY, 'Projector must not mutate the SDK or another consumer')
  assert.equal(projectWireSpan({ ...original, attributes: { ...original.attributes, 'langfuse.environment': CANARY } }), null)
})

test('actual official serializer sees only projected spans and bounded queue; shutdown releases all callbacks', async () => {
  let requests = 0, body: Uint8Array | undefined, finish: ((result: ExportResponse) => void) | undefined
  const transport: IExporterTransport = {
    send(data) { requests++; body = data; return new Promise(resolve => { finish = resolve }) },
    shutdown() { finish?.({ status: 'failure', error: new Error('synthetic_shutdown') }) },
  }
  const exporter = createQueuedExporter(transport)
  let callbacks = 0
  const span = enrichedSpan()
  for (let i = 0; i < 1000; i++) exporter.export([span], result => { callbacks++; assert.equal(result.code, ExportResultCode.FAILED) })
  assert.equal(exporter.diagnostics().queued, 128)
  assert.equal(exporter.diagnostics().dropped, 872)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests, 1); assert.equal(exporter.diagnostics().inFlight, 1)
  assert.equal(exporter.diagnostics().queued, 112)
  assert.equal(Buffer.from(body!).toString().includes(CANARY), false)
  const wire = JSON.parse(Buffer.from(body!).toString())
  assert.equal(wire.resourceSpans[0].scopeSpans[0].spans.length, 16)
  await exporter.shutdown()
  assert.equal(callbacks, 1000); assert.equal(exporter.diagnostics().queued, 0); assert.equal(exporter.diagnostics().inFlight, 0)
})

test('official serialized request fits exact cap and fails cap-minus-one before network', async () => {
  const fixture = tlsFixture(), span = enrichedSpan()
  const received: Buffer[] = []
  const server = await fixture.receiver((req, res) => { const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { received.push(Buffer.concat(chunks)); res.end('{}') }) })
  let serialized: Uint8Array | undefined
  const measuring = createQueuedExporter({ send: async data => { serialized = data; return { status: 'success' } }, shutdown() {} })
  const once = (exporter: ReturnType<typeof createQueuedExporter>) => new Promise<number>(resolve => exporter.export([span], result => resolve(result.code)))
  try {
    assert.equal(await once(measuring), ExportResultCode.SUCCESS)
    assert.ok(serialized && serialized.byteLength > 1000 && serialized.byteLength <= 65536)
    for (const maxBytes of [serialized.byteLength, serialized.byteLength - 1]) {
      const transport = createHttpsTransport({ endpoint: server.endpoint, ca: fixture.ca, authorization: 'Basic SYNTHETIC', maxBytes })
      const exporter = createQueuedExporter(transport)
      try { assert.equal(await once(exporter), maxBytes === serialized.byteLength ? ExportResultCode.SUCCESS : ExportResultCode.FAILED) }
      finally { await exporter.shutdown() }
    }
    assert.equal(received.length, 1)
    assert.deepEqual(received[0], Buffer.from(serialized))
  } finally { await measuring.shutdown(); await server.close(); fixture.remove() }
})
