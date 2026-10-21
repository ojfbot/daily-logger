import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectContext } from '../collect-context.js'

// Stop at collection: exercise each real entrypoint's date selection without
// GitHub, providers, article writes or the report CLI's terminal catch handler.
vi.mock('../collect-context.js', () => ({
  collectContext: vi.fn(() => new Promise<never>(() => {})),
}))

beforeEach(() => {
  vi.resetModules()
  vi.mocked(collectContext).mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubEnv('DATE_OVERRIDE', '')
  vi.stubEnv('GITHUB_ACTIONS', 'false')
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-no-provider-call')
  vi.stubEnv('GITHUB_TOKEN', '')
  vi.stubEnv('DRY_RUN', 'true')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in date-selection control') }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each(['article', 'persona report'])('%s CLI reporting date', (entrypoint) => {
  it.each([
    ['2026-10-20T00:30:00Z', '', '2026-10-19'],
    ['2027-01-20T00:30:00Z', '', '2027-01-19'],
    ['2026-10-20T00:30:00Z', '2026-10-17', '2026-10-17'],
  ])('passes Chicago date or explicit override at %s', async (now, override, expected) => {
    vi.setSystemTime(new Date(now))
    vi.stubEnv('DATE_OVERRIDE', override)
    if (entrypoint === 'article') {
      const { main } = await import('../index.js')
      void main()
    } else {
      await import('../report.js')
    }
    await vi.waitFor(() => expect(collectContext).toHaveBeenCalledExactlyOnceWith(expected))
    expect(fetch).not.toHaveBeenCalled()
  })
})
