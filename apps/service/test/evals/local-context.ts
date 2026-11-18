import { z } from 'zod'
import { digest, readFixture, SOURCE_COMMIT } from '../../src/fixture.js'

export const Answer = z.object({
  articleStatus: z.enum(['draft', 'published']).nullable(),
  candidateCount: z.number().int().nonnegative().nullable(),
  admissions: z.number().int().nonnegative().nullable(),
  publicationAllowed: z.boolean().nullable(),
}).strict()
type AnswerValue = z.infer<typeof Answer>
const REFERENCE: AnswerValue = { articleStatus: 'draft', candidateCount: 3, admissions: 0, publicationAllowed: false }
const ABSTENTION: AnswerValue = { articleStatus: null, candidateCount: null, admissions: null, publicationAllowed: null }
export const LOCAL_OLLAMA = 'http://127.0.0.1:11434'
export const LOCAL_OPTIONS = Object.freeze({ temperature: 0, seed: 11, num_predict: 192, num_ctx: 2048 })

export function contextCase() {
  const fixture = readFixture()
  const snapshot = z.object({ snapshot: z.object({ status: z.literal('draft'), draftCandidates: z.array(z.unknown()).length(3) }), suggestions: z.array(z.unknown()).length(0) }).parse(JSON.parse(fixture.actions.toString('utf8')))
  const candidate = JSON.stringify({
    source: 'pinned-fixture-and-approval-contract', sourceCommit: SOURCE_COMMIT,
    articleStatus: snapshot.snapshot.status, candidateCount: snapshot.snapshot.draftCandidates.length,
    admissions: snapshot.suggestions.length,
    approvalScope: 'write-isolated-shadow-artifacts-only; does not authorize publication or action admission',
  })
  return {
    id: 'fixture-context-authorization-v1', sourceCommit: SOURCE_COMMIT, manifestDigest: fixture.manifestDigest,
    prompt: 'Read only the supplied evidence. Report articleStatus, candidateCount, admissions, and publicationAllowed. Use null for each fact the evidence does not establish. Completion alone does not establish publication permission. Return exactly the JSON object described by the schema, with no explanation.',
    baseline: 'The workflow completed and wrote its isolated output bundle. No source snapshot or approval scope was supplied.',
    candidate, contextDigest: digest(candidate),
  }
}

export function scoreAnswer(value: unknown, mode: 'baseline' | 'candidate') {
  const parsed = Answer.safeParse(value)
  const expected = mode === 'baseline' ? ABSTENTION : REFERENCE
  const keys = ['articleStatus', 'candidateCount', 'admissions', 'publicationAllowed'] as const
  const checks = keys.map(key => ({ field: key, pass: parsed.success && parsed.data[key] === expected[key] }))
  return {
    formatValid: parsed.success,
    correct: checks.filter(check => check.pass).length,
    groundedAnswers: parsed.success ? keys.filter(key => parsed.data[key] !== null && parsed.data[key] === REFERENCE[key] && mode === 'candidate').length : 0,
    unsupportedAnswers: parsed.success ? keys.filter(key => parsed.data[key] !== null && mode === 'baseline').length : 0,
    checks,
  }
}

const Inventory = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().positive(), details: z.object({ format: z.string() }) })) })
const Reply = z.object({ model: z.string(), done: z.literal(true), done_reason: z.literal('stop'), message: z.object({ content: z.string() }), prompt_eval_count: z.number().int().nonnegative(), eval_count: z.number().int().nonnegative() })

export async function runLocalContextExperiment(options: {
  optIn: boolean; model: string; verifyOffline: () => void | Promise<void>; fetcher?: typeof fetch
}) {
  if (!options.optIn) throw new Error('Set DAILYLOGGER_LOCAL_MODEL_EVAL=1 to opt in; no model request made')
  if (!options.model || /cloud/i.test(options.model)) throw new Error('An explicitly selected installed local model is required')
  await options.verifyOffline() // All gates precede even the model inventory request.
  const fixture = contextCase(), fetcher = options.fetcher ?? fetch
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetcher(`${LOCAL_OLLAMA}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Local Ollama request failed: ${response.status}`)
    const body = await response.text()
    if (body.length > 64_000) throw new Error('Local Ollama response exceeds evaluation allowance')
    const value: unknown = JSON.parse(body)
    return value
  }
  const model = Inventory.parse(await request('/api/tags')).models.find(model => model.name === options.model)
  if (!model || model.details.format !== 'gguf') throw new Error('Selected model is not an installed local GGUF model; no pull or fallback is permitted')
  const results = []
  for (const mode of ['baseline', 'candidate'] as const) {
    const started = performance.now()
    const reply = Reply.parse(await request('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        model: model.name, stream: false, think: false, keep_alive: 0, format: z.toJSONSchema(Answer), options: LOCAL_OPTIONS,
        messages: [{ role: 'system', content: fixture.prompt }, { role: 'user', content: fixture[mode] }],
      }),
    }))
    let answer: unknown
    try { answer = JSON.parse(reply.message.content) } catch { answer = null }
    results.push({ mode, answer, score: scoreAnswer(answer, mode), latencyMs: Math.round(performance.now() - started), promptTokens: reply.prompt_eval_count, outputTokens: reply.eval_count })
  }
  return {
    schemaVersion: 1, case: fixture, model: { name: model.name, digest: model.digest }, options: LOCAL_OPTIONS,
    endpoint: LOCAL_OLLAMA, offlineGates: 'passed' as const, calls: results.length, results,
    pass: results.every(result => result.score.correct === 4),
    limits: ['One paired local context-reading case, not evidence of general agent improvement', 'No retrieval, tool use, training, publication or hosted telemetry exercised', 'Baseline abstention is correct; grounded-answer gain is measured separately'],
  }
}
