import assert from 'node:assert/strict'
import { fork, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { ACTIONS_PATH, ARTICLE_PATH, REPO_ROOT, readFixture } from '../../src/fixture.js'
import { migrateDatabase } from '../../src/postgres-db.js'
import { migrateDelivery } from '../../src/delivery-db.js'
import { dropIdleTestDatabase } from '../database-cleanup.js'
import { tlsFixture, until } from '../fixtures/telemetry-tls.js'

const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
assert.ok(configured, 'DAILYLOGGER_TEST_DATABASE_URL is required; enabled exporter integration never skips')
const database = `dailylogger_exporter_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(configured); url.pathname = `/${database}`
const connectionString = url.toString()
const admin = new pg.Pool({ connectionString: configured, connectionTimeoutMillis: 5000 })
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 })
const root = mkdtempSync(join(tmpdir(), 'dailylogger-enabled-exporter-'))
const origin = 'https://operator.fixture.invalid'
const ownerId = '987654321012345'
const cookieValue = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url')
const cookie = `__Host-dailylogger_session=${cookieValue}`
const CANARY = 'PRIVATE-exporter-integration-CANARY'
const probePath = fileURLToPath(new URL('./process-probe.mjs', import.meta.url))
let tls: ReturnType<typeof tlsFixture>
let created = false
const children = new Set<Process>()
const receivers = new Set<Awaited<ReturnType<ReturnType<typeof tlsFixture>['receiver']>>>()

type Process = { child: ChildProcess; stdout: string; stderr: string; outputBound: boolean;
  exporters: Map<number, { ready: boolean; exited: boolean }>; port?: number }
type Span = { name: string; traceId: string; spanId: string; parentSpanId?: string;
  attributes: { key: string; value: { stringValue?: string } }[];
  events?: unknown[]; links?: unknown[]; status?: { message?: string } }
type Wire = { body: Buffer; authorization: string | undefined; path: string | undefined }
type Admission = { commandId: string; runId: string }

async function waitFor<T>(read: () => Promise<T | false>, timeout = 20_000): Promise<T> {
  const deadline = performance.now() + timeout
  for (;;) {
    const value = await read()
    if (value !== false) return value
    assert.ok(performance.now() < deadline, 'Enabled exporter fixture exceeded its condition deadline')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
function exited(child: ChildProcess, timeout = 8500): Promise<[number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve([child.exitCode, child.signalCode])
  return new Promise((resolve, reject) => {
    const done = (code: number | null, signal: NodeJS.Signals | null) => { clearTimeout(timer); resolve([code, signal]) }
    const timer = setTimeout(() => { child.removeListener('exit', done); reject(new Error('Owned CLI exit deadline')) }, timeout)
    child.once('exit', done)
  })
}
function exporterGone(pid: number) {
  try { process.kill(pid, 0); return false }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' }
}
async function exportersGone(process: Process) {
  // Worker process.exit() can outrun the probe's last IPC write. Check actual
  // process absence too; never send a mutating signal to a remembered PID.
  await until(() => [...process.exporters.keys()].every(exporterGone), 2500)
}
async function terminate(process: Process, graceful = true) {
  try {
    if (graceful) {
      const ending = exited(process.child)
      process.child.kill('SIGTERM')
      assert.deepEqual(await ending, [0, null])
      assert.equal(process.outputBound, false)
    }
  } finally {
    if (process.child.exitCode === null && process.child.signalCode === null) {
      const ending = exited(process.child, 2500); process.child.kill('SIGKILL'); await ending
    }
    await exportersGone(process)
    children.delete(process)
  }
}
async function unusedPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}
async function launch(kind: 'api' | 'worker', configPath?: string, databaseUrl = connectionString) {
  const port = kind === 'api' ? await unusedPort() : undefined
  const fixtureRoot = join(root, randomUUID()); mkdirSync(fixtureRoot, { mode: 0o700 })
  const child = fork(join(REPO_ROOT, `apps/service/src/${kind === 'api' ? 'http' : 'delivery'}-cli.ts`),
    [kind === 'api' ? 'serve' : 'work', ...(configPath ? ['--telemetry-config', configPath] : [])], {
      cwd: REPO_ROOT, execArgv: ['--import', 'tsx', '--import', probePath],
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
        DAILYLOGGER_DATABASE_URL: databaseUrl, DAILYLOGGER_PRIVATE_ORIGIN: origin,
        DAILYLOGGER_HTTP_HOST: '127.0.0.1', DAILYLOGGER_HTTP_PORT: String(port ?? 4300),
        DAILYLOGGER_OWNER_GITHUB_ID: ownerId, DAILYLOGGER_GITHUB_CLIENT_ID: `${CANARY}-client`,
        DAILYLOGGER_GITHUB_CLIENT_SECRET: `${CANARY}-oauth`, DAILYLOGGER_FIXTURE_ROOT: fixtureRoot,
        LANGFUSE_SECRET_KEY: `${CANARY}-ambient`, LANGFUSE_HOST: 'https://ambient.fixture.invalid',
        OTEL_RESOURCE_ATTRIBUTES: `private=${CANARY}`, LANGSMITH_API_KEY: CANARY,
      }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
  const result: Process = { child, stdout: '', stderr: '', outputBound: false, exporters: new Map(), port }
  children.add(result)
  for (const channel of ['stdout', 'stderr'] as const) child[channel]!.on('data', (chunk: Buffer) => {
    if (Buffer.byteLength(result[channel]) + chunk.length > 16_384) { result.outputBound = true; child.kill('SIGKILL'); return }
    result[channel] += chunk.toString('utf8')
  })
  child.on('message', (value: unknown) => {
    if (!value || typeof value !== 'object' || !('type' in value) || !('pid' in value)
      || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid <= 0) return
    const pid = Number(value.pid)
    if (value.type === 'exporter-child') result.exporters.set(pid, { ready: false, exited: false })
    else if (value.type === 'exporter-ready' && result.exporters.has(pid)) result.exporters.get(pid)!.ready = true
    else if (value.type === 'exporter-exit' && result.exporters.has(pid)) result.exporters.get(pid)!.exited = true
  })
  return result
}
async function ready(process: Process, kind: 'api' | 'worker', enabled: boolean) {
  await waitFor(async () => {
    assert.ok(process.child.exitCode === null && process.child.signalCode === null, 'CLI exited before readiness; raw logs withheld')
    return (kind === 'api' ? /"status"\s*:\s*"http_ready"/ : /"worker"\s*:\s*"ready"/).test(process.stdout)
  })
  if (enabled) {
    await until(() => process.exporters.size === 1 && [...process.exporters.values()].every(value => value.ready && !value.exited), 4000)
  } else assert.equal(process.exporters.size, 0)
}
async function receiver(mode: 'accept' | 'blackhole' = 'accept') {
  const wires: Wire[] = []
  let oversized = false
  const server = await tls.receiver((request, response) => {
    const chunks: Buffer[] = []; let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 65_536 || wires.length >= 128) { oversized = true; request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (oversized) return
      wires.push({ body: Buffer.concat(chunks), authorization: request.headers.authorization, path: request.url })
      if (mode === 'accept') response.end('{}')
    })
  })
  receivers.add(server)
  const configPath = join(root, `config-${randomUUID()}.json`)
  writeFileSync(configPath, JSON.stringify(server.config), { flag: 'wx', mode: 0o600 })
  return { ...server, configPath, wires, bounded: () => !oversized }
}
function spans(wires: Wire[]): Span[] {
  return wires.flatMap(wire => JSON.parse(wire.body.toString('utf8')).resourceSpans
    .flatMap((resource: { scopeSpans: { spans: Span[] }[] }) => resource.scopeSpans.flatMap(scope => scope.spans)))
}
function field(span: Span, name: string): unknown {
  const value = span.attributes.find(attribute => attribute.key === `langfuse.observation.metadata.dailylogger.${name}`)?.value.stringValue
  return value === undefined ? undefined : JSON.parse(value)
}
async function call(api: Process, path: string, key?: string, body: unknown = {}) {
  return await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const outgoing = request(`http://127.0.0.1:${api.port}${path}`, { method: key ? 'POST' : 'GET',
      headers: { Host: new URL(origin).host, Cookie: cookie, ...(key ? { Origin: origin,
        'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': key } : {}) } }, incoming => {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk)); incoming.on('error', reject)
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('HTTP fixture request deadline')))
    outgoing.on('error', reject); outgoing.end(key ? JSON.stringify(body) : undefined)
  })
}
async function admission(api: Process, path: string, key: string, body: unknown = {}) {
  const response = await call(api, path, key, body)
  assert.equal(response.status, 202)
  const value = JSON.parse(response.text) as Admission
  assert.match(value.runId, /^[a-f0-9-]{36}$/); assert.match(value.commandId, /^[a-f0-9-]{36}$/)
  return { ...value, response, key }
}
async function settled(commandId: string) {
  return await waitFor(async () => {
    const row = (await pool.query(`SELECT c.disposition,c.job_id,j.state FROM dailylogger_service.fixture_commands c
      JOIN dailylogger_delivery.job j ON j.id=c.job_id WHERE c.command_id=$1`, [commandId])).rows[0]
    return row?.disposition === 'succeeded' && row.state === 'completed' ? row : false
  })
}
async function complete(api: Process, started: Admission) {
  await settled(started.commandId)
  const view = await call(api, `/v1/runs/${started.runId}`)
  assert.equal(view.status, 200)
  const waiting = JSON.parse(view.text)
  assert.equal(waiting.state, 'awaiting_owner')
  const resumed = await admission(api, `/v1/fixture/runs/${started.runId}/resumes`, `${CANARY}-${randomUUID()}`, { resumeTargetId: waiting.resumeTarget.resumeTargetId })
  await settled(resumed.commandId)
  const row = (await pool.query('SELECT * FROM dailylogger_service.fixture_runs WHERE run_id=$1', [started.runId])).rows[0]
  assert.equal(row.status, 'complete')
  const fixture = readFixture()
  assert.ok(readFileSync(join(row.run_dir, 'artifacts', ARTICLE_PATH)).equals(fixture.article), 'Article bytes changed')
  assert.ok(readFileSync(join(row.run_dir, 'artifacts', ACTIONS_PATH)).equals(fixture.actions), 'Action bytes changed')
  assert.equal(/traceId|observationId|instrumentationVersion/.test(readFileSync(join(row.run_dir, 'artifacts/receipt.json'), 'utf8')), false)
  return resumed
}
function privateWire(wires: Wire[], processes: Process[], extra: string[] = []) {
  const body = wires.map(wire => wire.body.toString('utf8')).join('\n')
  const fixture = readFixture()
  for (const content of [fixture.article, fixture.actions]) {
    // Check real fixture text as well as the private request/auth/config canaries.
    const line = content.toString('utf8').split('\n').find(value => value.trim().length > 40)
    assert.ok(line)
    assert.ok(!body.includes(JSON.stringify(line).slice(1, -1)), 'Artifact content reached exported metadata')
  }
  for (const canary of [CANARY, root, tls.file(''), connectionString, origin, ownerId, cookieValue, csrf,
    'sk-SYNTHETIC-SECRET-CANARY', 'pk-synthetic-qualification', ...extra])
    assert.ok(!body.includes(canary), 'Private application context reached exported metadata')
  assert.equal(/approvalDigest|csrfToken|sessionHash|runDir|requestKey|response_text/.test(body), false)
  for (const wire of wires) {
    assert.ok(wire.authorization === `Basic ${Buffer.from('pk-synthetic-qualification:sk-SYNTHETIC-SECRET-CANARY').toString('base64')}`, 'Unexpected ingestion authorization')
    assert.equal(wire.path, '/api/public/otel/v1/traces')
  }
  for (const process of processes) {
    const output = process.stdout + process.stderr
    for (const canary of [CANARY, root, connectionString, cookieValue, csrf, 'sk-SYNTHETIC-SECRET-CANARY', ...extra])
      assert.ok(!output.includes(canary), 'Private application context reached CLI logs')
  }
}

before(async () => {
  await admin.query(`CREATE DATABASE ${database}`); created = true
  await migrateDelivery(pool, connectionString); await migrateDatabase(pool, connectionString, { http: true })
  await pool.query(`INSERT INTO dailylogger_service.owner_sessions(session_hash,actor_id,csrf_token,expires_at)
    VALUES($1,$2,$3,now()+interval '1 hour')`, [createHash('sha256').update(cookieValue).digest('hex'), `github:${ownerId}`, csrf])
  tls = tlsFixture()
})
after(async () => {
  const failures: unknown[] = []
  for (const child of [...children]) try { await terminate(child, false) } catch (error) { failures.push(error) }
  for (const server of receivers) try { await server.close() } catch (error) { failures.push(error) }
  try { await pool.end(); if (created) await dropIdleTestDatabase(admin, database) } catch (error) { failures.push(error) }
  finally { await admin.end(); tls?.remove(); rmSync(root, { recursive: true, force: true }) }
  assert.equal(failures.length, 0, 'Owned exporter integration cleanup failed')
})

test('actual API and worker CLIs remain no-op without the explicit option despite ambient SDK settings', { timeout: 40_000 }, async () => {
  const destination = await receiver()
  const api = await launch('api'), worker = await launch('worker')
  try {
    await ready(api, 'api', false); await ready(worker, 'worker', false)
    const started = await admission(api, '/v1/fixture/runs', `${CANARY}-${randomUUID()}`)
    await complete(api, started)
    await terminate(worker); await terminate(api)
    assert.equal(api.exporters.size + worker.exporters.size, 0)
    assert.equal(destination.wires.length, 0)
    privateWire(destination.wires, [api, worker])
  } finally { if (children.has(worker)) await terminate(worker, false); if (children.has(api)) await terminate(api, false) }
})

test('enabled strict-TLS exports correlate real HTTP admission and restarted durable-worker attempts without content', { timeout: 50_000 }, async () => {
  const destination = await receiver()
  const api = await launch('api', destination.configPath)
  let worker = await launch('worker', destination.configPath)
  const processes = [api, worker]
  try {
    await ready(api, 'api', true); await ready(worker, 'worker', true)
    const started = await admission(api, '/v1/fixture/runs', `${CANARY}-${randomUUID()}`)
    await settled(started.commandId)
    await until(() => spans(destination.wires).filter(span => field(span, 'commandId') === started.commandId).length >= 7, 6000)
    const replay = await call(api, '/v1/fixture/runs', started.key)
    assert.deepEqual(replay, started.response)
    await terminate(worker)
    worker = await launch('worker', destination.configPath); processes.push(worker)
    await ready(worker, 'worker', true)
    const resumed = await complete(api, started)
    await until(() => spans(destination.wires).filter(span => field(span, 'commandId') === resumed.commandId).length >= 5, 6000)
    const attempts = (await pool.query('SELECT attempt_id,command_id,state FROM dailylogger_service.operation_attempts WHERE run_id=$1', [started.runId])).rows
    assert.equal(attempts.length, 2)
    const segments: unknown[] = []
    for (const [commandId, nodes, outcome] of [[started.commandId, ['collect_fixture', 'draft_fixture', 'review_fixture', 'human_gate'], 'paused'],
      [resumed.commandId, ['human_gate', 'write_shadow_artifacts'], 'succeeded']] as const) {
      const observed = spans(destination.wires).filter(span => field(span, 'commandId') === commandId)
      const admissions = observed.filter(span => field(span, 'kind') === 'admission_response_observed')
      const delivery = observed.find(span => field(span, 'kind') === 'delivery')!
      const operation = observed.find(span => field(span, 'kind') === 'operation')!
      const nodeSpans = observed.filter(span => field(span, 'kind') === 'node')
      assert.ok(admissions.length >= 1 && delivery && operation)
      const attempt = attempts.find(row => row.command_id === commandId)
      assert.equal(attempt.state, 'succeeded'); assert.equal(field(operation, 'attemptId'), attempt.attempt_id)
      assert.equal(field(operation, 'outcome'), outcome); assert.equal(field(delivery, 'outcome'), 'returned')
      assert.equal(operation.parentSpanId, delivery.spanId)
      assert.equal(field(operation, 'parentId'), field(delivery, 'observationId'))
      assert.deepEqual(nodeSpans.map(span => field(span, 'node')).sort(), [...nodes].sort())
      for (const node of nodeSpans) {
        assert.equal(node.parentSpanId, operation.spanId); assert.equal(node.traceId, delivery.traceId)
        assert.equal(field(node, 'parentId'), field(operation, 'observationId'))
        assert.equal(field(node, 'attemptId'), attempt.attempt_id)
      }
      for (const span of observed) {
        assert.equal(field(span, 'runId'), started.runId)
        for (const key of ['traceId', 'observationId'] as const)
          assert.match(String(field(span, key)), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
        assert.equal(span.attributes.find(attribute => attribute.key === 'langfuse.session.id')?.value.stringValue, started.runId)
        assert.match(span.traceId, /^[a-f0-9]{32}$/); assert.match(span.spanId, /^[a-f0-9]{16}$/)
        assert.equal(span.events?.length ?? 0, 0); assert.equal(span.links?.length ?? 0, 0); assert.equal(span.status?.message ?? '', '')
      }
      assert.ok(admissions.every(span => field(span, 'traceId') !== field(delivery, 'traceId')), 'Admission and delivery retain independent segments')
      segments.push(field(delivery, 'traceId'))
    }
    assert.notEqual(segments[0], segments[1])
    assert.ok(destination.bounded()); privateWire(destination.wires, processes, [destination.configPath])
    await terminate(worker); await terminate(api)
    for (const process of processes) await exportersGone(process)
  } finally { for (const process of processes) if (children.has(process)) await terminate(process, false) }
})

test('a real TLS export blackhole cannot change admission, settlement or bounded CLI shutdown', { timeout: 45_000 }, async () => {
  const destination = await receiver('blackhole')
  const api = await launch('api', destination.configPath), worker = await launch('worker', destination.configPath)
  try {
    await ready(api, 'api', true); await ready(worker, 'worker', true)
    const started = await admission(api, '/v1/fixture/runs', `${CANARY}-${randomUUID()}`)
    await complete(api, started)
    await until(() => destination.wires.length >= 2)
    const begin = performance.now()
    await terminate(worker); await terminate(api)
    assert.ok(performance.now() - begin < 17_000, 'Optional exporter exceeded existing process shutdown allowances')
    await until(() => destination.sockets.size === 0)
    assert.equal(destination.wires.length, 2, 'Each isolated exporter permits only one failed in-flight request')
    privateWire(destination.wires, [api, worker])
  } finally { if (children.has(worker)) await terminate(worker, false); if (children.has(api)) await terminate(api, false) }
})

test('protected config rejection is fixed and enabled API startup failure reaps its actual exporter child', { timeout: 30_000 }, async () => {
  const destination = await receiver()
  const invalidPath = join(root, `${CANARY}.json`)
  writeFileSync(invalidPath, JSON.stringify({ ...destination.config, secret: CANARY }), { flag: 'wx', mode: 0o600 })
  for (const kind of ['api', 'worker'] as const) {
    const process = await launch(kind, invalidPath)
    try {
      assert.deepEqual(await exited(process.child, 7000), [1, null])
      assert.ok(process.stderr === 'Private fixture telemetry configuration invalid\n', 'Startup error must be fixed and sanitized')
      assert.equal(process.exporters.size, 0)
    } finally { await terminate(process, false) }
  }
  const empty = `dailylogger_exporter_empty_${randomUUID().replaceAll('-', '')}`
  const emptyUrl = new URL(connectionString); emptyUrl.pathname = `/${empty}`
  await admin.query(`CREATE DATABASE ${empty}`)
  try {
    const process = await launch('api', destination.configPath, emptyUrl.toString())
    try {
      assert.deepEqual(await exited(process.child, 7000), [1, null])
      assert.ok(process.stderr === 'Private fixture HTTP command failed\n', 'API setup error must remain sanitized')
      assert.equal(process.exporters.size, 1)
      await exportersGone(process)
      privateWire(destination.wires, [process], [invalidPath, emptyUrl.toString()])
    } finally { await terminate(process, false) }
  } finally { await dropIdleTestDatabase(admin, empty) }
  assert.equal(destination.wires.length, 0)
})
