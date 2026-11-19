// Test-only observer. The real CLI, fork, compiled child and SDK remain unchanged.
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'

const original = childProcess.fork
const report = value => { try { if (process.connected) process.send(value, () => {}) } catch {} }
childProcess.fork = function (...args) {
  const child = Reflect.apply(original, childProcess, args)
  if (String(args[0]).endsWith('/dist/telemetry/telemetry-export-child.mjs')) {
    report({ type: 'exporter-child', pid: child.pid })
    child.on('message', value => { if (value?.type === 'ready') report({ type: 'exporter-ready', pid: child.pid }) })
    child.once('exit', () => report({ type: 'exporter-exit', pid: child.pid }))
  }
  return child
}
syncBuiltinESMExports()
