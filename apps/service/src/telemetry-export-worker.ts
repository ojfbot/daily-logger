import { parentPort, workerData } from 'node:worker_threads'
import { projectExportConfig } from './telemetry-export-config.js'
import { createLangfuseWriter } from './telemetry-langfuse.js'

// This module is an entry point only, never imported into API/worker business code.
try {
  const config = projectExportConfig(workerData)
  if (!config || !parentPort) throw new Error('export_startup')
  const writer = createLangfuseWriter(config)
  const expiry = setInterval(() => {
    writer.expire()
    // A quarantined transport must become visible as a fixed child failure,
    // without copying status bodies, SDK diagnostics or credential-bearing URLs.
    if (writer.diagnostics().closed) process.exit(1)
    parentPort!.postMessage({ type: 'heartbeat' })
  }, 250)
  expiry.unref()
  parentPort.on('message', (message: unknown) => {
    try {
      const input = message as { type?: string; sequence?: number; records?: unknown[] }
      if (input.type === 'batch' && Array.isArray(input.records)) { writer.accept(input.records); parentPort!.postMessage({ type: 'ack', sequence: input.sequence }) }
      else if (input.type === 'close') {
        clearInterval(expiry)
        void writer.shutdown().catch(() => {}).finally(() => { parentPort!.postMessage({ type: 'closed' }); parentPort!.close() })
      } else throw new Error('export_protocol')
    } catch { process.exit(1) }
  })
  parentPort.postMessage({ type: 'ready' })
} catch { process.exit(1) }
