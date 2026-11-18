import assert from 'node:assert/strict'
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { ACTIONS_PATH, ARTICLE_PATH, CANDIDATE_IDS, REPO_ROOT, approvalDigest, digest, json, readFixture, reviewFixture } from '../../src/fixture.js'
import { readPostgresFixture, POSTGRES_WORKFLOW_VERSION } from '../../src/postgres-fixture.js'
import { admitRun, admitRunInTransaction, AdmissionConflictError } from '../../src/postgres-runner.js'
import { checkedRunDir, initializeRun } from '../../src/storage.js'
import { RESERVATION_FILE, reserveDestination } from '../../src/postgres-destination.js'

// Deliberately fail, rather than skip-green, when the explicit PG suite lacks a DB.
const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
assert.ok(configured, 'DAILYLOGGER_TEST_DATABASE_URL is required for real PostgreSQL integration tests (CREATE DATABASE permission required)')
const adminUrl = new URL(configured)
assert.ok(['postgres:', 'postgresql:'].includes(adminUrl.protocol), 'Test database URL must use PostgreSQL')
// Only this newly created database is ever removed. Never reset the supplied DB.
const databaseName = `dailylogger_test_${randomUUID().replaceAll('-', '')}`
assert.match(databaseName, /^dailylogger_test_[a-f0-9]{32}$/)
const testUrl = new URL(adminUrl)
testUrl.pathname = `/${databaseName}`
const admin = new pg.Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 })
const db = new pg.Pool({ connectionString: testUrl.toString(), connectionTimeoutMillis: 5000 })
const sandbox = mkdtempSync(join(tmpdir(), 'dailylogger-postgres-test-'))
let databaseCreated = false
const cli = join(REPO_ROOT, 'apps/service/src/postgres-cli.ts')
const env = {
  ...process.env, DAILYLOGGER_DATABASE_URL: testUrl.toString(),
  LANGCHAIN_TRACING: 'true', LANGCHAIN_TRACING_V2: 'true', LANGSMITH_TRACING: 'true',
  LANGSMITH_API_KEY: 'fixture-never-valid', LANGSMITH_ENDPOINT: 'http://127.0.0.1:1',
}

function args(operation: string, values: string[] = [], preload?: string) {
  return ['--import', 'tsx', ...(preload ? ['--import', join(REPO_ROOT, 'apps/service/test/postgres', preload)] : []), cli, operation, ...values]
}
function command(operation: string, values: string[] = [], preload?: string) {
  return spawnSync(process.execPath, args(operation, values, preload), { cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 30_000 })
}
function concurrentResult(operation: string, values: string[]) {
  const child = spawn(process.execPath, args(operation, values), { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', value => { stdout += value })
  child.stderr.on('data', value => { stderr += value })
  return once(child, 'exit').then(([status]) => ({ status, stdout, stderr }))
}
function concurrentCommand(operation: string, values: string[]) {
  return concurrentResult(operation, values).then(({ status, stdout, stderr }) => {
    assert.equal(status, 0, stderr)
    assert.equal(stderr, '')
    return JSON.parse(stdout)
  })
}
function success(result: SpawnSyncReturns<string>) {
  assert.equal(result.status, 0, result.stderr || String(result.error))
  assert.equal(result.stderr, '')
  return JSON.parse(result.stdout)
}
function failure(result: SpawnSyncReturns<string>, expected: RegExp) {
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, expected)
}
function start(name: string) {
  const directory = join(sandbox, name)
  return success(command('start', ['--request-key', name, '--run-dir', directory]))
}
function forRun(runId: string) { return ['--run-id', runId] }
function resumeArgs(started: { runId: string; approvalDigest: string }) { return [...forRun(started.runId), '--approval-digest', started.approvalDigest] }
function nodes(directory: string): string[] {
  return readFileSync(join(directory, 'attempts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).node)
}
async function requireBlockedBy(blocker: number, contender: number): Promise<void> {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const observation = await db.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [blocker, contender])
    if (observation.rows[0].blocked) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail('Contender must be observed waiting for the held admission transaction')
}
function assertOutput(directory: string, runId: string) {
  const fixture = readFixture()
  assert.deepEqual(readFileSync(join(directory, 'artifacts', ARTICLE_PATH)), fixture.article)
  assert.deepEqual(readFileSync(join(directory, 'artifacts', ACTIONS_PATH)), fixture.actions)
  const actions = JSON.parse(readFileSync(join(directory, 'artifacts', ACTIONS_PATH), 'utf8'))
  assert.equal(actions.snapshot.status, 'draft')
  assert.equal(actions.snapshot.review.state, 'pending')
  assert.deepEqual(actions.snapshot.draftCandidates.map((candidate: { candidateId: string }) => candidate.candidateId), CANDIDATE_IDS)
  assert.deepEqual(actions.suggestions, [])
  assert.deepEqual(actions.decisions, [])
  assert.deepEqual(actions.snapshot.actionKeys, [])
  const receipt = JSON.parse(readFileSync(join(directory, 'artifacts/receipt.json'), 'utf8'))
  assert.equal(receipt.runId, runId)
  assert.equal(receipt.persistence, 'postgresql-fixture-checkpoint-proof')
  assert.equal(receipt.milestone, 'S03a PostgreSQL fixture checkpoint parity')
  assert.equal(receipt.publication, 'none')
  assert.equal(receipt.admissions, 0)
  assert.deepEqual(receipt.source, fixture.manifest.source)
  assert.equal(existsSync(join(directory, 'checkpoints.sqlite')), false)
}

before(async () => {
  const version = await admin.query<{ server_version: string }>('SHOW server_version')
  console.log(`Real PostgreSQL integration server: ${version.rows[0].server_version}`)
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  databaseCreated = true
})
after(async () => {
  await db.end()
  if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
  await admin.end()
  rmSync(sandbox, { recursive: true, force: true })
})

test('runtime requires explicit migrations; migration is repeatable and checks its checksum', async () => {
  failure(command('start', ['--request-key', 'not-migrated', '--run-dir', join(sandbox, 'not-migrated')]), /not initialized/)
  assert.equal(success(command('migrate')).status, 'migrated')
  assert.equal(success(command('migrate')).status, 'migrated')
  const result = await db.query('SELECT version, checkpointer_version FROM dailylogger_service.schema_migrations')
  assert.deepEqual(result.rows, [{ version: 1, checkpointer_version: '1.1.4' }])
  const saved = await db.query('SELECT digest FROM dailylogger_service.schema_migrations WHERE version=1')
  await db.query("UPDATE dailylogger_service.schema_migrations SET digest='changed' WHERE version=1")
  failure(command('migrate'), /migration checksum differs/)
  await db.query('UPDATE dailylogger_service.schema_migrations SET digest=$1 WHERE version=1', [saved.rows[0].digest])
})

test('actual saver migration history rejects unknown versions and gaps before stamping or runtime', async () => {
  await db.query('INSERT INTO dailylogger_checkpoints.checkpoint_migrations(v) VALUES (999)')
  await db.query('UPDATE dailylogger_service.schema_migrations SET checkpointer_version=NULL WHERE version=1')
  failure(command('migrate'), /Saver migration history is incompatible/)
  const marker = await db.query('SELECT checkpointer_version FROM dailylogger_service.schema_migrations WHERE version=1')
  assert.equal(marker.rows[0].checkpointer_version, null, 'Failed migration must not stamp compatibility')
  await db.query("UPDATE dailylogger_service.schema_migrations SET checkpointer_version='1.1.4' WHERE version=1")
  failure(command('status', forRun(randomUUID())), /Saver migration history is incompatible/)
  await db.query('DELETE FROM dailylogger_checkpoints.checkpoint_migrations WHERE v=999')
  await db.query('DELETE FROM dailylogger_checkpoints.checkpoint_migrations WHERE v=2')
  failure(command('migrate'), /Saver migration history is incompatible/)
  failure(command('status', forRun(randomUUID())), /Saver migration history is incompatible/)
  await db.query('INSERT INTO dailylogger_checkpoints.checkpoint_migrations(v) VALUES (2)')
  assert.equal(success(command('migrate')).status, 'migrated')
})

test('separate-process restart/resume preserves identity, frozen bytes and successful steps', async () => {
  const started = start('restart')
  assert.equal(started.status, 'awaiting-approval')
  assert.match(started.runId, /^[a-f0-9-]{36}$/)
  assert.deepEqual(started.completedSteps, ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal(success(command('status', forRun(started.runId))).checkpointId, started.checkpointId)
  assert.equal(success(command('recover', forRun(started.runId))).status, 'awaiting-approval')
  assert.equal(existsSync(join(started.runDir, 'artifacts')), false)
  const resumed = success(command('resume', resumeArgs(started)))
  assert.equal(resumed.status, 'complete')
  assert.notEqual(resumed.attemptId, started.attemptId)
  assertOutput(started.runDir, started.runId)
  const timestamp = statSync(join(started.runDir, 'artifacts/receipt.json')).mtimeMs
  assert.equal(success(command('resume', resumeArgs(started))).checkpointId, resumed.checkpointId)
  assert.equal(success(command('recover', forRun(started.runId))).checkpointId, resumed.checkpointId)
  assert.equal(statSync(join(started.runDir, 'artifacts/receipt.json')).mtimeMs, timestamp)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
  const record = await db.query('SELECT status,checkpoint_id,manifest_digest FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  assert.deepEqual(record.rows[0], { status: 'complete', checkpoint_id: resumed.checkpointId, manifest_digest: started.manifestDigest })
})

test('duplicate start is stable, conflicting reuse rejects, and identical inputs have separate run threads', async () => {
  const directory = join(sandbox, 'duplicate')
  const requests = ['--request-key', 'duplicate', '--run-dir', directory]
  const [first, duplicate] = await Promise.all([concurrentCommand('start', requests), concurrentCommand('start', requests)])
  assert.equal(first.runId, duplicate.runId)
  assert.equal(first.checkpointId, duplicate.checkpointId)
  assert.deepEqual(nodes(directory), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  failure(command('start', ['--request-key', 'duplicate', '--run-dir', join(sandbox, 'different')]), /different immutable inputs or run directory/)
  failure(command('start', ['--request-key', 'different-key', '--run-dir', directory]), /already bound/)
  const other = start('same-source-new-run')
  assert.notEqual(other.runId, first.runId)
  assert.notEqual(other.manifestDigest, first.manifestDigest, 'Local approval is bound to run identity')
  const threads = await db.query('SELECT DISTINCT thread_id FROM dailylogger_checkpoints.checkpoints WHERE thread_id=ANY($1::text[])', [[first.runId, other.runId]])
  assert.equal(threads.rows.length, 2)
  const [a, b] = await Promise.all([concurrentCommand('resume', resumeArgs(first)), concurrentCommand('resume', resumeArgs(first))])
  assert.equal(a.status, 'complete')
  assert.equal(a.checkpointId, b.checkpointId)
  assert.deepEqual(nodes(directory), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
})

test('uppercase UUID spelling uses the same run, manifest and lock identity', async () => {
  const started = start('uuid-spelling')
  const upper = started.runId.toUpperCase()
  assert.notEqual(upper, started.runId)
  const observed = success(command('status', forRun(upper)))
  assert.equal(observed.runId, started.runId)
  assert.equal(observed.checkpointId, started.checkpointId)
  const [a, b] = await Promise.all([
    concurrentCommand('resume', [...forRun(upper), '--approval-digest', started.approvalDigest]),
    concurrentCommand('resume', resumeArgs(started)),
  ])
  assert.equal(a.runId, b.runId)
  assert.equal(a.checkpointId, b.checkpointId)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
})

test('physical aliases never create a second admission; case-sensitive distinct directories remain valid', async t => {
  const probe = join(sandbox, 'CaseProbe')
  mkdirSync(probe)
  const insensitive = existsSync(join(sandbox, 'caseprobe'))
  t.diagnostic(`Real PostgreSQL artifact filesystem case-insensitive: ${insensitive}`)
  if (process.env.DAILYLOGGER_REQUIRE_CASE_INSENSITIVE === '1') assert.equal(insensitive, true, 'macOS qualification requires a real case-insensitive filesystem')
  const upper = join(sandbox, 'FixtureAlias'), lower = join(sandbox, 'fixturealias')
  const first = success(command('start', ['--request-key', 'alias-owner', '--run-dir', upper]))
  const alias = command('start', ['--request-key', 'alias-other', '--run-dir', lower])
  if (insensitive) {
    failure(alias, /already bound/)
    const second = await db.query('SELECT run_id FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['alias-other'])
    assert.equal(second.rows.length, 0)
    assert.equal(success(command('start', ['--request-key', 'alias-owner', '--run-dir', lower])).runId, first.runId)
    const nestedAlias = join(lower, 'nested')
    failure(command('start', ['--request-key', 'nested-case-alias', '--run-dir', nestedAlias]), /overlaps/)
    assert.equal(existsSync(nestedAlias), false)
    assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['nested-case-alias'])).rows.length, 0)
  } else assert.notEqual(success(alias).runId, first.runId)
  const raced = await Promise.all([
    concurrentResult('start', ['--request-key', 'race-alias-one', '--run-dir', join(sandbox, 'ConcurrentAlias')]),
    concurrentResult('start', ['--request-key', 'race-alias-two', '--run-dir', join(sandbox, 'concurrentalias')]),
  ])
  assert.equal(raced.filter(result => result.status === 0).length, insensitive ? 1 : 2, JSON.stringify(raced))
  if (insensitive) assert.match(raced.find(result => result.status !== 0)!.stderr, /already bound/)
  const rows = await db.query("SELECT run_id FROM dailylogger_service.fixture_runs WHERE request_key IN ('race-alias-one','race-alias-two')")
  assert.equal(rows.rows.length, insensitive ? 1 : 2, 'No losing alias may leave an admitted row')
})

test('rolled-back admission retains a reusable reservation and lost new markers fail closed', async () => {
  const client = await db.connect()
  const directory = join(sandbox, 'rollback-reservation')
  let reservedId: string
  try {
    await client.query('BEGIN')
    reservedId = (await admitRunInTransaction(client, 'rollback-reservation', directory)).run_id
    await client.query('ROLLBACK')
  } finally { client.release() }
  assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['rollback-reservation'])).rows.length, 0)
  assert.equal(existsSync(join(directory, RESERVATION_FILE)), true)
  const nested = join(directory, 'nested')
  await assert.rejects(admitRun(db, 'rollback-reservation-child', nested), /overlaps an ancestor reservation/)
  assert.equal(existsSync(nested), false, 'An uncommitted reservation protects its complete tree')
  assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['rollback-reservation-child'])).rows.length, 0)
  const started = start('rollback-reservation')
  assert.equal(started.runId, reservedId!)
  rmSync(join(directory, RESERVATION_FILE))
  failure(command('status', forRun(started.runId)), /marker is missing/)
  failure(command('start', ['--request-key', 'rollback-reservation', '--run-dir', directory]), /marker is missing/)
  assert.equal(existsSync(join(directory, RESERVATION_FILE)), false)
})

test('transactional admission refuses autocommit and stale isolation before filesystem writes', async () => {
  const client = await db.connect()
  const directory = join(sandbox, 'no-admission-transaction')
  try {
    await assert.rejects(admitRunInTransaction(client, 'no-transaction', directory), (error: unknown) => (error as { code?: string }).code === '25P01')
    assert.equal(existsSync(directory), false)
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await assert.rejects(admitRunInTransaction(client, 'stale-transaction', directory), /READ COMMITTED/)
    assert.equal(existsSync(directory), false)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
})

test('same request with different directories arbitrates before leaving a losing reservation', { timeout: 30_000 }, async () => {
  const winner = await db.connect()
  const contender = new pg.Pool({ connectionString: testUrl.toString(), max: 1, connectionTimeoutMillis: 5000 })
  const winnerDirectory = join(sandbox, 'arbitration-winner')
  const loserDirectory = join(sandbox, 'arbitration-loser')
  let pending: Promise<unknown> | undefined
  try {
    const winnerPid = (await winner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const contenderPid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await winner.query('BEGIN')
    const admitted = await admitRunInTransaction(winner, 'held-request-key', winnerDirectory)
    pending = admitRun(contender, 'held-request-key', loserDirectory).then(() => assert.fail('Conflicting request unexpectedly admitted'), error => {
      assert.ok(error instanceof AdmissionConflictError)
      assert.match(error.message, /different immutable inputs or run directory/)
    })
    void pending.catch(() => {}) // retain rejection for await without early unhandled rejection on regression
    await requireBlockedBy(winnerPid, contenderPid)
    assert.equal(existsSync(loserDirectory), false, 'Blocked contender must not create a directory or marker')
    await winner.query('COMMIT')
    await pending
    assert.equal(existsSync(loserDirectory), false, 'Losing binding must leave no stranded reservation')
    assert.deepEqual((await db.query('SELECT run_id FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['held-request-key'])).rows, [{ run_id: admitted.run_id }])
    const retry = await admitRun(db, 'held-request-key', winnerDirectory)
    assert.equal(retry.run_id, admitted.run_id)
    assert.ok((await admitRun(db, 'unrelated-new-key', loserDirectory)).run_id, 'Unmodified losing destination remains usable')
  } finally {
    await winner.query('ROLLBACK').catch(() => {})
    winner.release()
    await pending?.catch(() => {})
    await contender.end()
  }
})

test('nested admissions cannot mutate completed artifacts or bypass a missing ancestor marker', async () => {
  const started = start('protected-bundle')
  const completed = success(command('resume', resumeArgs(started)))
  const nested = join(started.runDir, 'artifacts/nested')
  const receiptBytes = readFileSync(join(started.runDir, 'artifacts/receipt.json'))
  failure(command('start', ['--request-key', 'nested-artifact', '--run-dir', nested]), /overlaps/)
  assert.equal(existsSync(nested), false)
  assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['nested-artifact'])).rows.length, 0)
  assert.deepEqual(readFileSync(join(started.runDir, 'artifacts/receipt.json')), receiptBytes)
  assert.equal(success(command('status', forRun(started.runId))).checkpointId, completed.checkpointId)
  assertOutput(started.runDir, started.runId)
  const markerPath = join(started.runDir, RESERVATION_FILE)
  const marker = readFileSync(markerPath)
  rmSync(markerPath)
  try {
    failure(command('start', ['--request-key', 'nested-without-marker', '--run-dir', nested]), /overlaps an existing run directory/)
    assert.equal(existsSync(nested), false, 'Canonical DB binding protects a marker-damaged ancestor')
  } finally { writeFileSync(markerPath, marker, { flag: 'wx', mode: 0o600 }) }
  assert.equal(success(command('status', forRun(started.runId))).status, 'complete')
})

test('missing destinations hold new admissions without guessing absent case aliases; intact existing runs remain usable', async t => {
  const intact = start('namespace-intact-control')
  const directory = join(sandbox, 'MissingAdmittedDirectory')
  const alias = join(sandbox, 'missingadmitteddirectory')
  const parked = join(sandbox, 'temporarily-moved-admission')
  const unrelated = join(sandbox, 'unrelated-during-missing-directory')
  const admitted = await admitRun(db, 'missing-directory-owner', directory)
  const insensitive = existsSync(alias)
  t.diagnostic(`Missing-destination alias qualification filesystem case-insensitive: ${insensitive}`)
  if (process.env.DAILYLOGGER_REQUIRE_CASE_INSENSITIVE === '1') assert.equal(insensitive, true)
  // Preserve the original inode and marker for finally; no recreated ownership.
  renameSync(directory, parked)
  try {
    assert.equal(existsSync(directory), false)
    assert.equal(existsSync(alias), false)
    await assert.rejects(admitRun(db, 'missing-directory-contender', directory), /already bound to another request key/)
    await assert.rejects(admitRun(db, 'missing-directory-alias', alias), /namespace has a missing bound destination/)
    await assert.rejects(admitRun(db, 'missing-directory-unrelated', unrelated), /namespace has a missing bound destination/)
    for (const path of [directory, alias, unrelated]) assert.equal(existsSync(path), false, 'Held admission must create no directory or marker')
    assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=ANY($1::text[])', [['missing-directory-contender', 'missing-directory-alias', 'missing-directory-unrelated']])).rows.length, 0)
    await assert.rejects(admitRun(db, 'missing-directory-owner', directory), /Reserved destination is missing/)
    assert.equal(existsSync(directory), false, 'The existing key also stays held instead of repairing missing ownership')
    assert.deepEqual((await db.query('SELECT run_id,status FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['missing-directory-owner'])).rows, [{ run_id: admitted.run_id, status: 'admitted' }])
    const retried = success(command('start', ['--request-key', 'namespace-intact-control', '--run-dir', intact.runDir]))
    assert.equal(retried.checkpointId, intact.checkpointId)
    assert.equal(success(command('status', forRun(intact.runId))).checkpointId, intact.checkpointId)
  } finally {
    // Only these test-owned candidate paths could have been created by a bug.
    for (const path of [directory, alias, unrelated]) if (existsSync(path)) rmSync(path, { recursive: true })
    renameSync(parked, directory)
  }
  assert.equal((await admitRun(db, 'missing-directory-owner', directory)).run_id, admitted.run_id)
  assert.ok((await admitRun(db, 'missing-directory-unrelated', unrelated)).run_id, 'New admission resumes after original physical ownership is restored')
})

test('concurrent ancestor and descendant admission serialize without creating a losing marker', { timeout: 30_000 }, async () => {
  for (const ancestorWins of [true, false]) {
    const ancestor = join(sandbox, `overlap-race-${ancestorWins}`)
    if (!ancestorWins) mkdirSync(ancestor)
    const descendant = join(ancestor, 'nested')
    const winnerDirectory = ancestorWins ? ancestor : descendant
    const loserDirectory = ancestorWins ? descendant : ancestor
    const winnerKey = `overlap-winner-${ancestorWins}`, loserKey = `overlap-loser-${ancestorWins}`
    const winner = await db.connect()
    const contender = new pg.Pool({ connectionString: testUrl.toString(), max: 1, connectionTimeoutMillis: 5000 })
    let pending: Promise<unknown> | undefined
    try {
      const winnerPid = (await winner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const contenderPid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await winner.query('BEGIN')
      const admitted = await admitRunInTransaction(winner, winnerKey, winnerDirectory)
      pending = admitRun(contender, loserKey, loserDirectory).then(() => assert.fail('Overlapping admission unexpectedly succeeded'), error => {
        assert.ok(error instanceof AdmissionConflictError)
        assert.match(error.message, /overlaps/)
      })
      void pending.catch(() => {})
      await requireBlockedBy(winnerPid, contenderPid)
      assert.equal(existsSync(join(loserDirectory, RESERVATION_FILE)), false)
      if (ancestorWins) assert.equal(existsSync(loserDirectory), false)
      await winner.query('COMMIT')
      await pending
      assert.equal(existsSync(join(loserDirectory, RESERVATION_FILE)), false)
      if (ancestorWins) assert.equal(existsSync(loserDirectory), false)
      assert.equal((await db.query('SELECT 1 FROM dailylogger_service.fixture_runs WHERE request_key=$1', [loserKey])).rows.length, 0)
      const started = success(command('start', ['--request-key', winnerKey, '--run-dir', winnerDirectory]))
      assert.equal(started.runId, admitted.run_id)
      assert.equal(started.status, 'awaiting-approval')
    } finally {
      await winner.query('ROLLBACK').catch(() => {})
      winner.release()
      await pending?.catch(() => {})
      await contender.end()
    }
  }
})

test('admission resolves a forced concurrent directory conflict; old targeted arbitration fails the positive control', { timeout: 30_000 }, async () => {
  // This suite owns a newly created database. Recreate the request-key index
  // after the directory index to force the contender to reach the directory
  // conflict before reserving its final request key. Constraint names and
  // definitions are unchanged; restore the original index order afterward.
  await db.query(`ALTER TABLE dailylogger_service.fixture_runs
    DROP CONSTRAINT fixture_runs_request_key_key,
    ADD CONSTRAINT fixture_runs_request_key_key UNIQUE (request_key)`)
  try {
    for (const targeted of [true, false]) {
      const requestKey = targeted ? 'forced-targeted-control' : 'forced-all-constraints'
      const directory = checkedRunDir(join(sandbox, requestKey))
      const winnerRunId = randomUUID()
      const winnerFixture = readPostgresFixture(winnerRunId)
      const requestDigest = digest(json({ runDir: directory, source: winnerFixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
      reserveDestination(directory, requestKey, winnerRunId, () => requestDigest)
      const winner = await db.connect()
      const contender = new pg.Pool({ connectionString: testUrl.toString(), max: 1, connectionTimeoutMillis: 5000 })
      let pending: Promise<{ ok: true; value: Awaited<ReturnType<typeof admitRun>> | null } | { ok: false; error: unknown }> | undefined
      try {
        await winner.query("SET statement_timeout = '8s'")
        await contender.query("SET statement_timeout = '8s'")
        const winnerPid = (await winner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        const contenderPid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        await winner.query('BEGIN')
        // Reserve the directory in an uncommitted row; finalize its key only
        // after the contender has passed its request-key conflict precheck.
        await winner.query(`INSERT INTO dailylogger_service.fixture_runs
          (run_id,request_key,request_digest,run_dir,manifest_digest,manifest_text,workflow_version)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [winnerRunId, `${requestKey}-provisional`, requestDigest, directory, winnerFixture.manifestDigest, winnerFixture.manifestBytes, POSTGRES_WORKFLOW_VERSION])
        const contenderRunId = randomUUID()
        const contenderFixture = readPostgresFixture(contenderRunId)
        const operation = targeted
          // Positive control: the exact former target allows the other unique
          // index to raise 23505 even though both requests ultimately match.
          ? contender.query(`INSERT INTO dailylogger_service.fixture_runs
              (run_id,request_key,request_digest,run_dir,manifest_digest,manifest_text,workflow_version)
              VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (request_key) DO NOTHING`,
            [contenderRunId, requestKey, requestDigest, directory, contenderFixture.manifestDigest, contenderFixture.manifestBytes, POSTGRES_WORKFLOW_VERSION]).then(() => null)
          : admitRun(contender, requestKey, directory)
        pending = operation.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
        let blocked = false
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          const observation = await db.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [winnerPid, contenderPid])
          if (observation.rows[0].blocked) { blocked = true; break }
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        assert.equal(blocked, true, 'Contender must be observed waiting for the held winner transaction')
        await winner.query('UPDATE dailylogger_service.fixture_runs SET request_key=$2 WHERE run_id=$1', [winnerRunId, requestKey])
        await winner.query('COMMIT')
        const outcome = await pending
        if (targeted) {
          assert.equal(outcome.ok, false, 'Positive control must expose the former unique-index race')
          if (outcome.ok) assert.fail('Former targeted admission unexpectedly succeeded')
          assert.equal((outcome.error as { code?: string }).code, '23505')
          assert.equal((outcome.error as { constraint?: string }).constraint, 'fixture_runs_run_dir_key')
        } else {
          if (!outcome.ok) throw outcome.error
          assert.ok(outcome.value)
          assert.equal(outcome.value.run_id, winnerRunId)
          assert.equal(outcome.value.request_digest, requestDigest)
          assert.equal(outcome.value.manifest_digest, winnerFixture.manifestDigest)
          assert.equal(outcome.value.run_dir, directory)
        }
        const persisted = await db.query('SELECT run_id FROM dailylogger_service.fixture_runs WHERE request_key=$1 OR run_dir=$2', [requestKey, directory])
        assert.deepEqual(persisted.rows, [{ run_id: winnerRunId }])
        assert.equal(existsSync(join(directory, RESERVATION_FILE)), true, 'Filesystem reservation precedes database admission')
        assert.equal(existsSync(join(directory, 'manifest.json')), false, 'Admission alone must not initialize or execute a graph')
      } finally {
        // Releasing the transaction unblocks a contender even when an assertion
        // fails. Its server-side timeout bounds settlement before pool cleanup.
        await winner.query('ROLLBACK').catch(() => {})
        await winner.query('RESET statement_timeout').catch(() => {})
        winner.release()
        await pending
        await contender.end()
      }
    }
  } finally {
    await db.query(`ALTER TABLE dailylogger_service.fixture_runs
      DROP CONSTRAINT fixture_runs_run_dir_key,
      ADD CONSTRAINT fixture_runs_run_dir_key UNIQUE (run_dir)`)
    const constraints = await db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='dailylogger_service.fixture_runs'::regclass
      AND conname IN ('fixture_runs_request_key_key','fixture_runs_run_dir_key') ORDER BY conname`)
    assert.deepEqual(constraints.rows, [
      { conname: 'fixture_runs_request_key_key', definition: 'UNIQUE (request_key)' },
      { conname: 'fixture_runs_run_dir_key', definition: 'UNIQUE (run_dir)' },
    ])
  }
})

test('a durable admission survives process exit before input initialization and retry reuses its UUID', async () => {
  const directory = join(sandbox, 'admission-only')
  const runnerPath = join(REPO_ROOT, 'apps/service/src/postgres-runner.ts')
  const dbPath = join(REPO_ROOT, 'apps/service/src/postgres-db.ts')
  const admitted = success(spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { admitRun } from ${JSON.stringify(runnerPath)};
    import { openDatabase } from ${JSON.stringify(dbPath)};
    const db = openDatabase(process.env.DAILYLOGGER_DATABASE_URL);
    const row = await admitRun(db, 'admission-only', ${JSON.stringify(directory)});
    console.log(JSON.stringify({ runId: row.run_id }));
    await db.end();
  `], { cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 30_000 }))
  assert.equal(existsSync(join(directory, RESERVATION_FILE)), true)
  assert.equal(existsSync(join(directory, 'manifest.json')), false)
  const before = await db.query('SELECT status,checkpoint_id FROM dailylogger_service.fixture_runs WHERE run_id=$1', [admitted.runId])
  assert.deepEqual(before.rows[0], { status: 'admitted', checkpoint_id: null })
  const started = start('admission-only')
  assert.equal(started.runId, admitted.runId)
  assert.equal(started.status, 'awaiting-approval')
  assert.deepEqual(nodes(directory), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

test('initialized legacy admissions adopt ownership without changing manifest or approval bytes', async () => {
  const runId = randomUUID()
  const fixture = readPostgresFixture(runId, false)
  const directory = checkedRunDir(join(sandbox, 'legacy-adoption'))
  initializeRun(directory, fixture)
  const requestDigest = digest(json({ runDir: directory, source: fixture.manifest.source, workflowVersion: POSTGRES_WORKFLOW_VERSION }))
  await db.query(`INSERT INTO dailylogger_service.fixture_runs
    (run_id,request_key,request_digest,run_dir,manifest_digest,manifest_text,workflow_version) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [runId, 'legacy-adoption', requestDigest, directory, fixture.manifestDigest, fixture.manifestBytes, POSTGRES_WORKFLOW_VERSION])
  const started = success(command('start', ['--request-key', 'legacy-adoption', '--run-dir', directory]))
  assert.equal(started.runId, runId)
  assert.equal(started.approvalDigest, approvalDigest(fixture, reviewFixture(fixture)))
  assert.equal(readFileSync(join(directory, 'manifest.json'), 'utf8'), fixture.manifestBytes)
  assert.equal(JSON.parse(readFileSync(join(directory, RESERVATION_FILE), 'utf8')).runId, runId)
})

test('initial empty input checkpoint survives process death before pending writes and recovers normally', async () => {
  const directory = join(sandbox, 'initial-checkpoint')
  const request = ['--request-key', 'initial-checkpoint', '--run-dir', directory]
  const killed = command('start', request, 'crash-after-initial-checkpoint.ts')
  assert.equal(killed.signal, 'SIGKILL', killed.stderr)
  const admitted = await db.query('SELECT run_id,checkpoint_id FROM dailylogger_service.fixture_runs WHERE request_key=$1', ['initial-checkpoint'])
  const runId = admitted.rows[0].run_id
  assert.equal(admitted.rows[0].checkpoint_id, null, 'Application projection has not observed the initial checkpoint')
  const checkpoints = await db.query('SELECT checkpoint_id,metadata FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1', [runId])
  assert.equal(checkpoints.rows.length, 1)
  assert.equal(checkpoints.rows[0].metadata.source, 'input')
  assert.equal(checkpoints.rows[0].metadata.step, -1)
  const writes = await db.query('SELECT 1 FROM dailylogger_checkpoints.checkpoint_writes WHERE thread_id=$1', [runId])
  assert.equal(writes.rows.length, 0, 'Crash is before the input pending writes are committed')
  const initial = success(command('status', forRun(runId)))
  assert.equal(initial.status, 'recoverable')
  assert.equal(initial.checkpointId, checkpoints.rows[0].checkpoint_id)
  assert.deepEqual(initial.completedSteps, [])
  assert.deepEqual(initial.next, ['__start__'])
  assert.equal(success(command('status', forRun(runId))).checkpointId, initial.checkpointId, 'Repeated status must not reinterpret the persisted input as missing')
  assert.equal(success(command('start', request)).checkpointId, initial.checkpointId, 'Duplicate start observes; it does not create another initial checkpoint')
  const recovered = success(command('recover', forRun(runId)))
  assert.equal(recovered.status, 'awaiting-approval')
  assert.equal(existsSync(join(directory, 'artifacts')), false, 'Initial recovery cannot approve output')
  assert.deepEqual(nodes(directory), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal(success(command('resume', resumeArgs(recovered))).status, 'complete')
  assertOutput(directory, runId)
})

test('later missing manifest state is rejected instead of being reconstructed as new input', async () => {
  const started = start('later-missing-manifest')
  // Fault injection is confined to this test's newly created database. Blobs
  // are keyed by thread and channel version; removing this channel must not
  // cause a later checkpoint to be mistaken for the initial input boundary.
  await db.query("DELETE FROM dailylogger_checkpoints.checkpoint_blobs WHERE thread_id=$1 AND channel='manifestDigest'", [started.runId])
  failure(command('status', forRun(started.runId)), /Missing initialized manifest outside the initial input checkpoint/)
  failure(command('recover', forRun(started.runId)), /Missing initialized manifest outside the initial input checkpoint/)
  assert.equal(existsSync(join(started.runDir, 'artifacts')), false)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

test('loss of an acknowledged checkpoint never moves the application pointer backward', async () => {
  const started = start('lost-acknowledged')
  await db.query("DELETE FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND checkpoint_ns='' AND checkpoint_id=$2", [started.runId, started.checkpointId])
  assert.ok((await db.query('SELECT 1 FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1', [started.runId])).rows.length > 0, 'Older checkpoints remain')
  failure(command('status', forRun(started.runId)), /Acknowledged checkpoint is missing/)
  failure(command('recover', forRun(started.runId)), /Acknowledged checkpoint is missing/)
  failure(command('start', ['--request-key', 'lost-acknowledged', '--run-dir', started.runDir]), /Acknowledged checkpoint is missing/)
  const row = await db.query('SELECT checkpoint_id,status FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  assert.deepEqual(row.rows[0], { checkpoint_id: started.checkpointId, status: 'awaiting-approval' })
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

test('empty checkpoint history cannot restart prior node or artifact effects even before app acknowledgment', async () => {
  const started = start('empty-after-execution')
  await db.query('DELETE FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1', [started.runId])
  await db.query("UPDATE dailylogger_service.fixture_runs SET checkpoint_id=NULL,status='admitted' WHERE run_id=$1", [started.runId])
  failure(command('start', ['--request-key', 'empty-after-execution', '--run-dir', started.runDir]), /Checkpoint history is missing after recorded execution/)
  failure(command('status', forRun(started.runId)), /Checkpoint history is missing after recorded execution/)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  // Isolate filesystem evidence from the DB attempt ledger in this test DB.
  await db.query("UPDATE dailylogger_service.operation_attempts SET nodes='[]'::jsonb,before_checkpoint_id=NULL,after_checkpoint_id=NULL WHERE run_id=$1", [started.runId])
  rmSync(join(started.runDir, 'attempts.jsonl'))
  mkdirSync(join(started.runDir, 'artifacts'))
  writeFileSync(join(started.runDir, 'artifacts/retained-effect'), 'do not replace')
  failure(command('start', ['--request-key', 'empty-after-execution', '--run-dir', started.runDir]), /Checkpoint history is missing after recorded execution/)
  assert.equal(readFileSync(join(started.runDir, 'artifacts/retained-effect'), 'utf8'), 'do not replace')
  assert.equal(existsSync(join(started.runDir, 'attempts.jsonl')), false)
})

test('attempt checkpoint anchors reject partial history loss before first application acknowledgment', async () => {
  const started = start('lost-attempt-anchor')
  const earliest = await db.query("SELECT checkpoint_id FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND metadata->>'step'='0'", [started.runId])
  assert.equal(earliest.rows.length, 1)
  await db.query('DELETE FROM dailylogger_checkpoints.checkpoints WHERE thread_id=$1 AND checkpoint_id<>$2', [started.runId, earliest.rows[0].checkpoint_id])
  await db.query("UPDATE dailylogger_service.fixture_runs SET checkpoint_id=NULL,status='admitted' WHERE run_id=$1", [started.runId])
  failure(command('recover', forRun(started.runId)), /Recorded operation checkpoint is missing/)
  failure(command('start', ['--request-key', 'lost-attempt-anchor', '--run-dir', started.runDir]), /Recorded operation checkpoint is missing/)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.equal((await db.query('SELECT checkpoint_id FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])).rows[0].checkpoint_id, null)
})

test('an unrelated surviving checkpoint is not accepted as forward reconciliation', async () => {
  const started = start('unrelated-history')
  const unrelatedId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  await db.query(`INSERT INTO dailylogger_checkpoints.checkpoints (thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,type,checkpoint,metadata)
    SELECT thread_id,checkpoint_ns,$3,NULL,type,checkpoint,metadata FROM dailylogger_checkpoints.checkpoints
    WHERE thread_id=$1 AND checkpoint_id=$2`, [started.runId, started.checkpointId, unrelatedId])
  failure(command('status', forRun(started.runId)), /not a descendant/)
  const row = await db.query('SELECT checkpoint_id FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  assert.equal(row.rows[0].checkpoint_id, started.checkpointId)
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

test('stale approval, changed frozen inputs and conflicting application manifest fail closed', async () => {
  const started = start('stale')
  failure(command('resume', [...forRun(started.runId), '--approval-digest', '0'.repeat(64)]), /Stale or missing approval/)
  for (const relative of ['inputs/article.md', 'inputs/actions.json', 'manifest.json']) {
    const file = join(started.runDir, relative)
    const original = readFileSync(file)
    appendFileSync(file, 'changed')
    failure(command('resume', resumeArgs(started)), /Changed frozen|Stale or changed manifest/)
    writeFileSync(file, original)
  }
  await db.query("UPDATE dailylogger_service.fixture_runs SET manifest_digest='changed' WHERE run_id=$1", [started.runId])
  failure(command('resume', resumeArgs(started)), /different immutable manifest/)
  await db.query('UPDATE dailylogger_service.fixture_runs SET manifest_digest=$2 WHERE run_id=$1', [started.runId, started.manifestDigest])
  const original = await db.query('SELECT request_digest,run_dir FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  await db.query("UPDATE dailylogger_service.fixture_runs SET request_digest='changed' WHERE run_id=$1", [started.runId])
  failure(command('status', forRun(started.runId)), /admission digest or canonical run directory differs/)
  await db.query('UPDATE dailylogger_service.fixture_runs SET request_digest=$2,run_dir=$3 WHERE run_id=$1', [started.runId, original.rows[0].request_digest, join(sandbox, 'redirected')])
  failure(command('resume', resumeArgs(started)), /admission digest or canonical run directory differs/)
  assert.equal(existsSync(join(sandbox, 'redirected')), false)
  await db.query('UPDATE dailylogger_service.fixture_runs SET run_dir=$2 WHERE run_id=$1', [started.runId, `${original.rows[0].run_dir}/.`])
  failure(command('status', forRun(started.runId)), /admission digest or canonical run directory differs/)
  await db.query('UPDATE dailylogger_service.fixture_runs SET run_dir=$2 WHERE run_id=$1', [started.runId, original.rows[0].run_dir])
  assert.equal(success(command('status', forRun(started.runId))).checkpointId, started.checkpointId)
  assert.equal(existsSync(join(started.runDir, 'artifacts')), false)
})

test('SIGKILL after output before checkpoint releases the lock and recovers without overwriting or rerunning successful steps', async () => {
  const started = start('crash-before-checkpoint')
  const killed = command('resume', resumeArgs(started), 'crash-after-output.ts')
  assert.equal(killed.signal, 'SIGKILL', killed.stderr)
  assertOutput(started.runDir, started.runId)
  const timestamp = statSync(join(started.runDir, 'artifacts/receipt.json')).mtimeMs
  const recovering = success(command('status', forRun(started.runId)))
  assert.equal(recovering.status, 'recoverable')
  assert.deepEqual(recovering.next, ['write_shadow_artifacts'])
  const recovered = success(command('recover', forRun(started.runId)))
  assert.equal(recovered.status, 'complete')
  assert.equal(statSync(join(started.runDir, 'artifacts/receipt.json')).mtimeMs, timestamp)
  for (const node of ['collect_fixture', 'draft_fixture', 'review_fixture']) assert.equal(nodes(started.runDir).filter(item => item === node).length, 1)
  const abandoned = await db.query("SELECT after_checkpoint_id FROM dailylogger_service.operation_attempts WHERE run_id=$1 AND state='abandoned'", [started.runId])
  assert.equal(abandoned.rows.length, 1)
  assert.equal(abandoned.rows[0].after_checkpoint_id, recovering.checkpointId)
})

test('final checkpoint survives a crash before application settlement and repairs the stale run row', async () => {
  const started = start('crash-after-checkpoint')
  assert.equal(command('resume', resumeArgs(started), 'crash-after-checkpoint.ts').signal, 'SIGKILL')
  const stale = await db.query('SELECT status FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  assert.equal(stale.rows[0].status, 'awaiting-approval')
  const repaired = success(command('status', forRun(started.runId)))
  assert.equal(repaired.status, 'complete')
  const row = await db.query('SELECT status,checkpoint_id,receipt_sha256 FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])
  assert.deepEqual(row.rows[0], { status: 'complete', checkpoint_id: repaired.checkpointId, receipt_sha256: repaired.receiptSha256 })
  assert.deepEqual(nodes(started.runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
})

test('losing the advisory-lock connection terminates its process', { timeout: 15_000 }, async () => {
  const modulePath = join(REPO_ROOT, 'apps/service/src/postgres-db.ts')
  const runId = randomUUID()
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { openDatabase, withRunLock } from ${JSON.stringify(modulePath)};
    const db = openDatabase(process.env.DAILYLOGGER_DATABASE_URL);
    await withRunLock(db, ${JSON.stringify(runId)}, async client => {
      const result = await client.query('SELECT pg_backend_pid() AS pid');
      console.log(JSON.stringify(result.rows[0]));
      await new Promise(() => {});
    });
  `], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', bytes => { stderr += bytes })
  const exited = once(child, 'exit')
  try {
    const [bytes] = await once(child.stdout, 'data')
    const { pid } = JSON.parse(String(bytes))
    await db.query('SELECT pg_terminate_backend($1)', [pid])
    const [code] = await exited
    assert.equal(code, 1)
    assert.match(stderr, /lock connection lost/)
  } finally { if (child.exitCode === null) child.kill('SIGKILL') }
})
