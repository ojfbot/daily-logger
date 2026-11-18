import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { digest, json, requireCondition } from './fixture.js'
import { readPostgresFixture, POSTGRES_WORKFLOW_VERSION } from './postgres-fixture.js'
import { openCheckpointer, withRunLock } from './postgres-db.js'
import { checkedRunDir, initializeRun, recordAttempt, validateInputs } from './storage.js'
import { createWorkflow } from './workflow.js'

type Operation = 'start' | 'status' | 'resume' | 'recover'
interface RunRow {
  run_id: string; request_key: string; request_digest: string; run_dir: string
  manifest_digest: string; manifest_text: string; workflow_version: string
  status: string; checkpoint_id: string | null; receipt_sha256: string | null
}
type Snapshot = Awaited<ReturnType<ReturnType<typeof createWorkflow>['snapshot']>>

/** Application admission is durable before filesystem/graph execution begins. */
export async function admitRun(pool: pg.Pool, requestKey: string, directory: string): Promise<RunRow> {
  requireCondition(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestKey), 'Request key must be 1–128 letters, digits, dots, underscores, colons or hyphens')
  const runDir = checkedRunDir(directory)
  const runId = randomUUID()
  const fixture = readPostgresFixture(runId)
  const requestDigest = digest(json({ runDir, source: fixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
  try {
    await pool.query(`INSERT INTO dailylogger_service.fixture_runs
      (run_id, request_key, request_digest, run_dir, manifest_digest, manifest_text, workflow_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (request_key) DO NOTHING`,
    [runId, requestKey, requestDigest, runDir, fixture.manifestDigest, fixture.manifestBytes, POSTGRES_WORKFLOW_VERSION])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Run directory is already bound to another request key')
    throw error
  }
  const row = await readRun(pool, 'request_key', requestKey)
  requireCondition(row.request_digest === requestDigest && row.run_dir === runDir, 'Request key already exists with different immutable inputs or run directory')
  return row
}

async function readRun(db: Pick<pg.Pool, 'query'> | pg.PoolClient, field: 'run_id' | 'request_key', id: string): Promise<RunRow> {
  const result = await db.query<RunRow>(`SELECT * FROM dailylogger_service.fixture_runs WHERE ${field} = $1`, [id])
  requireCondition(result.rows.length === 1, 'Run not found; start a new fixture run explicitly')
  return result.rows[0]
}

function projection(snapshot: Snapshot) {
  // The first input checkpoint exists before __start__ populates public values.
  // Its raw __start__ channel already contains the immutable input for recovery.
  const hasCheckpoint = Boolean(snapshot.config?.configurable?.checkpoint_id)
  const awaitingApproval = snapshot.tasks.some(task => (task.interrupts?.length ?? 0) > 0)
  return {
    status: !hasCheckpoint ? 'admitted' : snapshot.values.published ? 'complete' : awaitingApproval ? 'awaiting-approval' : 'recoverable',
    checkpointId: snapshot.config?.configurable?.checkpoint_id ?? null,
    receiptSha256: snapshot.values.published?.receiptSha256 ?? null,
    hasCheckpoint,
    awaitingApproval,
  }
}

/** This projection follows durable graph state; it does not commit atomically with it. */
async function reconcile(client: pg.PoolClient, row: RunRow, snapshot: Snapshot): Promise<void> {
  const state = projection(snapshot)
  requireCondition(!row.checkpoint_id || state.hasCheckpoint, 'Application run references a missing graph checkpoint; refusing to restart it')
  requireCondition(row.status !== 'complete' || state.status === 'complete', 'Completed application run has an incomplete graph; reconciliation required')
  requireCondition(!row.receipt_sha256 || row.receipt_sha256 === state.receiptSha256, 'Application receipt identity conflicts with the graph')
  await client.query(`UPDATE dailylogger_service.fixture_runs SET status=$2, checkpoint_id=$3, receipt_sha256=$4, updated_at=now() WHERE run_id=$1`,
    [row.run_id, state.status, state.checkpointId, state.receiptSha256])
}

export async function runOperation(pool: pg.Pool, connectionString: string, operation: Operation, runId: string, approval?: string) {
  requireCondition(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId), 'Run ID must be a UUID')
  return withRunLock(pool, runId, async (client, assertActive) => {
    const row = await readRun(client, 'run_id', runId)
    const fixture = readPostgresFixture(runId)
    requireCondition(row.workflow_version === POSTGRES_WORKFLOW_VERSION && row.manifest_digest === fixture.manifestDigest && row.manifest_text === fixture.manifestBytes, 'Application run is bound to a different immutable manifest or workflow version')
    const runDir = checkedRunDir(row.run_dir)
    const requestDigest = digest(json({ runDir, source: fixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
    requireCondition(row.run_dir === runDir && row.request_digest === requestDigest, 'Application admission digest or canonical run directory differs')
    // A process can die after admission but before creating frozen inputs.
    // A repeated start uses the already-admitted UUID, not a new workflow.
    if (!existsSync(runDir)) {
      requireCondition(operation === 'start' && !row.checkpoint_id, 'Frozen run directory is missing; only an unstarted admission can initialize it')
      initializeRun(runDir, fixture)
    }
    validateInputs(runDir, fixture)
    const checkpointer = openCheckpointer(connectionString)
    let attemptId: string | null = null
    const workflow = createWorkflow(runDir, fixture, {
      checkpointer,
      threadId: runId,
      assertActive,
      receiptIdentity: { milestone: 'S03a PostgreSQL fixture checkpoint parity', runId },
      recordNode: async node => {
        assertActive()
        requireCondition(attemptId, 'Graph execution requires an operation attempt')
        await client.query(`UPDATE dailylogger_service.operation_attempts SET nodes = nodes || jsonb_build_array($2::text) WHERE attempt_id=$1`, [attemptId, node])
        recordAttempt(runDir, node)
      },
    })
    const validateSnapshot = async (snapshot: Snapshot) => {
      if (!projection(snapshot).hasCheckpoint) {
        requireCondition(Object.keys(snapshot.values).length === 0, 'Graph values exist without a checkpoint identity')
        return
      }
      if (Object.hasOwn(snapshot.values, 'manifestDigest')) {
        workflow.validate(snapshot.values)
        return
      }
      // Only the original, unexecuted input checkpoint may have empty public
      // values. Never treat later missing/corrupt state as permission to restart.
      const initial = Object.keys(snapshot.values).length === 0
        && snapshot.metadata?.source === 'input' && snapshot.metadata?.step === -1
        && !snapshot.parentConfig?.configurable?.checkpoint_id
        && snapshot.next.length === 1 && snapshot.next[0] === '__start__'
        && snapshot.tasks.length === 1 && snapshot.tasks[0].name === '__start__'
        && !snapshot.tasks[0].error && !(snapshot.tasks[0].interrupts?.length)
        && ['admitted', 'recoverable'].includes(row.status) && !row.receipt_sha256
      requireCondition(initial, 'Missing initialized manifest outside the initial input checkpoint; refusing recovery')
      const raw = await checkpointer.getTuple(snapshot.config)
      requireCondition(raw, 'Initial checkpoint is missing')
      requireCondition(raw.checkpoint.id === projection(snapshot).checkpointId && raw.metadata?.source === 'input' && raw.metadata?.step === -1 && !raw.parentConfig?.configurable?.checkpoint_id, 'Initial checkpoint identity or provenance differs')
      const channels = raw.checkpoint.channel_values
      requireCondition(Object.keys(channels).every(name => ['__start__', '__pregel_tasks'].includes(name))
        && json(channels.__start__) === json({ manifestDigest: fixture.manifestDigest })
        && (channels.__pregel_tasks === undefined || json(channels.__pregel_tasks) === '[]\n'), 'Initial checkpoint input differs from immutable admission')
      requireCondition((raw.pendingWrites ?? []).every(([task, channel, value]) => task === snapshot.tasks[0].id
        && ((channel === 'manifestDigest' && value === fixture.manifestDigest) || (channel === 'branch:to:collect_fixture' && value === null))), 'Initial checkpoint has unexpected pending writes')
      const attempted = await client.query('SELECT 1 FROM dailylogger_service.operation_attempts WHERE run_id=$1 AND nodes <> \'[]\'::jsonb LIMIT 1', [runId])
      requireCondition(attempted.rows.length === 0 && !readdirSync(runDir).some(name => name === 'artifacts' || name.startsWith('.staging-'))
        && (!existsSync(join(runDir, 'attempts.jsonl')) || readFileSync(join(runDir, 'attempts.jsonl')).length === 0), 'Initial checkpoint conflicts with recorded execution or artifact effects')
      // No reconstruction/deletion: recover() consumes the validated __start__
      // channel using LangGraph's normal pending-work recovery.
    }
    try {
      let snapshot = await workflow.snapshot()
      await validateSnapshot(snapshot)
      await reconcile(client, row, snapshot)
      // Acquiring the session lock proves no prior command still owns this run.
      // Its graph may have advanced after its last application-row update.
      await client.query(`UPDATE dailylogger_service.operation_attempts SET state='abandoned', after_checkpoint_id=$2, finished_at=now(), error_code='process-ended-before-settlement' WHERE run_id=$1 AND state='running'`, [runId, projection(snapshot).checkpointId])
      if (operation !== 'status') {
        attemptId = randomUUID()
        await client.query(`INSERT INTO dailylogger_service.operation_attempts (attempt_id,run_id,operation,state,before_checkpoint_id) VALUES ($1,$2,$3,'running',$4)`, [attemptId, runId, operation, projection(snapshot).checkpointId])
        const state = projection(snapshot)
        if (operation === 'start') {
          // Duplicate admission is an observation, not an implicit restart/recovery.
          if (!state.hasCheckpoint) await workflow.start()
        } else {
          requireCondition(state.hasCheckpoint, 'No graph checkpoint found; use start with the original request key and directory')
          if (operation === 'resume') {
            requireCondition(approval === workflow.expectedApproval, 'Stale or missing approval digest; resume rejected')
            if (!snapshot.values.published) {
              requireCondition(state.awaitingApproval && snapshot.next.includes('human_gate'), 'Run is not awaiting approval; use recover for a failed step')
              await workflow.resume(approval!)
            }
          } else if (!snapshot.values.published && !state.awaitingApproval) await workflow.recover()
        }
        snapshot = await workflow.snapshot()
        await validateSnapshot(snapshot)
        await reconcile(client, row, snapshot)
        await client.query(`UPDATE dailylogger_service.operation_attempts SET state='succeeded', after_checkpoint_id=$2, finished_at=now() WHERE attempt_id=$1`, [attemptId, projection(snapshot).checkpointId])
      }
      const state = projection(snapshot)
      return {
        status: state.status,
        milestone: 'S03a PostgreSQL fixture checkpoint parity',
        runId, attemptId, requestKey: row.request_key, runDir,
        workflowVersion: POSTGRES_WORKFLOW_VERSION,
        manifestDigest: fixture.manifestDigest,
        approvalDigest: workflow.expectedApproval,
        checkpointId: state.checkpointId,
        completedSteps: [snapshot.values.collected && 'collect_fixture', snapshot.values.draft && 'draft_fixture', snapshot.values.review && 'review_fixture', snapshot.values.approval && 'human_gate', snapshot.values.published && 'write_shadow_artifacts'].filter(Boolean),
        next: snapshot.next,
        review: snapshot.values.review ?? null,
        receiptSha256: state.receiptSha256,
        paths: { manifest: join(runDir, 'manifest.json'), artifacts: snapshot.values.published ? join(runDir, 'artifacts') : null },
      }
    } catch (error) {
      if (attemptId) {
        // Best effort only: a crash/DB loss leaves 'running' for the next lock
        // holder to reconcile. Never manufacture a graph rollback or completion.
        try {
          const snapshot = await workflow.snapshot()
          await validateSnapshot(snapshot)
          await reconcile(client, row, snapshot)
          await client.query(`UPDATE dailylogger_service.operation_attempts SET state='failed', after_checkpoint_id=$2, finished_at=now(), error_code='operation-failed' WHERE attempt_id=$1`, [attemptId, projection(snapshot).checkpointId])
        } catch { /* retained for later explicit reconciliation */ }
      }
      throw error
    } finally { await checkpointer.end() }
  })
}
