import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './packages/frontend/e2e', testMatch: 'editorial-continuation.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4040', browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm --dir packages/frontend exec vite preview --host 127.0.0.1 --port 4040 --strictPort',
    cwd: process.env.UIK_BROWSER_ROOT ?? process.cwd(), env: { VITE_BASE_PATH: '/' }, url: 'http://127.0.0.1:4040', reuseExistingServer: false, timeout: 30000 },
})
