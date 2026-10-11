import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4040',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'pnpm --dir packages/frontend dev --host 127.0.0.1',
    url: 'http://127.0.0.1:4040',
    env: { VITE_BASE_PATH: '/' },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
