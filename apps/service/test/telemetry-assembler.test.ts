import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createSegmentAssembler, type CompletedObservation } from '../src/telemetry-langfuse.js'
import { projectExportConfig, readExportFile } from '../src/telemetry-export-config.js'
import { createLangfuseTelemetry } from '../src/telemetry-export-process.js'
import { NOOP_TELEMETRY } from '../src/telemetry.js'

test('default and malformed enablement are no-op; config projects only explicit private HTTPS references', () => {
  const valid = { mode: 'langfuse', endpoint: 'https://receiver.fixture.invalid/api/public/otel/v1/traces', publicKeyFile: '/synthetic/public', secretKeyFile: '/synthetic/secret', caFile: '/synthetic/root', environment: 'qualification' }
  assert.equal(createLangfuseTelemetry(), NOOP_TELEMETRY)
  assert.deepEqual(projectExportConfig({ ...valid, secret: 'CANARY' }), valid)
  for (const endpoint of ['http://localhost/api/public/otel/v1/traces', valid.endpoint + '?secret=CANARY', 'https://user:CANARY@receiver.fixture.invalid/api/public/otel/v1/traces']) assert.equal(createLangfuseTelemetry({ ...valid, endpoint }), NOOP_TELEMETRY)
  assert.equal(projectExportConfig({ ...valid, secretKeyFile: 'relative' }), null)
  assert.throws(() => readExportFile('/nonexistent-synthetic-fixture', true))
})

test('complete pairs preserve parentage, late IDs and monotonic timing; malformed/incomplete records never fabricate ends', () => {
  const output: readonly CompletedObservation[][] = []
  const captured = output as CompletedObservation[][]
  const assembler = createSegmentAssembler(records => captured.push([...records]))
  const traceId = randomUUID(), root = randomUUID(), child = randomUUID(), runId = randomUUID()
  const base = { traceId, kind: 'delivery', observationId: root, at: 1000 }
  assembler.accept([{ ...base, phase: 'start' }, { ...base, kind: 'node', parentId: root, observationId: child, phase: 'start', at: 1020 }])
  assert.equal(output.length, 0)
  assembler.accept([{ ...base, kind: 'node', parentId: root, observationId: child, phase: 'end', at: 900, durationMs: 10, outcome: 'paused' }, { ...base, phase: 'end', at: 850, durationMs: 40, runId, outcome: 'returned' }])
  assert.equal(output.length, 1)
  assert.deepEqual(output[0].map(value => [value.data.observationId, value.start, value.end]), [[root, 1000, 1040], [child, 1020, 1030]])
  assert.equal(output[0][0].data.runId, runId)
  assert.equal(output[0][1].data.outcome, 'paused')
  assembler.accept([{ ...base, phase: 'end' }])
  assert.equal(output.length, 1)
  assert.equal(assembler.diagnostics().records, 0)
})

test('assembler bounds records/segments and expires unfinished SDK-free state', () => {
  let clock = 0, emitted = 0
  const assembler = createSegmentAssembler(() => { emitted++ }, () => clock)
  for (let i = 0; i < 1000; i++) assembler.accept([{ kind: 'delivery', phase: 'start', traceId: randomUUID(), observationId: randomUUID(), at: 0 }])
  assert.equal(assembler.diagnostics().segments, 16)
  assert.equal(assembler.diagnostics().dropped, 984)
  clock = 60_000; assembler.expire()
  assert.equal(assembler.diagnostics().records, 0)
  const traceId = randomUUID()
  for (let i = 0; i < 1000; i++) assembler.accept([{ kind: 'node', phase: 'start', parentId: randomUUID(), traceId, observationId: randomUUID(), at: 0 }])
  assert.equal(assembler.diagnostics().records, 128)
  assembler.clear(); assert.equal(assembler.diagnostics().records, 0); assert.equal(emitted, 0)
})
