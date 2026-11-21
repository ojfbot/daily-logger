import { parseArgs } from 'node:util'

delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { 'telemetry-config': { type: 'string' } } })
  const [operation] = positionals
  if (!['migrate', 'serve'].includes(operation) || positionals.length !== 1
    || (operation !== 'serve' && values['telemetry-config'] !== undefined)) throw new Error('Usage: service:http migrate | serve [--telemetry-config FILE]')
  if (operation === 'migrate') {
    const { databaseUrl, openDatabase, migrateDatabase } = await import('./postgres-db.js')
    const { migrateDelivery } = await import('./delivery-db.js')
    const url = databaseUrl(process.env.DAILYLOGGER_DATABASE_URL)
    const pool = openDatabase(url)
    try { await migrateDelivery(pool, url); await migrateDatabase(pool, url, { http: true }) }
    finally { await pool.end() }
    console.log(JSON.stringify({ status: 'http_migrated' }))
    return
  }
  const { createHttpServer, httpConfig, httpListenHost } = await import('./http-server.js')
  const config = httpConfig(process.env)
  const host = httpListenHost(process.env)
  const port = Number(process.env.DAILYLOGGER_HTTP_PORT ?? 4300)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid private HTTP port')
  const { createRuntimeTelemetry } = await import('./telemetry-runtime.js')
  const { shutdownTelemetry } = await import('./telemetry.js')
  const telemetry = createRuntimeTelemetry(values['telemetry-config'])
  // createHttpServer owns normal/startup cleanup; its adapter shutdown is idempotent.
  // This guard also covers an exception before the server can register ownership.
  let app: Awaited<ReturnType<typeof createHttpServer>>
  try { app = await createHttpServer(config, undefined, telemetry) }
  catch (error) { await shutdownTelemetry(telemetry); throw error }
  const stop = async () => {
    const deadline = setTimeout(() => process.exit(1), 8000)
    await app.close()
    clearTimeout(deadline)
  }
  process.once('SIGTERM', () => { void stop() })
  process.once('SIGINT', () => { void stop() })
  try { await app.listen({ host, port }) }
  catch (error) { await app.close(); throw error }
  console.log(JSON.stringify({ status: 'http_ready', port }))
}

main().catch(async error => {
  const { TelemetryConfigurationError } = await import('./telemetry-runtime.js')
  process.stderr.write(error instanceof TelemetryConfigurationError ? 'Private fixture telemetry configuration invalid\n' : 'Private fixture HTTP command failed\n')
  process.exitCode = 1
})
