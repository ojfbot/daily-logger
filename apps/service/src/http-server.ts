import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import pg from 'pg'
import { readFileSync, realpathSync } from 'node:fs'
import { z } from 'zod'
import { Ajv } from 'ajv'
import addFormats from 'ajv-formats'
import { databaseUrl, requireMigrated } from './postgres-db.js'
import { startDelivery } from './delivery-db.js'
import { checkedRunDir } from './storage.js'
import { HttpError, input, readSnapshot, type HttpReader } from './http-db.js'
import { beginLogin, finishLogin, ownerSession, privateCookie, SESSION_COOKIE } from './http-sessions.js'
import { admitHttpFixture, type FixtureIntent } from './http-fixtures.js'
import { commandProjection, runProjection } from './http-projections.js'

const configSchema = z.strictObject({
  connectionString: z.string(), origin: z.url(), ownerGithubId: z.string().regex(/^[1-9][0-9]*$/),
  githubClientId: z.string().min(1), githubClientSecret: z.string().min(1), fixtureRoot: z.string().min(1),
})
export type HttpConfig = z.infer<typeof configSchema>

export function httpConfig(env: NodeJS.ProcessEnv): HttpConfig {
  const parsed = configSchema.safeParse({ connectionString: env.DAILYLOGGER_DATABASE_URL,
    origin: env.DAILYLOGGER_PRIVATE_ORIGIN, ownerGithubId: env.DAILYLOGGER_OWNER_GITHUB_ID,
    githubClientId: env.DAILYLOGGER_GITHUB_CLIENT_ID, githubClientSecret: env.DAILYLOGGER_GITHUB_CLIENT_SECRET,
    fixtureRoot: env.DAILYLOGGER_FIXTURE_ROOT })
  if (!parsed.success) throw new Error('Invalid private HTTP configuration')
  databaseUrl(parsed.data.connectionString)
  const origin = new URL(parsed.data.origin)
  if (origin.protocol !== 'https:' || origin.origin !== parsed.data.origin) throw new Error('Private HTTP origin must be an HTTPS origin')
  return { ...parsed.data, fixtureRoot: realpathSync.native(checkedRunDir(parsed.data.fixtureRoot)) }
}

function fixtureIntent(kind: FixtureIntent['operation'], request: FastifyRequest): FixtureIntent {
  if (kind === 'start') { input(z.strictObject({}), request.body); return { operation: 'start', payload: {} } }
  const runId = input(z.object({ runId: z.uuid() }), request.params).runId.toLowerCase()
  if (kind === 'resume') {
    const body = input(z.strictObject({ resumeTargetId: z.uuid() }), request.body)
    return { operation: 'resume', payload: { runId, resumeTargetId: body.resumeTargetId.toLowerCase() } }
  }
  input(z.strictObject({}), request.body)
  return { operation: kind, payload: { runId } }
}

export async function createHttpServer(config: HttpConfig, fetcher: typeof fetch = fetch) {
  const pool = new pg.Pool({ connectionString: config.connectionString, max: 4, connectionTimeoutMillis: 5000 })
  const readPool = new pg.Pool({ connectionString: config.connectionString, max: 4, connectionTimeoutMillis: 150,
    statement_timeout: 650, application_name: 'dailylogger-http-read' })
  const cancellations = new pg.Pool({ connectionString: config.connectionString, max: 1, connectionTimeoutMillis: 50,
    statement_timeout: 50, query_timeout: 60, application_name: 'dailylogger-http-cancel' })
  pool.on('error', () => {})
  readPool.on('error', () => {})
  cancellations.on('error', () => {})
  let boss: Awaited<ReturnType<typeof startDelivery>>
  try { await requireMigrated(pool, { http: true }); boss = await startDelivery(pool, config.connectionString) }
  catch (error) { await Promise.all([pool.end(), readPool.end(), cancellations.end()]); throw error }
  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 4096 })
  const responses = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(new URL('../../../docs/agent-service/editorial-api-responses.schema.json', import.meta.url), 'utf8')))
  app.addSchema({ ...responses, $id: 'dailylogger-fixture-responses' })
  const validator = new Ajv({ strict: false })
  addFormats.default(validator)
  validator.addSchema({ ...responses, $id: 'dailylogger-fixture-responses' })
  app.setSerializerCompiler(({ schema: responseSchema }) => {
    const validate = validator.compile(z.record(z.string(), z.unknown()).parse(responseSchema))
    return (value: unknown) => {
      if (!validate(value)) throw new HttpError(503, 'integrity_rejected')
      const encoded = JSON.stringify(value)
      if (encoded === undefined) throw new HttpError(503, 'integrity_rejected')
      return encoded
    }
  })
  const schema = (name: string) => ({ response: { 200: { $ref: `dailylogger-fixture-responses#/definitions/${name}` } } })
  const reads = new WeakMap<FastifyRequest, { startedAt: number; signal: AbortSignal }>()
  app.addHook('onRequest', async (request, reply) => {
    const controller = new AbortController()
    reads.set(request, { startedAt: performance.now(), signal: controller.signal })
    request.raw.once('aborted', () => controller.abort())
    reply.raw.once('close', () => { if (!reply.raw.writableFinished) controller.abort() })
    reply.header('Cache-Control', 'no-store')
    if (request.headers.host !== new URL(config.origin).host) throw new HttpError(403, 'forbidden')
  })
  app.setErrorHandler((error, request, reply) => {
    const status = error !== null && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 503
    const known = error instanceof HttpError ? error : new HttpError(
      status < 500 ? 400 : 503, status < 500 ? 'invalid_request' : request.method === 'GET' ? 'read_unavailable' : 'operation_unavailable')
    if (known.status === 503) reply.header('Retry-After', '2')
    return reply.code(known.status).send({ schemaVersion: 1, error: known.code })
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ schemaVersion: 1, error: 'not_found' }))
  app.addHook('onClose', async () => { await boss.stop(); await Promise.all([pool.end(), readPool.end(), cancellations.end()]) })

  const read = <T>(request: FastifyRequest, work: (client: HttpReader, owner: Awaited<ReturnType<typeof ownerSession>>) => Promise<T>) => {
    const budget = reads.get(request)
    if (!budget) throw new HttpError(503, 'read_unavailable')
    return readSnapshot(readPool, cancellations, budget.startedAt, budget.signal, async client => work(client, await ownerSession(client, request.headers.cookie, config)))
  }
  const write = async <T>(request: FastifyRequest, lockSession: boolean, work: (client: pg.PoolClient, owner: Awaited<ReturnType<typeof ownerSession>>) => Promise<T>) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'")
      const owner = await ownerSession(client, request.headers.cookie, config,
        { origin: request.headers.origin, csrf: request.headers['x-csrf-token'], lock: lockSession })
      const value = await work(client, owner)
      await client.query('COMMIT')
      return value
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
    finally { client.release() }
  }

  app.get('/v1/auth/login', async (_request, reply) => {
    const login = await beginLogin(pool, config)
    return reply.header('Set-Cookie', login.cookie).redirect(login.location)
  })
  app.get('/v1/auth/callback', async (request, reply) => {
    const cookies = await finishLogin(pool, config, request.headers.cookie, request.query, fetcher)
    return reply.header('Set-Cookie', cookies).redirect('/v1/auth/me')
  })
  app.get('/v1/auth/me', { schema: schema('ownerSessionView') }, request => read(request, async (_client, owner) =>
    ({ schemaVersion: 1, githubId: config.ownerGithubId, csrfToken: owner.csrfToken, expiresAt: owner.expiresAt })))
  app.post('/v1/auth/logout', async (request, reply) => {
    await write(request, false, async (client, owner) => {
      input(z.strictObject({}), request.body)
      await client.query('UPDATE dailylogger_service.owner_sessions SET revoked_at=now() WHERE session_hash=$1', [owner.sessionHash])
    })
    return reply.header('Set-Cookie', privateCookie(SESSION_COOKIE, '', 0)).code(204).send()
  })
  const mutate = (kind: FixtureIntent['operation']) => async (request: FastifyRequest, reply: FastifyReply) => {
    const admission = await write(request, true, async (client, owner) => {
      const intent = fixtureIntent(kind, request)
      const key = input(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/), request.headers['idempotency-key'])
      return admitHttpFixture(client, boss, owner.actorId, key, intent, config.fixtureRoot)
    })
    return reply.code(admission.status).type('application/json').send(Buffer.from(admission.body, 'utf8'))
  }
  app.post('/v1/fixture/runs', mutate('start'))
  app.post('/v1/fixture/runs/:runId/resumes', mutate('resume'))
  app.post('/v1/fixture/runs/:runId/recoveries', mutate('recover'))
  app.post('/v1/fixture/runs/:runId/cancellations', mutate('cancel'))
  app.get('/v1/commands/:commandId', { schema: schema('fixtureCommandView') }, request => read(request, (client, owner) =>
    commandProjection(client, input(z.object({ commandId: z.uuid() }), request.params).commandId.toLowerCase(), owner.readAt)))
  app.get('/v1/runs/:runId', { schema: schema('fixtureRunView') }, request => read(request, (client, owner) =>
    runProjection(client, input(z.object({ runId: z.uuid() }), request.params).runId.toLowerCase(), owner.readAt)))
  try { await app.ready() } catch (error) { await app.close(); throw error }
  return app
}
