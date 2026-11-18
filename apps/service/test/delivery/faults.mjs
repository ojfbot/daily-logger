// Test-only preloader. No fault controls exist in the fixture CLI itself.
import pg from 'pg'
import { existsSync, writeFileSync } from 'node:fs'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

const fault = process.env.DELIVERY_TEST_FAULT
const original = pg.Client.prototype.query
let commandInserted = false
pg.Client.prototype.query = async function (...args) {
  const text = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''
  if (fault === 'admission-io' && text.includes('INSERT INTO dailylogger_service.fixture_runs')) throw Object.assign(new Error('injected disk failure'), { code: 'EIO' })
  if (fault === 'transient-node' && text.includes('SET nodes = nodes')) throw Object.assign(new Error('injected serialization failure'), { code: '40001' })
  const result = await original.apply(this, args)
  if (text.includes('INSERT INTO dailylogger_service.fixture_commands')) commandInserted = true
  if (fault === 'after-command-commit' && commandInserted && text === 'COMMIT') process.kill(process.pid, 'SIGKILL')
  if (fault === 'after-command-settlement' && text.includes("SET disposition='succeeded'")) process.kill(process.pid, 'SIGKILL')
  if (fault === 'after-consume' && text.includes('SET consumed_by=')) process.kill(process.pid, 'SIGKILL')
  if (fault === 'pause-node' && text.includes('SET nodes = nodes')) {
    writeFileSync(process.env.DELIVERY_TEST_MARKER, 'paused')
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (existsSync(process.env.DELIVERY_TEST_RELEASE)) { clearInterval(timer); resolve() }
      }, 20)
    })
  }
  return result
}
const originalPut = PostgresSaver.prototype.put
PostgresSaver.prototype.put = async function (...args) {
  if (fault === 'after-output' && args[1].channel_values.published) process.kill(process.pid, 'SIGKILL')
  const saved = await originalPut.apply(this, args)
  if (fault === 'after-start-checkpoint' && args[1].channel_values.collected && !args[1].channel_values.draft) process.kill(process.pid, 'SIGKILL')
  if (fault === 'after-checkpoint' && args[1].channel_values.published) process.kill(process.pid, 'SIGKILL')
  return saved
}
