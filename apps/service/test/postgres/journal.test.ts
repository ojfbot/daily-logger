import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'

test('private drafting survives process crashes, checkpoint interruption and provider failure', { timeout: 240_000 }, async () => {
  const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
  assert.ok(configured, 'Integration proof requires a disposable PostgreSQL database')
  const { stdout } = await promisify(execFile)(process.execPath, ['runtime/journal-probe.mjs'], {
    cwd: new URL('../../', import.meta.url), env: { ...process.env, DAILYLOGGER_DATABASE_URL: configured }, timeout: 230_000,
  })
  const proof = JSON.parse(stdout)
  assert.equal(proof.workerRestarts, 3)
  assert.equal(proof.completedCallsRepeated, 0)
  assert.equal(proof.cachedResultRecoveredBeforeCheckpoint, true)
  assert.equal(proof.fullRetryBudgetVerified, true)
  assert.equal(proof.unknownOutcomeHeld, true)
  assert.equal(proof.terminalDeliveryRedriven, true)
})
