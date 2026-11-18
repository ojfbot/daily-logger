import pg from 'pg'

const query = pg.Client.prototype.query
const transactions = new WeakSet()
pg.Client.prototype.query = function (...args) {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''
  if (process.env.HTTP_TEST_FAULT === 'lost_commit_response' && sql.includes('INSERT INTO dailylogger_service.fixture_http_requests')) transactions.add(this)
  const result = query.apply(this, args)
  if (sql === 'COMMIT' && transactions.has(this)) {
    transactions.delete(this)
    delete process.env.HTTP_TEST_FAULT
    return result.then(() => { throw Object.assign(new Error('Injected response loss after actual COMMIT'), { code: '08006' }) })
  }
  return result
}
