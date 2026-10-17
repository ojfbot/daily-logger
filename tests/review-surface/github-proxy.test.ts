import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/_lib/cookies.js', () => ({ extractToken: () => 'fixture-token' }))
import handler from '../../api/github.js'

async function invoke(query: Record<string, string | string[]>) {
  const request = Object.assign(new IncomingMessage(new Socket()), { query, cookies: {}, body: undefined })
  request.method = 'GET'
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
afterEach(() => vi.unstubAllGlobals())

describe('authenticated GitHub proxy query forwarding', () => {
  it('reads the editorial registry instead of main and prevents stale readback caching', async () => {
    let observed: URL | undefined
    vi.stubGlobal('fetch', async (url: string) => {
      observed = new URL(url)
      return new Response(JSON.stringify({ sha: observed.searchParams.get('ref') === 'accept/2026-10-18' ? 'editorial-sha' : 'main-sha' }), { headers: { 'Content-Type': 'application/json' } })
    })
    const result = await invoke({ path: 'repos/ojfbot/daily-logger/contents/actions/registry.json', ref: 'accept/2026-10-18' })
    expect(result.output).toBe('{"sha":"editorial-sha"}')
    expect(observed?.searchParams.has('path')).toBe(false)
    expect(result.headers['cache-control']).toBe('private, no-store')
    expect(result.headers.vary).toBe('Cookie')
  })

  it('keeps the exact editorial head and open-state filters during PR reuse', async () => {
    let observed: URL | undefined
    vi.stubGlobal('fetch', async (url: string) => { observed = new URL(url); return new Response('[]') })
    expect((await invoke({ path: 'repos/ojfbot/daily-logger/pulls', head: 'ojfbot:accept/2026-10-18', state: 'open' })).status).toBe(200)
    expect(observed?.pathname).toBe('/repos/ojfbot/daily-logger/pulls')
    expect(observed?.searchParams.get('head')).toBe('ojfbot:accept/2026-10-18')
    expect(observed?.searchParams.get('state')).toBe('open')
  })
})
