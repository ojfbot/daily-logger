import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { GraphInterrupt } from '@langchain/langgraph'
import { projectObservation, type Observation } from '../src/telemetry-schema.js'
import { beginObservation, createOfflineTelemetry, NOOP_SPAN, NOOP_TELEMETRY, observeAdmissionResponse, shutdownTelemetry, TELEMETRY_LIMITS, type ObservationSpan, type Telemetry } from '../src/telemetry.js'
import { observeNodeExecution } from '../src/workflow.js'

const CANARY = 'SECRET-canary-not-for-export'
function event() { return { kind: 'delivery', phase: 'event', traceId: randomUUID(), observationId: randomUUID(), at: Date.now(), outcome: 'inspection' } }

test('closed projection drops raw capture surfaces, unknown fields and unsafe known values', async () => {
  let getterCalls = 0, ignoredSinkCalls = 0
  const records: Readonly<Observation>[] = []
  const telemetry = createOfflineTelemetry([
    { export(batch) { assert.ok(Object.isFrozen(batch)); assert.ok(Object.isFrozen(batch[0])); (batch[0] as unknown as Record<string, unknown>).input = CANARY } },
    { export(batch) { records.push(...batch) } },
    { export() { ignoredSinkCalls++ } },
  ])
  const input = { ...event(), runId: randomUUID(), commandId: randomUUID(), attemptId: randomUUID(), node: CANARY, operation: CANARY, retryCount: Infinity,
    name: CANARY, input: CANARY, output: { nested: CANARY }, metadata: { nested: CANARY }, attributes: { secret: CANARY },
    events: [{ name: CANARY }], links: [{ attributes: { secret: CANARY } }], resource: { attributes: { host: CANARY } },
    error: new Error(CANARY), stack: CANARY, requestKey: CANARY, approvalDigest: CANARY, path: CANARY, baggage: CANARY }
  Object.defineProperty(input, 'durationMs', { get() { getterCalls++; throw new Error(CANARY) } })
  telemetry.emit(input)
  telemetry.emit({ ...event(), kind: CANARY })
  telemetry.emit({ ...event(), traceId: CANARY })
  await telemetry.shutdown()
  assert.equal(records.length, 1)
  assert.equal(getterCalls, 0)
  assert.equal(ignoredSinkCalls, 0)
  assert.equal(JSON.stringify([records, telemetry.diagnostics()]).includes(CANARY), false)
  assert.equal(telemetry.diagnostics().sinkFailures, 1)
  assert.equal(telemetry.diagnostics().ignoredSinks, 1)
  assert.equal(telemetry.diagnostics().invalid, 2)
  assert.deepEqual(Object.keys(records[0]).sort(), ['at', 'attemptId', 'commandId', 'instrumentationVersion', 'kind', 'observationId', 'outcome', 'phase', 'runId', 'schemaVersion', 'traceId'].sort())
  assert.equal(projectObservation(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(CANARY) } })), null)
})

test('async timeout quarantines one unresolved export; memory and secondary sinks stay bounded', async () => {
  let stuckCalls = 0
  const batches: readonly Readonly<Observation>[][] = []
  const captured: Readonly<Observation>[][] = batches as Readonly<Observation>[][]
  const telemetry = createOfflineTelemetry([
    { export() { stuckCalls++; return new Promise<void>(() => {}) } },
    { export(batch) { captured.push([...batch]) } },
  ])
  for (let index = 0; index < 1000; index++) telemetry.emit(event())
  assert.equal(stuckCalls, 0, 'No exporter callback runs on emit business path')
  assert.equal(telemetry.diagnostics().queued, TELEMETRY_LIMITS.queue)
  await telemetry.flush()
  for (let round = 0; round < 3; round++) { telemetry.emit(event()); await telemetry.flush() }
  assert.equal(stuckCalls, 1, 'Timeout must not create replacement unresolved exports')
  assert.equal(telemetry.diagnostics().sinkTimeouts, 1)
  assert.equal(telemetry.diagnostics().pendingExports, 1)
  assert.ok(telemetry.diagnostics().dropped >= 1000 - TELEMETRY_LIMITS.queue)
  for (const batch of batches) {
    assert.ok(batch.length <= TELEMETRY_LIMITS.batch)
    assert.ok(Buffer.byteLength(JSON.stringify(batch)) <= TELEMETRY_LIMITS.batchBytes)
    for (const record of batch) assert.ok(Buffer.byteLength(JSON.stringify(record)) <= TELEMETRY_LIMITS.recordBytes)
  }
  await telemetry.shutdown()
  assert.equal(telemetry.diagnostics().queued, 0)
})

test('throwing asynchronous export is sanitized and quarantined without changing observed work', async () => {
  let calls = 0
  const telemetry = createOfflineTelemetry([{ export: async () => { calls++; throw new Error(CANARY) } }])
  const observation = beginObservation(telemetry, 'delivery')
  const value = await observeNodeExecution(observation.child('node', { node: 'draft_fixture' }), async () => 'unchanged')
  observation.end('succeeded')
  await telemetry.flush()
  telemetry.emit(event())
  await telemetry.shutdown()
  assert.equal(value, 'unchanged')
  assert.equal(calls, 1)
  assert.equal(telemetry.diagnostics().sinkFailures, 1)
  assert.equal(JSON.stringify(telemetry.diagnostics()).includes(CANARY), false)
})

test('finite synchronous blocking is an overrun diagnostic, not a preemption guarantee', async () => {
  let calls = 0
  const telemetry = createOfflineTelemetry([{ export() {
    calls++
    const deadline = performance.now() + TELEMETRY_LIMITS.exportMs + 25
    while (performance.now() < deadline) { /* deliberate negative control for unsupported blocking sink */ }
  } }])
  telemetry.emit(event())
  assert.equal(calls, 0)
  const started = performance.now()
  await telemetry.flush()
  assert.ok(performance.now() - started >= TELEMETRY_LIMITS.exportMs)
  assert.equal(telemetry.diagnostics().sinkTimeouts, 1)
  assert.equal(telemetry.diagnostics().exported, 0)
  telemetry.emit(event()); await telemetry.shutdown()
  assert.equal(calls, 1)
})

test('post-commit adapter describes repeated responses and never invents admission or attempt creation', async () => {
  const records: Readonly<Observation>[] = []
  const telemetry = createOfflineTelemetry([{ export: batch => { records.push(...batch) } }])
  const commandId = randomUUID(), runId = randomUUID()
  const response = { status: 202, body: JSON.stringify({ admission: 'admitted', commandId, runId, secret: CANARY }) }
  observeAdmissionResponse(telemetry, response)
  observeAdmissionResponse(telemetry, response)
  observeAdmissionResponse(telemetry, { status: 409, body: JSON.stringify({ error: 'idempotency_conflict', commandId }) })
  observeAdmissionResponse(telemetry, { status: 409, body: JSON.stringify({ admission: 'rejected', commandId: randomUUID(), runId: null, error: CANARY }) })
  observeAdmissionResponse(telemetry, { status: 202, body: CANARY })
  await telemetry.shutdown()
  assert.deepEqual(records.map(record => record.outcome), ['admitted_response', 'admitted_response', 'idempotency_conflict_response', 'rejected_response'])
  assert.ok(records.every(record => record.kind === 'admission_response_observed' && record.phase === 'event' && !record.attemptId && record.durationMs === undefined))
  assert.equal(records[2].commandId, commandId)
  assert.equal(records[2].runId, undefined)
  assert.equal(JSON.stringify(records).includes(CANARY), false)
  const broken = { ...NOOP_TELEMETRY, emit() { throw new Error(CANARY) } }
  assert.doesNotThrow(() => observeAdmissionResponse(broken, response))
})

test('node observer preserves null, throwing-name errors and recognized interrupt object identity', async () => {
  const outcomes: string[] = []
  const observation: ObservationSpan = { ...NOOP_SPAN, end: outcome => { outcomes.push(outcome) } }
  const getterError = Object.defineProperty({}, 'name', { get() { throw new Error(CANARY) } })
  const interruption = new GraphInterrupt([{ value: { secret: CANARY } }])
  for (const original of [null, getterError, interruption]) {
    await observeNodeExecution(observation, async () => { throw original }).then(() => assert.fail('Expected the original thrown value'), thrown => assert.equal(thrown, original))
  }
  assert.deepEqual(outcomes, ['failed', 'failed', 'paused'])
  const broken = { ...NOOP_SPAN, end() { throw new Error(CANARY) } }
  assert.equal(await observeNodeExecution(broken, async () => 42), 42)
})

test('shutdown bounds a stuck asynchronous adapter within its own optional allowance', async () => {
  const broken = { ...NOOP_TELEMETRY, shutdown: () => new Promise<Readonly<ReturnType<Telemetry['diagnostics']>>>(() => {}) }
  const started = performance.now()
  await shutdownTelemetry(broken)
  assert.ok(performance.now() - started < TELEMETRY_LIMITS.flushMs + 1000)
  assert.deepEqual(NOOP_TELEMETRY.diagnostics(), await NOOP_TELEMETRY.shutdown())
})

test('unexpected async void hook rejections are consumed without awaiting business execution', async () => {
  const reject = async () => { throw new Error(CANARY) }
  const broken = { ...NOOP_TELEMETRY, emit: reject, begin: () => ({ ...NOOP_SPAN, bind: reject, event: reject, end: reject }) }
  const observation = beginObservation(broken, 'delivery')
  observation.bind({ runId: randomUUID() })
  observation.event('reconciliation', 'inspection')
  assert.equal(await observeNodeExecution(observation, async () => 42), 42)
  observeAdmissionResponse(broken, { status: 202, body: JSON.stringify({ admission: 'admitted', commandId: randomUUID(), runId: randomUUID() }) })
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
})
