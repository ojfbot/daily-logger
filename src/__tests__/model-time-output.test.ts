import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { BlogContext, GeneratedArticle } from '../types.js'
import { ArticleDataSchema, StructuredArticleSchema } from '../schema.js'

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn<(request: unknown) => Promise<unknown>>() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: createMessage }
  },
}))

import { generateArticle, toMarkdown } from '../generate-article.js'
import { synthesizeWithCouncil } from '../council.js'

const fullHash = 'a'.repeat(40)
const authoredAt = '2026-10-14T08:59:01.000Z'
const mergedAt = '2026-10-14T09:10:23+00:00'
const context: BlogContext = {
  date: '2026-10-15', repos: ['daily-logger'],
  commits: [{ hash: fullHash.slice(0, 7), fullHash, authoredAt, committedAt: mergedAt,
    message: 'Retain source event facts', author: 'editor', date: mergedAt, repo: 'daily-logger',
    url: `https://github.com/ojfbot/daily-logger/commit/${fullHash}` }],
  mergedPRs: [], openPRs: [], closedIssues: [], openIssues: [], openActions: [],
  recentPRs: [{ number: 359, title: 'Ship the change', repo: 'daily-logger',
    url: 'https://github.com/ojfbot/daily-logger/pull/359', state: 'closed', draft: false,
    createdAt: '2026-10-13T08:00:00Z', updatedAt: mergedAt, mergedAt }],
  projectVision: 'Keep the ordinary article focused on observable work.', previousArticles: [],
}

const v2 = {
  schemaVersion: 2, date: context.date, title: 'The observed change', summary: 'A recorded merge.',
  tags: [{ name: 'daily-logger', type: 'repo' }],
  whatShipped: [{ repo: 'daily-logger', description: 'The change merged at 09:10Z.', commits: ['aaaaaaa'] }],
  decisions: [], roadmapPulse: 'The change is available.', whatsNext: 'Inspect the next run.',
  suggestedActions: [], commitCount: 1, reposActive: ['daily-logger'], activityType: 'build',
}
const v1 = {
  title: 'The observed change', tags: ['daily-logger'], summary: 'A recorded merge.',
  whatShipped: 'The change merged at 09:10Z.', theDecisions: 'Keep the evidence.',
  roadmapPulse: 'The change is available.', whatsNext: 'Inspect the next run.',
}
const inventedTimeFields = {
  timeReferences: [{ text: '09:10Z', occurrence: 0, at: '1999-01-01T09:10:00.000Z', precision: 'minute',
    evidence: { kind: 'explicit-offset', value: '1999-01-01T09:10Z' } }],
  time_references: [{ text: '09:10Z', at: '1999-01-01T09:10:00.000Z' }],
  time_references_body_sha256: 'f'.repeat(64),
  time_records_sha256: '1'.repeat(64),
}
const draft: GeneratedArticle = {
  title: v1.title, date: context.date, tags: v1.tags, summary: v1.summary, body: v1.whatShipped,
}

const requestSchema = z.object({
  system: z.string(),
  tools: z.array(z.object({ name: z.literal('write_article'), input_schema: z.object({ properties: z.record(z.string(), z.unknown()) }) })),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
})

function expectEditorialRequest(request: unknown) {
  const parsed = requestSchema.parse(request)
  expect(parsed.tools).toHaveLength(1)
  expect(parsed.tools[0].input_schema.properties).toHaveProperty('title')
  expect(parsed.tools[0].input_schema.properties).not.toHaveProperty('timeReferences')
  const serialized = JSON.stringify(request)
  expect(serialized).not.toMatch(/timeReferences|time_references|time_records|Authoritative event timestamp records|Event timestamp standards/)
  expect(serialized).not.toContain(fullHash)
  expect(serialized).not.toContain(authoredAt)
  return parsed
}

beforeEach(() => { vi.stubEnv('MOCK_LLM', 'false') })
afterEach(() => { createMessage.mockReset(); vi.unstubAllEnvs() })

describe('model time metadata is outside editorial output', () => {
  it.each([['v2', v2], ['v1', v1]])('draft %s requests only editorial fields and discards invented metadata', async (_version, payload) => {
    createMessage.mockResolvedValue({ content: [{ type: 'tool_use', input: { ...payload, ...inventedTimeFields } }] })
    const article = await generateArticle(context)
    expect(createMessage).toHaveBeenCalled()
    for (const [request] of createMessage.mock.calls) {
      const parsed = expectEditorialRequest(request)
      expect(parsed.messages[0].content).toContain(`MERGED ${mergedAt}`)
    }
    expect(article.body).toContain('The change merged at 09:10Z.')
    expect(article).not.toHaveProperty('timeReferences')
    expect(toMarkdown(article)).not.toMatch(/timeReferences|time_references|time_records/)
  })

  it.each([['v2', v2], ['v1', v1]])('synthesis %s requests only editorial fields and discards invented metadata', async (_version, payload) => {
    createMessage.mockResolvedValue({ content: [{ type: 'tool_use', input: { ...payload, ...inventedTimeFields } }] })
    const article = await synthesizeWithCouncil(draft, [], context)
    expect(createMessage).toHaveBeenCalledTimes(1)
    expectEditorialRequest(createMessage.mock.calls[0][0])
    expect(article.body).toContain('The change merged at 09:10Z.')
    expect(article).not.toHaveProperty('timeReferences')
    expect(toMarkdown(article)).not.toMatch(/timeReferences|time_references|time_records/)
  })

  it('both model schemas strip metadata rather than admitting model-supplied evidence or pointers', () => {
    for (const result of [ArticleDataSchema.parse({ ...v2, ...inventedTimeFields }), StructuredArticleSchema.parse({ ...v1, ...inventedTimeFields })]) {
      for (const key of Object.keys(inventedTimeFields)) expect(result).not.toHaveProperty(key)
    }
  })

  it('ordinary serialization cannot publish time metadata injected into an otherwise valid runtime article', () => {
    const supplied = { ...draft, ...inventedTimeFields }
    const markdown = toMarkdown(supplied)
    expect(markdown).toContain('status: "draft"')
    expect(markdown).toContain('The change merged at 09:10Z.')
    expect(markdown).not.toMatch(/timeReferences|time_references|time_records/)
    expect(markdown).not.toContain('1999-01-01')
  })
})
