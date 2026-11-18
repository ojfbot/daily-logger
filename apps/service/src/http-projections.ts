import { z } from 'zod'
import { FINAL_DISPOSITIONS } from './delivery-commands.js'
import { QUEUE } from './delivery-db.js'
import { checkedAdmission } from './http-fixtures.js'
import { HttpError, stored, type HttpReader } from './http-db.js'

const nullableUuid = z.uuid().nullable()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const operation = z.enum(['start', 'resume', 'recover', 'cancel'])
const disposition = z.enum(['queued', 'running', 'retrying', 'reconciliation_required', 'succeeded', 'failed', 'stale', 'cancelled', 'rejected'])
const runRow = z.object({
  run_id: z.uuid(), status: z.enum(['admitted', 'awaiting-approval', 'recoverable', 'complete']),
  checkpoint_id: nullableUuid, receipt_sha256: digest.nullable(), updated_at: z.date(),
  workflow_version: z.string(), manifest_digest: digest,
})
const commandRow = z.object({
  command_id: z.uuid(), run_id: nullableUuid, operation, disposition,
  admission: z.enum(['admitted', 'rejected']), response_status: z.number().int(), response_text: z.string(),
  target_text: z.string(), result_text: z.string().nullable(), error_code: z.string().nullable(),
  job_state: z.string().nullable(), run_updated_at: z.date().nullable(),
  run_manifest_digest: digest.nullable(), run_workflow_version: z.string().nullable(),
})
const attemptRow = z.object({
  attempt_id: z.uuid(), command_id: nullableUuid, run_id: z.uuid(), operation: z.enum(['start', 'resume', 'recover']),
  state: z.enum(['running', 'succeeded', 'failed', 'abandoned']), started_at: z.date(), finished_at: z.date().nullable(),
  before_checkpoint_id: nullableUuid, after_checkpoint_id: nullableUuid, delivery_retry: z.number().int().nonnegative().nullable(),
  error_code: z.string().nullable(),
})
const subjectSchema = z.object({
  runId: z.uuid(), workflowVersion: z.string(), manifestDigest: digest, checkpointId: z.uuid(),
  scope: z.literal('write-isolated-shadow-artifacts-only'),
})
const commandSelect = `SELECT c.command_id,c.run_id,c.operation,c.disposition,c.admission,c.response_status,c.response_text,
  c.target_text,c.result_text,c.error_code,j.state AS job_state,r.updated_at AS run_updated_at,
  r.manifest_digest AS run_manifest_digest,r.workflow_version AS run_workflow_version
  FROM dailylogger_service.fixture_commands c
  LEFT JOIN dailylogger_delivery.job j ON j.id=c.job_id AND j.name='${QUEUE}'
  LEFT JOIN dailylogger_service.fixture_runs r ON r.run_id=c.run_id`
const attemptSelect = `SELECT attempt_id,command_id,run_id,operation,state,started_at,finished_at,
  before_checkpoint_id,after_checkpoint_id,delivery_retry,error_code FROM dailylogger_service.operation_attempts`

function parsedJson(text: string): unknown {
  try { return JSON.parse(text) } catch { throw new HttpError(503, 'integrity_rejected') }
}

function currentDisposition(row: z.infer<typeof commandRow>) {
  const uncertain = row.admission === 'admitted' && !FINAL_DISPOSITIONS.includes(row.disposition)
    && (row.job_state === null || ['failed', 'cancelled', 'completed'].includes(row.job_state))
  return uncertain ? 'reconciliation_required' : row.disposition
}

function attemptView(row: z.infer<typeof attemptRow>) {
  return {
    attemptId: row.attempt_id, commandId: row.command_id, operation: row.operation, state: row.state,
    startedAt: row.started_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null,
    beforeCheckpointId: row.before_checkpoint_id, afterCheckpointId: row.after_checkpoint_id, retryNumber: row.delivery_retry,
    failureCode: row.error_code === null ? null : row.error_code === 'operation-failed' ? 'attempt_failed'
      : row.error_code === 'process-ended-before-settlement' ? 'process_ended_before_settlement' : 'unknown_failure',
  }
}

const failureCodes = new Set(['run_admission_conflict', 'queue_run_not_found', 'run_cancelled', 'resume_target_stale',
  'resume_successor_unproven', 'resume_interrupt_changed', 'fixture_integrity_rejected', 'transient_execution_failure',
  'delivery_retries_exhausted', 'delivery_missing', 'delivery_failed', 'delivery_cancelled', 'delivery_completed'])

export async function commandProjection(client: HttpReader, commandId: string, readAt: string) {
  const result = await client.query(`${commandSelect} WHERE c.command_id=$1`, [commandId])
  if (!result.rows.length) throw new HttpError(404, 'not_found')
  const row = stored(commandRow, result.rows[0])
  const admission = checkedAdmission(row)
  const attempts = stored(z.array(attemptRow), (await client.query(`${attemptSelect} WHERE command_id=$1 ORDER BY started_at,attempt_id`, [commandId])).rows)
  if (attempts.some(attempt => attempt.command_id !== commandId || attempt.run_id !== row.run_id)) throw new HttpError(503, 'integrity_rejected')
  let target = null
  if (row.admission === 'admitted') {
    const bound = stored(z.object({ runId: z.uuid(), manifestDigest: digest, workflowVersion: z.string(), resumeTargetId: z.uuid().optional(), subject: subjectSchema.optional() }), parsedJson(row.target_text))
    if (bound.runId !== row.run_id || bound.manifestDigest !== row.run_manifest_digest || bound.workflowVersion !== row.run_workflow_version) throw new HttpError(503, 'integrity_rejected')
    if (row.operation === 'resume' && (!bound.resumeTargetId || !bound.subject || bound.subject.runId !== bound.runId
      || bound.subject.manifestDigest !== bound.manifestDigest || bound.subject.workflowVersion !== bound.workflowVersion)) throw new HttpError(503, 'integrity_rejected')
    target = { runId: bound.runId, manifestDigest: bound.manifestDigest, workflowVersion: bound.workflowVersion,
      resumeTargetId: bound.resumeTargetId ?? null, scope: bound.subject?.scope ?? null }
  }
  let outcome = null
  if (row.result_text) {
    const value = stored(z.object({ outcome: z.enum(['complete', 'awaiting_approval', 'no_segment_executed', 'cancelled_before_next_segment']),
      checkpointId: nullableUuid.optional(), receiptSha256: digest.nullable().optional() }), parsedJson(row.result_text))
    outcome = { outcome: value.outcome === 'complete' ? 'fixture_complete' : value.outcome === 'awaiting_approval' ? 'awaiting_owner' : value.outcome,
      checkpointId: value.checkpointId ?? null, receiptSha256: value.receiptSha256 ?? null }
  }
  const state = currentDisposition(row)
  const code = state === 'reconciliation_required' && row.disposition !== 'reconciliation_required'
    ? row.job_state === null ? 'delivery_missing' : `delivery_${row.job_state}` : row.error_code
  return {
    schemaVersion: 1, commandId: row.command_id, runId: row.run_id, operation: row.operation,
    admission: { status: row.response_status, body: admission }, disposition: state, target,
    attempts: attempts.map(attemptView), result: outcome, failure: code === null ? null : { code: failureCodes.has(code) ? code : 'unknown_failure' },
    read: { source: 'application_projection', readAt, runUpdatedAt: row.run_updated_at?.toISOString() ?? null },
  }
}

export async function runProjection(client: HttpReader, runId: string, readAt: string) {
  const result = await client.query(`SELECT run_id,status,checkpoint_id,receipt_sha256,updated_at,workflow_version,manifest_digest
    FROM dailylogger_service.fixture_runs WHERE run_id=$1`, [runId])
  if (!result.rows.length) throw new HttpError(404, 'not_found')
  const row = stored(runRow, result.rows[0])
  const commands = stored(z.array(commandRow), (await client.query(`${commandSelect} WHERE c.run_id=$1 ORDER BY c.created_at,c.command_id`, [runId])).rows)
  for (const command of commands) checkedAdmission(command)
  const commandsById = new Map(commands.map(command => [command.command_id, command]))
  const attempts = stored(z.array(attemptRow), (await client.query(`${attemptSelect} WHERE run_id=$1 ORDER BY started_at,attempt_id`, [runId])).rows)
  if (attempts.some(attempt => attempt.run_id !== runId || (attempt.command_id !== null && !commandsById.has(attempt.command_id)))) throw new HttpError(503, 'integrity_rejected')
  const cancellations = stored(z.array(z.object({ command_id: z.uuid(), state: z.enum(['requested', 'effective', 'already_completed']), requested_at: z.date(), reconciled_at: z.date().nullable() })),
    (await client.query('SELECT command_id,state,requested_at,reconciled_at FROM dailylogger_service.run_cancellations WHERE run_id=$1 ORDER BY requested_at,command_id', [runId])).rows)
  if (cancellations.some(cancel => {
    const command = commandsById.get(cancel.command_id)
    return command?.operation !== 'cancel' || command.admission !== 'admitted'
  })) throw new HttpError(503, 'integrity_rejected')
  let resumeTarget = null
  if (row.status === 'awaiting-approval' && cancellations.length === 0) {
    const targets = stored(z.array(z.object({ target_id: z.uuid(), target_text: z.string() })), (await client.query(`SELECT target_id,target_text
      FROM dailylogger_service.resume_targets WHERE run_id=$1 AND consumed_by IS NULL ORDER BY created_at DESC,target_id`, [runId])).rows)
    for (const target of targets) {
      const subject = stored(subjectSchema, parsedJson(target.target_text))
      if (subject.runId !== runId || subject.manifestDigest !== row.manifest_digest || subject.workflowVersion !== row.workflow_version) throw new HttpError(503, 'integrity_rejected')
      if (subject.checkpointId === row.checkpoint_id) { resumeTarget = { resumeTargetId: target.target_id, scope: subject.scope }; break }
    }
  }
  return {
    schemaVersion: 1, runId, state: row.status === 'complete' ? 'fixture_complete' : row.status === 'awaiting-approval' ? 'awaiting_owner' : row.status,
    checkpointId: row.checkpoint_id, receiptSha256: row.receipt_sha256,
    commands: commands.map(command => ({ commandId: command.command_id, operation: command.operation, disposition: currentDisposition(command) })),
    attempts: attempts.map(attemptView), resumeTarget,
    cancellations: cancellations.map(cancel => ({ commandId: cancel.command_id, state: cancel.state, requestedAt: cancel.requested_at.toISOString(), reconciledAt: cancel.reconciled_at?.toISOString() ?? null })),
    read: { source: 'application_projection', readAt, runUpdatedAt: row.updated_at.toISOString() },
  }
}
