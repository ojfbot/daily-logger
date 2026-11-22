import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'
import { readFixture, ARTICLE_PATH, ACTIONS_PATH } from './src/fixture.ts'

const [phase, runId, resumeTargetId, startKey] = process.argv.slice(2)
const origin = process.env.DAILYLOGGER_PRIVATE_ORIGIN
const token = randomBytes(32).toString('base64url')
const csrf = randomBytes(32).toString('base64url')
const sessionHash = createHash('sha256').update(token).digest('hex')
const pool = new pg.Pool({ connectionString: process.env.DAILYLOGGER_DATABASE_URL })
const ownerHeaders = {
  Cookie: '__Host-dailylogger_session=' + token, Origin: origin, 'X-CSRF-Token': csrf,
}

function call(path, headers = {}, data) {
  return new Promise((resolve, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data)
    const req = request({
      host: '127.0.0.1', port: 4300, path,
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Host: new URL(origin).host, ...headers,
        ...(body === undefined ? {} : {
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        }),
      },
      timeout: 3000,
    }, response => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers, text,
      }))
      response.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')))
    req.end(body)
  })
}

async function waitFor(check) {
  for (let count = 0; count < 60; count++) {
    const value = await check()
    if (value) return value
    await sleep(500)
  }
  throw new Error('DailyLogger did not reach the expected state')
}

async function readRun(id) {
  const response = await call('/v1/runs/' + id, ownerHeaders)
  assert.equal(response.status, 200)
  return JSON.parse(response.text)
}

const start = key => call('/v1/fixture/runs', { ...ownerHeaders, 'Idempotency-Key': key }, {})

try {
  const denied = await waitFor(async () => {
    try {
      return await call('/v1/auth/me')
    } catch (error) {
      if (error.code === 'ECONNREFUSED') return undefined
      throw error
    }
  })
  assert.equal(denied.status, 401)
  assert.equal(denied.headers['cache-control'], 'no-store')
  await pool.query(`INSERT INTO dailylogger_service.owner_sessions
    (session_hash,actor_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')`,
    [sessionHash, 'github:' + process.env.DAILYLOGGER_OWNER_GITHUB_ID, csrf])
  const me = await call('/v1/auth/me', ownerHeaders)
  assert.equal(me.status, 200)
  assert.equal(JSON.parse(me.text).csrfToken === csrf, true)

  if (phase === 'start') {
    const key = 'nas-start-' + randomUUID()
    const bad = await call('/v1/fixture/runs', { ...ownerHeaders, 'X-CSRF-Token': 'invalid', 'Idempotency-Key': key }, {})
    assert.equal(bad.status, 403)
    const admitted = await start(key)
    assert.equal(admitted.status, 202)
    const id = JSON.parse(admitted.text).runId
    const paused = await waitFor(async () => {
      const value = await readRun(id)
      return value.state === 'awaiting_owner' && value.resumeTarget ? value : undefined
    })
    console.log(JSON.stringify({ runId: id, resumeTargetId: paused.resumeTarget.resumeTargetId, key }))
  } else {
    assert.equal(phase, 'resume')
    const paused = await readRun(runId)
    assert.equal(paused.state, 'awaiting_owner')
    assert.equal(paused.resumeTarget.resumeTargetId, resumeTargetId)
    const replay = await start(startKey)
    assert.equal(replay.status, 202)
    assert.equal(JSON.parse(replay.text).runId, runId)
    const resumed = await call('/v1/fixture/runs/' + runId + '/resumes', {
      ...ownerHeaders, 'Idempotency-Key': 'nas-resume-' + randomUUID(),
    }, { resumeTargetId })
    assert.equal(resumed.status, 202)
    const complete = await waitFor(async () => {
      const value = await readRun(runId)
      return value.state === 'fixture_complete' ? value : undefined
    })
    assert.match(complete.receiptSha256, /^[a-f0-9]{64}$/)
    const result = await pool.query('SELECT run_dir FROM dailylogger_service.fixture_runs WHERE run_id=$1', [runId])
    assert.equal(result.rows.length, 1)
    const root = result.rows[0].run_dir
    const fixture = readFixture()
    assert.deepEqual(readFileSync(join(root, 'artifacts', ARTICLE_PATH)), fixture.article)
    assert.deepEqual(readFileSync(join(root, 'artifacts', ACTIONS_PATH)), fixture.actions)
    console.log(JSON.stringify({
      runId, stoppedAndResumed: true, duplicateStayedSameRun: true,
      anonymousRequestRejected: true, invalidCsrfRejected: true,
      articleAndActionsMatch: true, receiptSha256: complete.receiptSha256,
    }))
  }
} finally {
  try {
    await pool.query('DELETE FROM dailylogger_service.owner_sessions WHERE session_hash=$1', [sessionHash])
  } finally {
    await pool.end()
  }
}
