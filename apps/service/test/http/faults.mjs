import pg from 'pg'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const readFileSync = fs.readFileSync
fs.readFileSync = function (...args) {
  if (process.env.HTTP_TEST_FAULT === 'response_schema_read' && String(args[0]).endsWith('/docs/agent-service/editorial-api-responses.schema.json')) {
    delete process.env.HTTP_TEST_FAULT
    throw new Error('Injected response schema setup failure')
  }
  return readFileSync.apply(this, args)
}
syncBuiltinESMExports()

const query = pg.Client.prototype.query
const transactions = new WeakSet()
pg.Client.prototype.query = function (...args) {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''
  if (process.env.HTTP_TEST_FAULT === 'lost_commit_response' && sql.includes('INSERT INTO dailylogger_service.fixture_http_requests')) transactions.add(this)
  const result = query.apply(this, args)
  if (process.env.HTTP_TEST_FAULT === 'rollback_admission' && sql.includes('INSERT INTO dailylogger_service.fixture_http_requests')) {
    delete process.env.HTTP_TEST_FAULT
    return result.then(() => { throw new Error('Injected failure after provisional HTTP binding') })
  }
  if (sql === 'COMMIT' && transactions.has(this)) {
    transactions.delete(this)
    delete process.env.HTTP_TEST_FAULT
    return result.then(() => { throw Object.assign(new Error('Injected response loss after actual COMMIT'), { code: '08006' }) })
  }
  return result
}
