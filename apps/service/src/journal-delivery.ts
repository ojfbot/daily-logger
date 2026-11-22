import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import type { Job, PgBoss } from 'pg-boss'
import { createBoss, migrateDelivery, startDelivery, transactionAdapter } from './delivery-db.js'
import { digest, json, requireCondition } from './fixture.js'
import { journalRequest, JOURNAL_ATTEMPTS, JOURNAL_STEPS, JOURNAL_VERSION, routingDigest, validateJournalOutput, type JournalRequest, type JournalRouting } from './journal-model.js'
import { JournalBlocked, JournalRetry, runJournalGraph } from './journal-workflow.js'
import { migrateDatabase, openCheckpointer, requireMigrated, withRunLock } from './postgres-db.js'
import { beginObservation, type Telemetry } from './telemetry.js'

export const JOURNAL_QUEUE = 'private-journal-v1'
const QUEUE_OPTIONS = {
  policy: 'standard' as const,
  // Each step can be rejected twice. Reserve room for worker or database failures too.
  retryLimit: JOURNAL_STEPS.length * (JOURNAL_ATTEMPTS - 1) + 2, retryDelay: 8,
  expireInSeconds: 420, heartbeatSeconds: 15, retentionSeconds: 86400, deleteAfterSeconds: 604800,
}
export type JournalJob = { runId: string }
type Run = {
  run_id: string; request_digest: string; request: unknown; routing_digest: string; job_id: string
  status: 'queued' | 'complete' | 'blocked'; error_code: string | null
}

async function verifyJournalQueue(boss: PgBoss, expectedRetryLimit = QUEUE_OPTIONS.retryLimit) {
  const queue = await boss.getQueue(JOURNAL_QUEUE)
  requireCondition(queue && Object.entries({ ...QUEUE_OPTIONS, retryLimit: expectedRetryLimit })
    .every(([key, value]) => queue[key as keyof typeof queue] === value),
  'Private journal queue is absent or differs from reviewed configuration')
}

export async function migrateJournal(pool: pg.Pool, connectionString: string) {
  await migrateDelivery(pool, connectionString)
  await migrateDatabase(pool, connectionString, { journal: true })
  const client = await pool.connect()
  const boss = createBoss(connectionString)
  try {
    await client.query('SELECT pg_advisory_lock(830031, 3)')
    await boss.start()
    await boss.createQueue(JOURNAL_QUEUE, QUEUE_OPTIONS)
    const queue = await boss.getQueue(JOURNAL_QUEUE)
    if (queue?.retryLimit === 4) {
      await verifyJournalQueue(boss, 4)
      await boss.updateQueue(JOURNAL_QUEUE, { retryLimit: QUEUE_OPTIONS.retryLimit })
    }
    await verifyJournalQueue(boss)
  } finally {
    try { await boss.stop() }
    finally {
      await client.query('SELECT pg_advisory_unlock(830031, 3)').catch(() => {})
      client.release()
    }
  }
}

export async function startJournal(pool: pg.Pool, connectionString: string, supervise: boolean) {
  await requireMigrated(pool, { journal: true })
  const boss = await startDelivery(pool, connectionString, supervise)
  try {
    await verifyJournalQueue(boss)
    return boss
  } catch (error) { await boss.stop(); throw error }
}

function admissionDigest(request: JournalRequest) {
  return digest(json(journalRequest.parse(request)))
}

async function sendJournal(client: pg.PoolClient, boss: PgBoss, runId: string, jobId: string) {
  const sent = await boss.send(JOURNAL_QUEUE, { runId }, { id: jobId, ...QUEUE_OPTIONS, db: transactionAdapter(client) })
  requireCondition(sent === jobId, 'Private journal queue did not accept the bound job')
}

/** Bind a request key and its queue job in one transaction. */
export async function enqueueJournal(pool: pg.Pool, boss: PgBoss, request: JournalRequest, routing: JournalRouting) {
  const client = await pool.connect()
  const runId = randomUUID(), jobId = randomUUID()
  const requestSha = admissionDigest(request), routingSha = routingDigest(routing)
  try {
    await client.query('BEGIN')
    const inserted = await client.query(`INSERT INTO dailylogger_service.journal_runs
      (run_id,request_key,request_digest,request,routing_digest,job_id)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(request_key) DO NOTHING`,
    [runId, request.key, requestSha, JSON.stringify(request), routingSha, jobId])
    if (inserted.rowCount) await sendJournal(client, boss, runId, jobId)
    const { rows: [run] } = await client.query<Run>('SELECT * FROM dailylogger_service.journal_runs WHERE request_key=$1', [request.key])
    requireCondition(run.request_digest === requestSha && run.routing_digest === routingSha, 'Journal key already refers to different inputs or model routing')
    await client.query('COMMIT')
    return { runId: run.run_id, jobId: run.job_id }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

/** Replace an expired or terminal delivery, retaining the same immutable run and call history. */
export async function redriveJournal(pool: pg.Pool, boss: PgBoss, runId: string) {
  return withRunLock(pool, runId, async client => {
    await client.query('BEGIN')
    try {
      const { rows: [run] } = await client.query<Run>('SELECT * FROM dailylogger_service.journal_runs WHERE run_id=$1', [runId])
      requireCondition(run?.status === 'queued', 'Only an unsettled private journal run can be re-driven')
      const job = await boss.getJobById(JOURNAL_QUEUE, run.job_id)
      if (job && !['failed', 'cancelled'].includes(job.state)) {
        requireCondition(job.state !== 'completed', 'Completed queue delivery has no journal settlement')
        await client.query('COMMIT')
        return { runId, jobId: run.job_id }
      }
      const jobId = randomUUID()
      await sendJournal(client, boss, runId, jobId)
      await client.query('UPDATE dailylogger_service.journal_runs SET job_id=$2 WHERE run_id=$1', [runId, jobId])
      await client.query('COMMIT')
      return { runId, jobId }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  })
}

export async function journalStatus(pool: pg.Pool, boss: PgBoss, runId: string) {
  const { rows: [run] } = await pool.query<Run>('SELECT * FROM dailylogger_service.journal_runs WHERE run_id=$1', [runId])
  requireCondition(run, 'Private journal run does not exist')
  const job = await boss.getJobById(JOURNAL_QUEUE, run.job_id)
  const calls = await pool.query(`SELECT step,attempt,status FROM dailylogger_service.journal_model_calls
    WHERE run_id=$1 ORDER BY CASE step WHEN 'draft' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,attempt`, [runId])
  const exhausted = run.status === 'queued' && (job?.state === 'failed' || job?.state === 'cancelled' || !job)
  return { runId, status: exhausted ? 'blocked' : run.status, error: exhausted ? 'journal_delivery_unavailable' : run.error_code,
    queueState: job?.state ?? null, calls: calls.rows }
}

export async function journalResult(pool: pg.Pool, runId: string) {
  const { rows: [row] } = await pool.query<{ request: unknown; result: string }>(`SELECT r.request,c.result
    FROM dailylogger_service.journal_runs r JOIN dailylogger_service.journal_model_calls c USING(run_id)
    WHERE r.run_id=$1 AND r.status='complete' AND c.step='revise' AND c.status='complete'`, [runId])
  requireCondition(row, 'Private revision is not complete')
  const result = validateJournalOutput('revise', JSON.parse(row.result) as unknown, journalRequest.parse(row.request).reportDate)
  requireCondition(result, 'Stored private revision is invalid')
  return result
}

export async function executeJournal(pool: pg.Pool, connectionString: string, job: Pick<Job<JournalJob>, 'id' | 'data'>,
  routing: JournalRouting, telemetry: Telemetry) {
  const { runId } = job.data
  const observation = beginObservation(telemetry, 'delivery', { runId, workflowVersion: JOURNAL_VERSION })
  try {
    await withRunLock(pool, runId, async (client, assertActive) => {
      const { rows: [run] } = await client.query<Run>('SELECT * FROM dailylogger_service.journal_runs WHERE run_id=$1', [runId])
      requireCondition(run && run.job_id === job.id, 'Delivery does not match an admitted private journal run')
      if (run.status !== 'queued') return
      const checkpointer = openCheckpointer(connectionString)
      try {
        // A replacement worker with different routing must not redirect an admitted job.
        if (routingDigest(routing) !== run.routing_digest) throw new JournalBlocked('model_routing_changed')
        const request = journalRequest.parse(run.request)
        if (admissionDigest(request) !== run.request_digest) throw new JournalBlocked('journal_input_changed')
        await runJournalGraph(client, checkpointer, assertActive, runId, request, run.request_digest, routing, observation)
        await client.query("UPDATE dailylogger_service.journal_runs SET status='complete' WHERE run_id=$1", [runId])
      } catch (error) {
        if (!(error instanceof JournalBlocked)) throw error
        await client.query("UPDATE dailylogger_service.journal_runs SET status='blocked',error_code=$2 WHERE run_id=$1", [runId, error.reason])
      } finally { await checkpointer.end() }
    })
    observation.end('returned')
  } catch (error) {
    observation.end(error instanceof JournalRetry ? 'retrying' : 'failed')
    // pg-boss persists worker failures. Pass only a fixed operational message.
    throw new Error(error instanceof JournalRetry ? 'private_model_rejected' : 'private_journal_execution_failed')
  }
}
