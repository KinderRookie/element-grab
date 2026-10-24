import { defineConfig } from '@playwright/test'

// README screenshots (docs/demo), kept out of the regular E2E run.
export default defineConfig({
  testDir: 'docs/demo',
  testMatch: 'screenshots.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  globalSetup: './docs/demo/global-setup.ts'
})
