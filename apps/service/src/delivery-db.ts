import type pg from 'pg'
import { PgBoss, type Db } from 'pg-boss'
import { digest, json, requireCondition } from './fixture.js'
import { migrateDatabase, requireMigrated } from './postgres-db.js'

export const BOSS_VERSION = '12.38.2'
export const BOSS_SCHEMA_VERSION = 46
export const BOSS_SCHEMA = 'dailylogger_delivery'
export const QUEUE = 'fixture-command-v1'
export const QUEUE_OPTIONS = {
  policy: 'standard' as const, retryLimit: 2, retryDelay: 1, retryBackoff: true, retryDelayMax: 30,
  expireInSeconds: 60, retentionSeconds: 86400, deleteAfterSeconds: 604800,
}
export const QUEUE_CONFIG_DIGEST = digest(json(QUEUE_OPTIONS))
export const SEGMENT_TIMEOUT_MS = 45_000
export const DRAIN_TIMEOUT_MS = 5_000
export const SHUTDOWN_TIMEOUT_MS = 8_000

export function transactionAdapter(client: pg.PoolClient): Db {
  return { executeSql: (text, values) => client.query(text, values) }
}

export function createBoss(connectionString: string, migrate = false, supervise = false) {
  const boss = new PgBoss({ connectionString, schema: BOSS_SCHEMA, migrate, createSchema: migrate,
    supervise, schedule: false, max: 4, connectionTimeoutMillis: 5000,
    superviseIntervalSeconds: 1, monitorIntervalSeconds: 1, maintenanceIntervalSeconds: 60,
    openTelemetry: { enabled: false },
  })
  boss.on('error', () => { process.stderr.write('Fixture delivery database error; stopping process\n'); process.exit(1) })
  return boss
}

export async function migrateDelivery(pool: pg.Pool, connectionString: string) {
  const installed = await pool.query("SELECT to_regclass('dailylogger_delivery.version') AS vendor,to_regclass('dailylogger_service.delivery_installation') AS receipt")
  if (installed.rows[0].vendor) {
    const version = await pool.query('SELECT version FROM dailylogger_delivery.version')
    requireCondition(version.rows.length === 1 && version.rows[0].version === BOSS_SCHEMA_VERSION, 'Existing pg-boss schema requires a separately reviewed migration')
  } else {
    // Namespace dependencies cover tables, sequences, types and functions, so
    // a damaged installation cannot be mistaken for a fresh empty schema.
    const objects = await pool.query<{ present: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_namespace n ON n.oid=d.refobjid
      WHERE d.refclassid='pg_catalog.pg_namespace'::regclass AND n.nspname=$1
    ) AS present`, [BOSS_SCHEMA])
    requireCondition(!objects.rows[0].present, 'Existing pg-boss objects have no version ledger; refusing installation')
  }
  if (installed.rows[0].receipt) {
    const version = await pool.query('SELECT library_version,schema_version FROM dailylogger_service.delivery_installation')
    requireCondition(version.rows.every(row => row.library_version === BOSS_VERSION && row.schema_version === BOSS_SCHEMA_VERSION), 'Existing delivery version requires a separately reviewed migration')
  }
  await migrateDatabase(pool, connectionString, { delivery: true })
  const client = await pool.connect()
  const boss = createBoss(connectionString, true)
  try {
    await client.query('SELECT pg_advisory_lock(830031, 2)')
    await boss.start()
    requireCondition(await boss.schemaVersion() === BOSS_SCHEMA_VERSION, 'Unsupported pg-boss schema version; refusing to record installation')
    await boss.createQueue(QUEUE, QUEUE_OPTIONS)
    await verifyQueue(boss)
    await client.query(`INSERT INTO dailylogger_service.delivery_installation(singleton,library_version,schema_version,queue_config_digest)
      VALUES(true,$1,$2,$3) ON CONFLICT(singleton) DO UPDATE SET library_version=EXCLUDED.library_version,schema_version=EXCLUDED.schema_version,queue_config_digest=EXCLUDED.queue_config_digest`,
    [BOSS_VERSION, BOSS_SCHEMA_VERSION, QUEUE_CONFIG_DIGEST])
  } finally {
    await boss.stop()
    await client.query('SELECT pg_advisory_unlock(830031, 2)').catch(() => {})
    client.release()
  }
}

async function verifyQueue(boss: PgBoss) {
  const queue = await boss.getQueue(QUEUE)
  requireCondition(queue, 'Fixture command queue is missing; migrate explicitly')
  for (const [name, expected] of Object.entries(QUEUE_OPTIONS)) requireCondition(queue[name as keyof typeof queue] === expected, `Fixture queue configuration differs: ${name}`)
}

export async function startDelivery(pool: pg.Pool, connectionString: string, supervise = false) {
  await requireMigrated(pool, { delivery: true })
  const exists = await pool.query("SELECT to_regclass('dailylogger_service.delivery_installation') AS installation")
  requireCondition(exists.rows[0].installation, 'Delivery is not initialized; migrate explicitly')
  const result = await pool.query('SELECT * FROM dailylogger_service.delivery_installation WHERE singleton')
  const installed = result.rows[0]
  requireCondition(installed?.library_version === BOSS_VERSION && installed?.schema_version === BOSS_SCHEMA_VERSION && installed?.queue_config_digest === QUEUE_CONFIG_DIGEST, 'Delivery installation/version differs; migrate explicitly')
  const boss = createBoss(connectionString, false, supervise)
  try {
    await boss.start()
    requireCondition(await boss.schemaVersion() === BOSS_SCHEMA_VERSION, 'Unsupported pg-boss schema version')
    await verifyQueue(boss)
    return boss
  } catch (error) { await boss.stop(); throw error }
}
