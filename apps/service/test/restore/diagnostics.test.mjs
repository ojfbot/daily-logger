import assert from 'node:assert/strict'
import test from 'node:test'
import { dockerDiagnostic, failureDiagnostic, readDriverDiagnostic } from './diagnostics.mjs'

test('failure diagnostics expose only fixed code, operation and allowlisted bounded locations', () => {
  const privateValue = 'synthetic-password-SQL-actual-expected'
  const diagnostic = failureDiagnostic('RESTORE_DRIVER_FAILED', 'reconcile', {
    message: privateValue, actual: privateValue, expected: privateValue,
    stack: `Error: ${privateValue}\n    at main (file:///private/secret/apps/service/test/restore/driver.mjs:123:4)\n`
      + `    at query (/app/apps/service/src/postgres-db.ts:45:6)\n    at foreign (/private/credentials.js:1:2)\n`
      + `    at injected (/app/apps/service/src/${privateValue}.ts:1:2)\n`
      + Array.from({ length: 20 }, () => '    at helper (/app/apps/service/test/restore/archive.mjs:10:3)').join('\n'),
  })
  assert.deepEqual(diagnostic, { code: 'RESTORE_DRIVER_FAILED', operation: 'reconcile', locations: [
    { file: 'test/restore/driver.mjs', line: 123, column: 4 }, { file: 'src/postgres-db.ts', line: 45, column: 6 },
    { file: 'test/restore/archive.mjs', line: 10, column: 3 }, { file: 'test/restore/archive.mjs', line: 10, column: 3 },
  ] })
  assert.ok(!JSON.stringify(diagnostic).includes(privateValue)); assert.ok(!JSON.stringify(diagnostic).includes('/private'))
  assert.deepEqual(failureDiagnostic(privateValue, privateValue, { get stack() { throw Error(privateValue) } }),
    { code: 'RESTORE_PROOF_FAILED', operation: 'unknown', locations: [] })
})

test('driver stderr must be one bounded exact closed diagnostic for the requested operation', () => {
  const valid = { code: 'RESTORE_DRIVER_FAILED', operation: 'raw', locations: [{ file: 'test/restore/driver.mjs', line: 10, column: 2 }] }
  const bytes = value => Buffer.from(JSON.stringify(value))
  assert.deepEqual(readDriverDiagnostic(bytes(valid), 'raw'), valid)
  for (const input of [
    bytes({ ...valid, message: 'synthetic-secret' }), bytes({ ...valid, code: 'unexpected' }),
    bytes({ ...valid, operation: 'admit' }), bytes({ ...valid, locations: Array(5).fill(valid.locations[0]) }),
    bytes({ ...valid, locations: [{ ...valid.locations[0], file: '/private/secret' }] }),
    bytes({ ...valid, locations: [{ ...valid.locations[0], line: 'secret' }] }),
    bytes({ ...valid, locations: [{ ...valid.locations[0], column: 10_000_000 }] }),
    bytes({ ...valid, locations: [{ ...valid.locations[0], actual: 'secret' }] }),
    Buffer.from('raw driver stderr\n' + JSON.stringify(valid)), Buffer.alloc(2049, 32),
  ]) assert.equal(readDriverDiagnostic(input, 'raw'), null)
})

test('Docker diagnostics discard arguments, credentials, raw output and error text', () => {
  const secret = 'postgresql://synthetic-secret'
  assert.deepEqual(dockerDiagnostic(['exec', '-e', secret], { status: 1, stdout: secret, stderr: secret, error: { code: 'ETIMEDOUT', message: secret } }),
    { command: 'exec', exitStatus: 1, timedOut: true, spawnFailed: true })
  assert.deepEqual(dockerDiagnostic(['network', 'rm', secret], { status: 0 }),
    { command: 'network rm', exitStatus: 0, timedOut: false, spawnFailed: false })
  assert.deepEqual(dockerDiagnostic([secret], { status: secret }),
    { command: 'unknown', exitStatus: null, timedOut: false, spawnFailed: false })
})
