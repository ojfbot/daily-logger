import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { ACTIONS_PATH, ARTICLE_PATH, REPO_ROOT, readFixture } from '../../src/fixture.js'
import { admitCommand, admitCommandInTransaction, runStatus, type CommandRequest } from '../../src/delivery-commands.js'
import { migrateDelivery, QUEUE, startDelivery } from '../../src/delivery-db.js'
import { runOperation } from '../../src/postgres-runner.js'
import { beginObservation, createOfflineTelemetry, observeAdmissionResponse } from '../../src/telemetry.js'
import type { Observation } from '../../src/telemetry-schema.js'
import { dropIdleTestDatabase } from '../database-cleanup.js'

const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
assert.ok(configured, 'DAILYLOGGER_TEST_DATABASE_URL is required; observability PostgreSQL tests never skip')
const adminUrl = new URL(configured)
const name = `dailylogger_observation_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(adminUrl); url.pathname = `/${name}`
const connectionString = url.toString()
const admin = new pg.Pool({ connectionString: configured, connectionTimeoutMillis: 5000 })
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 })
const sandbox = mkdtempSync(join(tmpdir(), 'dailylogger-observation-pg-'))
const children = new Set<ChildProcess>()
const CANARY = 'SECRET-observation-owner-context'
let created = false
let boss: Awaited<ReturnType<typeof startDelivery>>
function request(operation: CommandRequest['operation'], key: string, payload: Record<string, string>): CommandRequest { return { schemaVersion: 1, actorId: CANARY, key, operation, payload } }
function startRequest(key: string) { return request('start', key, { runDir: join(sandbox, key) }) }
async function command(commandId: string) { return (await pool.query('SELECT * FROM dailylogger_service.fixture_commands WHERE command_id=$1', [commandId])).rows[0] }
async function waitFor<T>(read: () => Promise<T | false>) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) { const value = await read(); if (value !== false) return value; await new Promise(resolve => setTimeout(resolve, 25)) }
  throw new Error('Observability fixture condition did not settle')
}
function capture(path: string): Observation[] { return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] }
function waitExit(child: ChildProcess, timeoutMs = 8500): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.removeListener('exit', exited); reject(new Error('Observability test child did not exit within its bounded allowance')) }, timeoutMs)
    const exited = (code: number | null, signal: NodeJS.Signals | null) => { clearTimeout(timer); resolve({ code, signal }) }
    child.once('exit', exited)
  })
}
async function forceCleanup(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) { const exited = waitExit(child, 2500); child.kill('SIGKILL'); await exited }
  children.delete(child)
}
async function deliver(commandId: string, mode = 'capture', alsoSettle: string[] = []) {
  const file = join(sandbox, `capture-${randomUUID()}.jsonl`)
  const child = spawn(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/test/delivery/observability-worker.ts'), file, mode], {
    cwd: REPO_ROOT, env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString, LANGCHAIN_TRACING_V2: 'true', LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: CANARY }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let stdout = '', stderr = ''
  child.stdout!.on('data', bytes => { stdout = (stdout + bytes).slice(-4096) })
  child.stderr!.on('data', bytes => { stderr = (stderr + bytes).slice(-4096) })
  try {
    await waitFor(async () => {
      assert.equal(child.exitCode, null, stderr)
      assert.equal(child.signalCode, null, stderr)
      return stdout.includes('"worker": "ready"') || stdout.includes('"worker":"ready"')
    })
    await waitFor(async () => {
      assert.equal(child.exitCode, null, stderr)
      assert.equal(child.signalCode, null, stderr)
      for (const id of [commandId, ...alsoSettle]) if (!['succeeded', 'cancelled', 'stale', 'rejected'].includes((await command(id)).disposition)) return false
      return true
    })
    const exited = waitExit(child), stoppedAt = Date.now()
    child.kill('SIGTERM')
    const { code } = await exited
    assert.equal(code, 0, stderr)
    assert.ok(Date.now() - stoppedAt < 8000, 'Optional telemetry cannot extend the existing worker shutdown deadline')
    assert.equal(stderr, '')
    return capture(file)
  } finally {
    await forceCleanup(child)
  }
}
before(async () => {
  console.log(`Real PostgreSQL observability server: ${(await admin.query('SHOW server_version')).rows[0].server_version}`)
  await admin.query(`CREATE DATABASE "${name}"`); created = true
  await migrateDelivery(pool, connectionString)
  boss = await startDelivery(pool, connectionString)
})
after(async () => {
  try {
    for (const child of children) await forceCleanup(child)
    await boss?.stop(); await pool.end()
    if (created) await dropIdleTestDatabase(admin, name)
  } finally {
    await admin.end(); rmSync(sandbox, { recursive: true, force: true })
  }
})

test('only committed admission responses are observed; replay and conflict retain exact response semantics', async () => {
  const records: Readonly<Observation>[] = []
  const telemetry = createOfflineTelemetry([{ export: batch => { records.push(...batch) } }])
  const client = await pool.connect()
  let provisionalId = ''
  try {
    await client.query('BEGIN')
    const provisional = await admitCommandInTransaction(client, boss, startRequest('observation-rollback'))
    provisionalId = JSON.parse(provisional.body).commandId
    await client.query('ROLLBACK')
    await telemetry.flush()
    assert.equal(records.length, 0)
    assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.fixture_commands WHERE command_id=$1', [provisionalId])).rows.length, 0)
    await client.query('BEGIN')
    const committed = await admitCommandInTransaction(client, boss, request('recover', 'caller-owned-commit', { runId: randomUUID() }))
    await client.query('COMMIT')
    observeAdmissionResponse(telemetry, committed) // The explicit adapter seam for an owner API.
  } finally { await client.query('ROLLBACK'); client.release() }
  const input = startRequest(`${CANARY}-admitted`)
  const original = await admitCommand(pool, boss, input, telemetry)
  assert.deepEqual(await admitCommand(pool, boss, input, telemetry), original)
  const conflict = await admitCommand(pool, boss, { ...input, payload: { runDir: join(sandbox, 'unused-conflict') } }, telemetry)
  assert.equal(conflict.status, 409)
  assert.equal(JSON.parse(conflict.body).commandId, JSON.parse(original.body).commandId)
  await telemetry.shutdown()
  assert.deepEqual(records.map(record => record.outcome), ['rejected_response', 'admitted_response', 'admitted_response', 'idempotency_conflict_response'])
  assert.ok(records.every(record => record.phase === 'event' && !record.attemptId))
  assert.equal(JSON.stringify(records).includes(CANARY), false)
  assert.equal(records.some(record => record.commandId === provisionalId), false)
})

test('worker restart closes human wait, correlates durable attempts and preserves canonical fixture output', async () => {
  const input = startRequest('observed-restart')
  const first = JSON.parse((await admitCommand(pool, boss, input)).body)
  const startRecords = (await deliver(first.commandId)).filter(record => record.commandId === first.commandId)
  const waiting = await runStatus(pool, connectionString, first.runId)
  assert.equal(waiting.status, 'awaiting-approval')
  const resumed = JSON.parse((await admitCommand(pool, boss, request('resume', 'observed-resume', { runId: first.runId, resumeTargetId: waiting.resumeTargetId! }))).body)
  const resumeRecords = (await deliver(resumed.commandId)).filter(record => record.commandId === resumed.commandId)
  assert.equal((await runStatus(pool, connectionString, first.runId)).status, 'complete')
  const attempts = (await pool.query('SELECT attempt_id,command_id,state FROM dailylogger_service.operation_attempts WHERE run_id=$1', [first.runId])).rows
  assert.equal(attempts.length, 2)
  for (const [records, commandId, outcome] of [[startRecords, first.commandId, 'paused'], [resumeRecords, resumed.commandId, 'succeeded']] as const) {
    const attempt = attempts.find(row => row.command_id === commandId)
    assert.equal(attempt.state, 'succeeded')
    const terminal = records.find(record => record.kind === 'operation' && record.phase === 'end')!
    assert.equal(terminal.attemptId, attempt.attempt_id)
    assert.equal(terminal.outcome, outcome)
    assert.ok(records.filter(record => record.kind === 'node').every(record => record.attemptId === attempt.attempt_id && record.runId === first.runId))
    assert.ok(records.filter(record => record.phase === 'start').every(record => records.some(end => end.phase === 'end' && end.observationId === record.observationId)), 'No attempted/node span stays open across owner wait')
    assert.equal(records.find(record => record.kind === 'delivery' && record.phase === 'end')?.outcome, 'returned')
  }
  assert.notEqual(startRecords[0].traceId, resumeRecords[0].traceId)
  const fixture = readFixture()
  assert.deepEqual(readFileSync(join(input.payload.runDir, 'artifacts', ARTICLE_PATH)), fixture.article)
  assert.deepEqual(readFileSync(join(input.payload.runDir, 'artifacts', ACTIONS_PATH)), fixture.actions)
  const receipt = readFileSync(join(input.payload.runDir, 'artifacts/receipt.json'), 'utf8')
  assert.equal(/traceId|observationId|instrumentationVersion/.test(receipt), false)
  assert.equal(/SECRET-|postgresql:|approvalDigest|runDir/.test(JSON.stringify([...startRecords, ...resumeRecords])), false)
})

test('cancelled queued work reports a returned delivery call separately from owner-wait graph state', async () => {
  const first = JSON.parse((await admitCommand(pool, boss, startRequest('observed-cancel'))).body)
  await deliver(first.commandId)
  const state = await runStatus(pool, connectionString, first.runId)
  const resume = JSON.parse((await admitCommand(pool, boss, request('resume', 'cancelled-observed-resume', { runId: first.runId, resumeTargetId: state.resumeTargetId! }))).body)
  const cancellation = JSON.parse((await admitCommand(pool, boss, request('cancel', 'observed-cancel-command', { runId: first.runId }))).body)
  const records = await deliver(cancellation.commandId, 'capture', [resume.commandId])
  const terminal = records.find(record => record.commandId === resume.commandId && record.kind === 'delivery' && record.phase === 'end')!
  assert.equal((await command(resume.commandId)).disposition, 'cancelled')
  assert.equal(terminal.outcome, 'returned')
  assert.equal(terminal.operation, 'resume')
  assert.equal(terminal.runState, 'awaiting_approval')
  assert.equal(records.some(record => record.commandId === resume.commandId && record.kind === 'operation'), false)
})

test('throwing and stuck exporters do not change worker settlement or shutdown deadline', async () => {
  for (const mode of ['throw', 'stuck']) {
    const admitted = JSON.parse((await admitCommand(pool, boss, startRequest(`observed-${mode}`))).body)
    assert.deepEqual(await deliver(admitted.commandId, mode), [])
    assert.equal((await command(admitted.commandId)).disposition, 'succeeded')
    assert.equal((await runStatus(pool, connectionString, admitted.runId)).status, 'awaiting-approval')
  }
})

test('process death leaves no invented terminal observation and retry uses durable checkpoints', async () => {
  const input = startRequest('observed-process-death')
  const admitted = JSON.parse((await admitCommand(pool, boss, input)).body)
  const file = join(sandbox, `killed-capture-${randomUUID()}.jsonl`)
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', join(REPO_ROOT, 'apps/service/test/delivery/faults.mjs'), join(REPO_ROOT, 'apps/service/test/delivery/observability-worker.ts'), file, 'capture'], {
    cwd: REPO_ROOT, env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString, DELIVERY_TEST_FAULT: 'after-start-checkpoint' }, stdio: ['ignore', 'ignore', 'ignore'],
  })
  children.add(child)
  try { assert.equal((await waitExit(child, 15000)).signal, 'SIGKILL') } finally { await forceCleanup(child) }
  const before = capture(file).filter(record => record.commandId === admitted.commandId)
  assert.equal(before.some(record => ['delivery', 'operation'].includes(record.kind) && record.phase === 'end'), false)
  const row = await command(admitted.commandId)
  const job = await boss.getJobById(QUEUE, row.job_id)
  assert.ok(job); assert.equal(job.state, 'active')
  // Explicit test-only recovery after proving the previous process is dead.
  await boss.fail(QUEUE, { id: job.id, retryCount: job.retryCount }, { test: 'dead-observed-worker' })
  const retried = (await deliver(admitted.commandId)).filter(record => record.commandId === admitted.commandId)
  assert.equal((await runStatus(pool, connectionString, admitted.runId)).status, 'awaiting-approval')
  assert.deepEqual(readFileSync(join(input.payload.runDir, 'attempts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).node), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  if (before.length) assert.notEqual(before[0].traceId, retried[0].traceId)
  const attempts = (await pool.query('SELECT attempt_id,state FROM dailylogger_service.operation_attempts WHERE command_id=$1 ORDER BY started_at', [admitted.commandId])).rows
  assert.deepEqual(attempts.map(row => row.state), ['abandoned', 'succeeded'])
  assert.equal(retried.find(record => record.kind === 'operation' && record.phase === 'end')?.attemptId, attempts[1].attempt_id)
})

test('settlement failure ends the real attempt as failed, never prematurely paused or succeeded', async () => {
  const admitted = JSON.parse((await admitCommand(pool, boss, startRequest('observed-settlement-fault'))).body)
  const row = await command(admitted.commandId)
  const records: Readonly<Observation>[] = []
  const telemetry = createOfflineTelemetry([{ export: batch => { records.push(...batch) } }])
  const observation = beginObservation(telemetry, 'delivery', { runId: admitted.runId, commandId: admitted.commandId })
  const fault = new Error(CANARY)
  await assert.rejects(runOperation(pool, connectionString, 'start', admitted.runId, undefined, {
    commandId: admitted.commandId, jobId: row.job_id, retryCount: 0,
    plan: async () => ({ operation: 'start' }), settled: async () => { throw fault },
  }, observation), error => error === fault)
  observation.end('failed'); await telemetry.shutdown()
  const attempts = (await pool.query('SELECT attempt_id,state FROM dailylogger_service.operation_attempts WHERE command_id=$1', [admitted.commandId])).rows
  assert.equal(attempts.length, 1); assert.equal(attempts[0].state, 'failed')
  const terminal = records.filter(record => record.kind === 'operation' && record.phase === 'end')
  assert.equal(terminal.length, 1); assert.equal(terminal[0].attemptId, attempts[0].attempt_id); assert.equal(terminal[0].outcome, 'failed')
  assert.equal(JSON.stringify(records).includes(CANARY), false)
})

test('a rejected attempt INSERT never exports a fabricated durable attempt identity', async () => {
  const admitted = JSON.parse((await admitCommand(pool, boss, startRequest('observed-insert-fault'))).body)
  const row = await command(admitted.commandId)
  const records: Readonly<Observation>[] = []
  const telemetry = createOfflineTelemetry([{ export: batch => { records.push(...batch) } }])
  const observation = beginObservation(telemetry, 'delivery', { runId: admitted.runId, commandId: admitted.commandId })
  // This schema belongs to this suite's disposable DB; no other workers run here.
  await pool.query(`CREATE FUNCTION dailylogger_service.observation_test_reject_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only attempt insert rejected'; END $$`)
  await pool.query(`CREATE TRIGGER observation_test_reject_attempt BEFORE INSERT ON dailylogger_service.operation_attempts FOR EACH ROW EXECUTE FUNCTION dailylogger_service.observation_test_reject_attempt()`)
  try {
    await assert.rejects(runOperation(pool, connectionString, 'start', admitted.runId, undefined, {
      commandId: admitted.commandId, jobId: row.job_id, retryCount: 0,
      plan: async () => ({ operation: 'start' }), settled: async () => {},
    }, observation), error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0001')
  } finally {
    await pool.query('DROP TRIGGER observation_test_reject_attempt ON dailylogger_service.operation_attempts')
    await pool.query('DROP FUNCTION dailylogger_service.observation_test_reject_attempt()')
    observation.end('failed'); await telemetry.shutdown()
  }
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.operation_attempts WHERE command_id=$1', [admitted.commandId])).rows.length, 0)
  assert.ok(records.every(record => record.attemptId === undefined && record.kind !== 'operation' && record.kind !== 'node'))
})
