import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCAL_OLLAMA, runLocalContextExperiment, scoreAnswer } from './evals/local-context.js'

test('local model remains unreachable without opt-in and successful offline gates', async () => {
  let requests = 0
  const fetcher: typeof fetch = async () => { requests++; throw new Error('No request expected') }
  await assert.rejects(runLocalContextExperiment({ optIn: false, model: 'local:7b', verifyOffline() { assert.fail('Gate should not run') }, fetcher }), /opt in/)
  await assert.rejects(runLocalContextExperiment({ optIn: true, model: 'local:7b', verifyOffline() { throw new Error('offline oracle failed') }, fetcher }), /offline oracle failed/)
  await assert.rejects(runLocalContextExperiment({ optIn: true, model: 'local:cloud', verifyOffline() { assert.fail('Cloud model must be rejected first') }, fetcher }), /local model/)
  assert.equal(requests, 0)
})

test('code evaluator rejects hallucination, invalid format and unauthorized publication independently', () => {
  const correct = { articleStatus: 'draft', candidateCount: 3, admissions: 0, publicationAllowed: false }
  assert.equal(scoreAnswer(correct, 'candidate').correct, 4)
  assert.equal(scoreAnswer({ ...correct, publicationAllowed: true }, 'candidate').correct, 3)
  assert.equal(scoreAnswer({ ...correct, candidateCount: 4 }, 'candidate').correct, 3)
  assert.equal(scoreAnswer('looks correct', 'candidate').correct, 0)
  assert.equal(scoreAnswer({ articleStatus: null, candidateCount: null, admissions: null, publicationAllowed: null }, 'baseline').correct, 4)
  assert.equal(scoreAnswer(correct, 'baseline').unsupportedAnswers, 4)
})

test('paired experiment changes only context, sends exactly two bounded local requests and records a real failure', async () => {
  let gatesPassed = false, calls = 0
  const bodies: { model: string; options: unknown; messages: { content: string }[] }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    assert.ok(gatesPassed)
    assert.ok(String(url).startsWith(`${LOCAL_OLLAMA}/api/`))
    assert.equal(init?.redirect, 'error')
    if (String(url).endsWith('/tags')) return Response.json({ models: [{ name: 'local:7b', digest: 'a'.repeat(64), size: 1, details: { format: 'gguf' } }] })
    calls++
    const body = init?.body
    assert.ok(typeof body === 'string')
    bodies.push(JSON.parse(body))
    return Response.json({ model: 'local:7b', done: true, done_reason: 'stop', message: { content: JSON.stringify(calls === 1 ? { articleStatus: null, candidateCount: null, admissions: null, publicationAllowed: null } : { articleStatus: 'draft', candidateCount: 3, admissions: 0, publicationAllowed: true }) }, prompt_eval_count: 50, eval_count: 30 })
  }
  const report = await runLocalContextExperiment({ optIn: true, model: 'local:7b', verifyOffline() { gatesPassed = true }, fetcher })
  assert.equal(calls, 2)
  assert.equal(report.pass, false, 'A model claiming publication permission fails the experiment')
  assert.equal(report.results[1].score.correct, 3)
  assert.equal(bodies[0].model, bodies[1].model)
  assert.deepEqual(bodies[0].options, bodies[1].options)
  assert.deepEqual(bodies[0].messages[0], bodies[1].messages[0])
  assert.notEqual(bodies[0].messages[1].content, bodies[1].messages[1].content)
})

test('missing installed model and a truncated local response never trigger a pull, retry or fallback', async () => {
  let calls = 0
  await assert.rejects(runLocalContextExperiment({ optIn: true, model: 'missing:7b', verifyOffline() {}, fetcher: async () => { calls++; return Response.json({ models: [] }) } }), /installed local GGUF/)
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(runLocalContextExperiment({ optIn: true, model: 'local:7b', verifyOffline() {}, fetcher: async url => {
    calls++
    return Response.json(String(url).endsWith('/tags') ? { models: [{ name: 'local:7b', digest: 'a'.repeat(64), size: 1, details: { format: 'gguf' } }] } : { model: 'local:7b', done: true, done_reason: 'length', message: { content: '{}' }, prompt_eval_count: 10, eval_count: 192 })
  } }), /stop/)
  assert.equal(calls, 2)
})
