import { fork } from 'node:child_process'
import { createProcessSink } from '../../src/telemetry-export-process.js'

// Harness-only parent. No production fault controls, PIDs or telemetry payloads
// are exposed by the application adapter.
process.once('message', (input: { config: Parameters<typeof createProcessSink>[0]; childPath: string }) => {
  let pid: number | undefined
  const sink = createProcessSink(input.config, (_path, args, options) => { const child = fork(input.childPath, args, options); pid = child.pid; return child })
  const polling = setInterval(() => {
    if (sink.diagnostics().ready) { clearInterval(polling); process.send?.({ type: 'ready', pid }) }
    else if (sink.diagnostics().closed) { clearInterval(polling); process.exit(1) }
  }, 10)
  process.once('disconnect', () => { sink.stop(); process.exit(0) })
})
