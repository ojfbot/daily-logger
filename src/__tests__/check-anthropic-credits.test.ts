import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAnthropicCredits } from '../check-anthropic-credits.js'

afterEach(() => vi.unstubAllGlobals())

describe('checkAnthropicCredits', () => {
  it('makes a one-token request before generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await checkAnthropicCredits('test-key')
    } finally {
      log.mockRestore()
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"max_tokens":1'),
      }),
    )
  })

  it('fails clearly when credits are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Your credit balance is too low' } }),
      { status: 400 },
    )))
    await expect(checkAnthropicCredits('test-key')).rejects.toThrow(
      'Anthropic credit preflight failed (HTTP 400): Your credit balance is too low',
    )
  })
})
