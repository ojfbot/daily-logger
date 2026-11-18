import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ACTIONS_PATH, ARTICLE_PATH, REPO_ROOT, readFixture } from '../src/fixture.js'
import type { Observation } from '../src/telemetry-schema.js'
import { fixtureTraceFailures, inMemoryMapping, SegmentEvidence } from './support/fixture-trace.js'

test('independent oracle reconciles every native OTel edge across separate fixture processes and rejects planted defects', async t => {
  const root = mkdtempSync(join(tmpdir(), 'dailylogger-otel-oracle-')), directory = join(root, 'run'), runId = randomUUID()
  try {
    const segments = ['start', 'resume'].map(phase => {
      const child = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/test/otel-fixture-child.ts'), directory, phase, runId], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15_000 })
      assert.equal(child.status, 0, child.stderr)
      assert.equal(child.stderr, '')
      if (phase === 'start') assert.equal(existsSync(join(directory, 'artifacts')), false, 'Owner wait must write no artifacts')
      return SegmentEvidence.parse(JSON.parse(child.stdout))
    })
    assert.deepEqual(fixtureTraceFailures(segments, runId), [])
    const fixture = readFixture()
    assert.deepEqual(readFileSync(join(directory, 'artifacts', ARTICLE_PATH)), fixture.article)
    assert.deepEqual(readFileSync(join(directory, 'artifacts', ACTIONS_PATH)), fixture.actions)
    const receipt: unknown = JSON.parse(readFileSync(join(directory, 'artifacts/receipt.json'), 'utf8'))
    assert.equal(JSON.stringify(receipt).includes('langsmith'), false)

    const defects = {
      'missing node': (copy: typeof segments) => { copy[0].spans = copy[0].spans.filter(span => span.attributes['langsmith.metadata.dailylogger_node'] !== 'review_fixture') },
      'duplicate span': (copy: typeof segments) => { copy[0].spans.push(structuredClone(copy[0].spans[0])) },
      'wrong parent': (copy: typeof segments) => { const node = copy[0].spans.find(span => span.name === 'dailylogger.node'); assert.ok(node); node.parentSpanId = 'f'.repeat(16) },
      'split child trace': (copy: typeof segments) => { const node = copy[0].spans.find(span => span.name === 'dailylogger.node'); assert.ok(node); node.traceId = 'f'.repeat(32) },
      'wrong thread': (copy: typeof segments) => { copy[1].spans[0].attributes['langsmith.trace.session_id'] = randomUUID() },
      'false wait completion': (copy: typeof segments) => { const gate = copy[0].spans.find(span => span.attributes['langsmith.metadata.dailylogger_node'] === 'human_gate'); assert.ok(gate); gate.attributes['langsmith.metadata.dailylogger_outcome'] = 'succeeded' },
      'open span hidden by finished export': (copy: typeof segments) => { copy[0].diagnostics.openSpans = 1 },
      'reused restart trace': (copy: typeof segments) => { const root = copy[0].spans.find(span => span.name === 'dailylogger.delivery'); assert.ok(root); for (const span of copy[1].spans) span.traceId = root.traceId },
    }
    for (const [name, mutate] of Object.entries(defects)) await t.test(name, () => {
      const copy = structuredClone(segments); mutate(copy)
      assert.notDeepEqual(fixtureTraceFailures(copy, runId), [], 'A broken capture must never receive a passing score')
    })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('real OTel provider exposes incomplete pairs, orphan parents, duplicate starts and failed outcomes', async t => {
  const record = (phase: Observation['phase'], extra: Partial<Observation> = {}): Observation => ({ schemaVersion: 1, instrumentationVersion: 's05a-offline-v1', kind: 'delivery', phase, traceId: randomUUID(), observationId: randomUUID(), at: Date.now(), ...extra })
  for (const name of ['orphan', 'missing-start', 'missing-end', 'duplicate-start', 'failed', 'late-bound-run'] as const) await t.test(name, async () => {
    const mapping = inMemoryMapping(), id = randomUUID(), runId = randomUUID()
    try {
      if (name === 'orphan') mapping.mapper.export([record('start', { parentId: randomUUID() })])
      else if (name === 'missing-start') mapping.mapper.export([record('end')])
      else {
        const start = record('start', { observationId: id })
        mapping.mapper.export([start])
        if (name === 'duplicate-start') mapping.mapper.export([start])
        if (name !== 'missing-end') mapping.mapper.export([record('end', { observationId: id, traceId: start.traceId, runId, outcome: name === 'failed' ? 'failed' : 'succeeded' })])
      }
      const spans = await mapping.spans(), d = mapping.mapper.diagnostics()
      if (name === 'orphan') { assert.equal(d.missingParents, 1); assert.deepEqual(spans, []) }
      if (name === 'missing-start') { assert.equal(d.missingStarts, 1); assert.deepEqual(spans, []) }
      if (name === 'missing-end') { assert.equal(d.openSpans, 1); assert.deepEqual(spans, [], 'No invented terminal span for interrupted work') }
      if (name === 'duplicate-start') { assert.equal(d.duplicateStarts, 1); assert.equal(spans.length, 1) }
      if (name === 'failed') { assert.equal(spans.length, 1); assert.equal(spans[0].statusCode, 2) }
      if (name === 'late-bound-run') { assert.equal(spans.length, 1); assert.equal(spans[0].attributes['langsmith.trace.session_id'], runId) }
    } finally { await mapping.provider.shutdown() }
  })
})
