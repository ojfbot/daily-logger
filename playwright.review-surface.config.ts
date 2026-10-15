import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './packages/frontend/e2e', testMatch: 'article-review.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4057', browserName: 'chromium', channel: 'chrome' },
  webServer: { command: 'pnpm --dir packages/frontend dev --host 127.0.0.1 --port 4057 --strictPort', url: 'http://127.0.0.1:4057', env: { VITE_BASE_PATH: '/' }, reuseExistingServer: false, timeout: 30000 },
})
