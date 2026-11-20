import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('HTTP is disabled in the fixture delivery executable') }

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { request: { type: 'string' }, 'command-id': { type: 'string' }, 'run-id': { type: 'string' } } })
  const [operation] = positionals
  if (positionals.length !== 1 || !['migrate', 'enqueue', 'command', 'run', 'work'].includes(operation)) throw new Error('Usage: service:delivery migrate | enqueue --request JSON_FILE | command --command-id UUID | run --run-id UUID | work')
  const expected = operation === 'enqueue' ? 'request' : operation === 'command' ? 'command-id' : operation === 'run' ? 'run-id' : null
  if (Object.keys(values).some(key => key !== expected) || (expected && !values[expected])) throw new Error('Unexpected or missing delivery command argument')
  const { databaseUrl, openDatabase } = await import('./postgres-db.js')
  const { migrateDelivery, startDelivery } = await import('./delivery-db.js')
  const { admitCommand, commandStatus, runStatus } = await import('./delivery-commands.js')
  const connectionString = databaseUrl(process.env.DAILYLOGGER_DATABASE_URL)
  const pool = openDatabase(connectionString)
  let worker = false
  let boss: Awaited<ReturnType<typeof startDelivery>> | undefined
  try {
    if (operation === 'migrate') { await migrateDelivery(pool, connectionString); console.log(JSON.stringify({ status: 'delivery_migrated' })); return }
    boss = await startDelivery(pool, connectionString, operation === 'work')
    if (operation === 'work') {
      const { runWorker } = await import('./delivery-worker.js')
      await runWorker(pool, connectionString, boss)
      worker = true
    } else if (operation === 'enqueue') {
      const result = await admitCommand(pool, boss, JSON.parse(readFileSync(values.request!, 'utf8')) as unknown)
      console.log(JSON.stringify(result))
    } else if (operation === 'command') console.log(JSON.stringify(await commandStatus(pool, boss, values['command-id']!), null, 2))
    else console.log(JSON.stringify(await runStatus(pool, connectionString, values['run-id']!), null, 2))
  } finally { if (!worker) { await boss?.stop(); await pool.end() } }
}
main().catch(async error => {
  const { safeDatabaseError } = await import('./postgres-db.js')
  console.error(safeDatabaseError(error)); process.exitCode = 1
})
