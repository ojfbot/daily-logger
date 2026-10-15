import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixture, blob, today } from './fixture.js'

const auth = vi.hoisted(() => (() => { const state: { token: string | null } = { token: 'fixture-token' }; return state })())
vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => auth.token }))
import handler from '../../api/article-reviews.js'

async function invoke({ method = 'GET', body = undefined as unknown, csrf = true, date = today } = {}) {
  const request = Object.assign(new IncomingMessage(new Socket()), { query: { date, visibleBlobSha: blob }, cookies: {}, body })
  request.method = method
  if (csrf) request.headers['x-requested-with'] = 'XMLHttpRequest'
  let output: unknown
  const response = Object.assign(new ServerResponse(request), {
    status(code: number) { response.statusCode = code; return response },
    json(value: unknown) { output = value; return response },
    send(value: unknown) { output = value; return response },
    redirect(code: number | string, url?: string) { response.statusCode = typeof code === 'number' ? code : 302; response.setHeader('Location', typeof code === 'string' ? code : url ?? '/'); return response },
  })
  await handler(request, response)
  return { status: response.statusCode, output, headers: response.getHeaders() }
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); auth.token = 'fixture-token' })
describe('real review route admission', () => {
  it('requires an authenticated allowlisted editor for reads, and marks responses private/no-store', async () => {
    const fixture = createFixture()
    vi.stubEnv('ALLOWED_USERS', 'editor')
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => fixture.github(url.replace('https://api.github.com', ''), options))
    auth.token = null
    expect((await invoke()).status).toBe(401)
    auth.token = 'fixture-token'
    fixture.state.login = 'someone-else'
    expect((await invoke()).status).toBe(403)
    fixture.state.login = 'editor'
    const result = await invoke()
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('private, no-store')
    expect(result.headers.vary).toBe('Cookie')
    expect(fixture.state.comments).toEqual([])
  })
  it('fails closed on empty authorization config, absent CSRF, invalid intent, unknown method, and malformed date', async () => {
    const fixture = createFixture()
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => fixture.github(url.replace('https://api.github.com', ''), options))
    vi.stubEnv('ALLOWED_USERS', '')
    expect((await invoke()).status).toBe(403)
    vi.stubEnv('ALLOWED_USERS', 'editor')
    expect((await invoke({ method: 'POST', csrf: false })).status).toBe(403)
    expect((await invoke({ method: 'POST', body: { intent: 'accept' } })).status).toBe(400)
    expect((await invoke({ method: 'DELETE' })).status).toBe(405)
    expect((await invoke({ date: '../../secrets' })).status).toBe(400)
    expect(fixture.state.calls.filter((call) => !call.startsWith('GET '))).toEqual([])
  })
  it('reports upstream failure without exposing data or writing', async () => {
    const fixture = createFixture()
    fixture.state.outage = true
    vi.stubEnv('ALLOWED_USERS', 'editor')
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => fixture.github(url.replace('https://api.github.com', ''), options))
    expect((await invoke()).status).toBe(401)
    expect(fixture.state.comments).toEqual([])
  })
})
