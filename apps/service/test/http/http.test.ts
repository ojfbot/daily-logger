import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { Ajv } from 'ajv'
import formats from 'ajv-formats'
import { REPO_ROOT } from '../../src/fixture.js'
import { migrateDatabase, requireMigrated } from '../../src/postgres-db.js'
import { migrateDelivery } from '../../src/delivery-db.js'
import { startDelivery } from '../../src/delivery-db.js'
import { admitCommand } from '../../src/delivery-commands.js'
import { createHttpServer, httpConfig, type HttpConfig } from '../../src/http-server.js'
import { readSnapshot } from '../../src/http-db.js'

const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
assert.ok(configured, 'DAILYLOGGER_TEST_DATABASE_URL is required for HTTP integration tests')
const adminUrl = new URL(configured)
const database = `dailylogger_http_test_${randomUUID().replaceAll('-', '')}`
const url = new URL(adminUrl); url.pathname = `/${database}`
const connectionString = url.toString()
const admin = new pg.Pool({ connectionString: adminUrl.toString() })
const pool = new pg.Pool({ connectionString })
const root = mkdtempSync(join(tmpdir(), 'dailylogger-http-test-'))
const firstRoot = mkdtempSync(join(root, 'first-'))
const secondRoot = mkdtempSync(join(root, 'second-'))
const config: HttpConfig = { connectionString, origin: 'https://dailylogger.test', ownerGithubId: '151410806',
  githubClientId: 'fixture-client', githubClientSecret: 'fixture-secret', fixtureRoot: firstRoot }
const apps = new Set<Awaited<ReturnType<typeof createHttpServer>>>()
let app: Awaited<ReturnType<typeof createHttpServer>>
let base = ''
let providerBase = ''
let worker: ChildProcess | undefined
let ownerCookie = '', csrf = ''
let created = false
const codes = new Map<string, { id: number; challenge: string }>()
const tokens = new Map<string, number>()
let tokenExchanges = 0
const responseSchema = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/agent-service/editorial-api-responses.schema.json'), 'utf8'))
const ajv = new Ajv({ strict: false }); formats.default(ajv)
const validResponse = ajv.compile(responseSchema)
const provider = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json')
  if (request.url === '/login/oauth/access_token') {
    let body = ''
    for await (const chunk of request) body += String(chunk)
    const value = z.object({ code: z.string(), code_verifier: z.string(), client_id: z.literal(config.githubClientId),
      client_secret: z.literal(config.githubClientSecret), redirect_uri: z.literal(`${config.origin}/v1/auth/callback`) }).parse(JSON.parse(body))
    const code = codes.get(value.code)
    if (!code || createHash('sha256').update(value.code_verifier).digest('base64url') !== code.challenge) {
      response.statusCode = 400; response.end('{}'); return
    }
    tokenExchanges++
    codes.delete(value.code)
    tokens.set(`fixture-token-${value.code}`, code.id)
    response.end(JSON.stringify({ access_token: `fixture-token-${value.code}` }))
  } else if (request.url === '/user') {
    const id = tokens.get((request.headers.authorization ?? '').replace('Bearer ', ''))
    response.end(JSON.stringify({ id }))
  } else { response.statusCode = 404; response.end('{}') }
})
const githubFetch: typeof fetch = (resource, options) => {
  const target = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url)
  assert.ok(['https://github.com', 'https://api.github.com'].includes(target.origin))
  return fetch(`${providerBase}${target.pathname}`, options)
}

async function serve(fixtureRoot = firstRoot) {
  const server = await createHttpServer({ ...config, fixtureRoot }, githubFetch)
  apps.add(server)
  const address = await server.listen({ host: '127.0.0.1', port: 0 })
  return { server, address }
}
async function call(path: string, options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; address?: string } = {}) {
  const response = await new Promise<{ status: number; text: string; headers: Headers }>((resolve, reject) => {
    const request = httpRequest(`${options.address ?? base}${path}`, { method: options.method ?? 'GET',
      headers: { Host: 'dailylogger.test', ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }, incoming => {
      const chunks: Buffer[] = []
      incoming.on('data', chunk => chunks.push(chunk))
      incoming.on('error', reject)
      incoming.on('end', () => {
        const headers = new Headers()
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1])
        resolve({ status: incoming.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8'), headers })
      })
    })
    request.on('error', reject)
    request.end(options.body === undefined ? undefined : JSON.stringify(options.body))
  })
  if (response.text && response.headers.get('content-type')?.includes('application/json')) assert.equal(validResponse(JSON.parse(response.text)), true, JSON.stringify(validResponse.errors))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  return response
}
async function login(id = Number(config.ownerGithubId)) {
  const start = await call('/v1/auth/login')
  assert.equal(start.status, 302)
  const location = new URL(start.headers.get('location') ?? '')
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(location.searchParams.has('scope'), false)
  const cookieHeader = start.headers.getSetCookie()[0]
  assert.match(cookieHeader, /Secure; HttpOnly; SameSite=Lax; Path=\//)
  assert.equal(cookieHeader.includes('Domain='), false)
  const cookie = cookieHeader.split(';')[0]
  const code = randomUUID()
  codes.set(code, { id, challenge: location.searchParams.get('code_challenge') ?? '' })
  return { cookie, callback: `/v1/auth/callback?code=${code}&state=${location.searchParams.get('state')}` }
}
function mutation(key: string, body: unknown = {}, address = base) {
  return { method: 'POST', body, cookie: ownerCookie, headers: { Origin: config.origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': key }, address }
}
const receipt = (text: string) => z.object({ commandId: z.uuid(), runId: z.uuid() }).parse(JSON.parse(text))
const runView = (text: string) => z.object({ state: z.string(), resumeTarget: z.object({ resumeTargetId: z.uuid() }).nullable(),
  checkpointId: z.string().nullable(), receiptSha256: z.string().nullable(), attempts: z.array(z.object({ commandId: z.uuid().nullable() })), cancellations: z.array(z.object({ state: z.string() })) }).parse(JSON.parse(text))
async function waitFor<T>(read: () => Promise<T | false>, timeout = 20000): Promise<T> {
  const end = Date.now() + timeout
  while (Date.now() < end) { const value = await read(); if (value !== false) return value; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('HTTP fixture did not reach expected state')
}

before(async () => {
  await admin.query(`CREATE DATABASE ${database}`); created = true
  await migrateDelivery(pool, connectionString)
  await migrateDatabase(pool, connectionString, { http: true })
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening')
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  providerBase = `http://127.0.0.1:${address.port}`
  const started = await serve(); app = started.server; base = started.address
})
after(async () => {
  if (worker && worker.exitCode === null && worker.signalCode === null) { const stopped = once(worker, 'exit'); worker.kill('SIGTERM'); await stopped }
  for (const server of apps) await server.close()
  provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
  await pool.end()
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
  await admin.end()
  rmSync(root, { recursive: true, force: true })
})

test('real OAuth exchange binds state, PKCE and immutable owner identity to a revocable host session', async () => {
  assert.equal((await call('/v1/auth/me')).status, 401)
  assert.equal((await call('/v1/fixture/runs', { method: 'POST', body: {}, headers: { 'Idempotency-Key': 'unauthenticated' } })).status, 401)
  const foreign = await login(42)
  assert.equal((await call(foreign.callback, { cookie: foreign.cookie })).status, 403)
  const owner = await login()
  const exchanges = tokenExchanges
  const bad = owner.callback.replace(/state=[^&]+/, `state=${randomBytes(32).toString('base64url')}`)
  assert.equal((await call(bad, { cookie: owner.cookie })).status, 403)
  assert.equal(tokenExchanges, exchanges)
  const callback = await call(owner.callback, { cookie: owner.cookie })
  assert.equal(callback.status, 302)
  const session = callback.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-dailylogger_session='))
  assert.ok(session); assert.match(session, /Secure; HttpOnly; SameSite=Lax; Path=\//)
  ownerCookie = session.split(';')[0]
  assert.equal((await call(owner.callback, { cookie: owner.cookie })).status, 403)
  const me = await call('/v1/auth/me', { cookie: ownerCookie })
  const identity = z.object({ githubId: z.literal(config.ownerGithubId), csrfToken: z.string() }).parse(JSON.parse(me.text))
  csrf = identity.csrfToken
  assert.equal(me.text.includes('fixture-token'), false)
})

test('router failures return closed no-store errors without reflecting raw paths', async () => {
  const canary = 'private-path-canary'
  for (const path of [`/v1/runs/${canary}%ZZ`, `/v1/runs/${canary}${'x'.repeat(200)}`]) {
    const response = await call(path, { headers: { Host: 'foreign.test' } })
    assert.equal(response.status, 400)
    assert.deepEqual(JSON.parse(response.text), { schemaVersion: 1, error: 'invalid_request' })
    assert.equal(response.text.includes(canary), false)
  }
})

test('Origin, session CSRF and strict payload checks run before admission or idempotency replay', async () => {
  const rejected = mutation('csrf-rejected')
  assert.equal((await call('/v1/fixture/runs', { ...rejected, headers: { ...rejected.headers, Origin: 'https://foreign.test' } })).status, 403)
  assert.equal((await call('/v1/fixture/runs', { ...rejected, headers: { ...rejected.headers, 'X-CSRF-Token': randomBytes(32).toString('base64url') } })).status, 403)
  assert.equal((await call('/v1/fixture/runs', mutation('browser-path', { runDir: '/private/forbidden' }))).status, 400)
  assert.equal((await pool.query("SELECT 1 FROM dailylogger_service.fixture_commands WHERE idempotency_key IN ('csrf-rejected','browser-path')")).rowCount, 0)
})

test('every private request rechecks expiry, configured owner and session-specific CSRF', async () => {
  const hash = createHash('sha256').update(ownerCookie.split('=')[1]).digest('hex')
  const original = z.object({ expires_at: z.date() }).parse((await pool.query('SELECT expires_at FROM dailylogger_service.owner_sessions WHERE session_hash=$1', [hash])).rows[0])
  await pool.query("UPDATE dailylogger_service.owner_sessions SET expires_at=now()-interval '1 second' WHERE session_hash=$1", [hash])
  try {
    assert.equal((await call('/v1/auth/me', { cookie: ownerCookie })).status, 401)
    assert.equal((await call('/v1/fixture/runs', mutation('expired-owner'))).status, 401)
  } finally { await pool.query('UPDATE dailylogger_service.owner_sessions SET expires_at=$2 WHERE session_hash=$1', [hash, original.expires_at]) }
  await pool.query("UPDATE dailylogger_service.owner_sessions SET actor_id='github:42' WHERE session_hash=$1", [hash])
  try {
    assert.equal((await call('/v1/auth/me', { cookie: ownerCookie })).status, 403)
    assert.equal((await call('/v1/fixture/runs', mutation('foreign-session'))).status, 403)
  } finally { await pool.query('UPDATE dailylogger_service.owner_sessions SET actor_id=$2 WHERE session_hash=$1', [hash, `github:${config.ownerGithubId}`]) }
  const loginRequest = await login()
  const callback = await call(loginRequest.callback, { cookie: loginRequest.cookie })
  const secondCookie = callback.headers.getSetCookie().find(value => value.startsWith('__Host-dailylogger_session='))?.split(';')[0]
  assert.ok(secondCookie)
  assert.equal((await call('/v1/fixture/runs', { ...mutation('wrong-session-csrf'), cookie: secondCookie })).status, 403)
  assert.equal((await pool.query("SELECT 1 FROM dailylogger_service.fixture_commands WHERE idempotency_key IN ('expired-owner','foreign-session','wrong-session-csrf')")).rowCount, 0)
})

test('concurrent empty starts with changing server destinations retain one command, run, job and response', async () => {
  const second = await serve(secondRoot)
  const before = readdirSync(firstRoot).length + readdirSync(secondRoot).length
  const [one, two] = await Promise.all([call('/v1/fixture/runs', mutation('concurrent-start')), call('/v1/fixture/runs', mutation('concurrent-start', {}, second.address))])
  assert.equal(one.status, 202); assert.equal(two.status, 202); assert.equal(one.text, two.text)
  assert.equal(readdirSync(firstRoot).length + readdirSync(secondRoot).length, before + 1)
  const count = await pool.query(`SELECT count(*)::int AS count FROM dailylogger_service.fixture_commands c
    JOIN dailylogger_delivery.job j ON j.id=c.job_id AND j.name='fixture-command-v1' WHERE c.idempotency_key='concurrent-start'`)
  assert.equal(count.rows[0].count, 1)
  const admitted = receipt(one.text)
  const conflict = await call(`/v1/fixture/runs/${admitted.runId}/recoveries`, mutation('concurrent-start'))
  assert.equal(conflict.status, 409); assert.equal(JSON.parse(conflict.text).error, 'idempotency_conflict')
  const beforeRows = await pool.query('SELECT row_to_json(r) AS row FROM dailylogger_service.fixture_runs r WHERE run_id=$1', [admitted.runId])
  const lock = await pool.connect()
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`dailylogger-s03a:${admitted.runId}`])
    const view = await call(`/v1/runs/${admitted.runId}`, { cookie: ownerCookie })
    assert.equal(view.status, 200); assert.equal(runView(view.text).state, 'admitted')
    const command = await call(`/v1/commands/${admitted.commandId}`, { cookie: ownerCookie })
    assert.equal(command.status, 200)
    assert.equal(command.text.includes('requestKey'), false); assert.equal(command.text.includes('runDir'), false)
    assert.deepEqual((await pool.query('SELECT row_to_json(r) AS row FROM dailylogger_service.fixture_runs r WHERE run_id=$1', [admitted.runId])).rows, beforeRows.rows)
    const directory = z.object({ run_dir: z.string() }).parse((await pool.query('SELECT run_dir FROM dailylogger_service.fixture_runs WHERE run_id=$1', [admitted.runId])).rows[0]).run_dir
    assert.equal(existsSync(join(directory, 'manifest.json')), false)
  } finally { await lock.query('SELECT pg_advisory_unlock_all()'); lock.release() }
})

test('lost HTTP and COMMIT responses replay original bytes across server restart and root change', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest(`${base}/v1/fixture/runs`, { method: 'POST', headers: { Host: 'dailylogger.test', Cookie: ownerCookie,
      Origin: config.origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': 'lost-http-response', 'Content-Type': 'application/json' } }, response => {
      assert.equal(response.statusCode, 202); response.destroy(); resolve()
    })
    request.on('error', reject); request.end('{}')
  })
  const original = z.object({ response_text: z.string() }).parse((await pool.query("SELECT response_text FROM dailylogger_service.fixture_commands WHERE idempotency_key='lost-http-response'")).rows[0])
  await app.close(); apps.delete(app)
  const restarted = await serve(secondRoot); app = restarted.server; base = restarted.address
  const entries = readdirSync(secondRoot)
  const retried = await call('/v1/fixture/runs', mutation('lost-http-response'))
  assert.equal(retried.status, 202); assert.equal(retried.text, original.response_text)
  assert.deepEqual(readdirSync(secondRoot), entries)
  process.env.HTTP_TEST_FAULT = 'lost_commit_response'
  const uncertain = await call('/v1/fixture/runs', mutation('uncertain-commit'))
  assert.equal(uncertain.status, 503); assert.equal(JSON.parse(uncertain.text).error, 'operation_unavailable')
  const committed = z.object({ response_text: z.string() }).parse((await pool.query("SELECT response_text FROM dailylogger_service.fixture_commands WHERE idempotency_key='uncertain-commit'")).rows[0])
  assert.equal((await call('/v1/fixture/runs', mutation('uncertain-commit'))).text, committed.response_text)
  assert.equal((await pool.query("SELECT 1 FROM dailylogger_service.fixture_commands WHERE idempotency_key='uncertain-commit'")).rowCount, 1)
})

test('retry, command and run reads reject inconsistent receipt identities and cancellation links', async () => {
  const row = z.object({ command_id: z.uuid(), run_id: z.uuid(), response_text: z.string() }).parse((await pool.query(
    "SELECT command_id,run_id,response_text FROM dailylogger_service.fixture_commands WHERE idempotency_key='concurrent-start'")).rows[0])
  const corrupted = { ...receipt(row.response_text), admission: 'admitted', runId: randomUUID() }
  await pool.query('UPDATE dailylogger_service.fixture_commands SET response_text=$2 WHERE command_id=$1', [row.command_id, JSON.stringify(corrupted)])
  try {
    assert.equal((await call('/v1/fixture/runs', mutation('concurrent-start'))).status, 503)
    assert.equal((await call(`/v1/commands/${row.command_id}`, { cookie: ownerCookie })).status, 503)
    assert.equal((await call(`/v1/runs/${row.run_id}`, { cookie: ownerCookie })).status, 503)
  } finally { await pool.query('UPDATE dailylogger_service.fixture_commands SET response_text=$2 WHERE command_id=$1', [row.command_id, row.response_text]) }
  await pool.query("INSERT INTO dailylogger_service.run_cancellations(command_id,run_id,state) VALUES($1,$2,'requested')", [row.command_id, row.run_id])
  try { assert.equal((await call(`/v1/runs/${row.run_id}`, { cookie: ownerCookie })).status, 503) }
  finally { await pool.query('DELETE FROM dailylogger_service.run_cancellations WHERE command_id=$1', [row.command_id]) }
})

test('read deadlines cancel blocked SQL and remove pending pool acquisition without leaving transactions', async () => {
  const command = z.object({ command_id: z.uuid() }).parse((await pool.query("SELECT command_id FROM dailylogger_service.fixture_commands WHERE idempotency_key='concurrent-start'")).rows[0])
  const lock = await pool.connect()
  try {
    await lock.query('BEGIN'); await lock.query('LOCK TABLE dailylogger_service.fixture_commands IN ACCESS EXCLUSIVE MODE')
    const started = performance.now()
    const busy = await call(`/v1/commands/${command.command_id}`, { cookie: ownerCookie })
    assert.equal(busy.status, 503); assert.equal(busy.headers.get('retry-after'), '2')
    assert.ok(performance.now() - started < 1000)
    assert.equal((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='dailylogger-http-read' AND state <> 'idle'")).rowCount, 0)
  } finally { await lock.query('ROLLBACK'); lock.release() }
  const limited = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 150 })
  const held = await limited.connect()
  try {
    await assert.rejects(readSnapshot(limited, pool, performance.now(), new AbortController().signal, async () => 'unexpected'))
    assert.equal(limited.waitingCount, 0)
  } finally { held.release(); await limited.end() }
  assert.equal((await call(`/v1/commands/${command.command_id}`, { cookie: ownerCookie })).status, 200)
})

test('hard read cutoff and disconnect release real SQL and late-acquired clients', async () => {
  const hardPool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 150, application_name: 'dailylogger-http-cutoff-test' })
  try {
    const started = performance.now()
    await assert.rejects(readSnapshot(hardPool, pool, started, new AbortController().signal, async client => {
      await client.query('SET LOCAL statement_timeout=0')
      await client.query('SELECT pg_sleep(10)')
    }), /read_unavailable/)
    assert.ok(performance.now() - started < 1000)
    await waitFor(async () => (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='dailylogger-http-cutoff-test'")).rowCount === 0,
      Math.max(1, Math.floor(1000 - (performance.now() - started))))
    assert.ok(performance.now() - started < 1000)
    assert.equal(hardPool.totalCount, 0)
    const held = await hardPool.connect()
    const controller = new AbortController()
    let readCalled = false
    const pending = readSnapshot(hardPool, pool, performance.now(), controller.signal, async () => { readCalled = true })
    const rejected = assert.rejects(pending, /read_unavailable/)
    await waitFor(async () => hardPool.waitingCount === 1)
    controller.abort(); await rejected
    held.release()
    await waitFor(async () => hardPool.totalCount === 0 && hardPool.waitingCount === 0)
    assert.equal(readCalled, false)
    const betweenQueries = new AbortController()
    await assert.rejects(readSnapshot(hardPool, pool, performance.now(), betweenQueries.signal, async reader => {
      await reader.query('SELECT 1')
      betweenQueries.abort()
      await assert.rejects(reader.query('SELECT pg_sleep(10)'), /read_unavailable/)
    }), /read_unavailable/)
    assert.equal(hardPool.totalCount, 0)
  } finally { await hardPool.end() }
  const command = z.object({ command_id: z.uuid() }).parse((await pool.query("SELECT command_id FROM dailylogger_service.fixture_commands WHERE idempotency_key='concurrent-start'")).rows[0])
  const lock = await pool.connect()
  try {
    await lock.query('BEGIN'); await lock.query('LOCK TABLE dailylogger_service.fixture_commands IN ACCESS EXCLUSIVE MODE')
    const request = httpRequest(`${base}/v1/commands/${command.command_id}`, { headers: { Host: 'dailylogger.test', Cookie: ownerCookie } })
    request.on('error', () => {})
    request.end()
    await waitFor(async () => (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='dailylogger-http-read' AND wait_event_type='Lock'")).rowCount !== 0)
    const disconnected = performance.now()
    request.destroy()
    await waitFor(async () => (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='dailylogger-http-read' AND state <> 'idle'")).rowCount === 0, 500)
    assert.ok(performance.now() - disconnected < 500)
  } finally { await lock.query('ROLLBACK'); lock.release() }
})

test('the configured owner can inspect prior direct and trusted-CLI fixtures with stable attempt links', async () => {
  const direct = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/src/postgres-cli.ts'), 'start',
    '--request-key', 'prior-direct-cli', '--run-dir', join(firstRoot, 'prior-direct-cli')],
  { cwd: REPO_ROOT, env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString }, encoding: 'utf8', timeout: 10000 })
  assert.equal(direct.status, 0, direct.stderr)
  const prior = z.object({ runId: z.uuid() }).parse(JSON.parse(direct.stdout))
  const directView = await call(`/v1/runs/${prior.runId}`, { cookie: ownerCookie })
  assert.equal(directView.status, 200)
  assert.ok(runView(directView.text).attempts.length)
  assert.ok(runView(directView.text).attempts.every(attempt => attempt.commandId === null))
  const producer = await startDelivery(pool, connectionString)
  try {
    const admission = await admitCommand(pool, producer, { schemaVersion: 1, actorId: 'trusted-fixture-owner', key: 'prior-queue-cli',
      operation: 'start', payload: { runDir: join(firstRoot, 'prior-queue-cli') } })
    const command = receipt(admission.body)
    assert.equal((await call(`/v1/commands/${command.commandId}`, { cookie: ownerCookie })).status, 200)
    assert.equal((await call(`/v1/runs/${command.runId}`, { cookie: ownerCookie })).status, 200)
  } finally { await producer.stop() }
})

test('all fixture operations use the real worker and cancellation hides an existing target immediately', async () => {
  worker = spawn(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/src/delivery-cli.ts'), 'work'],
    { cwd: REPO_ROOT, env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  worker.stdout?.on('data', bytes => { stdout += String(bytes) })
  await waitFor(async () => stdout.includes('"worker": "ready"') || stdout.includes('"worker":"ready"'))
  const started = receipt((await call('/v1/fixture/runs', mutation('worker-run'))).text)
  const waiting = await waitFor(async () => {
    const view = runView((await call(`/v1/runs/${started.runId}`, { cookie: ownerCookie })).text)
    return view.resumeTarget ? view : false
  })
  const recovered = receipt((await call(`/v1/fixture/runs/${started.runId}/recoveries`, mutation('worker-recover'))).text)
  await waitFor(async () => JSON.parse((await call(`/v1/commands/${recovered.commandId}`, { cookie: ownerCookie })).text).disposition === 'succeeded')
  const resumed = await call(`/v1/fixture/runs/${started.runId}/resumes`, mutation('worker-resume', { resumeTargetId: waiting.resumeTarget?.resumeTargetId }))
  assert.equal(resumed.status, 202)
  const complete = await waitFor(async () => {
    const view = runView((await call(`/v1/runs/${started.runId}`, { cookie: ownerCookie })).text)
    return view.state === 'fixture_complete' ? view : false
  })
  assert.ok(complete.receiptSha256); assert.ok(complete.attempts.every(attempt => attempt.commandId !== null))
  const direct = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/src/postgres-cli.ts'), 'status', '--run-id', started.runId],
    { cwd: REPO_ROOT, env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString }, encoding: 'utf8', timeout: 10000 })
  assert.equal(direct.status, 0, direct.stderr)
  const cancellableResponse = await call('/v1/fixture/runs', mutation('cancel-run'))
  const cancellable = receipt(cancellableResponse.text)
  const target = await waitFor(async () => runView((await call(`/v1/runs/${cancellable.runId}`, { cookie: ownerCookie })).text).resumeTarget || false)
  assert.equal((await call(`/v1/fixture/runs/${cancellable.runId}/cancellations`, mutation('cancel-request'))).status, 202)
  const cancelled = runView((await call(`/v1/runs/${cancellable.runId}`, { cookie: ownerCookie })).text)
  assert.equal(cancelled.resumeTarget, null); assert.ok(cancelled.cancellations.length)
  const rejected = await call(`/v1/fixture/runs/${cancellable.runId}/resumes`, mutation('after-cancel', { resumeTargetId: target.resumeTargetId }))
  assert.equal(rejected.status, 409); assert.equal(JSON.parse(rejected.text).error, 'run_cancelled')
  assert.equal((await call(`/v1/fixture/runs/${cancellable.runId}/resumes`, mutation('after-cancel', { resumeTargetId: target.resumeTargetId }))).text, rejected.text)
  assert.equal((await call('/v1/fixture/runs', mutation('cancel-run'))).text, cancellableResponse.text)
})

test('migration 003 is explicit, checksum-checked and compatible with the current worker and CLI', async () => {
  await migrateDatabase(pool, connectionString, { http: true })
  await requireMigrated(pool); await requireMigrated(pool, { delivery: true }); await requireMigrated(pool, { http: true })
  const migration = z.object({ digest: z.string() }).parse((await pool.query('SELECT digest FROM dailylogger_service.schema_migrations WHERE version=3')).rows[0])
  await pool.query("UPDATE dailylogger_service.schema_migrations SET digest='wrong' WHERE version=3")
  try { await assert.rejects(createHttpServer(config, githubFetch), /checksum/) }
  finally { await pool.query('UPDATE dailylogger_service.schema_migrations SET digest=$1 WHERE version=3', [migration.digest]) }
  assert.throws(() => httpConfig({ ...process.env, DAILYLOGGER_DATABASE_URL: connectionString, DAILYLOGGER_PRIVATE_ORIGIN: 'http://insecure.test' }))
})

test('normal HTTP executable serves private routes and drains on SIGTERM', async () => {
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening')
  const address = reservation.address(); assert.ok(address && typeof address !== 'string')
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const child = spawn(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/src/http-cli.ts'), 'serve'], { cwd: REPO_ROOT,
    env: { ...process.env, DAILYLOGGER_DATABASE_URL: connectionString, DAILYLOGGER_PRIVATE_ORIGIN: config.origin,
      DAILYLOGGER_OWNER_GITHUB_ID: config.ownerGithubId, DAILYLOGGER_GITHUB_CLIENT_ID: config.githubClientId,
      DAILYLOGGER_GITHUB_CLIENT_SECRET: config.githubClientSecret, DAILYLOGGER_FIXTURE_ROOT: firstRoot, DAILYLOGGER_HTTP_PORT: String(address.port) },
    stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', value => { stdout += String(value) }); child.stderr.on('data', value => { stderr += String(value) })
  try {
    await waitFor(async () => { assert.equal(child.exitCode, null, stderr); return stdout.includes('http_ready') })
    assert.equal((await call('/v1/auth/me', { address: `http://127.0.0.1:${address.port}` })).status, 401)
    const stopped = once(child, 'exit'); child.kill('SIGTERM')
    assert.deepEqual(await stopped, [0, null])
  } finally { if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped } }
})

test('logout durably revokes replay access and clears the host session', async () => {
  const loggedOut = await call('/v1/auth/logout', mutation('logout'))
  assert.equal(loggedOut.status, 204); assert.match(loggedOut.headers.getSetCookie()[0], /Max-Age=0/)
  assert.equal((await call('/v1/auth/me', { cookie: ownerCookie })).status, 401)
  assert.equal((await call('/v1/fixture/runs', mutation('concurrent-start'))).status, 401)
})
