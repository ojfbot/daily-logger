import { defineConfig } from 'vitest/config'

// Golden eval suite (audit S19 / integration plan I4). Kept OUT of the root
// vitest config on purpose: `pnpm test` stays the unit suite; `pnpm eval`
// runs this one and snapshots results to evals/results/latest.json.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/tasks/**/*.eval.ts'],
    // Task files mutate process.env (offline-API replay); isolate them.
    fileParallelism: false,
    testTimeout: 60_000,
  },
})
