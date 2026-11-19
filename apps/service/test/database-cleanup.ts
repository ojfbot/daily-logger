import assert from 'node:assert/strict'

type Admin = { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }> }

/** Only pass a uniquely named database created and owned by the calling test. */
export async function dropIdleTestDatabase(admin: Admin, database: string): Promise<void> {
  assert.match(database, /^dailylogger_[a-z_]+_[a-f0-9]{32}$/)
  const deadline = Date.now() + 2000
  // pg-pool.end() can resolve before its clients' sockets finish closing.
  // Match the HTTP suite's server-side barrier; FORCE would race those closes.
  while ((await admin.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1', [database])).rowCount !== 0) {
    assert.ok(Date.now() < deadline, 'Owned test database still has sessions after pool shutdown')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  await admin.query(`DROP DATABASE "${database}"`)
}
