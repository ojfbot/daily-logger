import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4040',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'pnpm --dir packages/frontend dev --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4040',
    env: { VITE_BASE_PATH: '/' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
