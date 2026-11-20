import { Annotation, Command, END, START, StateGraph, interrupt, isGraphInterrupt } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { join } from 'node:path'
import { approvalDigest, digest, json, requireCondition, reviewFixture, type Fixture, type Review } from './fixture.js'
import { artifactFiles, recordAttempt, validateArtifacts, validateInputs, writeArtifacts } from './storage.js'
import { NOOP_SPAN, safeSpan, type ObservationSpan } from './telemetry.js'
import type { ObservationNode } from './telemetry-schema.js'

const State = Annotation.Root({
  manifestDigest: Annotation<string>,
  collected: Annotation<{ sourceCommit: string }>,
  draft: Annotation<{ articleSha256: string; actionsSha256: string }>,
  review: Annotation<Review>,
  approval: Annotation<{ digest: string; scope: string }>,
  published: Annotation<{ receiptSha256: string }>,
})

export type WorkflowState = typeof State.State

/** Observe computation without replacing its result, error or interrupt object. */
export async function observeNodeExecution<T>(observation: ObservationSpan, execute: () => Promise<T>): Promise<T> {
  observation = safeSpan(observation)
  try {
    const result = await execute()
    observation.end('succeeded')
    return result
  } catch (error) {
    let paused = false
    try { paused = isGraphInterrupt(error) } catch { /* arbitrary thrown values remain unchanged */ }
    observation.end(paused ? 'paused' : 'failed')
    throw error
  }
}

export function createWorkflow(runDir: string, fixture: Fixture, runtime: {
  checkpointer: BaseCheckpointSaver
  threadId: string
  recordNode?: (node: string) => void | Promise<void>
  assertActive?: () => void
  receiptIdentity?: { milestone: string; runId: string }
  nodeObservation?: (node: ObservationNode) => ObservationSpan
}) {
  const recordNode = runtime.recordNode ?? ((node: string) => recordAttempt(runDir, node))
  const expectedReview = reviewFixture(fixture)
  const expectedApproval = approvalDigest(fixture, expectedReview)
  const files = artifactFiles(fixture, expectedReview, expectedApproval)
  if (runtime.receiptIdentity) files['receipt.json'] = Buffer.from(json({ ...JSON.parse(files['receipt.json'].toString('utf8')), ...runtime.receiptIdentity }))
  const validate = (state: WorkflowState) => {
    runtime.assertActive?.()
    validateInputs(runDir, fixture)
    requireCondition(state.manifestDigest === fixture.manifestDigest, 'Checkpoint belongs to a stale or different input manifest')
    if (state.collected) requireCondition(state.collected.sourceCommit === fixture.manifest.source.commit, 'Checkpoint source changed')
    if (state.draft) requireCondition(state.draft.articleSha256 === expectedReview.articleSha256 && state.draft.actionsSha256 === expectedReview.actionsSha256, 'Checkpoint draft changed')
    if (state.review) requireCondition(json(state.review) === json(expectedReview), 'Checkpoint review changed')
    if (state.approval) requireCondition(state.approval.digest === expectedApproval && state.approval.scope === 'write-isolated-shadow-artifacts-only', 'Checkpoint approval changed')
    if (state.published) {
      requireCondition(state.published.receiptSha256 === digest(files['receipt.json']), 'Checkpoint receipt changed')
      validateArtifacts(runDir, files)
    }
  }
  const observedNode = <T>(name: ObservationNode, execute: (state: WorkflowState) => Promise<T>) => async (state: WorkflowState): Promise<T> => {
    let observation = NOOP_SPAN
    try { observation = safeSpan(runtime.nodeObservation?.(name) ?? NOOP_SPAN) } catch { /* optional diagnostics only */ }
    return observeNodeExecution(observation, () => execute(state))
  }

  const graph = new StateGraph(State)
    .addNode('collect_fixture', observedNode('collect_fixture', async (state) => {
      validate(state)
      await recordNode('collect_fixture')
      return { collected: { sourceCommit: fixture.manifest.source.commit } }
    }))
    .addNode('draft_fixture', observedNode('draft_fixture', async (state) => {
      validate(state)
      await recordNode('draft_fixture')
      return { draft: { articleSha256: expectedReview.articleSha256, actionsSha256: expectedReview.actionsSha256 } }
    }))
    .addNode('review_fixture', observedNode('review_fixture', async (state) => {
      validate(state)
      await recordNode('review_fixture')
      return { review: reviewFixture(fixture) }
    }))
    .addNode('human_gate', observedNode('human_gate', async (state) => {
      validate(state)
      const answer = interrupt({
        kind: 'shadow-artifact-approval',
        scope: 'write-isolated-shadow-artifacts-only',
        manifestDigest: fixture.manifestDigest,
        approvalDigest: expectedApproval,
        review: state.review,
        message: 'Inspect the frozen inputs and invariant review. This only authorizes writing the isolated fixture bundle, not publishing or admitting actions.',
      }) as { approvalDigest: string }
      requireCondition(answer?.approvalDigest === expectedApproval, 'Stale approval digest; resume rejected')
      return { approval: { digest: expectedApproval, scope: 'write-isolated-shadow-artifacts-only' } }
    }))
    .addNode('write_shadow_artifacts', observedNode('write_shadow_artifacts', async (state) => {
      validate(state)
      requireCondition(state.approval?.digest === expectedApproval, 'Shadow output requires the exact review approval')
      await recordNode('write_shadow_artifacts')
      runtime.assertActive?.()
      writeArtifacts(runDir, files)
      return { published: { receiptSha256: digest(files['receipt.json']) } }
    }))
    .addEdge(START, 'collect_fixture')
    .addEdge('collect_fixture', 'draft_fixture')
    .addEdge('draft_fixture', 'review_fixture')
    .addEdge('review_fixture', 'human_gate')
    .addEdge('human_gate', 'write_shadow_artifacts')
    .addEdge('write_shadow_artifacts', END)
    .compile({ checkpointer: runtime.checkpointer })

  const config = { configurable: { thread_id: runtime.threadId }, durability: 'sync' as const, callbacks: [] }
  const snapshot = () => graph.getState(config)
  return {
    graph, config, validate, snapshot, expectedApproval,
    start: () => graph.invoke({ manifestDigest: fixture.manifestDigest }, config),
    resume: (approval: string) => graph.invoke(new Command({ resume: { approvalDigest: approval } }), config),
    recover: () => graph.invoke(null, config),
  }
}

/** Preserve the original standalone SQLite development entry point. */
export function openWorkflow(runDir: string, fixture: Fixture) {
  const checkpointer = SqliteSaver.fromConnString(join(runDir, 'checkpoints.sqlite'))
  return {
    ...createWorkflow(runDir, fixture, { checkpointer, threadId: fixture.manifestDigest }),
    close: () => checkpointer.db.close(),
  }
}
