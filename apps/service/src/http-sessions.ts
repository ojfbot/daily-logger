import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'
import { HttpError, input, stored, type HttpReader } from './http-db.js'

export const SESSION_COOKIE = '__Host-dailylogger_session'
const LOGIN_COOKIE = '__Host-dailylogger_login'
const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const randomSecret = () => randomBytes(32).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export interface OwnerConfig {
  origin: string
  ownerGithubId: string
  githubClientId: string
  githubClientSecret: string
}

export function privateCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

function credential(header: string | undefined, name: string): string | undefined {
  const values = (header ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`))
  if (values.length !== 1) return undefined
  const parsed = secretSchema.safeParse(values[0].slice(name.length + 1))
  return parsed.success ? parsed.data : undefined
}

const sessionRow = z.object({
  actor_id: z.string().regex(/^github:[1-9][0-9]*$/), csrf_token: secretSchema,
  expires_at: z.date(), observed_at: z.date(),
})

export async function ownerSession(client: HttpReader, cookie: string | undefined, config: OwnerConfig, mutation?: { origin: unknown; csrf: unknown; lock: boolean }) {
  const token = credential(cookie, SESSION_COOKIE)
  if (!token) throw new HttpError(401, 'unauthenticated')
  const result = await client.query(`SELECT actor_id,csrf_token,expires_at,clock_timestamp() AS observed_at
    FROM dailylogger_service.owner_sessions
    WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()${mutation?.lock ? ' FOR SHARE' : ''}`, [hash(token)])
  if (!result.rows.length) throw new HttpError(401, 'unauthenticated')
  const session = stored(sessionRow, result.rows[0])
  if (session.actor_id !== `github:${config.ownerGithubId}`) throw new HttpError(403, 'forbidden')
  if (mutation) {
    const csrf = secretSchema.safeParse(mutation.csrf)
    if (mutation.origin !== config.origin || !csrf.success
      || !timingSafeEqual(Buffer.from(csrf.data), Buffer.from(session.csrf_token))) throw new HttpError(403, 'forbidden')
  }
  return { actorId: session.actor_id, csrfToken: session.csrf_token, expiresAt: session.expires_at.toISOString(), readAt: session.observed_at.toISOString(), sessionHash: hash(token) }
}

export async function beginLogin(pool: pg.Pool, config: OwnerConfig) {
  const cookie = randomSecret(), state = randomSecret(), verifier = randomSecret()
  await pool.query(`INSERT INTO dailylogger_service.owner_logins(cookie_hash,state_hash,pkce_verifier,expires_at)
    VALUES($1,$2,$3,now()+interval '10 minutes')`, [hash(cookie), hash(state), verifier])
  const parameters = new URLSearchParams({
    client_id: config.githubClientId, redirect_uri: `${config.origin}/v1/auth/callback`,
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  })
  return { cookie: privateCookie(LOGIN_COOKIE, cookie, 600), location: `https://github.com/login/oauth/authorize?${parameters}` }
}

export async function finishLogin(pool: pg.Pool, config: OwnerConfig, cookieHeader: string | undefined, query: unknown, fetcher: typeof fetch) {
  const callback = input(z.strictObject({ code: z.string().min(1).max(4096), state: secretSchema }), query)
  const cookie = credential(cookieHeader, LOGIN_COOKIE)
  if (!cookie) throw new HttpError(403, 'forbidden')
  const claimed = await pool.query(`DELETE FROM dailylogger_service.owner_logins
    WHERE cookie_hash=$1 AND state_hash=$2 AND expires_at>clock_timestamp() RETURNING pkce_verifier`, [hash(cookie), hash(callback.state)])
  if (claimed.rows.length !== 1) throw new HttpError(403, 'forbidden')
  const login = stored(z.object({ pkce_verifier: secretSchema }), claimed.rows[0])
  let accountId: number
  try {
    const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret,
        code: callback.code, redirect_uri: `${config.origin}/v1/auth/callback`, code_verifier: login.pkce_verifier }),
    })
    if (!tokenResponse.ok) throw new Error('Token exchange failed')
    const token = z.object({ access_token: z.string().min(1) }).parse(await tokenResponse.json())
    const profileResponse = await fetcher('https://api.github.com/user', {
      signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json' },
    })
    if (!profileResponse.ok) throw new Error('Identity read failed')
    accountId = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).parse(await profileResponse.json()).id
  } catch { throw new HttpError(503, 'authentication_unavailable') }
  if (String(accountId) !== config.ownerGithubId) throw new HttpError(403, 'forbidden')
  const session = randomSecret(), csrf = randomSecret()
  await pool.query(`INSERT INTO dailylogger_service.owner_sessions(session_hash,actor_id,csrf_token,expires_at)
    VALUES($1,$2,$3,now()+interval '8 hours')`, [hash(session), `github:${accountId}`, csrf])
  return [privateCookie(LOGIN_COOKIE, '', 0), privateCookie(SESSION_COOKIE, session, 28800)]
}
