import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ACTIONS_PATH, ARTICLE_PATH, REPO_ROOT } from '../src/fixture.js'
import type { Observation } from '../src/telemetry-schema.js'

test('disabled, enabled, failed and stuck export preserve fixture bytes, approvals and restart/human-wait behavior', () => {
  const root = mkdtempSync(join(tmpdir(), 'dailylogger-telemetry-'))
  try {
    const results = ['disabled', 'capture', 'throw', 'stuck'].map(mode => {
      const directory = join(root, mode), runId = randomUUID()
      const calls = ['start', 'resume'].map(command => {
        const capture = join(root, `${mode}-${command}.json`)
        const result = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'apps/service/test/telemetry-fixture-child.ts'), directory, command, mode, capture, runId], {
          cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000,
          env: { ...process.env, LANGCHAIN_TRACING: 'true', LANGCHAIN_TRACING_V2: 'true', LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: 'SECRET-never-export', LANGSMITH_ENDPOINT: 'http://127.0.0.1:1' },
        })
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stderr, '')
        return { value: JSON.parse(result.stdout), records: JSON.parse(readFileSync(capture, 'utf8')) as Observation[] }
      })
      assert.equal(calls[0].value.status, 'paused')
      assert.equal(calls[1].value.status, 'complete')
      if (mode === 'capture') {
        for (const call of calls) {
          assert.ok(call.records.every(record => record.runId === runId))
          const starts = call.records.filter(record => record.phase === 'start')
          const ends = call.records.filter(record => record.phase === 'end')
          assert.deepEqual(starts.map(record => record.observationId).sort(), ends.map(record => record.observationId).sort(), 'No span remains open during owner wait')
          assert.ok(ends.every(record => typeof record.durationMs === 'number' && record.durationMs >= 0))
          assert.equal(new Set(call.records.map(record => record.traceId)).size, 1)
          assert.ok(call.records.every(record => record.attemptId === undefined), 'SQLite fixture must not invent durable PG attempt IDs')
        }
        assert.notEqual(calls[0].records[0].traceId, calls[1].records[0].traceId)
        assert.equal(calls[0].records.find(record => record.node === 'human_gate' && record.phase === 'end')?.outcome, 'paused')
        assert.equal(calls[1].records.find(record => record.node === 'human_gate' && record.phase === 'end')?.outcome, 'succeeded')
      } else assert.deepEqual(calls.map(call => call.records), [[], []])
      return { calls: calls.map(call => call.value), artifacts: [ARTICLE_PATH, ACTIONS_PATH, 'receipt.json'].map(path => readFileSync(join(directory, 'artifacts', path))) }
    })
    for (const observed of results.slice(1)) assert.deepEqual(observed, results[0], 'Telemetry cannot change graph state, approval or article/action/receipt bytes')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
