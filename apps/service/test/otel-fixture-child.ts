// Test-only child: no SDK auto-instrumentation, credentials, or network exporter.
import { join } from 'node:path'
delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('Offline OTel fixture HTTP is disabled') }
const { SqliteSaver } = await import('@langchain/langgraph-checkpoint-sqlite')
const { readFixture } = await import('../src/fixture.js')
const { initializeRun } = await import('../src/storage.js')
const { createWorkflow } = await import('../src/workflow.js')
const { beginObservation, createOfflineTelemetry } = await import('../src/telemetry.js')
const { inMemoryMapping } = await import('./support/fixture-trace.js')
const [directory, phase, runId] = process.argv.slice(2)
if (phase !== 'start' && phase !== 'resume') throw new Error('Expected start or resume')
const fixture = readFixture()
if (phase === 'start') initializeRun(directory, fixture)
const checkpointer = SqliteSaver.fromConnString(join(directory, 'checkpoints.sqlite'))
const mapping = inMemoryMapping()
const telemetry = createOfflineTelemetry([mapping.mapper])
const observation = beginObservation(telemetry, 'delivery', { runId, workflowVersion: fixture.manifest.workflowVersion })
const workflow = createWorkflow(directory, fixture, { checkpointer, threadId: fixture.manifestDigest, nodeObservation: node => observation.child('node', { node }) })
try {
  if (phase === 'start') await workflow.start()
  else await workflow.resume(workflow.expectedApproval)
  const snapshot = await workflow.snapshot()
  const paused = snapshot.tasks.some(task => task.interrupts?.length)
  observation.end(paused ? 'paused' : 'succeeded')
  await telemetry.shutdown()
  console.log(JSON.stringify({ phase, status: paused ? 'paused' : 'complete', diagnostics: mapping.mapper.diagnostics(), spans: await mapping.spans() }))
} finally { checkpointer.db.close(); await mapping.provider.shutdown() }
