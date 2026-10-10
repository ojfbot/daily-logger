import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlogContext } from '../types.js'

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: createMessage }
  },
}))

import { generateArticle } from '../generate-article.js'

const context: BlogContext = {
  date: '2026-10-10',
  repos: ['daily-logger'],
  commits: [],
  mergedPRs: [],
  openPRs: [],
  recentPRs: [],
  closedIssues: [],
  openIssues: [],
  openActions: [],
  projectVision: '',
  previousArticles: [],
  telemetry: {
    totalToolCalls: 1,
    totalSessions: 1,
    toolBreakdown: {},
    skillsInvoked: [],
    repoBreakdown: {},
    lintFixed: 0,
    lintRegressions: 0,
    qualityCoverage: 0,
    suggestionsGiven: 0,
    suggestionsFollowed: 0,
    suggestionConversion: 0,
    prSkillComments: 0,
    skillSource: 'dispositions',
    skillSourceNewestTs: null,
  },
}

afterEach(() => {
  createMessage.mockReset()
  delete process.env.MOCK_LLM
})

describe('generateArticle provenance inputs', () => {
  it('keeps the telemetry system prompt on the validation retry', async () => {
    createMessage
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', input: null }] })
      .mockResolvedValueOnce({
        content: [{
          type: 'tool_use',
          input: {
            schemaVersion: 2,
            date: context.date,
            title: 'Retry article',
            summary: 'Valid after retry.',
            tags: [{ name: 'daily-logger', type: 'repo' }],
            whatShipped: [],
            decisions: [],
            roadmapPulse: 'No open PRs.',
            whatsNext: 'Inspect the next run.',
            suggestedActions: [],
            commitCount: 0,
            reposActive: [],
            activityType: 'audit',
          },
        }],
      })

    await generateArticle(context)

    expect(createMessage).toHaveBeenCalledTimes(2)
    expect(createMessage.mock.calls[0][0].system).toContain('## Claude Code skill telemetry')
    expect(createMessage.mock.calls[1][0].system).toContain('## Claude Code skill telemetry')
  })

  it('labels mock and fallback outputs instead of crediting the model', async () => {
    process.env.MOCK_LLM = 'true'
    await expect(generateArticle(context)).resolves.toMatchObject({ generationMode: 'mock' })
    delete process.env.MOCK_LLM

    createMessage.mockResolvedValue({ content: [] })
    await expect(generateArticle(context)).resolves.toMatchObject({ generationMode: 'stub' })
  })
})
