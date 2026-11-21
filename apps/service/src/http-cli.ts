delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'

async function main() {
  const [operation, ...extra] = process.argv.slice(2)
  if (!['migrate', 'serve'].includes(operation) || extra.length) throw new Error('Usage: service:http migrate|serve')
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
  const { createHttpServer, httpConfig } = await import('./http-server.js')
  const config = httpConfig(process.env)
  const port = Number(process.env.DAILYLOGGER_HTTP_PORT ?? 4300)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid private HTTP port')
  const app = await createHttpServer(config)
  const stop = async () => {
    const deadline = setTimeout(() => process.exit(1), 8000)
    await app.close()
    clearTimeout(deadline)
  }
  process.once('SIGTERM', () => { void stop() })
  process.once('SIGINT', () => { void stop() })
  try { await app.listen({ host: '127.0.0.1', port }) }
  catch (error) { await app.close(); throw error }
  console.log(JSON.stringify({ status: 'http_ready', port }))
}

main().catch(() => { process.stderr.write('Private fixture HTTP command failed\n'); process.exitCode = 1 })
