import { digest, json, readFixture, type Fixture } from './fixture.js'

export const POSTGRES_WORKFLOW_VERSION = 's03a-recorded-artifact-replay-v1'

/** The run identity is part of the frozen input and local approval digest. */
export function readPostgresFixture(runId: string): Fixture {
  const recorded = readFixture()
  const manifest = {
    ...recorded.manifest,
    workflowVersion: POSTGRES_WORKFLOW_VERSION,
    persistence: 'postgresql-fixture-checkpoint-proof',
    runId,
  }
  return { ...recorded, manifest, manifestBytes: json(manifest), manifestDigest: digest(json(manifest)) }
}
