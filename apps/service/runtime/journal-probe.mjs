import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { PgBoss } from 'pg-boss'
import { promisify } from 'node:util'

// Run from apps/service. Test jobs and checkpoints live in a new database owned by this process.
const execute = promisify(execFile)
const root = mkdtempSync(join(tmpdir(), 'dailylogger-journal-probe-'))
const workers = new Set()
const ledger = []
const parentUrl = new URL(process.env.DAILYLOGGER_DATABASE_URL)
const name = 'dailylogger_journal_probe_' + randomUUID().replaceAll('-', '')
const admin = new pg.Pool({ connectionString: parentUrl.href, connectionTimeoutMillis: 5000 })
const testUrl = new URL(parentUrl)
testUrl.pathname = '/' + name
const env = { ...process.env, DAILYLOGGER_DATABASE_URL: testUrl.href }
let created = false
let boss
let checkpointGate
let releaseDraft
const draftGate = new Promise(resolve => { releaseDraft = resolve })
const reportDate = '2026-11-17'
const draft = { schemaVersion: 2, date: reportDate, title: 'Synthetic private draft', summary: 'Private workflow proof.',
  lede: '', tags: [], whatShipped: [], decisions: [], roadmapPulse: '', whatsNext: '', suggestedActions: [],
  commitCount: 0, reposActive: [], activityType: 'rest', codeReferences: [] }
const findings = ['Use the exact wording from the synthetic input.']
const revised = { ...draft, title: 'Synthetic private revision' }
const cli = (operation, ...args) => ['--import', 'tsx', 'src/journal-cli.ts', operation, ...args]
const config = join(root, 'models.json')
const readRun = id => run('status', '--run-id', id)

async function run(operation, ...args) {
  const { stdout } = await execute(process.execPath, cli(operation, ...args), { env, timeout: 15_000 })
  return JSON.parse(stdout)
}

async function waitFor(check, message, timeout = 45_000) {
  const deadline = Date.now() + timeout
  do {
    const result = await check()
    if (result) return result
    await delay(200)
  } while (Date.now() < deadline)
  assert.fail(message)
}

async function startWorker() {
  const child = spawn(process.execPath, cli('work', '--models', config), { env, stdio: ['ignore', 'pipe', 'pipe'] })
  workers.add(child)
  child.once('exit', () => workers.delete(child))
  let startup = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { startup += chunk })
  child.stderr.resume()
  await waitFor(() => {
    assert.equal(child.exitCode, null, 'Journal worker exited during startup')
    return startup.includes('journal_worker_ready')
  }, 'Journal worker did not become ready', 10_000)
  return child
}

async function stopWorker(child, signal) {
  const ended = once(child, 'exit')
  child.kill(signal)
  const [code, observed] = await ended
  assert.equal(observed ?? code, signal === 'SIGKILL' ? 'SIGKILL' : 0)
}

const provider = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/v1/chat/completions')
    let body = ''
    for await (const chunk of request) {
      body += chunk
      assert.ok(body.length < 100_000)
    }
    const { model, messages, max_tokens: maxTokens, stream } = JSON.parse(body)
    const material = JSON.parse(messages.at(-1).content)
    const { evidence, draft: original, review } = material
    const step = review ? 'revise' : original ? 'review' : 'draft'
    const expectedModel = step === 'review' ? 'probe-reviewer' : 'probe-writer'
    assert.equal(model, expectedModel)
    assert.equal(maxTokens, step === 'review' ? 512 : 2048)
    assert.equal(stream, false)
    if (original) assert.deepEqual(original, draft)
    if (review) assert.deepEqual(review, { findings })
    const ordinal = ledger.filter(call => call.evidence === evidence && call.step === step).length + 1
    ledger.push({ evidence, step, model })
    if ((step === 'review' && evidence === 'restart-case' && ordinal === 1)
      || (evidence === 'budget-case' && ordinal <= 2) || evidence === 'exhausted-case') {
      response.writeHead(429).end()
      return
    }
    if (step === 'draft' && evidence === 'cache-case') await draftGate
    if (step === 'review' && evidence === 'uncertain-case') return // Worker dies with this request in flight.
    const output = step === 'draft' ? draft : step === 'review' ? { findings } : revised
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }))
  } catch {
    response.writeHead(500).end()
  }
})

function makeRequest(evidence) {
  const request = join(root, evidence + '.json')
  writeFileSync(request, JSON.stringify({ key: 'qualification-' + randomUUID(), reportDate, evidence }), { mode: 0o600 })
  return ['--models', config, '--request', request]
}
const complete = step => ({ step, attempt: 1, status: 'complete' })
const phases = evidence => ledger.filter(call => call.evidence === evidence).map(call => call.step)

try {
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  const endpoint = `http://127.0.0.1:${provider.address().port}/v1/chat/completions`
  const route = (model, maxOutputTokens) => ({ endpoint, model, maxOutputTokens, timeoutMs: 30_000 })
  writeFileSync(config, JSON.stringify({ writer: route('probe-writer', 2048), reviewer: route('probe-reviewer', 512) }), { mode: 0o600 })
  await admin.query(`CREATE DATABASE "${name}"`)
  created = true
  assert.equal((await run('migrate')).status, 'journal_migrated')

  let worker = await startWorker()
  const args = makeRequest('restart-case')
  const admitted = await run('enqueue', ...args)
  assert.deepEqual(await run('enqueue', ...args), admitted)
  const first = await waitFor(async () => {
    const status = await readRun(admitted.runId)
    return status.queueState === 'retry' ? status : undefined
  }, 'The first review rejection was not scheduled for retry')
  assert.deepEqual(first.calls, [complete('draft'), { step: 'review', attempt: 1, status: 'rejected' }])
  await stopWorker(worker, 'SIGKILL')
  worker = await startWorker()
  const settled = await waitFor(async () => {
    const status = await readRun(admitted.runId)
    return status.status === 'complete' && status.queueState === 'completed' ? status : undefined
  }, 'Restarted worker did not settle the private revision')
  assert.deepEqual(settled.calls, [...first.calls, { step: 'review', attempt: 2, status: 'complete' }, complete('revise')])
  assert.deepEqual(await run('result', '--run-id', admitted.runId), revised)
  assert.deepEqual(await run('enqueue', ...args), admitted)
  assert.deepEqual(phases('restart-case'), ['draft', 'review', 'review', 'revise'])

  const cached = await run('enqueue', ...makeRequest('cache-case'))
  await waitFor(() => phases('cache-case').includes('draft'), 'The cache proof did not reach the model')
  checkpointGate = new pg.Client({ connectionString: testUrl.href, connectionTimeoutMillis: 5000 })
  await checkpointGate.connect()
  await checkpointGate.query('BEGIN')
  // Block LangGraph persistence after the model request starts. The application call record uses a different table.
  await checkpointGate.query("SET LOCAL lock_timeout = '5s'")
  await checkpointGate.query(`LOCK TABLE dailylogger_checkpoints.checkpoint_writes,
    dailylogger_checkpoints.checkpoint_blobs, dailylogger_checkpoints.checkpoints IN ACCESS EXCLUSIVE MODE`)
  releaseDraft()
  await waitFor(async () => {
    const status = await readRun(cached.runId)
    return status.calls.some(call => call.step === 'draft' && call.status === 'complete')
  }, 'Draft was not committed to the call ledger before checkpointing')
  await stopWorker(worker, 'SIGKILL')
  // PostgreSQL can finish work after the client process dies. End only its
  // backend sessions blocked by this gate, while they still cannot write.
  const endedWriters = await checkpointGate.query(`SELECT pg_terminate_backend(pid, 5000) AS terminated
    FROM pg_stat_activity WHERE datname=current_database() AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`)
  assert.ok(endedWriters.rows.every(row => row.terminated), 'A crashed worker checkpoint write could still commit')
  await checkpointGate.query('ROLLBACK')
  const persistedDraft = await checkpointGate.query(`SELECT 1 FROM dailylogger_checkpoints.checkpoint_blobs WHERE thread_id=$1 AND channel='draft'
    UNION ALL SELECT 1 FROM dailylogger_checkpoints.checkpoint_writes WHERE thread_id=$1 AND channel='draft'`, [cached.runId])
  assert.equal(persistedDraft.rowCount, 0, 'The graph already had the model output before restart')
  await checkpointGate.end()
  checkpointGate = undefined
  worker = await startWorker()
  const afterCrash = await waitFor(async () => {
    const status = await readRun(cached.runId)
    return status.status === 'complete' ? status : undefined
  }, 'Restarted worker did not reuse the independently stored draft')
  assert.deepEqual(afterCrash.calls, ['draft', 'review', 'revise'].map(complete))
  assert.deepEqual(phases('cache-case'), ['draft', 'review', 'revise'])
  assert.deepEqual(await run('result', '--run-id', cached.runId), revised)

  const otherArgs = makeRequest('uncertain-case')
  const uncertain = await run('enqueue', ...otherArgs)
  await waitFor(() => phases('uncertain-case').includes('review'), 'The provider did not receive the second review')
  await stopWorker(worker, 'SIGKILL')
  worker = await startWorker()
  const held = await waitFor(async () => {
    const status = await readRun(uncertain.runId)
    return status.status === 'blocked' && status.queueState === 'completed' ? status : undefined
  }, 'Restarted worker did not hold the unknown provider outcome', 70_000)
  assert.equal(held.error, 'model_outcome_uncertain')
  assert.deepEqual(held.calls, [complete('draft'), { step: 'review', attempt: 1, status: 'uncertain' }])
  assert.deepEqual(await run('enqueue', ...otherArgs), uncertain)
  assert.deepEqual(phases('uncertain-case'), ['draft', 'review'])
  await assert.rejects(run('result', '--run-id', uncertain.runId))
  const changedModels = join(root, 'changed-models.json')
  writeFileSync(changedModels, JSON.stringify({ writer: route('probe-writer', 2048), reviewer: route('changed-reviewer', 512) }), { mode: 0o600 })
  const [, , requestOption, requestPath] = makeRequest('routing-case')
  const mismatched = await run('enqueue', '--models', changedModels, requestOption, requestPath)
  const mismatch = await waitFor(async () => {
    const status = await readRun(mismatched.runId)
    return status.status === 'blocked' ? status : undefined
  }, 'Different model routing was accepted')
  assert.equal(mismatch.error, 'model_routing_changed')
  assert.deepEqual(phases('routing-case'), [])

  const exhausted = await run('enqueue', ...makeRequest('exhausted-case'))
  const bounded = await run('enqueue', ...makeRequest('budget-case'))
  const ended = await waitFor(async () => {
    const status = await readRun(exhausted.runId)
    return status.status === 'blocked' ? status : undefined
  }, 'Exhausted model budget did not end')
  assert.equal(ended.error, 'model_retries_exhausted')
  assert.deepEqual(phases('exhausted-case'), ['draft', 'draft', 'draft'])
  const allSteps = await waitFor(async () => {
    const status = await readRun(bounded.runId)
    return status.status === 'complete' ? status : undefined
  }, 'The model retry budget did not cover all three steps', 90_000)
  assert.equal(allSteps.calls.length, 9)
  assert.deepEqual(phases('budget-case'), ['draft', 'draft', 'draft', 'review', 'review', 'review', 'revise', 'revise', 'revise'])
  await stopWorker(worker, 'SIGTERM')

  const lostArgs = makeRequest('redrive-case')
  const lost = await run('enqueue', ...lostArgs)
  boss = new PgBoss({ connectionString: testUrl.href, schema: 'dailylogger_delivery', migrate: false, createSchema: false, supervise: false, schedule: false })
  await boss.start()
  await boss.cancel('private-journal-v1', lost.jobId)
  assert.equal((await readRun(lost.runId)).error, 'journal_delivery_unavailable')
  const replacement = await run('redrive', '--run-id', lost.runId)
  assert.equal(replacement.runId, lost.runId)
  assert.notEqual(replacement.jobId, lost.jobId)
  assert.deepEqual(await run('redrive', '--run-id', lost.runId), replacement)
  assert.deepEqual(await run('enqueue', ...lostArgs), replacement)
  worker = await startWorker()
  await waitFor(async () => (await readRun(lost.runId)).status === 'complete', 'Re-driven journal did not finish')
  assert.deepEqual(phases('redrive-case'), ['draft', 'review', 'revise'])
  await stopWorker(worker, 'SIGTERM')

  console.log(JSON.stringify({ workerRestarts: 3, providerRejectionRetried: true, completedCallsRepeated: 0,
    unknownOutcomeHeld: true, duplicateAdmissionReused: true, privateRevisionValidated: true,
    cachedResultRecoveredBeforeCheckpoint: true, fullRetryBudgetVerified: true, retryExhaustionHeld: true,
    changedRoutingHeld: true, terminalDeliveryRedriven: true, isolatedDatabase: true,
    completedRunId: admitted.runId, blockedRunId: uncertain.runId,
    providerCalls: { draft: 1, review: 2, revise: 1 }, uncertainRunCalls: { draft: 1, review: 1, revise: 0 } }))
} finally {
  await Promise.all([...workers].map(child => stopWorker(child, 'SIGKILL')))
  await checkpointGate?.end()
  await boss?.stop()
  provider.closeAllConnections()
  await new Promise(resolve => provider.close(resolve))
  try {
    if (created) {
      // The randomly named database belongs to this probe alone. Close any
      // remaining backends even if a killed subprocess left a session behind.
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
    }
  } finally {
    await admin.end()
    rmSync(root, { recursive: true, force: true })
  }
}
