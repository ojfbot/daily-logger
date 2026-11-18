import { Worker } from 'node:worker_threads'
import { EXPORT_LIMITS, projectExportConfig } from './telemetry-export-config.js'

/** Responsive supervisor: SDK/serializer/secret reads run in a bounded-heap thread. */
let worker: Worker | undefined, pending: number | undefined, closing = false
let deadline: NodeJS.Timeout
let liveness: NodeJS.Timeout | undefined
const stop = () => { process.exit(0) } // Exiting the child also terminates its worker thread.
const arm = (ms: number) => { clearTimeout(deadline); deadline = setTimeout(stop, ms); deadline.unref() }
const heartbeat = () => { clearTimeout(liveness); liveness = setTimeout(stop, EXPORT_LIMITS.heartbeatMs); liveness.unref() }
arm(EXPORT_LIMITS.startupMs)
process.once('disconnect', stop)
process.once('SIGTERM', stop)
process.on('message', (message: unknown) => {
  try {
    if (!message || typeof message !== 'object' || closing) throw new Error('export_protocol')
    const input = message as { type?: string; config?: unknown; sequence?: number; records?: unknown[] }
    if (input.type === 'init' && !worker) {
      const config = projectExportConfig(input.config)
      if (!config) throw new Error('export_config')
      worker = new Worker(new URL('./telemetry-export-worker.mjs', import.meta.url), { workerData: config, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } })
      worker.once('error', stop); worker.once('exit', stop)
      worker.on('message', (reply: { type?: string; sequence?: number }) => {
        if (reply.type === 'ready') { clearTimeout(deadline); heartbeat(); process.send?.({ type: 'ready' }) }
        else if (reply.type === 'heartbeat') heartbeat()
        else if (reply.type === 'ack' && reply.sequence === pending) { pending = undefined; clearTimeout(deadline); process.send?.({ type: 'ack', sequence: reply.sequence }) }
        else if (reply.type === 'closed') stop()
        else stop()
      })
    } else if (input.type === 'batch' && worker && pending === undefined && Number.isSafeInteger(input.sequence) && Array.isArray(input.records) && input.records.length <= 16 && Buffer.byteLength(JSON.stringify(input.records)) <= 8192) {
      pending = input.sequence; arm(EXPORT_LIMITS.ipcMs); worker.postMessage({ type: 'batch', sequence: input.sequence, records: input.records })
    } else if (input.type === 'close' && worker) { closing = true; arm(EXPORT_LIMITS.shutdownMs); worker.postMessage({ type: 'close' }) }
    else throw new Error('export_protocol')
  } catch { stop() }
})
