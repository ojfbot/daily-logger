import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { fork, type ChildProcess, type ForkOptions } from 'node:child_process'
import { chmodSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { createLangfuseTelemetry, createProcessSink } from '../src/telemetry-export-process.js'
import { projectObservation } from '../src/telemetry-schema.js'
import { tlsFixture, until } from './fixtures/telemetry-tls.js'

let fixture: ReturnType<typeof tlsFixture>
before(() => { fixture = tlsFixture() })
after(() => fixture.remove())
const CANARY = 'PRIVATE-CONTENT-CREDENTIAL-COOKIE-PATH-CANARY'
const event = () => ({ kind: 'admission_response_observed', phase: 'event', traceId: randomUUID(), observationId: randomUUID(), at: Date.now(), outcome: 'admitted_response', runId: randomUUID(), commandId: randomUUID() })

test('real isolated SDK exports closed metadata, native ancestry, run grouping and no ambient canaries', async () => {
  const wires: { body: Buffer; headers: Record<string, unknown> }[] = []
  const server = await fixture.receiver((req, res) => { const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { wires.push({ body: Buffer.concat(chunks), headers: req.headers }); res.end('{}') }) })
  const ambient = ['LANGFUSE_SECRET_KEY', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_DEBUG', 'OTEL_RESOURCE_ATTRIBUTES', 'OTEL_SERVICE_NAME', 'OTEL_EXPORTER_OTLP_HEADERS', 'HTTP_PROXY', 'HTTPS_PROXY', 'GITHUB_TOKEN', 'DATABASE_URL', 'NODE_OPTIONS']
  const prior = Object.fromEntries(ambient.map(key => [key, process.env[key]]))
  for (const key of ambient) process.env[key] = CANARY
  const telemetry = createLangfuseTelemetry(server.config)
  for (const key of ambient) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key] }
  try {
    await until(() => telemetry.exporterDiagnostics!().ready)
    const input = { ...event(), input: CANARY, output: CANARY, resource: { secret: CANARY }, attributes: { secret: CANARY }, events: [CANARY], links: [CANARY], stack: CANARY, error: new Error(CANARY), name: CANARY, baggage: CANARY, requestKey: CANARY }
    telemetry.emit(input)
    const runId = randomUUID(), commandId = randomUUID(), attemptId = randomUUID()
    const root = telemetry.begin('delivery')
    root.bind({ runId, commandId, operation: 'start' })
    const operation = root.child('operation', { attemptId })
    const node = operation.child('node', { node: 'human_gate' })
    node.end('paused'); operation.end('awaiting_approval'); root.end('returned')
    await telemetry.flush()
    await until(() => wires.flatMap(wire => JSON.parse(wire.body.toString()).resourceSpans.flatMap((resource: any) => resource.scopeSpans.flatMap((scope: any) => scope.spans))).length === 4)
    const wireText = wires.map(wire => wire.body.toString()).join('\n')
    assert.equal(wireText.includes(CANARY), false)
    assert.equal(wireText.includes('sk-SYNTHETIC-SECRET-CANARY'), false)
    assert.equal(wireText.includes(fixture.file('')), false)
    const spans: any[] = []
    const keys = new Set(['schemaVersion', 'instrumentationVersion', 'kind', 'phase', 'traceId', 'observationId', 'at', 'runId', 'commandId', 'attemptId', 'parentId', 'node', 'operation', 'outcome', 'retryCount', 'durationMs', 'runState', 'workflowVersion'].map(key => `langfuse.observation.metadata.dailylogger.${key}`))
    for (const wire of wires) {
      assert.ok(wire.body.byteLength <= 65536)
      assert.equal(wire.headers.authorization, `Basic ${Buffer.from('pk-synthetic-qualification:sk-SYNTHETIC-SECRET-CANARY').toString('base64')}`)
      for (const resource of JSON.parse(wire.body.toString()).resourceSpans) {
        assert.deepEqual(resource.resource.attributes, [{ key: 'service.name', value: { stringValue: 'dailylogger-exporter' } }])
        for (const scope of resource.scopeSpans) {
          assert.equal(scope.scope.name, 'langfuse-sdk')
          assert.equal(scope.scope.attributes?.length ?? 0, 0)
          for (const span of scope.spans) {
            spans.push(span)
            assert.match(span.traceId, /^[a-f0-9]{32}$/); assert.match(span.spanId, /^[a-f0-9]{16}$/)
            assert.equal(span.events?.length ?? 0, 0); assert.equal(span.links?.length ?? 0, 0); assert.equal(span.status?.message ?? '', '')
            for (const attribute of span.attributes) assert.ok(keys.has(attribute.key) || ['langfuse.observation.type', 'langfuse.session.id', 'langfuse.environment', 'langfuse.release', 'langfuse.internal.is_app_root'].includes(attribute.key), `Unexpected wire attribute ${attribute.key}`)
          }
        }
      }
    }
    const metadata = (span: any, field: string) => { const value = span.attributes.find((attribute: any) => attribute.key === `langfuse.observation.metadata.dailylogger.${field}`)?.value.stringValue; return value === undefined ? undefined : JSON.parse(value) }
    const delivery = spans.find(span => span.name === 'dailylogger.delivery'), operationSpan = spans.find(span => span.name === 'dailylogger.operation'), nodeSpan = spans.find(span => span.name === 'dailylogger.node.human_gate')
    const admission = spans.find(span => span.name === 'dailylogger.admission_response_observed')
    assert.equal(metadata(admission, 'traceId'), input.traceId)
    assert.equal(metadata(admission, 'observationId'), input.observationId)
    assert.equal(metadata(admission, 'runId'), input.runId)
    assert.equal(metadata(admission, 'commandId'), input.commandId)
    assert.equal(operationSpan.parentSpanId, delivery.spanId); assert.equal(nodeSpan.parentSpanId, operationSpan.spanId)
    assert.equal(new Set([delivery.traceId, operationSpan.traceId, nodeSpan.traceId]).size, 1)
    assert.equal(metadata(operationSpan, 'attemptId'), attemptId)
    assert.equal(metadata(delivery, 'attemptId'), undefined)
    assert.equal(metadata(nodeSpan, 'outcome'), 'paused')
    assert.equal(metadata(operationSpan, 'parentId'), metadata(delivery, 'observationId'))
    assert.equal(metadata(nodeSpan, 'parentId'), metadata(operationSpan, 'observationId'))
    for (const span of [delivery, operationSpan, nodeSpan]) {
      assert.equal(span.attributes.find((attribute: any) => attribute.key === 'langfuse.session.id')?.value.stringValue, runId)
      assert.equal(metadata(span, 'commandId'), commandId)
      assert.match(metadata(span, 'traceId'), /^[a-f0-9-]{36}$/)
      assert.match(metadata(span, 'observationId'), /^[a-f0-9-]{36}$/)
    }
  } finally { await telemetry.shutdown(); await server.close() }
})

test('invalid secret permissions fail open, and shutdown is bounded with a live blackhole', async () => {
  const server = await fixture.receiver(() => {})
  const badSecret = fixture.file('world-readable-key')
  writeFileSync(badSecret, 'SYNTHETIC', { mode: 0o600 }); chmodSync(badSecret, 0o644)
  const invalid = createLangfuseTelemetry({ ...server.config, secretKeyFile: badSecret })
  try { await until(() => invalid.exporterDiagnostics!().closed); assert.ok(invalid.exporterDiagnostics!().failures > 0) }
  finally { await invalid.shutdown() }
  const telemetry = createLangfuseTelemetry(server.config)
  try {
    await until(() => telemetry.exporterDiagnostics!().ready)
    telemetry.emit(event()); await telemetry.flush(); await until(() => server.sockets.size > 0)
    const start = performance.now(); await telemetry.shutdown()
    assert.ok(performance.now() - start < 350)
    await until(() => server.sockets.size === 0)
    assert.equal(telemetry.exporterDiagnostics!().closed, true)
  } finally { await telemetry.shutdown(); await server.close() }
})

test('owned child kill, bounded unacknowledged IPC and constrained spawn environment', async () => {
  const server = await fixture.receiver((_req, res) => res.end('{}'))
  let child: ChildProcess | undefined, options: ForkOptions | undefined
  const processSink = createProcessSink(server.config, (path, args, supplied) => { options = supplied; child = fork(path, args, supplied); return child })
  try {
    await until(() => processSink.diagnostics().ready)
    assert.deepEqual(options!.env, { LANG: 'C', TZ: 'UTC' })
    assert.deepEqual(options!.stdio, ['ignore', 'ignore', 'ignore', 'ipc'])
    assert.equal(options!.execArgv!.includes('--max-old-space-size=96'), true)
    child!.kill('SIGSTOP') // Real unresponsive owned child, no SDK fault injection API.
    const batch = [projectObservation(event())!]
    const blocked = Promise.resolve(processSink.sink.export(batch)).catch(() => {})
    for (let i = 0; i < 100; i++) processSink.sink.export(batch)
    assert.equal(processSink.diagnostics().pending, 1)
    assert.equal(processSink.diagnostics().dropped, 100)
    await blocked
    await until(() => child!.signalCode !== null)
    assert.equal(child!.signalCode, 'SIGKILL')
    assert.equal(processSink.diagnostics().closed, true)
    assert.equal(processSink.diagnostics().kills, 1)
  } finally { processSink.stop(); await server.close() }
})

test('failed remote export becomes a fixed child failure with no retries or respawn', async () => {
  let requests = 0
  const server = await fixture.receiver((_req, res) => { requests++; res.writeHead(401); res.end(CANARY) })
  const telemetry = createLangfuseTelemetry(server.config)
  try {
    await until(() => telemetry.exporterDiagnostics!().ready)
    telemetry.emit(event()); await telemetry.flush()
    await until(() => telemetry.exporterDiagnostics!().closed, 2500)
    telemetry.emit(event()); await telemetry.flush()
    assert.equal(requests, 1)
    assert.equal(telemetry.exporterDiagnostics!().failures, 1)
    assert.equal(JSON.stringify(telemetry.exporterDiagnostics!()).includes(CANARY), false)
  } finally { await telemetry.shutdown(); await server.close() }
})

test('SDK thread CPU hang cannot block the supervisor watchdog or orphan after owner death', async () => {
  const directory = fixture.file('stuck-sdk'); mkdirSync(directory)
  const childPath = directory + '/telemetry-export-child.mjs'
  copyFileSync(fileURLToPath(new URL('../dist/telemetry/telemetry-export-child.mjs', import.meta.url)), childPath)
  writeFileSync(directory + '/telemetry-export-worker.mjs', `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({type:'ready'}); parentPort.on('message', () => { while (true) {} });`)
  const server = await fixture.receiver((_req, res) => res.end('{}'))
  let child: ChildProcess | undefined
  const sink = createProcessSink(server.config, (_path, args, options) => { child = fork(childPath, args, options); return child })
  try {
    await until(() => sink.diagnostics().ready)
    const started = performance.now()
    await Promise.resolve(sink.sink.export([projectObservation(event())!])).catch(() => {})
    await until(() => child!.exitCode !== null || child!.signalCode !== null)
    assert.ok(performance.now() - started < 500)
    assert.equal(sink.diagnostics().closed, true)
  } finally { sink.stop(); await server.close() }

  // Serialization is scheduled after accept/ACK. It needs an independent
  // heartbeat watchdog; the per-batch ACK timer has already been cleared.
  writeFileSync(directory + '/telemetry-export-worker.mjs', `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({type:'ready'}); parentPort.on('message', input => { parentPort.postMessage({type:'ack',sequence:input.sequence}); setImmediate(() => { while (true) {} }); });`)
  let afterAckChild: ChildProcess | undefined
  const afterAck = createProcessSink(server.config, (_path, args, options) => { afterAckChild = fork(childPath, args, options); return afterAckChild })
  try {
    await until(() => afterAck.diagnostics().ready)
    await afterAck.sink.export([projectObservation(event())!])
    assert.equal(afterAck.diagnostics().acknowledged, 1)
    await until(() => afterAckChild!.exitCode !== null || afterAckChild!.signalCode !== null, 2000)
    assert.equal(afterAck.diagnostics().closed, true)
  } finally { afterAck.stop() }

  writeFileSync(directory + '/telemetry-export-worker.mjs', `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({type:'ready'}); setImmediate(() => { while (true) {} });`)
  const owner = fork(fileURLToPath(new URL('./fixtures/telemetry-owner.ts', import.meta.url)), [], { execArgv: ['--import', import.meta.resolve('tsx')], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  let orphanPid: number | undefined
  const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
  try {
    const received = once(owner, 'message')
    owner.send({ config: server.config, childPath })
    const [message] = await Promise.race([received, new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error('owner_deadline')), 4000); timer.unref() })])
    assert.equal(message.type, 'ready'); orphanPid = message.pid; assert.ok(orphanPid)
    const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited
    await until(() => !alive(orphanPid!), 2000)
  } finally { owner.kill('SIGKILL'); if (orphanPid && alive(orphanPid)) process.kill(orphanPid, 'SIGKILL') }
})
