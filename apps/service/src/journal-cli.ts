import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { parseArgs } from 'node:util'

delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'

function readPrivateJson(path: string, maxBytes: number): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const file = fstatSync(fd)
    if (!file.isFile() || (file.mode & 0o077) !== 0 || file.uid !== process.geteuid?.()) throw new Error('Private input must be owned and accessible only to the operator')
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null)
      if (!count) break
      size += count
    }
    if (size > maxBytes) throw new Error('Private journal input exceeds its size ceiling')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))) as unknown
  } finally { closeSync(fd) }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    models: { type: 'string' }, request: { type: 'string' }, 'run-id': { type: 'string' }, 'telemetry-config': { type: 'string' },
  } })
  const [operation] = positionals
  const required: Record<string, readonly (keyof typeof values)[]> = {
    migrate: [], work: ['models'], enqueue: ['models', 'request'], status: ['run-id'], result: ['run-id'],
  }
  if (positionals.length !== 1 || !Object.hasOwn(required, operation) || !required[operation].every(key => values[key])
    || Object.keys(values).some(key => !required[operation].includes(key as keyof typeof values) && !(operation === 'work' && key === 'telemetry-config'))) {
    throw new Error('Unexpected journal arguments')
  }

  const { canonicalRunId, databaseUrl, openDatabase } = await import('./postgres-db.js')
  const { journalRouting, journalRequest, verifyModelCredentials } = await import('./journal-model.js')
  const { executeJournal, enqueueJournal, migrateJournal, startJournal, journalStatus, journalResult, JOURNAL_QUEUE } = await import('./journal-delivery.js')
  const { createRuntimeTelemetry } = await import('./telemetry-runtime.js')
  const { shutdownTelemetry } = await import('./telemetry.js')
  const url = databaseUrl(process.env.DAILYLOGGER_DATABASE_URL)
  const routing = values.models ? journalRouting.parse(readPrivateJson(values.models, 16_384)) : undefined
  const pool = openDatabase(url)
  const telemetry = createRuntimeTelemetry(values['telemetry-config'])
  let boss: Awaited<ReturnType<typeof startJournal>> | undefined
  let keepRunning = false
  try {
    if (operation === 'migrate') {
      await migrateJournal(pool, url)
      console.log(JSON.stringify({ status: 'journal_migrated' }))
      return
    }
    boss = await startJournal(pool, url, operation === 'work')
    if (operation === 'work' && routing) {
      verifyModelCredentials(routing)
      const worker = boss
      await worker.work<{ runId: string }>(JOURNAL_QUEUE, { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 0.5 }, async ([job]) => {
        const abort = () => process.exit(1)
        job.signal.addEventListener('abort', abort, { once: true })
        try {
          if (job.signal.aborted) abort()
          await executeJournal(pool, url, job, routing, telemetry)
        } finally { job.signal.removeEventListener('abort', abort) }
      })
      let stopping = false
      const stop = async () => {
        if (stopping) return
        stopping = true
        const deadline = setTimeout(() => process.exit(1), 8000)
        try {
          await worker.stop({ graceful: true, timeout: 5000 })
          await pool.end()
          await shutdownTelemetry(telemetry)
          process.exit(0)
        } finally { clearTimeout(deadline) }
      }
      process.on('SIGINT', () => { void stop().catch(() => process.exit(1)) })
      process.on('SIGTERM', () => { void stop().catch(() => process.exit(1)) })
      keepRunning = true
      console.log(JSON.stringify({ status: 'journal_worker_ready' }))
    } else if (operation === 'enqueue' && routing && values.request) {
      console.log(JSON.stringify(await enqueueJournal(pool, boss, journalRequest.parse(readPrivateJson(values.request, 512 * 1024)), routing)))
    } else {
      const runId = canonicalRunId(values['run-id']!)
      const result = operation === 'status' ? await journalStatus(pool, boss, runId) : await journalResult(pool, runId)
      console.log(JSON.stringify(result))
    }
  } finally {
    if (!keepRunning) {
      try { await boss?.stop() }
      finally { try { await pool.end() } finally { await shutdownTelemetry(telemetry) } }
    }
  }
}

main().catch(() => {
  process.stderr.write('Private journal command failed. See the command usage in apps/service/runtime/README.md.\n')
  process.exitCode = 1
})
