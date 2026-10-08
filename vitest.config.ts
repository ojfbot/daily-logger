import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'packages/frontend/src/**/__tests__/**/*.test.tsx'],
  },
})
