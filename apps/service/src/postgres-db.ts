import pg from 'pg'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { readFileSync } from 'node:fs'
import { digest, requireCondition } from './fixture.js'
import { AdmissionConflictError } from './admission-conflict.js'

export const CHECKPOINT_SCHEMA = 'dailylogger_checkpoints'
export const POSTGRES_SAVER_VERSION = '1.1.4'
const migration = readFileSync(new URL('../migrations/001_fixture_runs.sql', import.meta.url), 'utf8')
const migrationDigest = digest(migration)
// Reviewed against the migrations shipped by the pinned saver 1.1.4.
const VENDOR_MIGRATIONS = [0, 1, 2, 3, 4, 5]

export function canonicalRunId(input: string): string {
  requireCondition(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input), 'Run ID must be a UUID')
  return input.toLowerCase()
}

async function requireVendorHistory(db: Pick<pg.Pool, 'query'>, allowPrefix: boolean): Promise<void> {
  const objects = await db.query(`SELECT to_regclass('dailylogger_checkpoints.checkpoint_migrations')::text AS ledger,
    to_regclass('dailylogger_checkpoints.checkpoints')::text AS checkpoints,
    to_regclass('dailylogger_checkpoints.checkpoint_blobs')::text AS blobs,
    to_regclass('dailylogger_checkpoints.checkpoint_writes')::text AS writes`)
  const tables = objects.rows[0]
  if (!tables.ledger) {
    requireCondition(allowPrefix && !tables.checkpoints && !tables.blobs && !tables.writes, 'Saver migration ledger is missing or incompatible')
    return
  }
  const result = await db.query<{ v: number }>('SELECT v FROM dailylogger_checkpoints.checkpoint_migrations ORDER BY v')
  const versions = result.rows.map(row => row.v)
  requireCondition(versions.length <= VENDOR_MIGRATIONS.length && versions.every((version, index) => version === VENDOR_MIGRATIONS[index])
    && (allowPrefix || versions.length === VENDOR_MIGRATIONS.length), 'Saver migration history is incompatible with pinned version 1.1.4')
  if (versions.length === 0) requireCondition(!tables.checkpoints && !tables.blobs && !tables.writes, 'Empty saver migration ledger conflicts with existing tables')
  requireCondition((versions.length < 2 || tables.checkpoints) && (versions.length < 3 || tables.blobs)
    && (versions.length < 4 || tables.writes), 'Saver migration history references missing tables')
}

const deliveryMigration = readFileSync(new URL('../migrations/002_delivery_commands.sql', import.meta.url), 'utf8')
const deliveryMigrationDigest = digest(deliveryMigration)
const httpMigration = readFileSync(new URL('../migrations/003_fixture_http.sql', import.meta.url), 'utf8')
const journalMigration = readFileSync(new URL('../migrations/004_private_journal.sql', import.meta.url), 'utf8')
const applicationDigests = [migrationDigest, deliveryMigrationDigest, digest(httpMigration), digest(journalMigration)]

function validateApplicationMigrations(rows: { version: number; digest: string; checkpointer_version: string | null }[]) {
  requireCondition(rows.length >= 1 && rows.length <= applicationDigests.length && rows.every((row, index) => row.version === index + 1), 'Database has unsupported application migrations; refusing downgrade')
  requireCondition(rows.every((row, index) => row.digest === applicationDigests[index]), 'Application migration checksum differs; refusing to continue')
  requireCondition(!rows[0].checkpointer_version || rows[0].checkpointer_version === POSTGRES_SAVER_VERSION, 'Checkpointer version change requires a reviewed migration')
}

export function databaseUrl(value: string | undefined): string {
  requireCondition(value, 'DAILYLOGGER_DATABASE_URL is required; no implicit database connection is used')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Invalid PostgreSQL database URL') }
  requireCondition(['postgres:', 'postgresql:'].includes(parsed.protocol) && parsed.pathname.length > 1, 'A PostgreSQL URL with an explicit database name is required')
  return value
}

export function openDatabase(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 })
  pool.on('error', () => {
    process.stderr.write('PostgreSQL connection lost; stopping the fixture process\n')
    process.exit(1)
  })
  return pool
}

export function openCheckpointer(connectionString: string): PostgresSaver {
  // Own the pool so idle errors also use the sanitized, fail-closed handler.
  return new PostgresSaver(openDatabase(connectionString), undefined, { schema: CHECKPOINT_SCHEMA })
}

/** Explicit migration command; runtime commands never call setup(). */
export async function migrateDatabase(pool: pg.Pool, connectionString: string, options: { delivery?: boolean; http?: boolean; journal?: boolean } = {}): Promise<void> {
  const client = await pool.connect()
  const checkpointer = openCheckpointer(connectionString)
  let inTransaction = false
  try {
    await client.query('SELECT pg_advisory_lock(830031, 0)')
    await client.query('BEGIN')
    inTransaction = true
    await client.query('CREATE SCHEMA IF NOT EXISTS dailylogger_service')
    await client.query(`CREATE TABLE IF NOT EXISTS dailylogger_service.schema_migrations (
      version integer PRIMARY KEY, digest text NOT NULL,
      checkpointer_version text, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const existing = await client.query<{ version: number; digest: string; checkpointer_version: string | null }>('SELECT version, digest, checkpointer_version FROM dailylogger_service.schema_migrations ORDER BY version')
    if (existing.rows.length) {
      validateApplicationMigrations(existing.rows)
    }
    else {
      await client.query(migration)
      await client.query('INSERT INTO dailylogger_service.schema_migrations(version, digest) VALUES (1, $1)', [migrationDigest])
    }
    await requireVendorHistory(client, !existing.rows[0]?.checkpointer_version)
    if ((options.delivery || options.http || options.journal) && !existing.rows.some(row => row.version === 2)) {
      await client.query(deliveryMigration)
      await client.query('INSERT INTO dailylogger_service.schema_migrations(version, digest) VALUES (2, $1)', [deliveryMigrationDigest])
    }
    if ((options.http || options.journal) && !existing.rows.some(row => row.version === 3)) {
      await client.query(httpMigration)
      await client.query('INSERT INTO dailylogger_service.schema_migrations(version, digest) VALUES (3, $1)', [applicationDigests[2]])
    }
    if (options.journal && !existing.rows.some(row => row.version === 4)) {
      await client.query(journalMigration)
      await client.query('INSERT INTO dailylogger_service.schema_migrations(version, digest) VALUES (4, $1)', [applicationDigests[3]])
    }
    await client.query('COMMIT')
    inTransaction = false
    // Saver migrations own their transactions; they are not inside our app transaction.
    await checkpointer.setup()
    await requireVendorHistory(client, false)
    await client.query('UPDATE dailylogger_service.schema_migrations SET checkpointer_version = $1 WHERE version = 1', [POSTGRES_SAVER_VERSION])
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK')
    throw error
  } finally {
    await checkpointer.end()
    await client.query('SELECT pg_advisory_unlock(830031, 0)').catch(() => {})
    client.release()
  }
}

export async function requireMigrated(pool: pg.Pool, options: { delivery?: boolean; http?: boolean; journal?: boolean } = {}): Promise<void> {
  const exists = await pool.query<{ application: string | null; checkpoints: string | null }>(
    `SELECT to_regclass('dailylogger_service.schema_migrations')::text AS application,
      to_regclass('dailylogger_checkpoints.checkpoint_migrations')::text AS checkpoints`,
  )
  requireCondition(exists.rows[0].application && exists.rows[0].checkpoints, 'Database is not initialized; run service:postgres migrate explicitly')
  const result = await pool.query<{ version: number; digest: string; checkpointer_version: string }>('SELECT version, digest, checkpointer_version FROM dailylogger_service.schema_migrations ORDER BY version')
  validateApplicationMigrations(result.rows)
  requireCondition(!options.delivery || result.rows.length >= 2, 'Delivery migration 002 is missing; migrate explicitly')
  requireCondition(!options.http || result.rows.length >= 3, 'HTTP migration 003 is missing; migrate explicitly')
  requireCondition(result.rows[0]?.checkpointer_version === POSTGRES_SAVER_VERSION, 'Database migration/version differs; run the reviewed migration before execution')
  requireCondition(!options.journal || result.rows.length >= 4, 'Private journal migration 004 is missing; migrate explicitly')
  await requireVendorHistory(pool, false)
}

/** A dedicated session owns this lock until command completion or process death. */
export async function withRunLock<T>(pool: pg.Pool, runId: string, work: (client: pg.PoolClient, assertActive: () => void) => Promise<T>): Promise<T> {
  runId = canonicalRunId(runId)
  const client = await pool.connect()
  let alive = true
  const lockLost = () => {
    alive = false
    // Do not allow the saver pool to reconnect and continue without this lock.
    // This CLI owns its process; graceful cancellation alone cannot fence pending writes.
    process.stderr.write('PostgreSQL lock connection lost; stopping the fixture process\n')
    process.exit(1)
  }
  client.on('error', lockLost)
  try {
    await client.query("SET lock_timeout = '10s'")
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`dailylogger-s03a:${runId}`])
    return await work(client, () => requireCondition(alive, 'Run lock is no longer held'))
  } finally {
    if (alive) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`dailylogger-s03a:${runId}`]).catch(() => {})
    client.removeListener('error', lockLost)
    client.release()
  }
}

/** Server/connection diagnostics may contain connection details. Do not print them. */
export function safeDatabaseError(error: unknown): string {
  if (error instanceof AdmissionConflictError) return error.message
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    return `PostgreSQL or filesystem operation failed (${/^[A-Z0-9_]+$/.test(code) ? code : 'unknown'}); connection details withheld`
  }
  return error instanceof Error ? error.message : 'PostgreSQL fixture operation failed'
}
