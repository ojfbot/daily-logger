import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { readFixture, requireCondition } from './fixture.js'

// This fixture executable has no configured network integrations. In particular
// ambient LangSmith configuration must not turn this offline replay into a trace export.
delete process.env.LANGCHAIN_TRACING
process.env.LANGCHAIN_TRACING_V2 = 'false'
process.env.LANGSMITH_TRACING = 'false'
globalThis.fetch = async () => { throw new Error('Network access is disabled in the offline fixture executable') }

async function main() {
  const { positionals, values } = parseArgs({ options: { 'run-dir': { type: 'string' }, 'approval-digest': { type: 'string' } }, allowPositionals: true })
  const [command] = positionals
  if (positionals.length !== 1 || !['start', 'status', 'resume', 'recover'].includes(command) || !values['run-dir']) {
    throw new Error('Usage: service:shadow start|status|resume|recover --run-dir /absolute/outside/git [--approval-digest SHA256]')
  }
  if (command !== 'resume' && values['approval-digest']) throw new Error('--approval-digest is only valid with resume')
  const { acquireRunLock, checkedRunDir, initializeRun, validateInputs } = await import('./storage.js')
  const { openWorkflow } = await import('./workflow.js')
  const runDir = checkedRunDir(values['run-dir'])
  const fixture = readFixture()
  if (command === 'start' && !existsSync(runDir)) initializeRun(runDir, fixture)
  validateInputs(runDir, fixture)
  const unlock = acquireRunLock(runDir)
  let workflow: ReturnType<typeof openWorkflow> | undefined
  try {
    workflow = openWorkflow(runDir, fixture)
    let snapshot = await workflow.snapshot()
    const hasCheckpoint = Boolean(snapshot.values.manifestDigest)
    if (hasCheckpoint) workflow.validate(snapshot.values)
    if (command === 'start') {
      requireCondition(!hasCheckpoint, 'Run already started; use status, resume, or recover')
      await workflow.start()
    } else {
      requireCondition(hasCheckpoint, 'No checkpoint found; use start')
      if (command === 'resume') {
        requireCondition(values['approval-digest'] === workflow.expectedApproval, 'Stale or missing approval digest; resume rejected')
        if (!snapshot.values.published) {
          requireCondition(snapshot.next.includes('human_gate') && snapshot.tasks.some(task => (task.interrupts?.length ?? 0) > 0), 'Run is not awaiting approval; use recover for a failed step')
          await workflow.resume(values['approval-digest']!)
        }
      }
      if (command === 'recover' && !snapshot.values.published) {
        // Recovery cannot silently approve the human interrupt.
        if (!snapshot.tasks.some(task => (task.interrupts?.length ?? 0) > 0)) await workflow.recover()
      }
    }
    snapshot = await workflow.snapshot()
    workflow.validate(snapshot.values)
    const awaitingApproval = snapshot.tasks.some(task => (task.interrupts?.length ?? 0) > 0)
    console.log(JSON.stringify({
      status: snapshot.values.published ? 'complete' : awaitingApproval ? 'awaiting-approval' : 'recoverable',
      milestone: 'M1A offline fixture checkpoint',
      runDir,
      manifestDigest: fixture.manifestDigest,
      approvalDigest: workflow.expectedApproval,
      checkpointId: snapshot.config?.configurable?.checkpoint_id,
      completedSteps: [
        snapshot.values.collected && 'collect_fixture', snapshot.values.draft && 'draft_fixture',
        snapshot.values.review && 'review_fixture', snapshot.values.approval && 'human_gate',
        snapshot.values.published && 'write_shadow_artifacts',
      ].filter(Boolean),
      next: snapshot.next,
      review: snapshot.values.review ?? null,
      paths: {
        manifest: join(runDir, 'manifest.json'),
        inputs: join(runDir, 'inputs'),
        checkpoint: join(runDir, 'checkpoints.sqlite'),
        artifacts: snapshot.values.published ? join(runDir, 'artifacts') : null,
        receipt: snapshot.values.published ? join(runDir, 'artifacts/receipt.json') : null,
      },
    }, null, 2))
  } finally { workflow?.close(); unlock() }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
