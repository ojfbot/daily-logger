import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { trace, type Attributes, type Context, type Span, type SpanContext, type SpanStatus, type Tracer } from '@opentelemetry/api'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { readFixture } from '../src/fixture.js'
import { createLangSmithOtelSink } from '../src/langsmith-otel.js'
import { initializeRun } from '../src/storage.js'
import { beginObservation, createOfflineTelemetry } from '../src/telemetry.js'
import { createWorkflow } from '../src/workflow.js'

type CapturedSpan = {
  name: string
  options: unknown
  parent?: Context
  attributes: Record<string, unknown>
  status?: SpanStatus
  endedAt?: unknown
  span: Span
}

function capturedTracer(): { tracer: Tracer; spans: CapturedSpan[] } {
  const spans: CapturedSpan[] = []
  const tracer = {
    startSpan(name: string, options?: unknown, parent?: Context): Span {
      const attributes: Record<string, unknown> = {}
      const captured = { name, options, parent, attributes } as CapturedSpan
      const index = spans.length + 1
      const span = {
        setAttribute(key: string, value: unknown) { attributes[key] = value; return span },
        setAttributes(values: Attributes) { Object.assign(attributes, values); return span },
        setStatus(status: SpanStatus) { captured.status = status; return span },
        end(time?: unknown) { captured.endedAt = time },
        spanContext(): SpanContext { return { traceId: index.toString(16).padStart(32, '0'), spanId: index.toString(16).padStart(16, '0'), traceFlags: 1 } },
        isRecording() { return true },
        updateName() { return span },
        addEvent() { return span },
        recordException() { return undefined },
      } as unknown as Span
      captured.span = span
      spans.push(captured)
      return span
    },
  } as unknown as Tracer
  return { tracer, spans }
}

test('LangSmith OTel mapper preserves fixture hierarchy and groups restart segments into one run thread', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dailylogger-langsmith-otel-'))
  const directory = join(root, 'run')
  const { tracer, spans } = capturedTracer()
  const mapper = createLangSmithOtelSink(tracer)
  const telemetry = createOfflineTelemetry([mapper])
  const runId = randomUUID()
  try {
    const fixture = readFixture()
    initializeRun(directory, fixture)
    const checkpointer = SqliteSaver.fromConnString(join(directory, 'checkpoints.sqlite'))
    try {
      const startObservation = beginObservation(telemetry, 'delivery', { runId, workflowVersion: fixture.manifest.workflowVersion })
      const startWorkflow = createWorkflow(directory, fixture, { checkpointer, threadId: fixture.manifestDigest, nodeObservation: node => startObservation.child('node', { node }) })
      await startWorkflow.start()
      startObservation.end('paused')

      const resumeObservation = beginObservation(telemetry, 'delivery', { runId, workflowVersion: fixture.manifest.workflowVersion })
      const resumeWorkflow = createWorkflow(directory, fixture, { checkpointer, threadId: fixture.manifestDigest, nodeObservation: node => resumeObservation.child('node', { node }) })
      await resumeWorkflow.resume(resumeWorkflow.expectedApproval)
      const snapshot = await resumeWorkflow.snapshot()
      resumeWorkflow.validate(snapshot.values)
      resumeObservation.end('succeeded')
    } finally { checkpointer.db.close() }
    await telemetry.shutdown()

    assert.equal(mapper.diagnostics().openSpans, 0)
    assert.equal(mapper.diagnostics().missingParents, 0)
    assert.equal(mapper.diagnostics().missingStarts, 0)
    assert.equal(mapper.diagnostics().duplicateStarts, 0)
    assert.equal(spans.filter(span => span.name === 'dailylogger.delivery').length, 2)
    assert.ok(spans.some(span => span.name === 'dailylogger.node'))
    assert.ok(spans.every(span => span.attributes['langsmith.trace.session_id'] === runId))
    assert.ok(spans.every(span => span.attributes['langsmith.span.kind'] === 'chain'))
    assert.ok(spans.every(span => !('langsmith.span.id' in span.attributes) && !('langsmith.span.parent_id' in span.attributes)))
    const node = spans.find(span => span.name === 'dailylogger.node')!
    assert.ok(node.parent)
    assert.equal(trace.getSpan(node.parent!), spans.find(span => span.name === 'dailylogger.delivery')!.span)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('LangSmith OTel mapper ignores undeclared fields and represents a missing parent as a visible gap', () => {
  const { tracer, spans } = capturedTracer()
  const mapper = createLangSmithOtelSink(tracer)
  const canary = 'SECRET-not-for-LangSmith'
  mapper.export([{
    schemaVersion: 1,
    instrumentationVersion: 's05a-offline-v1',
    kind: 'delivery',
    phase: 'event',
    traceId: randomUUID(),
    observationId: randomUUID(),
    at: Date.now(),
    runId: randomUUID(),
    unexpected: canary,
  } as unknown as import('../src/telemetry-schema.js').Observation])
  mapper.export([{
    schemaVersion: 1,
    instrumentationVersion: 's05a-offline-v1',
    kind: 'node',
    phase: 'event',
    traceId: randomUUID(),
    observationId: randomUUID(),
    parentId: randomUUID(),
    at: Date.now(),
  }])
  assert.equal(spans.length, 1)
  assert.equal(JSON.stringify(spans).includes(canary), false)
  assert.equal(mapper.diagnostics().missingParents, 1)
})
