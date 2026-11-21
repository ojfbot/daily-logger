import { parseArgs } from 'node:util'

// Only PostgreSQL is configured in this fixture executable. No model, HTTP
// collector, publisher or ambient LangSmith trace export is permitted.
delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('HTTP access is disabled in the PostgreSQL fixture executable') }

async function main() {
  const { positionals, values } = parseArgs({ options: {
    'run-dir': { type: 'string' }, 'run-id': { type: 'string' },
    'request-key': { type: 'string' }, 'approval-digest': { type: 'string' },
  }, allowPositionals: true })
  const [operation] = positionals
  if (positionals.length !== 1 || !['migrate', 'start', 'status', 'resume', 'recover'].includes(operation)) throw new Error('Usage: service:postgres migrate | start --request-key KEY --run-dir DIR | status|recover --run-id UUID | resume --run-id UUID --approval-digest DIGEST')
  if (operation !== 'resume' && values['approval-digest']) throw new Error('--approval-digest is only valid with resume')
  if (operation !== 'start' && (values['run-dir'] || values['request-key'])) throw new Error('--run-dir and --request-key are only valid with start')
  if (['start', 'migrate'].includes(operation) && values['run-id']) throw new Error('--run-id is only valid with status, resume or recover')
  const { databaseUrl, openDatabase, migrateDatabase, requireMigrated } = await import('./postgres-db.js')
  const connectionString = databaseUrl(process.env.DAILYLOGGER_DATABASE_URL)
  const pool = openDatabase(connectionString)
  try {
    if (operation === 'migrate') {
      await migrateDatabase(pool, connectionString)
      console.log(JSON.stringify({ status: 'migrated', applicationSchema: 'dailylogger_service', checkpointSchema: 'dailylogger_checkpoints' }))
      return
    }
    await requireMigrated(pool)
    const { admitRun, runOperation } = await import('./postgres-runner.js')
    let runId = values['run-id']
    if (operation === 'start') {
      if (!values['run-dir'] || !values['request-key']) throw new Error('start requires --request-key and --run-dir')
      runId = (await admitRun(pool, values['request-key'], values['run-dir'])).run_id
    }
    if (!runId) throw new Error('This command requires --run-id')
    const result = await runOperation(pool, connectionString, operation as 'start' | 'status' | 'resume' | 'recover', runId, values['approval-digest'])
    console.log(JSON.stringify(result, null, 2))
  } finally { await pool.end() }
}

main().catch(async (error: unknown) => {
  const { safeDatabaseError } = await import('./postgres-db.js')
  console.error(safeDatabaseError(error))
  process.exitCode = 1
})
