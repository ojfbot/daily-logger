import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import type { PgBoss } from 'pg-boss'
import { createRuntimeTelemetry, readTelemetryConfig, TELEMETRY_CONFIG_BYTES, TelemetryConfigurationError } from '../src/telemetry-runtime.js'
import { NOOP_TELEMETRY, type Telemetry } from '../src/telemetry.js'
import { runWorker } from '../src/delivery-worker.js'
import { tlsFixture, until } from './fixtures/telemetry-tls.js'

const CANARY = 'PRIVATE-CONFIG-CONTENT-PATH-KEY-CANARY'
const config = { mode: 'langfuse', endpoint: 'https://127.0.0.1/api/public/otel/v1/traces',
  publicKeyFile: '/absent/public-key', secretKeyFile: '/absent/secret-key', caFile: '/absent/ca.pem', environment: 'qualification' }
const invalid = (error: unknown) => error instanceof TelemetryConfigurationError
  && error.code === 'TELEMETRY_CONFIG_INVALID' && error.message === 'Private fixture telemetry configuration invalid'
  && !('cause' in error)
const saved = (path: string, value: unknown) => { writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); return path }

test('only an explicit protected file enables telemetry; ambient SDK/config variables remain inert', t => {
  const names = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_HOST', 'LANGFUSE_TRACING_ENABLED', 'DAILYLOGGER_TELEMETRY_CONFIG', 'OTEL_EXPORTER_OTLP_ENDPOINT']
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]))
  for (const name of names) process.env[name] = CANARY
  t.after(() => { for (const name of names) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name] } })
  assert.equal(createRuntimeTelemetry(), NOOP_TELEMETRY)
  const directory = mkdtempSync(join(tmpdir(), 'dailylogger-runtime-config-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = saved(join(directory, 'config.json'), config)
  assert.deepEqual(readTelemetryConfig(path), config)
  assert.ok(Object.isFrozen(readTelemetryConfig(path)))
  // The parent reads only configuration; absent key/CA references remain child-owned reads.
  assert.equal(readTelemetryConfig(path).secretKeyFile, '/absent/secret-key')
  const boundary = JSON.stringify(config).padEnd(TELEMETRY_CONFIG_BYTES, ' ')
  writeFileSync(path, boundary)
  assert.deepEqual(readTelemetryConfig(path), config)
})

test('protected configuration rejects malformed, oversized, permissive and nonregular inputs with a closed error', t => {
  const directory = mkdtempSync(join(tmpdir(), `dailylogger-${CANARY}-`))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let sequence = 0
  const rejectBytes = (bytes: string | Buffer, mode = 0o600) => {
    const path = join(directory, String(sequence++)); writeFileSync(path, bytes, { mode }); chmodSync(path, mode)
    assert.throws(() => readTelemetryConfig(path), invalid)
  }
  for (const value of [{ ...config, secretKey: CANARY }, { ...config, mode: 'disabled' },
    { ...config, endpoint: `https://user:${CANARY}@localhost/api/public/otel/v1/traces` },
    { ...config, publicKeyFile: `relative-${CANARY}` }, {}, null, []]) rejectBytes(JSON.stringify(value))
  rejectBytes(`{"secret": "${CANARY}"`)
  rejectBytes(JSON.stringify(config).padEnd(TELEMETRY_CONFIG_BYTES + 1, ' '))
  rejectBytes(Buffer.from([0xff, 0xfe]))
  rejectBytes(JSON.stringify(config), 0o640); rejectBytes(JSON.stringify(config), 0o604)
  const regular = saved(join(directory, 'regular'), config), link = join(directory, 'link'), fifo = join(directory, 'fifo')
  symlinkSync(regular, link)
  execFileSync('mkfifo', [fifo], { timeout: 1000, stdio: 'ignore' })
  for (const path of [directory, link, fifo, join(directory, 'missing'), `relative-${CANARY}`]) assert.throws(() => readTelemetryConfig(path), invalid)
})

test('CLI opt-in is limited to serve/work and malformed opt-in never reaches a database', t => {
  const directory = mkdtempSync(join(tmpdir(), 'dailylogger-runtime-cli-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const bad = saved(join(directory, `${CANARY}.json`), { secret: CANARY })
  const cases: [string, string[]][] = [
    ['http-cli.ts', ['migrate']], ['delivery-cli.ts', ['migrate']],
    ['delivery-cli.ts', ['enqueue', '--request', bad]],
    ['delivery-cli.ts', ['command', '--command-id', '11111111-2222-4333-8444-555555555555']],
    ['delivery-cli.ts', ['run', '--run-id', '11111111-2222-4333-8444-555555555555']],
    ['http-cli.ts', ['serve']], ['delivery-cli.ts', ['work']],
  ]
  for (const [file, args] of cases) {
    const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL(`../src/${file}`, import.meta.url)), ...args, '--telemetry-config', bad], {
      env: { PATH: process.env.PATH, DAILYLOGGER_DATABASE_URL: `postgresql://synthetic:${CANARY}@127.0.0.1:1/unused`,
        DAILYLOGGER_PRIVATE_ORIGIN: 'https://localhost', DAILYLOGGER_OWNER_GITHUB_ID: '1', DAILYLOGGER_GITHUB_CLIENT_ID: CANARY,
        DAILYLOGGER_GITHUB_CLIENT_SECRET: CANARY, DAILYLOGGER_FIXTURE_ROOT: directory },
      timeout: 5000, killSignal: 'SIGKILL', encoding: 'utf8',
    })
    assert.equal(result.status, 1); assert.equal(result.error, undefined); assert.equal(result.stdout, '')
    assert.equal(result.stderr.includes(CANARY), false)
    if (['serve', 'work'].includes(args[0])) assert.equal(result.stderr, 'Private fixture telemetry configuration invalid\n')
  }
})

test('worker setup rejection closes its actual configured exporter and removes only its owned signal handlers', async () => {
  const fixture = tlsFixture()
  const path = saved(fixture.file('config.json'), { ...config, publicKeyFile: fixture.file('public-key'),
    secretKeyFile: fixture.file('secret-key'), caFile: fixture.file('root.pem') })
  const telemetry = createRuntimeTelemetry(path)
  const original = new Error(CANARY)
  let closes = 0
  const observed: Telemetry = { ...telemetry, shutdown() { closes++; return telemetry.shutdown() } }
  const before = [process.listeners('SIGTERM'), process.listeners('SIGINT')]
  try {
    await until(() => telemetry.exporterDiagnostics!().ready)
    await assert.rejects(runWorker({} as pg.Pool, 'unused', { work: async () => { throw original } } as unknown as PgBoss, observed), error => error === original)
    assert.equal(closes, 1); assert.equal(telemetry.exporterDiagnostics!().closed, true)
    assert.deepEqual([process.listeners('SIGTERM'), process.listeners('SIGINT')], before)
  } finally { await telemetry.shutdown(); fixture.remove() }
})

test('worker setup preserves the original exception even if optional adapter shutdown rejects', async () => {
  const original = new Error('registration failed')
  let closes = 0
  const telemetry: Telemetry = { ...NOOP_TELEMETRY, async shutdown() { closes++; throw new Error(CANARY) } }
  const before = [process.listeners('SIGTERM'), process.listeners('SIGINT')]
  await assert.rejects(runWorker({} as pg.Pool, 'unused', { work: async () => { throw original } } as unknown as PgBoss, telemetry), error => error === original)
  assert.equal(closes, 1); assert.deepEqual([process.listeners('SIGTERM'), process.listeners('SIGINT')], before)
})

test('valid opt-in with missing child-owned key files fails open without throwing at business startup', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dailylogger-runtime-unavailable-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const telemetry = createRuntimeTelemetry(saved(join(directory, 'config.json'), config))
  try {
    assert.notEqual(telemetry, NOOP_TELEMETRY)
    await until(() => telemetry.exporterDiagnostics!().closed)
    assert.equal(telemetry.exporterDiagnostics!().ready, false)
    assert.ok(telemetry.exporterDiagnostics!().failures > 0)
    assert.equal(JSON.stringify(telemetry.exporterDiagnostics!()).includes('/absent'), false)
  } finally { await telemetry.shutdown() }
})
