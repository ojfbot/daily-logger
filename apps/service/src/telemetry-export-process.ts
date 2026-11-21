import { fork, type ChildProcess, type ForkOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createOfflineTelemetry, NOOP_TELEMETRY, type ObservationSink, type Telemetry } from './telemetry.js'
import { projectObservation } from './telemetry-schema.js'
import { EXPORT_LIMITS, projectExportConfig, type ExportConfig } from './telemetry-export-config.js'

type Launch = (path: string, args: string[], options: ForkOptions) => ChildProcess

/** Injectable launch seam is for offline lifecycle tests, never external config. */
export function createProcessSink(config: Readonly<ExportConfig>, launch: Launch = fork) {
  let child: ChildProcess | undefined, ready = false, closed = false, closing = false, sequence = 0
  let pending: { sequence: number; resolve: () => void; reject: () => void; timer: NodeJS.Timeout } | undefined
  let startup: NodeJS.Timeout | undefined
  const counters = { dropped: 0, acknowledged: 0, failures: 0, kills: 0 }
  const stop = () => {
    if (closed) return
    closed = true; ready = false
    if (startup) clearTimeout(startup)
    if (pending) { clearTimeout(pending.timer); pending.reject(); pending = undefined }
    if (child && child.exitCode === null && child.signalCode === null) { counters.kills++; child.kill('SIGKILL') }
  }
  try {
    const path = fileURLToPath(new URL('../dist/telemetry/telemetry-export-child.mjs', import.meta.url))
    child = launch(path, [], { execPath: process.execPath, execArgv: ['--max-old-space-size=96'], env: { LANG: 'C', TZ: 'UTC' }, cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json' })
    child.unref()
    startup = setTimeout(() => { counters.failures++; stop() }, EXPORT_LIMITS.startupMs); startup.unref()
    child.once('error', () => { counters.failures++; stop() })
    child.once('exit', () => { if (!closed && !closing) counters.failures++; stop() })
    child.on('message', (input: { type?: string; sequence?: number }) => {
      if (closed) return
      if (input?.type === 'ready' && !ready) { ready = true; clearTimeout(startup) }
      else if (input?.type === 'ack' && pending && input.sequence === pending.sequence) {
        clearTimeout(pending.timer); counters.acknowledged++; pending.resolve(); pending = undefined
      } else { counters.failures++; stop() }
    })
    child.channel?.unref() // An otherwise finished application must be able to exit.
    child.send({ type: 'init', config }, error => { if (error) { counters.failures++; stop() } })
  } catch { counters.failures++; stop() }
  const sink: ObservationSink = {
    export(batch) {
      if (closed || !ready || pending) { counters.dropped += batch.length; return }
      const records = batch.map(projectObservation)
      if (records.some(record => !record) || records.length > 16 || Buffer.byteLength(JSON.stringify(records)) > 8192) { counters.dropped += batch.length; return }
      return new Promise<void>((resolve, reject) => {
        const current = ++sequence
        const timer = setTimeout(() => { counters.failures++; stop() }, EXPORT_LIMITS.ipcMs); timer.unref()
        pending = { sequence: current, resolve, reject: () => reject(new Error('export_unavailable')), timer }
        try { child!.send({ type: 'batch', sequence: current, records }, error => { if (error) { counters.failures++; stop() } }) } catch { counters.failures++; stop() }
      })
    },
  }
  return {
    sink,
    diagnostics: () => Object.freeze({ ...counters, ready, closed, pending: pending ? 1 : 0 }),
    stop,
    async close() {
      if (!child || closed) { stop(); return }
      closing = true
      const owned = child
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { stop(); resolve() }, EXPORT_LIMITS.shutdownMs)
        owned.once('exit', () => { clearTimeout(timer); resolve() })
        try { owned.send({ type: 'close' }, error => { if (error) { stop(); clearTimeout(timer); resolve() } }) } catch { stop(); clearTimeout(timer); resolve() }
      })
      stop()
    },
  }
}

/** Explicit injectable adapter. No ambient auto-enable and no SDK import in this process. */
export function createLangfuseTelemetry(input?: unknown): Telemetry & { exporterDiagnostics?: ReturnType<typeof createProcessSink>['diagnostics'] } {
  const config = projectExportConfig(input)
  if (!config) return NOOP_TELEMETRY
  const processSink = createProcessSink(config)
  const offline = createOfflineTelemetry([processSink.sink])
  let shutdown: Promise<ReturnType<Telemetry['diagnostics']>> | undefined
  return Object.freeze({
    ...offline,
    exporterDiagnostics: processSink.diagnostics,
    shutdown() {
      shutdown ??= new Promise(resolve => {
        const timer = setTimeout(() => { processSink.stop(); resolve(offline.diagnostics()) }, EXPORT_LIMITS.shutdownMs)
        void offline.shutdown().then(() => processSink.close()).catch(() => processSink.stop()).finally(() => { clearTimeout(timer); resolve(offline.diagnostics()) })
      })
      return shutdown
    },
  })
}
