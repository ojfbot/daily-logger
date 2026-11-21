// Offline subprocess harness only; never imported by an application entry point.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('Test fixture HTTP is disabled') }
const { SqliteSaver } = await import('@langchain/langgraph-checkpoint-sqlite')
const { readFixture } = await import('../src/fixture.js')
const { initializeRun } = await import('../src/storage.js')
const { createWorkflow } = await import('../src/workflow.js')
const { beginObservation, createOfflineTelemetry, NOOP_TELEMETRY } = await import('../src/telemetry.js')
const [directory, command, mode, capture, runId] = process.argv.slice(2)
const records: unknown[] = []
const telemetry = mode === 'disabled' ? NOOP_TELEMETRY : createOfflineTelemetry([{ export: batch => {
  if (mode === 'throw') throw new Error('SECRET-fixture-export-failure')
  if (mode === 'stuck') return new Promise<void>(() => {})
  records.push(...batch)
} }])
const fixture = readFixture()
if (command === 'start') initializeRun(directory, fixture)
const checkpointer = SqliteSaver.fromConnString(join(directory, 'checkpoints.sqlite'))
const observation = beginObservation(telemetry, 'delivery', { runId, workflowVersion: fixture.manifest.workflowVersion })
const workflow = createWorkflow(directory, fixture, { checkpointer, threadId: fixture.manifestDigest, nodeObservation: node => observation.child('node', { node }) })
try {
  if (command === 'start') await workflow.start()
  else await workflow.resume(workflow.expectedApproval)
  const snapshot = await workflow.snapshot()
  workflow.validate(snapshot.values)
  const paused = snapshot.tasks.some(task => task.interrupts?.length)
  observation.end(paused ? 'paused' : 'succeeded')
  console.log(JSON.stringify({ approval: workflow.expectedApproval, state: snapshot.values, status: paused ? 'paused' : 'complete', receipt: snapshot.values.published ? readFileSync(join(directory, 'artifacts/receipt.json'), 'utf8') : null }))
} catch (error) { observation.end('failed'); throw error }
finally { checkpointer.db.close(); await telemetry.shutdown(); writeFileSync(capture, JSON.stringify(records)) }
