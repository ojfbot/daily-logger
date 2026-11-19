// Closed test diagnostics only. Never retain error messages, values, SQL or paths.
const operations = new Set(['initialize', 'restore-files', 'files', 'migrate', 'admit', 'run', 'command', 'sessions',
  'snapshot', 'raw', 'negative-database', 'copy-rejected', 'plan', 'negative-cases', 'reconcile', 'gate', 'validate-restored', 'proof', 'unknown'])
const files = new Set([
  ...['archive.mjs', 'driver.mjs', 'matched-restore.test.mjs', 'diagnostics.mjs'].map(name => `test/restore/${name}`),
  ...['fixture', 'offline-git', 'storage', 'workflow', 'postgres-db', 'postgres-destination', 'postgres-fixture',
    'postgres-runner', 'delivery-db', 'delivery-commands', 'delivery-worker'].flatMap(name => [`src/${name}.ts`, `src/${name}.js`]),
])
const codes = new Set(['RESTORE_DRIVER_FAILED', 'RESTORE_PROOF_FAILED'])
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...fields].sort().join(',')
const position = value => Number.isSafeInteger(value) && value > 0 && value <= 9_999_999

export function failureDiagnostic(code, operation, error) {
  const locations = []
  try {
    const stack = error?.stack
    if (typeof stack === 'string') for (const line of stack.slice(0, 16384).split('\n').slice(0, 48)) {
      if (!/^\s+at /.test(line)) continue
      const match = line.match(/\/(?:[^\r\n]*)\/apps\/service\/((?:test\/restore|src)\/[a-z0-9.-]+):([1-9][0-9]{0,6}):([1-9][0-9]{0,6})\)?$/)
      if (match && files.has(match[1])) locations.push({ file: match[1], line: Number(match[2]), column: Number(match[3]) })
      if (locations.length === 4) break
    }
  } catch { /* A hostile stack getter cannot replace the original failure. */ }
  return { code: codes.has(code) ? code : 'RESTORE_PROOF_FAILED', operation: operations.has(operation) ? operation : 'unknown', locations }
}

/** Accept exactly one small driver JSON diagnostic, never surrounding raw stderr. */
export function readDriverDiagnostic(bytes, expectedOperation) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 2048) return null
    const value = JSON.parse(bytes.toString('utf8'))
    if (!exact(value, ['code', 'operation', 'locations']) || value.code !== 'RESTORE_DRIVER_FAILED'
      || !operations.has(value.operation) || value.operation !== expectedOperation
      || !Array.isArray(value.locations) || value.locations.length > 4) return null
    if (!value.locations.every(location => exact(location, ['file', 'line', 'column']) && files.has(location.file)
      && position(location.line) && position(location.column))) return null
    return { code: value.code, operation: value.operation, locations: value.locations.map(({ file, line, column }) => ({ file, line, column })) }
  } catch { return null }
}

export function dockerDiagnostic(args, result) {
  const single = new Set(['inspect', 'exec', 'create', 'start', 'stop'])
  const grouped = new Set(['image inspect', 'network ls', 'network create', 'network inspect', 'network rm',
    'volume ls', 'volume create', 'volume inspect', 'volume rm', 'container ls', 'container rm'])
  const command = single.has(args[0]) ? args[0] : grouped.has(`${args[0]} ${args[1]}`) ? `${args[0]} ${args[1]}` : 'unknown'
  return { command, exitStatus: Number.isSafeInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
    timedOut: result.error?.code === 'ETIMEDOUT', spawnFailed: Boolean(result.error) }
}
