import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { ACTIONS_PATH, ARTICLE_PATH, REPO_ROOT, readFixture } from '../../src/fixture.js'
import { admitCommand, admitCommandInTransaction, commandStatus, runStatus, type CommandRequest } from '../../src/delivery-commands.js'
import { BOSS_SCHEMA_VERSION, migrateDelivery, QUEUE, startDelivery } from '../../src/delivery-db.js'

const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
assert.ok(configured, 'DAILYLOGGER_TEST_DATABASE_URL is required; real delivery tests never skip without PostgreSQL')
const adminUrl = new URL(configured)
assert.ok(['postgres:', 'postgresql:'].includes(adminUrl.protocol))
const name = `dailylogger_delivery_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(adminUrl); url.pathname = `/${name}`
const connectionString = url.toString()
const admin = new pg.Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 })
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 })
const sandbox = mkdtempSync(join(tmpdir(), 'dailylogger-delivery-test-'))
const cli = join(REPO_ROOT, 'apps/service/src/delivery-cli.ts')
const faultModule = join(REPO_ROOT, 'apps/service/test/delivery/faults.mjs')
const children = new Set<ChildProcessWithoutNullStreams>()
const env = { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString, LANGCHAIN_TRACING_V2: 'false', LANGSMITH_TRACING: 'false' }
let created = false
let boss: Awaited<ReturnType<typeof startDelivery>>

function request(operation: CommandRequest['operation'], key: string, payload: Record<string, string>): CommandRequest { return { schemaVersion: 1, actorId: 'trusted-fixture-owner', key, operation, payload } }
function startRequest(key: string) { return request('start', key, { runDir: join(sandbox, key) }) }
function args(command: string[], fault?: string) { return ['--import', 'tsx', ...(fault ? ['--import', faultModule] : []), cli, ...command] }
function call(command: string[], fault?: string) { return spawnSync(process.execPath, args(command, fault), { cwd: REPO_ROOT, env: { ...env, DELIVERY_TEST_FAULT: fault }, encoding: 'utf8', timeout: 30000 }) }
function enqueueChild(input: CommandRequest, fault?: string) {
  const file = join(sandbox, `request-${randomUUID()}.json`); writeFileSync(file, JSON.stringify(input))
  return call(['enqueue', '--request', file], fault)
}
async function waitFor<T>(read: () => Promise<T | false>, timeout = 20000): Promise<T> {
  const end = Date.now() + timeout
  while (Date.now() < end) { const value = await read(); if (value !== false) return value; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('Timed out waiting for fixture delivery evidence')
}
async function worker(fault?: string, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args(['work'], fault), { cwd: REPO_ROOT, env: { ...env, DELIVERY_TEST_FAULT: fault, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] })
  children.add(child)
  let stdout = '', stderr = '', ready = false
  let spawnError: Error | undefined
  child.on('error', error => { spawnError = error })
  child.stdout.on('data', value => {
    stdout = (stdout + value).slice(-16_384)
    try {
      const message: unknown = JSON.parse(stdout)
      ready = typeof message === 'object' && message !== null && !Array.isArray(message)
        && 'worker' in message && message.worker === 'ready'
        && 'queue' in message && message.queue === QUEUE
        && 'concurrency' in message && message.concurrency === 1
    } catch { /* Wait for the remaining chunks of the complete readiness JSON. */ }
  })
  child.stderr.on('data', value => { stderr = (stderr + value).slice(-4096) })
  const diagnostics = () => `exitCode=${child.exitCode}, signalCode=${child.signalCode}, spawnError=${spawnError?.message ?? 'none'}\nstdout (tail): ${stdout.slice(-4096)}\nstderr (tail): ${stderr}`
  try {
    await waitFor(async () => {
      // A crash-injection worker can exit just after emitting readiness. Keep
      // that complete message so the caller can inspect its intentional exit.
      if (ready) return true
      assert.equal(spawnError, undefined)
      assert.equal(child.exitCode, null)
      assert.equal(child.signalCode, null)
      return false
    }, 20_000)
    return child
  } catch (error) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        const cleanup = () => { clearTimeout(deadline); child.removeListener('exit', cleanup); resolve() }
        const deadline = setTimeout(cleanup, 2000)
        child.once('exit', cleanup)
        child.kill('SIGKILL')
      })
    }
    children.delete(child)
    throw new Error(`Worker startup failed within 20 seconds; ${diagnostics()}`, { cause: error })
  }
}
async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) { children.delete(child); return }
  const exited = once(child, 'exit'); child.kill('SIGTERM')
  const [code] = await exited; children.delete(child)
  assert.equal(code, 0)
}
async function row(commandId: string) { return (await pool.query('SELECT * FROM dailylogger_service.fixture_commands WHERE command_id=$1', [commandId])).rows[0] }
async function settled(commandId: string, disposition = 'succeeded') {
  return waitFor(async () => { const value = await row(commandId); return value.disposition === disposition ? value : false })
}
async function admitted(input: CommandRequest) {
  const receipt = await admitCommand(pool, boss, input); assert.equal(receipt.status, 202, receipt.body)
  return { ...JSON.parse(receipt.body) as { commandId: string; runId: string }, receipt }
}
async function waiting(key: string) {
  const command = await admitted(startRequest(key)); const child = await worker()
  await settled(command.commandId); await stop(child)
  const state = await runStatus(pool, connectionString, command.runId)
  assert.equal(state.status, 'awaiting-approval'); assert.ok(state.resumeTargetId)
  return { ...command, state }
}
function nodes(runDir: string) { return readFileSync(join(runDir, 'attempts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).node) }
function output(runDir: string) {
  const fixture = readFixture()
  assert.deepEqual(readFileSync(join(runDir, 'artifacts', ARTICLE_PATH)), fixture.article)
  assert.deepEqual(readFileSync(join(runDir, 'artifacts', ACTIONS_PATH)), fixture.actions)
  const actions = JSON.parse(fixture.actions.toString('utf8'))
  assert.equal(actions.snapshot.draftCandidates.length, 3); assert.deepEqual(actions.suggestions, [])
}
async function retryKilled(commandId: string) {
  const command = await row(commandId)
  const job = await boss.getJobById(QUEUE, command.job_id)
  assert.ok(job); assert.equal(job.state, 'active')
  // Explicit fault recovery in this newly created test DB, after proving the
  // old process is dead. Production relies on bounded expiration/supervision.
  await boss.fail(QUEUE, { id: job.id, retryCount: job.retryCount }, { test: 'dead worker' })
}

before(async () => {
  console.log(`Real PostgreSQL delivery server: ${(await admin.query('SHOW server_version')).rows[0].server_version}`)
  await admin.query(`CREATE DATABASE "${name}"`); created = true
})
after(async () => {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited }
  await boss?.stop(); await pool.end()
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin.end(); rmSync(sandbox, { recursive: true, force: true })
})

test('explicit installation pins both ledgers and queue settings; runtime cannot skip migration002', async () => {
  assert.equal(call(['work']).status, 1)
  await migrateDelivery(pool, connectionString); await migrateDelivery(pool, connectionString)
  boss = await startDelivery(pool, connectionString)
  assert.equal(await boss.schemaVersion(), BOSS_SCHEMA_VERSION)
  const ledger = (await pool.query('SELECT * FROM dailylogger_service.schema_migrations WHERE version=2')).rows[0]
  await pool.query('DELETE FROM dailylogger_service.schema_migrations WHERE version=2')
  assert.equal(call(['work']).status, 1)
  await pool.query('INSERT INTO dailylogger_service.schema_migrations(version,digest) VALUES(2,$1)', [ledger.digest])
  await pool.query('UPDATE dailylogger_delivery.version SET version=$1', [BOSS_SCHEMA_VERSION + 1])
  await assert.rejects(migrateDelivery(pool, connectionString), /separately reviewed migration/)
  assert.equal((await pool.query('SELECT version FROM dailylogger_delivery.version')).rows[0].version, BOSS_SCHEMA_VERSION + 1)
  await pool.query('UPDATE dailylogger_delivery.version SET version=$1', [BOSS_SCHEMA_VERSION])
})

test('a nonempty vendor schema without its version ledger cannot be reinstalled', async () => {
  const damagedName = `dailylogger_damaged_${randomUUID().replaceAll('-', '')}`
  const damagedUrl = new URL(adminUrl); damagedUrl.pathname = `/${damagedName}`
  const damagedConnection = damagedUrl.toString()
  const damagedPool = new pg.Pool({ connectionString: damagedConnection, connectionTimeoutMillis: 5000 })
  let damagedCreated = false
  try {
    await admin.query(`CREATE DATABASE "${damagedName}"`); damagedCreated = true
    await migrateDelivery(damagedPool, damagedConnection)
    await damagedPool.query('DROP TABLE dailylogger_delivery.version')
    const objectsSql = `SELECT c.relname,c.oid::text FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='dailylogger_delivery' ORDER BY c.relname`
    const objects = (await damagedPool.query(objectsSql)).rows
    assert.ok(objects.some(object => object.relname === 'job'), 'Actual vendor tables survive ledger loss')
    const receipt = (await damagedPool.query('SELECT * FROM dailylogger_service.delivery_installation')).rows
    await assert.rejects(migrateDelivery(damagedPool, damagedConnection), /objects have no version ledger; refusing installation/)
    assert.equal((await damagedPool.query("SELECT to_regclass('dailylogger_delivery.version') AS ledger")).rows[0].ledger, null)
    assert.deepEqual((await damagedPool.query(objectsSql)).rows, objects, 'Rejected migration must not recreate or replace vendor objects')
    assert.deepEqual((await damagedPool.query('SELECT * FROM dailylogger_service.delivery_installation')).rows, receipt)
  } finally {
    await damagedPool.end()
    if (damagedCreated) await admin.query(`DROP DATABASE "${damagedName}" WITH (FORCE)`)
  }
})

test('caller transaction rollback leaves no admitted run, command or job; operational admission errors are not sticky', async () => {
  const client = await pool.connect()
  let commandId: string
  try {
    await client.query('BEGIN')
    const receipt = await admitCommandInTransaction(client, boss, startRequest('rollback'))
    commandId = JSON.parse(receipt.body).commandId
    await client.query('ROLLBACK')
  } finally { client.release() }
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.fixture_commands WHERE command_id=$1', [commandId!])).rows.length, 0)
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE run_dir=$1', [join(sandbox, 'rollback')])).rows.length, 0)
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_delivery.job WHERE data->>\'commandId\'=$1', [commandId!])).rows.length, 0)
  const input = startRequest('io-admission')
  assert.equal(enqueueChild(input, 'admission-io').status, 1)
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.fixture_commands WHERE idempotency_key=$1', [input.key])).rows.length, 0)
  assert.equal((await admitted(input)).receipt.status, 202)
})

test('committed admission survives lost producer response and replays exact response before current state', async () => {
  const input = startRequest('lost-response')
  assert.equal(enqueueChild(input, 'after-command-commit').signal, 'SIGKILL')
  const original = (await pool.query('SELECT * FROM dailylogger_service.fixture_commands WHERE idempotency_key=$1', [input.key])).rows[0]
  const replay = await admitCommand(pool, boss, input)
  assert.deepEqual(replay, { status: original.response_status, body: original.response_text })
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_delivery.job WHERE data->>\'commandId\'=$1', [original.command_id])).rows.length, 1)
  const conflict = await admitCommand(pool, boss, { ...input, payload: { runDir: join(sandbox, 'changed') } })
  assert.equal(conflict.status, 409); assert.match(conflict.body, /idempotency_conflict/)
  const a = await worker(), b = await worker()
  await settled(original.command_id); await stop(a); await stop(b)
  assert.deepEqual(await admitCommand(pool, boss, input), replay)
  assert.deepEqual(nodes(input.payload.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal((await boss.getJobById(QUEUE, original.job_id))?.state, 'completed', 'Human wait settles the delivery')
})

test('well-formed stale rejection is immutable and has no invented run or delivery', async () => {
  const run = await waiting('reject-target')
  const input = request('resume', 'reject-stale', { runId: run.runId, resumeTargetId: randomUUID() })
  const rejection = await admitCommand(pool, boss, input)
  assert.equal(rejection.status, 409)
  const rejected = await row(JSON.parse(rejection.body).commandId)
  assert.equal(rejected.run_id, null); assert.equal(rejected.job_id, null)
  assert.deepEqual(await admitCommand(pool, boss, input), rejection)
})

test('exact target is consumed by one command; competing resumes cannot manufacture another approval', async () => {
  const run = await waiting('exact-resume')
  const payload = { runId: run.runId, resumeTargetId: run.state.resumeTargetId! }
  const a = await admitted(request('resume', 'resume-a', payload)), b = await admitted(request('resume', 'resume-b', payload))
  const first = await worker(), second = await worker()
  await waitFor(async () => { const x = await row(a.commandId), y = await row(b.commandId); return [x.disposition, y.disposition].includes('succeeded') && [x.disposition, y.disposition].includes('stale') ? true : false })
  await stop(first); await stop(second)
  const winner = (await row(a.commandId)).disposition === 'succeeded' ? a : b
  assert.equal((await pool.query('SELECT consumed_by FROM dailylogger_service.resume_targets WHERE target_id=$1', [payload.resumeTargetId])).rows[0].consumed_by, winner.commandId)
  output(run.state.runDir)
  assert.deepEqual(nodes(run.state.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
  const direct = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/src/postgres-cli.ts'), 'recover', '--run-id', run.runId], { cwd: REPO_ROOT, env, encoding: 'utf8' })
  assert.equal(direct.status, 1); assert.match(direct.stderr, /Queue-owned/)
})

for (const fault of ['after-consume', 'after-output', 'after-checkpoint']) {
  test(`${fault}: redelivery resumes the same command and preserves completed work`, async () => {
    const run = await waiting(fault)
    const command = await admitted(request('resume', `resume-${fault}`, { runId: run.runId, resumeTargetId: run.state.resumeTargetId! }))
    const child = await worker(fault)
    const exited = child.signalCode ? [null, child.signalCode] : await once(child, 'exit')
    assert.equal(exited[1], 'SIGKILL'); children.delete(child)
    const artifact = join(run.state.runDir, 'artifacts/receipt.json')
    const before = existsSync(artifact) ? statSync(artifact).mtimeMs : null
    await retryKilled(command.commandId)
    const recovered = await worker(); await settled(command.commandId); await stop(recovered)
    output(run.state.runDir)
    if (before !== null) assert.equal(statSync(artifact).mtimeMs, before)
    for (const node of ['collect_fixture', 'draft_fixture', 'review_fixture']) assert.equal(nodes(run.state.runDir).filter(value => value === node).length, 1)
    assert.equal((await commandStatus(pool, boss, command.commandId)).disposition, 'succeeded')
  })
}

test('natural expiration redelivers a mid-progress start and recovers to human wait without rerunning collection', { timeout: 100_000 }, async () => {
  const run = await admitted(startRequest('natural-expiry-start'))
  const child = await worker('after-start-checkpoint')
  const exited = child.signalCode ? [null, child.signalCode] : await once(child, 'exit')
  assert.equal(exited[1], 'SIGKILL'); children.delete(child)
  const interrupted = await row(run.commandId)
  assert.equal(interrupted.disposition, 'running')
  const job = await boss.getJobById(QUEUE, interrupted.job_id)
  assert.ok(job); assert.equal(job.state, 'active'); assert.equal(job.expireInSeconds, 60)
  assert.equal(job.retryCount, 0)
  assert.deepEqual(nodes(join(sandbox, 'natural-expiry-start')), ['collect_fixture'])
  const latest = await pool.query('SELECT checkpoint_id,checkpoint FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 ORDER BY checkpoint_id DESC LIMIT 1', [run.runId])
  assert.ok(latest.rows[0]?.checkpoint.channel_versions.collected, 'Collection has a durable checkpoint before worker death')
  const began = Date.now()
  const recovered = await worker()
  // No boss.fail/retry/cancel, job timestamp edits, shortened expiry, or direct
  // graph invocation: the actual supervisor must expire and redeliver this job.
  await waitFor(async () => (await row(run.commandId)).disposition === 'succeeded' ? true : false, 90_000)
  await stop(recovered)
  const elapsed = Date.now() - began
  console.log(`Natural worker-death expiration/redelivery completed in ${elapsed}ms with configured expireInSeconds=60`)
  assert.ok(elapsed >= 50_000, 'Recovery must wait for the real expiration boundary')
  const completed = await boss.getJobById(QUEUE, interrupted.job_id)
  assert.equal(completed?.state, 'completed'); assert.equal(completed?.retryCount, 1)
  const state = await runStatus(pool, connectionString, run.runId)
  assert.equal(state.status, 'awaiting-approval'); assert.ok(state.resumeTargetId)
  assert.notEqual(state.checkpointId, latest.rows[0].checkpoint_id)
  assert.deepEqual(nodes(state.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal(existsSync(join(state.runDir, 'artifacts')), false, 'Start retry cannot approve output')
})

test('a succeeded command redelivered after death before queue acknowledgement is a no-op', async () => {
  const run = await admitted(startRequest('settled-before-ack'))
  const child = await worker('after-command-settlement')
  const exited = child.signalCode ? [null, child.signalCode] : await once(child, 'exit')
  assert.equal(exited[1], 'SIGKILL'); children.delete(child)
  const original = await row(run.commandId)
  assert.equal(original.disposition, 'succeeded')
  assert.equal((await boss.getJobById(QUEUE, original.job_id))?.state, 'active')
  const targets = (await pool.query('SELECT target_id FROM dailylogger_service.resume_targets WHERE run_id=$1', [run.runId])).rows
  const attemptCount = (await pool.query('SELECT count(*)::integer AS count FROM dailylogger_service.operation_attempts WHERE command_id=$1', [run.commandId])).rows[0].count
  await retryKilled(run.commandId)
  const retry = await worker()
  await waitFor(async () => (await boss.getJobById(QUEUE, original.job_id))?.state === 'completed' ? true : false)
  await stop(retry)
  const final = await row(run.commandId)
  assert.equal(final.result_text, original.result_text)
  assert.equal(final.response_text, original.response_text)
  assert.equal(final.disposition, 'succeeded')
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM dailylogger_service.operation_attempts WHERE command_id=$1', [run.commandId])).rows[0].count, attemptCount)
  assert.deepEqual((await pool.query('SELECT target_id FROM dailylogger_service.resume_targets WHERE run_id=$1', [run.runId])).rows, targets)
  assert.deepEqual(nodes(join(sandbox, 'settled-before-ack')), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

test('cancellation before delivery blocks all segments and stays separate from graph state', async () => {
  const run = await admitted(startRequest('cancel-before'))
  const cancellation = await admitted(request('cancel', 'cancel-before-command', { runId: run.runId }))
  const child = await worker(); await settled(run.commandId, 'cancelled'); await settled(cancellation.commandId); await stop(child)
  const state = await runStatus(pool, connectionString, run.runId)
  assert.equal(state.status, 'admitted'); assert.equal(state.cancellations[0].state, 'effective')
  assert.equal(existsSync(join(state.runDir, 'attempts.jsonl')), false)
  assert.equal((await admitCommand(pool, boss, request('recover', 'cancelled-recover', { runId: run.runId }))).status, 409)
})

test('cancellation can be requested during a locked segment and takes effect at its boundary', async () => {
  const run = await admitted(startRequest('cancel-during'))
  const marker = join(sandbox, 'paused'), release = join(sandbox, 'release')
  const child = await worker('pause-node', { DELIVERY_TEST_MARKER: marker, DELIVERY_TEST_RELEASE: release })
  await waitFor(async () => existsSync(marker) ? true : false)
  const began = Date.now()
  const cancellation = await admitted(request('cancel', 'cancel-during-command', { runId: run.runId }))
  assert.ok(Date.now() - began < 4000, 'Cancellation admission cannot wait for the run lock')
  assert.equal((await pool.query('SELECT state FROM dailylogger_service.run_cancellations WHERE command_id=$1', [cancellation.commandId])).rows[0].state, 'requested')
  writeFileSync(release, 'continue')
  await settled(run.commandId); await settled(cancellation.commandId); await stop(child)
  const state = await runStatus(pool, connectionString, run.runId)
  assert.equal(state.status, 'awaiting-approval'); assert.equal(state.cancellations[0].state, 'effective')
  assert.equal(existsSync(join(state.runDir, 'artifacts')), false)
})

test('cancellation at owner wait is effective and cancellation after completion preserves completed output', async () => {
  const waitingRun = await waiting('cancel-at-wait')
  const cancelled = await admitted(request('cancel', 'cancel-at-wait-command', { runId: waitingRun.runId }))
  const first = await worker(); await settled(cancelled.commandId); await stop(first)
  const waitingState = await runStatus(pool, connectionString, waitingRun.runId)
  assert.equal(waitingState.status, 'awaiting-approval')
  assert.equal(waitingState.cancellations[0].state, 'effective')
  assert.deepEqual(nodes(waitingState.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal((await admitCommand(pool, boss, request('resume', 'resume-cancelled-wait', { runId: waitingRun.runId, resumeTargetId: waitingRun.state.resumeTargetId! }))).status, 409)
  assert.equal(existsSync(join(waitingState.runDir, 'artifacts')), false)

  const completedRun = await waiting('cancel-after-complete')
  const resumed = await admitted(request('resume', 'complete-before-cancel', { runId: completedRun.runId, resumeTargetId: completedRun.state.resumeTargetId! }))
  const second = await worker(); await settled(resumed.commandId); await stop(second)
  output(completedRun.state.runDir)
  const artifact = join(completedRun.state.runDir, 'artifacts/receipt.json')
  const bytes = readFileSync(artifact), timestamp = statSync(artifact).mtimeMs
  const late = await admitted(request('cancel', 'cancel-already-completed-command', { runId: completedRun.runId }))
  const third = await worker(); await settled(late.commandId); await stop(third)
  const completedState = await runStatus(pool, connectionString, completedRun.runId)
  assert.equal(completedState.status, 'complete')
  assert.equal(completedState.cancellations[0].state, 'already_completed')
  assert.deepEqual(readFileSync(artifact), bytes); assert.equal(statSync(artifact).mtimeMs, timestamp)
  assert.equal((await row(resumed.commandId)).disposition, 'succeeded')
})

test('bounded transient retries and missing delivery remain visible without resetting graph', async () => {
  const run = await admitted(startRequest('exhaustion'))
  const child = await worker('transient-node')
  await waitFor(async () => (await commandStatus(pool, boss, run.commandId)).disposition === 'reconciliation_required' ? true : false)
  await stop(child)
  const state = await commandStatus(pool, boss, run.commandId)
  assert.equal(state.delivery?.retryCount, 2)
  assert.equal(state.delivery?.state, 'failed')
  const missing = await admitted(startRequest('missing-delivery'))
  await boss.deleteJob(QUEUE, (await row(missing.commandId)).job_id)
  assert.equal((await commandStatus(pool, boss, missing.commandId)).failure, 'delivery_missing')
})

test('graceful shutdown lets an already executing segment finish within its drain budget', async () => {
  const run = await admitted(startRequest('graceful-active'))
  const marker = join(sandbox, 'graceful-paused'), release = join(sandbox, 'graceful-release')
  const child = await worker('pause-node', { DELIVERY_TEST_MARKER: marker, DELIVERY_TEST_RELEASE: release })
  await waitFor(async () => existsSync(marker) ? true : false)
  const exited = once(child, 'exit')
  const began = Date.now(); child.kill('SIGTERM')
  const releaseTimer = setTimeout(() => writeFileSync(release, 'continue during drain'), 300)
  try {
    const [code] = await exited; children.delete(child)
    assert.equal(code, 0)
    assert.ok(Date.now() - began < 5000)
  } finally { clearTimeout(releaseTimer) }
  assert.equal((await row(run.commandId)).disposition, 'succeeded')
  const state = await runStatus(pool, connectionString, run.runId)
  assert.equal(state.status, 'awaiting-approval'); assert.equal(state.cancellations.length, 0)
  assert.deepEqual(nodes(state.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal(existsSync(join(state.runDir, 'artifacts')), false)
})

test('shutdown drains normally and forces a stuck segment to stop without inventing cancellation', async () => {
  const idle = await worker(); await stop(idle)
  const run = await admitted(startRequest('shutdown-stuck'))
  const marker = join(sandbox, 'shutdown-paused')
  const stuck = await worker('pause-node', { DELIVERY_TEST_MARKER: marker, DELIVERY_TEST_RELEASE: join(sandbox, 'never-release') })
  await waitFor(async () => existsSync(marker) ? true : false)
  const exited = once(stuck, 'exit'); const began = Date.now(); stuck.kill('SIGTERM')
  const [code] = await exited; children.delete(stuck)
  assert.equal(code, 1); assert.ok(Date.now() - began < 10000)
  assert.equal((await pool.query('SELECT 1 FROM dailylogger_service.run_cancellations WHERE run_id=$1', [run.runId])).rows.length, 0)
  assert.notEqual((await row(run.commandId)).disposition, 'cancelled')
})
