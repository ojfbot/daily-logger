import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { z } from 'zod'
import { digest, REPO_ROOT } from '../src/fixture.js'
import { LOCAL_OPTIONS, runLocalContextExperiment } from './evals/local-context.js'
import { PERMISSION_CONTROLS, permissionCase, permissionEvidenceVerdict, PermissionAnswer, scorePermissionAnswer, SHADOW_APPROVAL, UNKNOWN_PERMISSION } from './evals/permission-case.js'

test('v1 failed result remains byte-identical and cannot silently satisfy the v2 schema', () => {
  const bytes = readFileSync(join(REPO_ROOT, 'docs/agent-service/local-context-2026-11-18.json'))
  assert.equal(digest(bytes), 'e7c4f78660654f38cfc5c6ac758547d17b5df5632fd083726d62ac30717b3d4b')
  const record = z.object({ pass: z.literal(false), results: z.array(z.object({ mode: z.string(), answer: z.unknown() })) }).parse(JSON.parse(bytes.toString('utf8')))
  const candidate = record.results.find(result => result.mode === 'candidate')
  assert.ok(candidate)
  assert.equal(PermissionAnswer.safeParse(candidate.answer).success, false)
})

test('permission verifier keeps approval scope separate from unknown or independent authority', async t => {
  for (const control of PERMISSION_CONTROLS) await t.test(control.id, () => {
    assert.deepEqual(permissionEvidenceVerdict(control.evidence), control.expected)
    assert.equal(scorePermissionAnswer(control.expected, control.expected).correct, 5)
    for (const field of ['thisApprovalAuthorizesPublication', 'publicationPermissionOutsideThisApproval'] as const) {
      const incorrect = { ...control.expected, [field]: control.expected[field] === null ? false : null }
      const score = scorePermissionAnswer(incorrect, control.expected)
      assert.equal(score.correct, 4, `${control.id}: false and null must remain distinct`)
      assert.equal(score.checks.find(check => check.field === field)?.pass, false)
    }
  })
})

test('v2 rejects unsupported global denial, false abstention, unsafe grant and malformed answers', () => {
  assert.equal(scorePermissionAnswer(SHADOW_APPROVAL, SHADOW_APPROVAL).correct, 5)
  for (const value of [
    { ...SHADOW_APPROVAL, thisApprovalAuthorizesPublication: null },
    { ...SHADOW_APPROVAL, thisApprovalAuthorizesPublication: true },
    { ...SHADOW_APPROVAL, publicationPermissionOutsideThisApproval: false },
    { ...SHADOW_APPROVAL, publicationPermissionOutsideThisApproval: true },
  ]) assert.equal(scorePermissionAnswer(value, SHADOW_APPROVAL).correct, 4)
  assert.equal(scorePermissionAnswer({ ...SHADOW_APPROVAL, publicationAllowed: false }, SHADOW_APPROVAL).formatValid, false)
  assert.equal(scorePermissionAnswer({ ...SHADOW_APPROVAL, thisApprovalAuthorizesPublication: 'false' }, SHADOW_APPROVAL).formatValid, false)
  assert.equal(scorePermissionAnswer(SHADOW_APPROVAL, UNKNOWN_PERMISSION).unsupportedAnswers, 4)
  assert.equal(scorePermissionAnswer(UNKNOWN_PERMISSION, UNKNOWN_PERMISSION).correct, 5)
})

test('v2 request and five-field scorecard are frozen before inference and use the original local limits', async () => {
  let offlinePassed = false, calls = 0
  const bodies: { model: string; options: unknown; messages: { content: string }[] }[] = []
  const RequestBody = z.object({ model: z.literal('local:7b'), stream: z.literal(false), format: z.object({ properties: z.record(z.string(), z.unknown()) }), options: z.unknown(), messages: z.array(z.object({ content: z.string() })).length(2) })
  const result = await runLocalContextExperiment({
    optIn: true, model: 'local:7b', caseVersion: 'v2', verifyOffline() { offlinePassed = true },
    fetcher: async (url, init) => {
      assert.ok(offlinePassed)
      if (String(url).endsWith('/tags')) return Response.json({ models: [{ name: 'local:7b', digest: 'a'.repeat(64), size: 1, details: { format: 'gguf' } }] })
      const body = init?.body; assert.ok(typeof body === 'string')
      const request = RequestBody.parse(JSON.parse(body)); bodies.push(request)
      assert.deepEqual(Object.keys(request.format.properties).sort(), Object.keys(SHADOW_APPROVAL).sort())
      const answer = calls++ === 0 ? UNKNOWN_PERMISSION : SHADOW_APPROVAL
      return Response.json({ model: 'local:7b', done: true, done_reason: 'stop', message: { content: JSON.stringify(answer) }, prompt_eval_count: 100, eval_count: 40 })
    },
  })
  assert.equal(calls, 2)
  assert.equal(result.case.id, 'fixture-context-authorization-v2')
  assert.equal(result.pass, true)
  assert.deepEqual(result.results.map(result => result.score.correct), [5, 5])
  assert.deepEqual(result.results.map(result => result.score.groundedAnswers), [0, 4])
  assert.deepEqual(bodies[0].options, LOCAL_OPTIONS)
  assert.deepEqual(bodies[0].options, bodies[1].options)
  assert.deepEqual(bodies[0].messages[0], bodies[1].messages[0])
  const fixture = permissionCase()
  assert.equal(bodies[0].messages[1].content, fixture.baseline)
  assert.equal(bodies[1].messages[1].content, fixture.candidate)
  assert.equal(fixture.contextDigest, digest(fixture.candidate))
  assert.deepEqual(permissionEvidenceVerdict(JSON.parse(fixture.candidate)), SHADOW_APPROVAL)
  assert.deepEqual(permissionEvidenceVerdict({ approval: { authorizedOperations: 'publish-article' } }), UNKNOWN_PERMISSION)
})

test('v2 makes zero requests when opt-in is absent or either offline gate fails', async () => {
  let requests = 0
  const fetcher: typeof fetch = async () => { requests++; throw new Error('No model request expected') }
  await assert.rejects(runLocalContextExperiment({ optIn: false, model: 'local:7b', caseVersion: 'v2', verifyOffline() { assert.fail('Unexpected gate') }, fetcher }), /opt in/)
  for (const gate of ['type-check', 'offline fault suite']) await assert.rejects(runLocalContextExperiment({ optIn: true, model: 'local:7b', caseVersion: 'v2', verifyOffline() { throw new Error(gate) }, fetcher }), error => error instanceof Error && error.message === gate)
  assert.equal(requests, 0)
})
