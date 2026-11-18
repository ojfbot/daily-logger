import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { digest, json, requireCondition } from './fixture.js'
import { readPostgresFixture, POSTGRES_WORKFLOW_VERSION } from './postgres-fixture.js'
import { canonicalRunId, openCheckpointer, withRunLock } from './postgres-db.js'
import { checkedRunDir, recordAttempt, validateInputs } from './storage.js'
import { createWorkflow } from './workflow.js'
import { RESERVATION_FILE, canonicalDestination, requireNoReservedAncestor, initializeReservedRun, reserveDestination, validateDestination } from './postgres-destination.js'
import { AdmissionConflictError, requireAdmission } from './admission-conflict.js'
export { AdmissionConflictError } from './admission-conflict.js'

type Operation = 'start' | 'status' | 'resume' | 'recover'
interface RunRow {
  run_id: string; request_key: string; request_digest: string; run_dir: string
  manifest_digest: string; manifest_text: string; workflow_version: string
  status: string; checkpoint_id: string | null; receipt_sha256: string | null
}
type Snapshot = Awaited<ReturnType<ReturnType<typeof createWorkflow>['snapshot']>>

function admittedFixture(row: RunRow) {
  let parsed: { destinationReservation?: unknown }
  try { parsed = JSON.parse(row.manifest_text) } catch { throw new Error('Application manifest is invalid') }
  requireCondition(parsed && (parsed.destinationReservation === undefined || parsed.destinationReservation === 1), 'Unsupported destination reservation manifest format')
  const fixture = readPostgresFixture(row.run_id, parsed.destinationReservation === 1)
  requireCondition(row.workflow_version === POSTGRES_WORKFLOW_VERSION && row.manifest_digest === fixture.manifestDigest && row.manifest_text === fixture.manifestBytes, 'Application run is bound to a different immutable manifest or workflow version')
  return { fixture, legacy: parsed.destinationReservation === undefined }
}

/** Own the admission transaction; never execute graph work while holding it. */
export async function admitRun(pool: pg.Pool, requestKey: string, directory: string): Promise<RunRow> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const row = await admitRunInTransaction(client, requestKey, directory)
    await client.query('COMMIT')
    return row
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

/** Caller owns commit/rollback; locks and DB admission remain in that transaction. */
export async function admitRunInTransaction(client: pg.PoolClient, requestKey: string, directory: string): Promise<RunRow> {
  requireCondition(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestKey), 'Request key must be 1–128 letters, digits, dots, underscores, colons or hyphens')
  // SAVEPOINT fails outside an explicit transaction, before any reservation.
  await client.query('SAVEPOINT dailylogger_admission_transaction_guard')
  await client.query('RELEASE SAVEPOINT dailylogger_admission_transaction_guard')
  const isolation = await client.query('SHOW transaction_isolation')
  requireCondition(isolation.rows[0].transaction_isolation === 'read committed', 'Admission requires a READ COMMITTED transaction')
  await client.query("SET LOCAL lock_timeout = '10s'")
  // The short global admission lock makes ancestor/descendant checks atomic
  // across request keys. Acquire it first, consistently, to avoid lock inversion.
  await client.query('SELECT pg_advisory_xact_lock(830031, 1)')
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`dailylogger-admission:${requestKey}`])
  const proposedRunId = randomUUID()
  const source = readPostgresFixture(proposedRunId).manifest.source
  const requestDigestFor = (runDir: string) => digest(json({ runDir, source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
  const canonical = canonicalDestination(directory)
  const existing = await client.query<RunRow>('SELECT * FROM dailylogger_service.fixture_runs WHERE request_key=$1', [requestKey])
  if (existing.rows.length) requireAdmission(existing.rows[0].run_dir === canonical && existing.rows[0].request_digest === requestDigestFor(canonical), 'Request key already exists with different immutable inputs or run directory')
  requireNoReservedAncestor(canonical)
  const destinations = await client.query<{ run_dir: string; request_key: string }>('SELECT run_dir,request_key FROM dailylogger_service.fixture_runs')
  for (const destination of destinations.rows) {
    // Resolve physical aliases for existing bindings without case-folding paths
    // on case-sensitive filesystems. Retain absent bindings as protected paths.
    const bound = existsSync(destination.run_dir) ? realpathSync.native(destination.run_dir) : destination.run_dir
    requireAdmission(bound !== canonical || destination.request_key === existing.rows[0]?.request_key, 'Run directory is already bound to another request key')
    requireAdmission(!canonical.startsWith(`${bound}${sep}`) && !bound.startsWith(`${canonical}${sep}`), 'Run directory overlaps an existing run directory')
  }
  if (existing.rows.length) {
    const row = existing.rows[0]
    const { fixture, legacy } = admittedFixture(row)
    reserveDestination(canonical, requestKey, row.run_id, requestDigestFor, { existingBinding: true, ...(legacy ? { legacyFixture: fixture } : {}) })
    return row
  }
  const reservation = reserveDestination(canonical, requestKey, proposedRunId, requestDigestFor)
  const { runDir, runId, requestDigest } = reservation
  const fixture = readPostgresFixture(runId)
  if (readdirSync(runDir).some(name => name !== RESERVATION_FILE)) {
    // A rolled-back/uncommitted reservation may contain only its marker. A
    // concurrent winner can already be initializing inputs, but it must have
    // committed the same binding before doing so. Never admit foreign contents.
    const owner = await client.query<RunRow>('SELECT * FROM dailylogger_service.fixture_runs WHERE run_id=$1 AND request_key=$2', [runId, requestKey])
    requireAdmission(owner.rows.length === 1 && owner.rows[0].run_dir === runDir && owner.rows[0].request_digest === requestDigest, 'Unadmitted destination contains unexpected files; refusing admission')
  }
  // Both request_key and run_dir are unique. Targeting only request_key can
  // still raise a run_dir violation when equivalent admissions race. Let all
  // unique constraints arbitrate, then resolve the committed immutable binding
  // in a fresh READ COMMITTED statement (not the INSERT's earlier snapshot).
  await client.query(`INSERT INTO dailylogger_service.fixture_runs
    (run_id, request_key, request_digest, run_dir, manifest_digest, manifest_text, workflow_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
  [runId, requestKey, requestDigest, runDir, fixture.manifestDigest, fixture.manifestBytes, POSTGRES_WORKFLOW_VERSION])
  const bindings = await client.query<RunRow>('SELECT * FROM dailylogger_service.fixture_runs WHERE request_key=$1 OR run_dir=$2', [requestKey, runDir])
  const row = bindings.rows.find(candidate => candidate.request_key === requestKey)
  if (!row) {
    requireAdmission(!bindings.rows.some(candidate => candidate.run_dir === runDir), 'Run directory is already bound to another request key')
    throw new AdmissionConflictError('Admission conflict has no matching committed request; refusing to execute')
  }
  requireAdmission(row.request_digest === requestDigest && row.run_dir === runDir, 'Request key already exists with different immutable inputs or run directory')
  requireAdmission(row.run_id === reservation.runId, 'Committed run differs from its physical destination reservation')
  admittedFixture(row)
  validateDestination(reservation)
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

async function hasExecutionEvidence(client: pg.PoolClient, row: RunRow): Promise<boolean> {
  const attempts = await client.query(`SELECT 1 FROM dailylogger_service.operation_attempts WHERE run_id=$1
    AND (nodes <> '[]'::jsonb OR before_checkpoint_id IS NOT NULL OR after_checkpoint_id IS NOT NULL) LIMIT 1`, [row.run_id])
  const files = existsSync(row.run_dir) ? readdirSync(row.run_dir) : []
  return attempts.rows.length > 0 || files.some(name => name === 'artifacts' || name.startsWith('.staging-'))
    || (files.includes('attempts.jsonl') && readFileSync(join(row.run_dir, 'attempts.jsonl')).length > 0)
}

/** Never replace an acknowledged checkpoint with older or unrelated history. */
async function validateHistory(client: pg.PoolClient, row: RunRow, snapshot: Snapshot): Promise<void> {
  const state = projection(snapshot)
  const history = await client.query<{ checkpoint_id: string; parent_checkpoint_id: string | null }>(
    "SELECT checkpoint_id,parent_checkpoint_id FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND checkpoint_ns=''", [row.run_id])
  const parents = new Map(history.rows.map(checkpoint => [checkpoint.checkpoint_id, checkpoint.parent_checkpoint_id]))
  if (!state.hasCheckpoint) {
    requireCondition(!row.checkpoint_id && parents.size === 0 && row.status === 'admitted' && !row.receipt_sha256
      && !await hasExecutionEvidence(client, row), 'Checkpoint history is missing after recorded execution; refusing to restart')
    return
  }
  requireCondition(parents.has(state.checkpointId), 'Observed graph checkpoint is missing from persisted history')
  if (row.checkpoint_id) {
    requireCondition(parents.has(row.checkpoint_id), 'Acknowledged checkpoint is missing; preserving the application pointer')
    const visited = new Set<string>()
    let cursor: string | null = state.checkpointId
    while (cursor !== row.checkpoint_id) {
      requireCondition(cursor && parents.has(cursor) && !visited.has(cursor), 'Observed checkpoint is not a descendant of the acknowledged checkpoint')
      visited.add(cursor)
      cursor = parents.get(cursor) ?? null
    }
  }
  const attempts = await client.query<{ checkpoint_id: string }>(`SELECT before_checkpoint_id AS checkpoint_id FROM dailylogger_service.operation_attempts WHERE run_id=$1 AND before_checkpoint_id IS NOT NULL
    UNION SELECT after_checkpoint_id FROM dailylogger_service.operation_attempts WHERE run_id=$1 AND after_checkpoint_id IS NOT NULL`, [row.run_id])
  for (const anchor of attempts.rows) {
    requireCondition(parents.has(anchor.checkpoint_id), 'Recorded operation checkpoint is missing; refusing replay of older history')
    const visited = new Set<string>()
    let cursor: string | null = state.checkpointId
    while (cursor !== anchor.checkpoint_id) {
      requireCondition(cursor && parents.has(cursor) && !visited.has(cursor), 'Observed checkpoint is not a descendant of recorded operation history')
      visited.add(cursor)
      cursor = parents.get(cursor) ?? null
    }
  }
}

/** This projection follows durable graph state; it does not commit atomically with it. */
async function reconcile(client: pg.PoolClient, row: RunRow, snapshot: Snapshot): Promise<void> {
  const state = projection(snapshot)
  await validateHistory(client, row, snapshot)
  requireCondition(row.status !== 'complete' || state.status === 'complete', 'Completed application run has an incomplete graph; reconciliation required')
  requireCondition(!row.receipt_sha256 || row.receipt_sha256 === state.receiptSha256, 'Application receipt identity conflicts with the graph')
  await client.query(`UPDATE dailylogger_service.fixture_runs SET status=$2, checkpoint_id=$3, receipt_sha256=$4, updated_at=now() WHERE run_id=$1`,
    [row.run_id, state.status, state.checkpointId, state.receiptSha256])
  row.status = state.status
  row.checkpoint_id = state.checkpointId
  row.receipt_sha256 = state.receiptSha256
}

export async function runOperation(pool: pg.Pool, connectionString: string, operation: Operation, runId: string, approval?: string) {
  runId = canonicalRunId(runId)
  return withRunLock(pool, runId, async (client, assertActive) => {
    const row = await readRun(client, 'run_id', runId)
    const { fixture, legacy } = admittedFixture(row)
    const runDir = checkedRunDir(row.run_dir)
    const requestDigest = digest(json({ runDir, source: fixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
    requireCondition(row.run_dir === runDir && row.request_digest === requestDigest, 'Application admission digest or canonical run directory differs')
    const reservation = reserveDestination(runDir, row.request_key, runId, () => requestDigest, { existingBinding: true, ...(legacy ? { legacyFixture: fixture } : {}) })
    const checkpointer = openCheckpointer(connectionString)
    let attemptId: string | null = null
    let workflow: ReturnType<typeof createWorkflow>
    workflow = createWorkflow(runDir, fixture, {
      checkpointer,
      threadId: runId,
      assertActive: () => { assertActive(); validateDestination(reservation) },
      receiptIdentity: { milestone: 'S03a PostgreSQL fixture checkpoint parity', runId },
      recordNode: async node => {
        assertActive()
        requireCondition(attemptId, 'Graph execution requires an operation attempt')
        const observed = await workflow.snapshot()
        await client.query(`UPDATE dailylogger_service.operation_attempts SET nodes = nodes || jsonb_build_array($2::text), after_checkpoint_id=COALESCE($3,after_checkpoint_id) WHERE attempt_id=$1`, [attemptId, node, projection(observed).checkpointId])
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
      await validateHistory(client, row, snapshot)
      if (!existsSync(join(runDir, 'manifest.json'))) {
        requireCondition(operation === 'start' && !projection(snapshot).hasCheckpoint, 'Frozen inputs are missing; only an unstarted admission can initialize them')
        initializeReservedRun(reservation, fixture)
      }
      validateInputs(runDir, fixture)
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
