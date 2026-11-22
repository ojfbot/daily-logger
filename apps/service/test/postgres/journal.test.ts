import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { test } from 'node:test'
import pg from 'pg'
import { dropIdleTestDatabase } from '../database-cleanup.js'

test('private draft, review and revision recover from worker crashes and provider rejection', { timeout: 145_000 }, async () => {
  const configured = process.env.DAILYLOGGER_TEST_DATABASE_URL
  assert.ok(configured, 'Integration proof requires a disposable PostgreSQL database')
  const url = new URL(configured)
  const name = 'dailylogger_journal_' + randomUUID().replaceAll('-', '')
  const admin = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 })
  let created = false
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    url.pathname = '/' + name
    const { stdout } = await promisify(execFile)(process.execPath, ['runtime/journal-probe.mjs'], {
      cwd: new URL('../../', import.meta.url), env: { ...process.env, DAILYLOGGER_DATABASE_URL: url.href }, timeout: 135_000,
    })
    const proof = JSON.parse(stdout)
    assert.equal(proof.workerRestarts, 2)
    assert.equal(proof.completedCallsRepeated, 0)
    assert.equal(proof.unknownOutcomeHeld, true)
  } finally {
    try { if (created) await dropIdleTestDatabase(admin, name) }
    finally { await admin.end() }
  }
})
