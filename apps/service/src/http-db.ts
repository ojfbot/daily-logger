import type pg from 'pg'
import { z } from 'zod'

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

export function stored<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(503, 'integrity_rejected')
  return result.data
}

export function input<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpError(400, 'invalid_request')
  return result.data
}

export interface HttpReader {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

// The early cutoff reserves time to close the connection before the HTTP deadline.
export async function readSnapshot<T>(pool: pg.Pool, cancellations: pg.Pool, startedAt: number, signal: AbortSignal, read: (client: HttpReader) => Promise<T>): Promise<T> {
  const remaining = startedAt + 850 - performance.now()
  if (remaining <= 150 || signal.aborted) throw new HttpError(503, 'read_unavailable')
  let client: pg.PoolClient | undefined
  let released = false
  let expired = false
  let backendPid: number | undefined
  let cancellation: Promise<void> | undefined
  const release = (destroy = false) => {
    if (client && !released) { released = true; client.release(destroy) }
  }
  let rejectDeadline: (error: Error) => void = () => {}
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject })
  const abort = () => {
    if (expired) return
    expired = true
    cancellation = (async () => {
      if (backendPid && !released) await cancellations.query('SELECT pg_cancel_backend($1)', [backendPid]).catch(() => {})
      release(true)
      rejectDeadline(new HttpError(503, 'read_unavailable'))
    })()
  }
  const timer = setTimeout(abort, remaining)
  signal.addEventListener('abort', abort, { once: true })
  const operation = async () => {
    client = await pool.connect()
    if (expired || signal.aborted) { release(true); throw new HttpError(503, 'read_unavailable') }
    const owned = client
    const reader: HttpReader = { query: (text, values) => {
      if (expired || signal.aborted || performance.now() >= startedAt + 850) {
        abort()
        return Promise.reject(new HttpError(503, 'read_unavailable'))
      }
      return owned.query(text, values)
    } }
    try {
      backendPid = stored(z.object({ pid: z.number().int().positive() }), (await reader.query('SELECT pg_backend_pid() AS pid')).rows[0]).pid
      await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const sqlBudget = Math.max(1, Math.floor(startedAt + 750 - performance.now()))
      await reader.query(`SET LOCAL statement_timeout = '${sqlBudget}ms'`)
      const result = await read(reader)
      await reader.query('COMMIT')
      if (expired) { await cancellation; throw new HttpError(503, 'read_unavailable') }
      return result
    } catch (error) {
      if (expired) await cancellation
      else if (!released) await client.query('ROLLBACK').catch(() => {})
      if (error instanceof HttpError) throw error
      throw new HttpError(503, 'read_unavailable')
    } finally { if (!expired) release() }
  }
  try { return await Promise.race([operation(), deadline]) }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
