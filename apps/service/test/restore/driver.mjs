// Mounted read-only into the qualified image; never part of its production files.
import assert from 'node:assert/strict'
import { mkdirSync, readSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUN_ROOT, MARKER, applyPlan, captureTree, createPlan, encode, hash, restoreTree, validatePlan } from './archive.mjs'
import { failureDiagnostic } from './diagnostics.mjs'

delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('Network providers are unavailable in the restore fixture') }
const { openDatabase, openCheckpointer, requireMigrated, migrateDatabase } = await import('../../src/postgres-db.ts')
const { migrateDelivery, startDelivery } = await import('../../src/delivery-db.ts')
const { admitCommand, runStatus } = await import('../../src/delivery-commands.ts')
const { runOperation } = await import('../../src/postgres-runner.ts')
const { readPostgresFixture, POSTGRES_WORKFLOW_VERSION } = await import('../../src/postgres-fixture.ts')
const { createWorkflow } = await import('../../src/workflow.ts')
const { reserveDestination } = await import('../../src/postgres-destination.ts')
const { validateInputs } = await import('../../src/storage.ts')
const { digest, json } = await import('../../src/fixture.ts')
const url = process.env.DAILYLOGGER_DATABASE_URL
assert.ok(url)
const control = '/var/lib/dailylogger/fixtures/restore-control'

function input() {
  const chunks = []; let size = 0
  const buffer = Buffer.alloc(65536)
  for (;;) {
    const count = readSync(0, buffer)
    if (!count) break
    size += count; assert.ok(size <= 16 * 1024 * 1024, 'Restore driver input exceeded bound before parse')
    chunks.push(Buffer.from(buffer.subarray(0, count)))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
const quote = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return `"${value}"` }
const tableRows = (snapshot, table) => snapshot.tables[table].rows
export { tableRows }

async function raw(pool) {
  const schemas = ['dailylogger_service', 'dailylogger_checkpoints', 'dailylogger_delivery']
  const relations = await pool.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','S') ORDER BY n.nspname,c.relname`, [schemas])
  const tables = {}, sequences = {}
  for (const { schema, name, kind } of relations.rows) {
    const qualified = `${quote(schema)}.${quote(name)}`
    if (kind === 'S') sequences[`${schema}.${name}`] = (await pool.query(`SELECT last_value::text,is_called FROM ${qualified}`)).rows[0]
    else {
      const result = await pool.query(`SELECT to_jsonb(t) AS data FROM ${qualified} t ORDER BY to_jsonb(t)::text LIMIT 10001`)
      assert.ok(result.rows.length <= 10000)
      const columns = (await pool.query(`SELECT column_name,data_type,udt_schema,udt_name,is_nullable,column_default
        FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [schema, name])).rows
      tables[`${schema}.${name}`] = { columns, rows: result.rows.map(row => row.data) }
    }
  }
  assert.ok(tables['dailylogger_service.fixture_runs'] && tables['dailylogger_delivery.version'] && tables['dailylogger_checkpoints.checkpoints'])
  const result = { tables, sequences }
  assert.ok(encode(result).length <= 12 * 1024 * 1024)
  return result
}

async function quiescent(pool) {
  const deadline = Date.now() + 3000
  for (;;) {
    const connections = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")).rowCount
    if (connections === 0) break
    assert.ok(Date.now() < deadline, 'Source has a remaining application/database client')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal((await pool.query("SELECT 1 FROM dailylogger_service.operation_attempts WHERE state='running'")).rowCount, 0)
  assert.equal((await pool.query("SELECT 1 FROM dailylogger_delivery.job WHERE state='active'")).rowCount, 0)
}

async function rowsForRestore(pool) {
  await requireMigrated(pool, { delivery: true, http: true })
  const rows = (await pool.query('SELECT * FROM dailylogger_service.fixture_runs ORDER BY run_id')).rows
  assert.equal(rows.length, 3)
  for (const row of rows) {
    const fixture = readPostgresFixture(row.run_id)
    assert.equal(row.manifest_text, fixture.manifestBytes); assert.equal(row.manifest_digest, fixture.manifestDigest)
    assert.equal(row.workflow_version, POSTGRES_WORKFLOW_VERSION)
    assert.equal(row.request_digest, digest(json({ runDir: row.run_dir, source: fixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION })))
    assert.equal(row.delivery_owner, 's03b')
    validateInputs(row.run_dir, fixture)
  }
  return rows
}

async function main() {
  assert.equal(process.getuid(), 1000); assert.equal(process.getgid(), 1000)
  const [operation, ...extra] = process.argv.slice(2); assert.equal(extra.length, 0)
  const value = input()
  if (operation === 'initialize') {
    mkdirSync(RUN_ROOT, { mode: 0o700 }); mkdirSync(control, { mode: 0o700 })
    return { initialized: true, context: JSON.parse(readFileSync('/app/runtime-context.json', 'utf8')) }
  }
  if (operation === 'restore-files') { restoreTree(RUN_ROOT, value.archive); return { restored: true } }
  if (operation === 'files') return captureTree(RUN_ROOT)
  const pool = openDatabase(url)
  let boss
  try {
    if (operation === 'migrate') { await migrateDelivery(pool, url); await migrateDatabase(pool, url, { http: true }); return { migrated: true } }
    if (operation === 'admit') { boss = await startDelivery(pool, url); return await admitCommand(pool, boss, value.request) }
    if (operation === 'run') return await runStatus(pool, url, value.runId)
    if (operation === 'command') return (await pool.query(`SELECT c.*,j.state AS job_state,j.retry_count FROM dailylogger_service.fixture_commands c
      LEFT JOIN dailylogger_delivery.job j ON j.id=c.job_id WHERE c.command_id=$1`, [value.commandId])).rows[0]
    if (operation === 'sessions') {
      await pool.query(`INSERT INTO dailylogger_service.owner_sessions(session_hash,actor_id,csrf_token,created_at,expires_at,revoked_at)
        VALUES($1,'github:1','synthetic-csrf-only','2026-01-01','2099-01-01',NULL),($2,'github:1','synthetic-revoked-only','2026-01-01','2099-01-01','2026-01-02')`, ['a'.repeat(64), 'b'.repeat(64)])
      await pool.query("INSERT INTO dailylogger_service.owner_logins VALUES($1,$2,'synthetic-pkce-only','2099-01-01')", ['c'.repeat(64), 'd'.repeat(64)])
      await pool.query('CREATE SEQUENCE dailylogger_service.restore_sequence_called; CREATE SEQUENCE dailylogger_service.restore_sequence_unused')
      await pool.query("SELECT nextval('dailylogger_service.restore_sequence_called'),nextval('dailylogger_service.restore_sequence_called')")
      return { syntheticSessions: true }
    }
    if (operation === 'snapshot') { await quiescent(pool); return { raw: await raw(pool), files: captureTree(RUN_ROOT) } }
    if (operation === 'raw') { await quiescent(pool); return await raw(pool) }
    if (operation === 'negative-database') {
      assert.equal(hash(encode(await raw(pool))), hash(encode(value.expectedRaw)))
      const row = (await pool.query("SELECT * FROM dailylogger_service.fixture_runs WHERE status='complete'")).rows[0]
      assert.ok(row?.checkpoint_id)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        assert.equal((await client.query("DELETE FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND checkpoint_ns='' AND checkpoint_id=$2", [row.run_id, row.checkpoint_id])).rowCount, 1)
        assert.notEqual(hash(encode(await raw(client))), hash(encode(value.expectedRaw)), 'Missing acknowledged history must invalidate the matched raw-state seal')
        await client.query('ROLLBACK')
        await client.query('BEGIN')
        await client.query("UPDATE dailylogger_service.schema_migrations SET digest=repeat('0',64) WHERE version=1")
        await assert.rejects(requireMigrated(client, { delivery: true, http: true }), /checksum differs/)
        assert.notEqual(hash(encode(await raw(client))), hash(encode(value.expectedRaw)))
        await client.query('ROLLBACK')
      } finally { await client.query('ROLLBACK'); client.release() }
      assert.equal(hash(encode(await raw(pool))), hash(encode(value.expectedRaw)))
      return { omittedAcknowledgedCheckpoint: true, alteredLedger: true, originalStateRestored: true }
    }
    if (operation === 'copy-rejected') {
      await assert.rejects(runOperation(pool, url, 'status', value.runId), /physical identity or canonical path differs/)
      return { ordinaryCopyRejected: true }
    }
    const rows = await rowsForRestore(pool)
    if (operation === 'plan') return createPlan(RUN_ROOT, value.archive, rows, value.backupId)
    if (operation === 'negative-cases') {
      const plan = createPlan(RUN_ROOT, value.archive, rows, value.backupId)
      const before = captureTree(RUN_ROOT)
      const marker = join(rows[0].run_dir, MARKER), original = readFileSync(marker)
      try {
        writeFileSync(marker, encode({ ...JSON.parse(original), physicalIdentity: '0:0' }))
        assert.throws(() => applyPlan(RUN_ROOT, value.archive, rows, plan, control))
      } finally { writeFileSync(marker, original) }
      const article = join(rows[0].run_dir, 'inputs/article.md'), bytes = readFileSync(article)
      try { writeFileSync(article, Buffer.from('synthetic corruption')); assert.throws(() => applyPlan(RUN_ROOT, value.archive, rows, plan, control)) }
      finally { writeFileSync(article, bytes) }
      const foreign = join(RUN_ROOT, 'unexpected-synthetic-entry')
      writeFileSync(foreign, 'synthetic', { flag: 'wx', mode: 0o600 })
      try { assert.throws(() => applyPlan(RUN_ROOT, value.archive, rows, plan, control)) } finally { unlinkSync(foreign) }
      const changed = structuredClone(plan)
      changed.changes[0].next = encode({ ...JSON.parse(Buffer.from(changed.changes[0].next, 'base64')), runId: '00000000-0000-4000-8000-000000000000' }).toString('base64')
      assert.throws(() => applyPlan(RUN_ROOT, value.archive, rows, changed, control))
      assert.deepEqual(captureTree(RUN_ROOT), before)
      validatePlan(RUN_ROOT, value.archive, rows, plan)
      return { staleMarker: true, corruptedInput: true, extraEntry: true, changedAuthorityInPlan: true }
    }
    if (operation === 'reconcile') {
      const result = applyPlan(RUN_ROOT, value.archive, rows, value.plan, control, value.interruptAfterOne ? 1 : Infinity)
      if (value.interruptAfterOne) { assert.equal(result.changed, 1); process.exit(86) }
      assert.equal(result.complete, true)
      return result
    }
    if (operation === 'gate') {
      validatePlan(RUN_ROOT, value.archive, rows, value.plan)
      assert.ok(value.plan.changes.every(change => readFileSync(join(RUN_ROOT, change.path)).toString('base64') === change.next), 'Mixed markers must remain fenced')
      return { allMarkersReconciled: true }
    }
    if (operation === 'validate-restored') {
      for (const row of rows) {
        const fixture = readPostgresFixture(row.run_id)
        const reservation = reserveDestination(row.run_dir, row.request_key, row.run_id, () => row.request_digest, { existingBinding: true })
        const saver = openCheckpointer(url)
        try {
          const workflow = createWorkflow(row.run_dir, fixture, { checkpointer: saver, threadId: row.run_id,
            receiptIdentity: { milestone: 'S03a PostgreSQL fixture checkpoint parity', runId: row.run_id } })
          const snapshot = await workflow.snapshot(); workflow.validate(snapshot.values)
          assert.equal(snapshot.config.configurable.checkpoint_id, row.checkpoint_id)
          assert.equal(reservation.runId, row.run_id)
        } finally { await saver.end() }
      }
      return { immutableInputsCheckpointAndArtifacts: true }
    }
    throw new Error('Unsupported restore test operation')
  } finally { await boss?.stop(); await pool.end() }
}
main().then(value => { const output = encode(value); assert.ok(output.length <= 16 * 1024 * 1024); process.stdout.write(output) })
  .catch(error => { process.stderr.write(`${JSON.stringify(failureDiagnostic('RESTORE_DRIVER_FAILED', process.argv[2], error))}\n`); process.exitCode = 1 })
