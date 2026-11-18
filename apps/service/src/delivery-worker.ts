import type pg from 'pg'
import type { Job, PgBoss } from 'pg-boss'
import { json, requireCondition } from './fixture.js'
import { runOperation, type LockedRunContext, type Operation } from './postgres-runner.js'
import { currentResumeSubject, FINAL_DISPOSITIONS, installResumeTarget, isTransient, parseCommand, requestDigest, UUID, type CommandRow } from './delivery-commands.js'
import { DRAIN_TIMEOUT_MS, QUEUE, QUEUE_OPTIONS, SEGMENT_TIMEOUT_MS, SHUTDOWN_TIMEOUT_MS } from './delivery-db.js'

class CommandRejection extends Error {
  constructor(readonly reason: string) { super(reason) }
}
type Payload = { commandId: string }
async function loadCommand(client: Pick<pg.Pool, 'query'>, commandId: string) {
  const result = await client.query<CommandRow>('SELECT * FROM dailylogger_service.fixture_commands WHERE command_id=$1', [commandId])
  requireCondition(result.rows.length === 1, 'Delivery command is missing')
  return result.rows[0]
}
async function isSuccessor(context: LockedRunContext, ancestor: string, namespace: string): Promise<boolean> {
  const found = await context.client.query(`WITH RECURSIVE history AS (
    SELECT checkpoint_id,parent_checkpoint_id FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND checkpoint_ns=$2 AND checkpoint_id=$3
    UNION SELECT p.checkpoint_id,p.parent_checkpoint_id FROM dailylogger_checkpoints.checkpoints p JOIN history h ON p.checkpoint_id=h.parent_checkpoint_id WHERE p.thread_id=$1 AND p.checkpoint_ns=$2
  ) SELECT 1 FROM history WHERE checkpoint_id=$4 LIMIT 1`, [context.row.run_id, namespace, context.snapshot.config?.configurable?.checkpoint_id, ancestor])
  return found.rows.length === 1
}
async function reconcileCancellation(context: LockedRunContext) {
  await context.client.query(`UPDATE dailylogger_service.run_cancellations SET state=$2,reconciled_at=now() WHERE run_id=$1 AND state='requested'`,
    [context.row.run_id, context.snapshot.values.published ? 'already_completed' : 'effective'])
}

/** One delivery, one run lock. Checkpoint/file commits remain separate from settlement. */
export async function executeDelivery(pool: pg.Pool, connectionString: string, job: Pick<Job<Payload>, 'id' | 'data' | 'retryCount'>) {
  requireCondition(job.data && UUID.test(job.data.commandId), 'Invalid command reference in delivery')
  const admitted = await loadCommand(pool, job.data.commandId)
  requireCondition(admitted.run_id && admitted.admission === 'admitted' && admitted.job_id === job.id, 'Delivery does not match its admitted command')
  let observed: CommandRow = admitted
  try {
    return await runOperation(pool, connectionString, 'start', admitted.run_id, undefined, {
      commandId: admitted.command_id, jobId: job.id, retryCount: job.retryCount,
      plan: async context => {
        observed = await loadCommand(context.client, admitted.command_id)
        const original = parseCommand(JSON.parse(observed.request_text) as unknown)
        const bound = JSON.parse(observed.target_text) as { runId: string; manifestDigest: string; workflowVersion: string; resumeTargetId?: string; subject?: unknown }
        requireCondition(requestDigest(original) === observed.request_digest && original.actorId === observed.actor_id && original.key === observed.idempotency_key && original.operation === observed.operation, 'Stored command identity differs')
        requireCondition(bound.runId === context.row.run_id && bound.manifestDigest === context.manifestDigest && bound.workflowVersion === context.row.workflow_version, 'Command is bound to different immutable run inputs')
        if (FINAL_DISPOSITIONS.includes(observed.disposition)) return { operation: 'status' }
        const cancellation = await context.client.query('SELECT 1 FROM dailylogger_service.run_cancellations WHERE run_id=$1 LIMIT 1', [context.row.run_id])
        if (cancellation.rows.length) {
          await reconcileCancellation(context)
          if (observed.operation !== 'cancel') {
            await context.client.query("UPDATE dailylogger_service.fixture_commands SET disposition='cancelled',result_text=$2,settled_at=now() WHERE command_id=$1", [observed.command_id, json({ outcome: 'cancelled_before_next_segment' })])
          }
          return { operation: 'status' }
        }
        requireCondition(observed.operation !== 'cancel', 'Cancellation command lacks its durable cancellation request')
        await context.client.query("UPDATE dailylogger_service.fixture_commands SET disposition='running',error_code=NULL WHERE command_id=$1", [observed.command_id])
        if (observed.operation === 'resume') {
          const targetRows = await context.client.query<{ target_text: string; consumed_by: string | null }>('SELECT * FROM dailylogger_service.resume_targets WHERE target_id=$1 AND run_id=$2', [bound.resumeTargetId, context.row.run_id])
          const target = targetRows.rows[0]
          if (!target || json(bound.subject) !== target.target_text || (target.consumed_by && target.consumed_by !== observed.command_id)) throw new CommandRejection('resume_target_stale')
          const subject = JSON.parse(target.target_text) as { checkpointId: string; namespace: string }
          const exact = json(currentResumeSubject(context)) === target.target_text
          if (!target.consumed_by) {
            if (!exact) throw new CommandRejection('resume_target_stale')
            await context.client.query('UPDATE dailylogger_service.resume_targets SET consumed_by=$2,consumed_at=now() WHERE target_id=$1 AND consumed_by IS NULL', [bound.resumeTargetId, observed.command_id])
          } else if (!exact) {
            if (!await isSuccessor(context, subject.checkpointId, subject.namespace)) throw new CommandRejection('resume_successor_unproven')
            if (currentResumeSubject(context)) throw new CommandRejection('resume_interrupt_changed')
          }
          if (exact) return { operation: 'resume', approval: context.expectedApproval }
          return { operation: context.snapshot.values.published ? 'status' : 'recover' }
        }
        // Retrying start advances existing pending work; direct CLI start still observes.
        const hasCheckpoint = Boolean(context.snapshot.config?.configurable?.checkpoint_id)
        const waiting = Boolean(currentResumeSubject(context))
        const operation: Operation = context.snapshot.values.published || waiting ? 'status' : hasCheckpoint ? 'recover' : 'start'
        return { operation }
      },
      settled: async context => {
        await installResumeTarget(context)
        await reconcileCancellation(context)
        const outcome = context.snapshot.values.published ? 'complete' : currentResumeSubject(context) ? 'awaiting_approval' : 'no_segment_executed'
        const result = { outcome, checkpointId: context.snapshot.config?.configurable?.checkpoint_id ?? null, receiptSha256: context.snapshot.values.published?.receiptSha256 ?? null }
        await context.client.query(`UPDATE dailylogger_service.fixture_commands SET disposition='succeeded',result_text=$2,error_code=NULL,settled_at=now()
          WHERE command_id=$1 AND disposition NOT IN ('succeeded','failed','stale','cancelled','rejected')`, [observed.command_id, json(result)])
      },
    })
  } catch (error) {
    const transient = isTransient(error)
    const exhausted = job.retryCount >= QUEUE_OPTIONS.retryLimit
    const disposition = transient ? exhausted ? 'reconciliation_required' : 'retrying' : error instanceof CommandRejection ? 'stale' : 'rejected'
    const reason = transient ? exhausted ? 'delivery_retries_exhausted' : 'transient_execution_failure' : error instanceof CommandRejection ? error.reason : 'fixture_integrity_rejected'
    await pool.query(`UPDATE dailylogger_service.fixture_commands SET disposition=$2,error_code=$3,settled_at=CASE WHEN $2='retrying' THEN NULL ELSE now() END
      WHERE command_id=$1 AND disposition NOT IN ('succeeded','failed','stale','cancelled','rejected')`, [admitted.command_id, disposition, reason]).catch(() => {})
    if (transient) throw new Error('Transient fixture delivery failed')
    return { disposition, error: reason }
  }
}

/** The executable owns process lifetime: timeout/claim loss cannot leave a live handler. */
export async function runWorker(pool: pg.Pool, connectionString: string, boss: PgBoss) {
  let active = false
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    const deadline = setTimeout(() => { process.stderr.write('Fixture worker shutdown deadline reached\n'); process.exit(1) }, SHUTDOWN_TIMEOUT_MS)
    try {
      await boss.stop({ graceful: true, timeout: DRAIN_TIMEOUT_MS })
      if (active) { process.stderr.write('Fixture segment exceeded shutdown drain\n'); process.exit(1) }
      await pool.end()
      clearTimeout(deadline)
      process.exit(0)
    } catch { process.stderr.write('Fixture worker shutdown failed\n'); process.exit(1) }
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  await boss.work<Payload>(QUEUE, { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 0.5, includeMetadata: true }, async jobs => {
    const [job] = jobs
    active = true
    const abort = () => { process.stderr.write('Fixture delivery claim ended; stopping process\n'); process.exit(1) }
    const deadline = setTimeout(() => { process.stderr.write('Fixture segment deadline reached\n'); process.exit(1) }, SEGMENT_TIMEOUT_MS)
    job.signal.addEventListener('abort', abort, { once: true })
    try {
      if (job.signal.aborted) abort()
      return await executeDelivery(pool, connectionString, job)
    } finally { clearTimeout(deadline); job.signal.removeEventListener('abort', abort); active = false }
  })
  console.log(json({ worker: 'ready', queue: QUEUE, concurrency: 1, segmentTimeoutMs: SEGMENT_TIMEOUT_MS, drainTimeoutMs: DRAIN_TIMEOUT_MS, shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS }).trim())
}
