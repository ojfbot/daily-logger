import { Annotation, Command, END, START, StateGraph, interrupt } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { join } from 'node:path'
import { approvalDigest, digest, json, requireCondition, reviewFixture, type Fixture, type Review } from './fixture.js'
import { artifactFiles, recordAttempt, validateArtifacts, validateInputs, writeArtifacts } from './storage.js'

const State = Annotation.Root({
  manifestDigest: Annotation<string>,
  collected: Annotation<{ sourceCommit: string }>,
  draft: Annotation<{ articleSha256: string; actionsSha256: string }>,
  review: Annotation<Review>,
  approval: Annotation<{ digest: string; scope: string }>,
  published: Annotation<{ receiptSha256: string }>,
})

export type WorkflowState = typeof State.State

export function openWorkflow(runDir: string, fixture: Fixture) {
  const checkpointer = SqliteSaver.fromConnString(join(runDir, 'checkpoints.sqlite'))
  const expectedReview = reviewFixture(fixture)
  const expectedApproval = approvalDigest(fixture, expectedReview)
  const files = artifactFiles(fixture, expectedReview, expectedApproval)
  const validate = (state: WorkflowState) => {
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

  const graph = new StateGraph(State)
    .addNode('collect_fixture', async (state) => {
      validate(state)
      recordAttempt(runDir, 'collect_fixture')
      return { collected: { sourceCommit: fixture.manifest.source.commit } }
    })
    .addNode('draft_fixture', async (state) => {
      validate(state)
      recordAttempt(runDir, 'draft_fixture')
      return { draft: { articleSha256: expectedReview.articleSha256, actionsSha256: expectedReview.actionsSha256 } }
    })
    .addNode('review_fixture', async (state) => {
      validate(state)
      recordAttempt(runDir, 'review_fixture')
      return { review: reviewFixture(fixture) }
    })
    .addNode('human_gate', async (state) => {
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
    })
    .addNode('write_shadow_artifacts', async (state) => {
      validate(state)
      requireCondition(state.approval?.digest === expectedApproval, 'Shadow output requires the exact review approval')
      recordAttempt(runDir, 'write_shadow_artifacts')
      writeArtifacts(runDir, files)
      return { published: { receiptSha256: digest(files['receipt.json']) } }
    })
    .addEdge(START, 'collect_fixture')
    .addEdge('collect_fixture', 'draft_fixture')
    .addEdge('draft_fixture', 'review_fixture')
    .addEdge('review_fixture', 'human_gate')
    .addEdge('human_gate', 'write_shadow_artifacts')
    .addEdge('write_shadow_artifacts', END)
    .compile({ checkpointer })

  const config = { configurable: { thread_id: fixture.manifestDigest }, durability: 'sync' as const, callbacks: [] }
  const snapshot = () => graph.getState(config)
  return {
    graph, config, validate, snapshot, expectedApproval,
    start: () => graph.invoke({ manifestDigest: fixture.manifestDigest }, config),
    resume: (approval: string) => graph.invoke(new Command({ resume: { approvalDigest: approval } }), config),
    recover: () => graph.invoke(null, config),
    close: () => checkpointer.db.close(),
  }
}
