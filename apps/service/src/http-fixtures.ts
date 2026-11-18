import { join } from 'node:path'
import type pg from 'pg'
import type { PgBoss } from 'pg-boss'
import { z } from 'zod'
import { admitCommandInTransaction } from './delivery-commands.js'
import { digest, json } from './fixture.js'
import { HttpError, stored } from './http-db.js'

export type FixtureIntent = { operation: 'start'; payload: Record<string, never> }
  | { operation: 'resume'; payload: { runId: string; resumeTargetId: string } }
  | { operation: 'recover' | 'cancel'; payload: { runId: string } }

const admissionBody = z.union([
  z.strictObject({ admission: z.literal('admitted'), commandId: z.uuid(), runId: z.uuid() }),
  z.strictObject({ admission: z.literal('rejected'), commandId: z.uuid(), runId: z.null(), error: z.enum(['run_admission_conflict', 'queue_run_not_found', 'run_cancelled', 'resume_target_stale']) }),
])

export function parsedAdmission(status: number, body: string) {
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new HttpError(503, 'integrity_rejected') }
  const parsed = stored(admissionBody, value)
  if (status !== (parsed.admission === 'admitted' ? 202 : 409)) throw new HttpError(503, 'integrity_rejected')
  return parsed
}

export function checkedAdmission(row: { command_id: string; run_id: string | null; admission: string; response_status: number; response_text: string }) {
  const response = parsedAdmission(row.response_status, row.response_text)
  if (response.commandId !== row.command_id || response.runId !== row.run_id || response.admission !== row.admission) throw new HttpError(503, 'integrity_rejected')
  return response
}

export async function admitHttpFixture(client: pg.PoolClient, boss: PgBoss, actorId: string, key: string, intent: FixtureIntent, fixtureRoot: string) {
  const route = intent.operation === 'start' ? 'fixture/runs' : `fixture/runs/${intent.payload.runId}/${intent.operation}`
  const intentText = json({ schemaVersion: 1, route, ...intent })
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`dailylogger-command:${actorId}:${key}`])
  const existing = await client.query(`SELECT c.command_id,c.run_id,c.admission,c.response_status,c.response_text,h.intent_text
    FROM dailylogger_service.fixture_commands c LEFT JOIN dailylogger_service.fixture_http_requests h
      ON h.command_id=c.command_id AND h.actor_id=c.actor_id AND h.idempotency_key=c.idempotency_key AND h.schema_version=1
    WHERE c.actor_id=$1 AND c.idempotency_key=$2`, [actorId, key])
  if (existing.rows.length) {
    const row = stored(z.object({ command_id: z.uuid(), run_id: z.uuid().nullable(), admission: z.enum(['admitted', 'rejected']),
      response_status: z.number().int(), response_text: z.string(), intent_text: z.string().nullable() }), existing.rows[0])
    if (row.intent_text !== intentText) return { status: 409, body: json({ error: 'idempotency_conflict', commandId: row.command_id }) }
    checkedAdmission(row)
    return { status: row.response_status, body: row.response_text }
  }
  const payload = intent.operation === 'start'
    ? { runDir: join(fixtureRoot, `http-${digest(`${actorId}\0${key}\0${intentText}`)}`) }
    : intent.payload
  const response = await admitCommandInTransaction(client, boss, { schemaVersion: 1, actorId, key, operation: intent.operation, payload })
  const body = parsedAdmission(response.status, response.body)
  await client.query(`INSERT INTO dailylogger_service.fixture_http_requests(actor_id,idempotency_key,schema_version,intent_text,command_id)
    VALUES($1,$2,1,$3,$4)`, [actorId, key, intentText, body.commandId])
  return response
}
