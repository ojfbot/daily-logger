import type pg from 'pg'
import type { PgBoss } from 'pg-boss'
import { randomUUID } from 'node:crypto'
import { digest, json, requireCondition } from './fixture.js'
import { admitRunInTransaction, runOperation, type LockedRunContext, type RunRow } from './postgres-runner.js'
import { POSTGRES_WORKFLOW_VERSION } from './postgres-fixture.js'
import { QUEUE, QUEUE_OPTIONS, transactionAdapter } from './delivery-db.js'

type Kind = 'start' | 'resume' | 'recover' | 'cancel'
export interface CommandRequest { schemaVersion: 1; actorId: string; key: string; operation: Kind; payload: Record<string, string> }
export interface CommandRow {
  command_id: string; actor_id: string; idempotency_key: string; operation: Kind
  request_text: string; request_digest: string; route: string; run_id: string | null
  target_text: string; admission: string; response_status: number; response_text: string
  disposition: string; job_id: string | null; result_text: string | null; error_code: string | null
}
export interface Admission { status: number; body: string }
export const FINAL_DISPOSITIONS = ['succeeded', 'failed', 'stale', 'cancelled', 'rejected']
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function record(value: unknown): Record<string, unknown> {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), 'Command must be a JSON object')
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  requireCondition(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'Unexpected or missing command fields')
}
export function parseCommand(value: unknown): CommandRequest {
  const input = record(value)
  exactKeys(input, ['schemaVersion', 'actorId', 'key', 'operation', 'payload'])
  requireCondition(input.schemaVersion === 1, 'Unsupported command schema')
  requireCondition(typeof input.actorId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.actorId), 'Explicit trusted fixture actor label is required')
  requireCondition(typeof input.key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.key), 'Invalid idempotency key')
  requireCondition(typeof input.operation === 'string' && ['start', 'resume', 'recover', 'cancel'].includes(input.operation), 'Unsupported command operation')
  const operation = input.operation as Kind
  const payload = record(input.payload)
  exactKeys(payload, operation === 'start' ? ['runDir'] : operation === 'resume' ? ['runId', 'resumeTargetId'] : ['runId'])
  for (const [name, field] of Object.entries(payload)) {
    requireCondition(typeof field === 'string' && field.length > 0 && field.length <= 4096, `Invalid ${name}`)
    if (name !== 'runDir') requireCondition(UUID.test(field), `Invalid ${name} UUID`)
  }
  // Keep exact validated payload values. Canonicalized server targets are separate.
  return { schemaVersion: 1, actorId: input.actorId, key: input.key, operation, payload: Object.fromEntries(Object.entries(payload).sort()) as Record<string, string> }
}
function route(request: CommandRequest) { return request.operation === 'start' ? 'fixture/runs' : `fixture/runs/${request.payload.runId.toLowerCase()}/${request.operation}` }
export function requestDigest(request: CommandRequest) { return digest(json({ schemaVersion: 1, actorId: request.actorId, operation: request.operation, route: route(request), payload: request.payload })) }

/** Caller owns BEGIN/COMMIT. The pg-boss INSERT uses this exact client. */
export async function admitCommandInTransaction(client: pg.PoolClient, boss: PgBoss, value: unknown): Promise<Admission> {
  const request = parseCommand(value)
  const canonicalDigest = requestDigest(request)
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`dailylogger-command:${request.actorId}:${request.key}`])
  const existing = await client.query<CommandRow>('SELECT * FROM dailylogger_service.fixture_commands WHERE actor_id=$1 AND idempotency_key=$2', [request.actorId, request.key])
  if (existing.rows.length) {
    const row = existing.rows[0]
    if (row.request_digest !== canonicalDigest || row.request_text !== json(request)) return { status: 409, body: json({ error: 'idempotency_conflict', commandId: row.command_id }) }
    return { status: row.response_status, body: row.response_text }
  }
  const commandId = randomUUID()
  let run: RunRow | undefined
  let rejection: string | undefined
  let target: Record<string, unknown> = {}
  if (request.operation === 'start') {
    // SAVEPOINT allows well-formed admission conflicts to become durable receipts.
    await client.query('SAVEPOINT run_admission')
    try {
      const internalKey = `delivery:${digest(`${request.actorId}\0${request.key}\0${canonicalDigest}`)}`
      const prior = await client.query<RunRow>('SELECT * FROM dailylogger_service.fixture_runs WHERE request_key=$1', [internalKey])
      requireCondition(!prior.rows.length || prior.rows[0].delivery_owner === 's03b', 'Cannot adopt a direct-CLI run')
      run = await admitRunInTransaction(client, internalKey, request.payload.runDir)
      await client.query("UPDATE dailylogger_service.fixture_runs SET delivery_owner='s03b' WHERE run_id=$1", [run.run_id])
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT run_admission')
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const knownLegacyConflict = error instanceof Error && [
        'Run directory is already bound to another request key',
        'Request key already exists with different immutable inputs or run directory',
        'Cannot adopt a direct-CLI run',
      ].includes(error.message)
      if (code !== 'ADMISSION_CONFLICT' && !knownLegacyConflict) throw error
      rejection = 'run_admission_conflict'
    }
    await client.query('RELEASE SAVEPOINT run_admission')
  } else {
    const result = await client.query<RunRow>('SELECT * FROM dailylogger_service.fixture_runs WHERE run_id=$1', [request.payload.runId.toLowerCase()])
    run = result.rows[0]
    if (!run || run.delivery_owner !== 's03b') { rejection = 'queue_run_not_found'; run = undefined }
    else if (request.operation !== 'cancel') {
      const cancelled = await client.query('SELECT 1 FROM dailylogger_service.run_cancellations WHERE run_id=$1 LIMIT 1', [run.run_id])
      if (cancelled.rows.length) rejection = 'run_cancelled'
      if (!rejection && request.operation === 'resume') {
        const targets = await client.query<{ target_id: string; target_text: string; consumed_by: string | null }>('SELECT * FROM dailylogger_service.resume_targets WHERE run_id=$1 AND target_id=$2', [run.run_id, request.payload.resumeTargetId.toLowerCase()])
        const bound = targets.rows[0]
        if (!bound || bound.consumed_by) rejection = 'resume_target_stale'
        else target = { resumeTargetId: bound.target_id, subject: JSON.parse(bound.target_text) as unknown }
      }
    }
  }
  if (run) target = { ...target, runId: run.run_id, manifestDigest: run.manifest_digest, workflowVersion: run.workflow_version }
  const rejected = Boolean(rejection)
  const status = rejected ? 409 : 202
  const body = json(rejected
    ? { admission: 'rejected', commandId, runId: null, error: rejection }
    : { admission: 'admitted', commandId, runId: run!.run_id })
  await client.query(`INSERT INTO dailylogger_service.fixture_commands
    (command_id,actor_id,idempotency_key,schema_version,operation,route,request_text,request_digest,run_id,target_text,admission,response_status,response_text,disposition,error_code)
    VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
  [commandId, request.actorId, request.key, request.operation, route(request), json(request), canonicalDigest, rejected ? null : run!.run_id, json(target), rejected ? 'rejected' : 'admitted', status, body, rejected ? 'rejected' : 'queued', rejection ?? null])
  if (!rejected) {
    if (request.operation === 'cancel') await client.query("INSERT INTO dailylogger_service.run_cancellations(command_id,run_id,state) VALUES($1,$2,'requested')", [commandId, run!.run_id])
    const jobId = await boss.send(QUEUE, { commandId }, { ...QUEUE_OPTIONS, db: transactionAdapter(client) })
    requireCondition(jobId, 'Queue did not create a delivery; admission transaction must roll back')
    await client.query('UPDATE dailylogger_service.fixture_commands SET job_id=$2 WHERE command_id=$1', [commandId, jobId])
  }
  return { status, body }
}

export async function admitCommand(pool: pg.Pool, boss: PgBoss, value: unknown) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'")
    const admission = await admitCommandInTransaction(client, boss, value)
    await client.query('COMMIT')
    return admission
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export function isTransient(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  return code.startsWith('08') || ['40001', '40P01', '55P03', '57014', '57P01', '57P02', '57P03', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code)
}

export function currentResumeSubject(context: LockedRunContext) {
  const { snapshot } = context
  const tasks = snapshot.tasks.filter(task => task.interrupts?.length)
  if (!tasks.length) return null
  requireCondition(tasks.length === 1 && tasks[0].interrupts!.length === 1 && snapshot.next.includes('human_gate'), 'Unexpected fixture interrupt shape')
  const interruption = tasks[0].interrupts![0]
  requireCondition(interruption.id, 'Fixture interrupt has no stable identity')
  return {
    runId: context.row.run_id, workflowVersion: POSTGRES_WORKFLOW_VERSION, manifestDigest: context.manifestDigest,
    namespace: snapshot.config?.configurable?.checkpoint_ns ?? '', checkpointId: snapshot.config?.configurable?.checkpoint_id,
    taskId: tasks[0].id, interruptId: interruption.id, subjectDigest: context.expectedApproval,
    scope: 'write-isolated-shadow-artifacts-only',
  }
}

export async function installResumeTarget(context: LockedRunContext) {
  const subject = currentResumeSubject(context)
  if (!subject) return
  const text = json(subject)
  await context.client.query(`INSERT INTO dailylogger_service.resume_targets(target_id,run_id,target_digest,target_text)
    VALUES($1,$2,$3,$4) ON CONFLICT(run_id,target_digest) DO NOTHING`, [randomUUID(), context.row.run_id, digest(text), text])
}

export async function commandStatus(pool: pg.Pool, boss: PgBoss, commandId: string) {
  requireCondition(UUID.test(commandId), 'Invalid command UUID')
  const result = await pool.query<CommandRow>('SELECT * FROM dailylogger_service.fixture_commands WHERE command_id=$1', [commandId.toLowerCase()])
  const row = result.rows[0]
  requireCondition(row, 'Command not found')
  const job = row.job_id ? await boss.getJobById(QUEUE, row.job_id) : null
  // Delivery loss/exhaustion does not prove that a separate graph effect failed.
  const uncertain = row.admission === 'admitted' && !FINAL_DISPOSITIONS.includes(row.disposition) && (!job || ['failed', 'cancelled', 'completed'].includes(job.state))
  const attempts = await pool.query('SELECT attempt_id,operation,state,before_checkpoint_id,after_checkpoint_id,nodes,error_code,started_at,finished_at,delivery_retry FROM dailylogger_service.operation_attempts WHERE command_id=$1 ORDER BY started_at', [row.command_id])
  return { commandId: row.command_id, runId: row.run_id, admission: { status: row.response_status, body: row.response_text },
    disposition: uncertain ? 'reconciliation_required' : row.disposition,
    target: JSON.parse(row.target_text) as unknown, attempts: attempts.rows,
    result: row.result_text ? JSON.parse(row.result_text) as unknown : null,
    failure: uncertain ? (!job ? 'delivery_missing' : `delivery_${job.state}`) : row.error_code,
    delivery: job ? { state: job.state, retryCount: job.retryCount, retryLimit: job.retryLimit } : null }
}

export async function runStatus(pool: pg.Pool, connectionString: string, runId: string) {
  const state = await runOperation(pool, connectionString, 'status', runId.toLowerCase())
  const targets = await pool.query<{ target_id: string; target_text: string; consumed_by: string | null }>('SELECT * FROM dailylogger_service.resume_targets WHERE run_id=$1 ORDER BY created_at DESC', [state.runId])
  const target = targets.rows.find(row => !row.consumed_by && (JSON.parse(row.target_text) as { checkpointId: string }).checkpointId === state.checkpointId)
  const cancellations = await pool.query('SELECT command_id,state,requested_at,reconciled_at FROM dailylogger_service.run_cancellations WHERE run_id=$1 ORDER BY requested_at', [state.runId])
  return { ...state, resumeTargetId: target?.target_id ?? null, cancellations: cancellations.rows }
}
