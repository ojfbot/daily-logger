export async function checkAnthropicCredits(apiKey: string): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload: unknown = await response.json()
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const error = payload.error
        if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
          detail = `: ${error.message.slice(0, 300)}`
        }
      }
    } catch {
      // The HTTP status is still enough to identify a failed preflight.
    }
    throw new Error(`Anthropic credit preflight failed (HTTP ${response.status})${detail}`)
  }
  console.log('✓ Anthropic API reachable and funded')
}
