// Test-only worker with explicit offline capture. No production exporter configuration.
import { appendFileSync } from 'node:fs'
delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('HTTP is disabled in the observability test worker') }
const { databaseUrl, openDatabase, safeDatabaseError } = await import('../../src/postgres-db.js')
const { startDelivery } = await import('../../src/delivery-db.js')
const { runWorker } = await import('../../src/delivery-worker.js')
const { createOfflineTelemetry } = await import('../../src/telemetry.js')
const [capture, mode] = process.argv.slice(2)
const telemetry = createOfflineTelemetry([{ export(batch) {
  if (mode === 'stuck') return new Promise<void>(() => {})
  if (mode === 'throw') throw new Error('SECRET-test-export-error')
  appendFileSync(capture, batch.map(record => JSON.stringify(record)).join('\n') + '\n')
} }])
try {
  const connectionString = databaseUrl(process.env.DAILYLOGGER_DATABASE_URL)
  const pool = openDatabase(connectionString)
  const boss = await startDelivery(pool, connectionString, true)
  await runWorker(pool, connectionString, boss, telemetry)
} catch (error) { console.error(safeDatabaseError(error)); process.exitCode = 1 }
