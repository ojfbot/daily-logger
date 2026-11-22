import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { createBoss, migrateDelivery } from '../../src/delivery-db.js'
import { JOURNAL_QUEUE, migrateJournal } from '../../src/journal-delivery.js'
import { migrateDatabase, openDatabase } from '../../src/postgres-db.js'
import { dropIdleTestDatabase } from '../database-cleanup.js'
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

test('private journal migration upgrades the earlier queue once without replacing it', { timeout: 20_000 }, async () => {
  const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
  assert.ok(configured, 'Integration proof requires a disposable PostgreSQL database')
  const url = new URL(configured)
  const name = 'dailylogger_journal_upgrade_' + randomUUID().replaceAll('-', '')
  const admin = openDatabase(url.href)
  let created = false
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    url.pathname = '/' + name
    const pool = openDatabase(url.href)
    const boss = createBoss(url.href)
    try {
      await migrateDelivery(pool, url.href)
      await migrateDatabase(pool, url.href, { journal: true })
      await boss.start()
      await boss.createQueue(JOURNAL_QUEUE, { policy: 'standard', retryLimit: 4, retryDelay: 8, expireInSeconds: 420,
        heartbeatSeconds: 15, retentionSeconds: 86400, deleteAfterSeconds: 604800 })
      const before = await boss.getQueue(JOURNAL_QUEUE)
      assert.equal(before?.retryLimit, 4)
      await Promise.all([migrateJournal(pool, url.href), migrateJournal(pool, url.href)])
      const after = await boss.getQueue(JOURNAL_QUEUE)
      assert.equal(after?.retryLimit, 8)
      assert.deepEqual(after?.createdOn, before.createdOn)
      assert.equal(after?.heartbeatSeconds, before.heartbeatSeconds)
    } finally {
      try { await boss.stop() }
      finally { await pool.end() }
    }
  } finally {
    try { if (created) await dropIdleTestDatabase(admin, name) }
    finally { await admin.end() }
  }
})
