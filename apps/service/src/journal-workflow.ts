import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import type pg from 'pg'
import { callJournalModel, JOURNAL_ATTEMPTS, modelRequest, validateJournalOutput, type JournalOutput, type JournalRequest, type JournalRouting, type JournalStep } from './journal-model.js'
import type { ObservationSpan } from './telemetry.js'

const JournalState = Annotation.Root({
  requestDigest: Annotation<string>(),
  draft: Annotation<JournalOutput>(),
  review: Annotation<JournalOutput>(),
  revise: Annotation<JournalOutput>(),
})
type CallRow = { attempt: number; status: 'complete' | 'dispatching' | 'rejected' | 'uncertain' | 'invalid'; request_digest: string; result: string }
export class JournalBlocked extends Error {
  constructor(readonly reason: string) { super(reason) }
}
export class JournalRetry extends Error {}

async function executeStep(client: pg.PoolClient, assertActive: () => void, runId: string, step: JournalStep, request: JournalRequest, routing: JournalRouting,
  observation: ObservationSpan, state: Partial<typeof JournalState.State>): Promise<JournalOutput> {
  const call = modelRequest(step, request, routing, state.draft, state.review)
  const { rows } = await client.query<CallRow>(`SELECT attempt,status,request_digest,result FROM dailylogger_service.journal_model_calls
    WHERE run_id=$1 AND step=$2 ORDER BY attempt DESC LIMIT 1`, [runId, step])
  const previous = rows[0]
  if (previous && previous.request_digest !== call.requestDigest) throw new JournalBlocked('model_request_changed')
  if (previous?.status === 'complete') {
    const result = validateJournalOutput(step, JSON.parse(previous.result) as unknown, request.reportDate)
    if (!result) throw new JournalBlocked('stored_model_result_invalid')
    observation.event('node', 'inspection', { node: step, retryCount: previous.attempt - 1 })
    return result
  }
  if (previous?.status === 'dispatching') {
    await client.query(`UPDATE dailylogger_service.journal_model_calls SET status='uncertain',finished_at=now()
      WHERE run_id=$1 AND step=$2 AND attempt=$3`, [runId, step, previous.attempt])
    throw new JournalBlocked('model_outcome_uncertain')
  }
  if (previous?.status === 'uncertain') throw new JournalBlocked('model_outcome_uncertain')
  if (previous?.status === 'invalid') throw new JournalBlocked('model_output_invalid')
  const attempt = (previous?.attempt ?? 0) + 1
  if (attempt > JOURNAL_ATTEMPTS) throw new JournalBlocked('model_retries_exhausted')

  // Commit the dispatch marker before network I/O and the result before letting LangGraph advance.
  await client.query(`INSERT INTO dailylogger_service.journal_model_calls (run_id,step,attempt,request_digest,status)
    VALUES ($1,$2,$3,$4,'dispatching')`, [runId, step, attempt, call.requestDigest])
  assertActive()
  const span = observation.child('node', { node: step, retryCount: attempt - 1 })
  try {
    const outcome = await callJournalModel(step, request.reportDate, call)
    assertActive()
    await client.query(`UPDATE dailylogger_service.journal_model_calls SET status=$4,result=$5,finished_at=now()
      WHERE run_id=$1 AND step=$2 AND attempt=$3 AND status='dispatching'`,
    [runId, step, attempt, outcome.status, outcome.status === 'complete' ? JSON.stringify(outcome.result) : null])
    if (outcome.status === 'complete') {
      span.end('succeeded')
      return outcome.result
    }
    if (outcome.status === 'rejected' && attempt < JOURNAL_ATTEMPTS) {
      span.end('retrying')
      throw new JournalRetry('Model provider rejected the request before inference')
    }
    if (outcome.status === 'rejected') throw new JournalBlocked('model_retries_exhausted')
    throw new JournalBlocked(outcome.status === 'invalid' ? 'model_output_invalid' : 'model_outcome_uncertain')
  } catch (error) {
    if (!(error instanceof JournalRetry)) span.end('failed')
    throw error
  }
}

export async function runJournalGraph(client: pg.PoolClient, checkpointer: BaseCheckpointSaver, assertActive: () => void, runId: string,
  request: JournalRequest, requestDigest: string, routing: JournalRouting, observation: ObservationSpan) {
  const execute = (step: JournalStep, state: typeof JournalState.State) => {
    if (state.requestDigest !== requestDigest) throw new JournalBlocked('journal_checkpoint_input_changed')
    return executeStep(client, assertActive, runId, step, request, routing, observation,
      { draft: state.draft, review: state.review })
  }
  const graph = new StateGraph(JournalState)
    .addNode('generate_draft', async state => ({ draft: await execute('draft', state) }))
    .addNode('review_draft', async state => ({ review: await execute('review', state) }))
    .addNode('revise_draft', async state => ({ revise: await execute('revise', state) }))
    .addEdge(START, 'generate_draft')
    .addEdge('generate_draft', 'review_draft')
    .addEdge('review_draft', 'revise_draft')
    .addEdge('revise_draft', END)
    .compile({ checkpointer })
  const config = { configurable: { thread_id: runId }, durability: 'sync' as const, callbacks: [] }
  const snapshot = await graph.getState(config)
  const result = !snapshot.config?.configurable?.checkpoint_id ? await graph.invoke({ requestDigest }, config)
    : snapshot.next.length ? await graph.invoke(null, config) : snapshot.values
  if (result.requestDigest !== requestDigest || !validateJournalOutput('revise', result.revise, request.reportDate)) {
    throw new JournalBlocked('journal_checkpoint_incomplete')
  }
}
