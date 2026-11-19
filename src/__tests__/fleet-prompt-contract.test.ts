import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogContext, GeneratedArticle } from '../types.js'

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic { messages = { create: createMessage } },
}))

import { ARTICLE_PROMPT_VERSION, generateArticle } from '../generate-article.js'
import { COUNCIL_SYNTHESIS_PROMPT_VERSION, reviewDraft, synthesizeWithCouncil } from '../council.js'

const context: BlogContext = {
  date: '2026-11-19', repos: ['LocalHelp'], commits: [], mergedPRs: [], openPRs: [],
  recentPRs: [], closedIssues: [], openIssues: [], openActions: [], previousArticles: [],
  projectVision: 'Current goal: qualify attributable HelpDesk agent pickup before claiming continuous consumption.',
}
const response = {
  schemaVersion: 2, date: context.date, title: 'An attributable response', summary: 'A bounded listener check.',
  tags: [{ name: 'LocalHelp', type: 'repo' }], whatShipped: [], decisions: [],
  roadmapPulse: 'A listener receipt remains separate from an agent response.',
  whatsNext: 'Continuous consumer qualification is pending.', suggestedActions: [],
  commitCount: 0, reposActive: ['LocalHelp'], activityType: 'audit',
}
const toolResponse = () => ({ content: [{ type: 'tool_use', input: structuredClone(response) }] })

beforeEach(() => { vi.stubEnv('MOCK_LLM', 'false') })
afterEach(() => { createMessage.mockReset(); vi.unstubAllEnvs() })

describe('fleet editorial request contract', () => {
  it('carries fleet framing and the roadmap/action boundaries through draft, review and synthesis requests', async () => {
    createMessage.mockResolvedValueOnce(toolResponse())
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Keep transport and consumer evidence distinct.' }] })
      .mockResolvedValueOnce(toolResponse())

    const draft = await generateArticle(context)
    const note = await reviewDraft(draft, { slug: 'systems', role: 'systems reviewer', content: 'Ask what was actually observed.' })
    await synthesizeWithCouncil(draft, [note], context)

    expect(createMessage).toHaveBeenCalledTimes(3)
    const [draftRequest, reviewRequest, synthesisRequest] = createMessage.mock.calls.map(([request]) => request)
    for (const request of [draftRequest, reviewRequest, synthesisRequest]) {
      expect(request.system).toContain('CircusGreen / ojfbot fleet')
      expect(request.system).not.toMatch(/building (?:an AI App OS called Frame|Frame OS)/)
    }
    for (const request of [draftRequest, synthesisRequest]) {
      for (const label of ['Direction', 'Next milestone', 'Blocked', 'Also in flight']) {
        expect(request.system).toContain(label)
      }
      expect(request.system).toContain('independent action review')
    }
    expect(draftRequest.tools[0].input_schema.properties.roadmapPulse.description).toContain('Also in flight')
    expect(draftRequest.messages[0].content).toContain(context.projectVision)
    expect(reviewRequest.system).toContain('when that context is missing, ask for it')
    expect(synthesisRequest.messages[0].content).toContain(note.critique)
    expect(synthesisRequest.system).toContain('at most five and never a quota')
    expect(synthesisRequest.system).not.toContain('include 1-3 slash-command action items per section')
    expect(synthesisRequest.system).toContain('Do not add per-section action lists')
    expect(ARTICLE_PROMPT_VERSION).toBe('article-v8-2026-11-19-fleet-roadmap-pulse')
    expect(COUNCIL_SYNTHESIS_PROMPT_VERSION).toBe('council-synthesis-v3-2026-11-19-fleet-roadmap-pulse')
  })

  it('keeps orientation separate from current priority and runtime qualification evidence', async () => {
    createMessage.mockResolvedValueOnce(toolResponse())
    await generateArticle(context)
    const request = createMessage.mock.calls[0][0]
    expect(request.system).toContain('not news, a current status ledger or an owner-approved priority record')
    expect(request.system).toContain('Use the supplied current goal and roadmap evidence')
    expect(request.system).toContain('listener presence alone does not prove an active agent consumer')
    expect(request.system).toContain('persistent executor being qualified')
    expect(request.system).toContain('No blocker established by the supplied context')
    expect(request.system).not.toContain('"Nothing is blocked"')
  })

  it('keeps a reviewer question distinct from a verified source or priority decision', async () => {
    createMessage.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Which current goal does this advance?' }] })
    const draft: GeneratedArticle = { title: response.title, date: context.date, tags: [], summary: response.summary, body: 'A transport check passed.' }
    const note = await reviewDraft(draft, { slug: 'systems', role: 'systems reviewer', content: 'Ask about evidence.' })
    expect(note).toEqual({ personaSlug: 'systems', personaRole: 'systems reviewer', critique: 'Which current goal does this advance?' })
    expect(createMessage.mock.calls[0][0].messages[0].content).toContain(draft.body)
    expect(createMessage.mock.calls[0][0].messages[0].content).not.toContain(context.projectVision)
  })
})
