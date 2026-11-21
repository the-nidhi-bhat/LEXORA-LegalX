import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureE2eDatabase } from './e2e/test-env'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PYTHON = path.join(ROOT, '.venv', 'Scripts', 'python.exe')

// Fresh, never-overwritten artifact folder under the existing qa-screenshots/.
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const ARTIFACT_DIR = path.join(ROOT, 'qa-screenshots', `e2e-${RUN_ID}`)

// One throwaway DB per run, resolved identically by globalSetup and webServer.
const DATABASE_URL = configureE2eDatabase()

const BACKEND_ENV: Record<string, string> = {
  APP_ENV: 'test',
  DATABASE_URL,
  CORS_ORIGINS: '',
  // E2E signs in several personas; keep the demo credential from rate-limiting
  // an otherwise deterministic run. Production default is untouched.
  LOGIN_RATE_LIMIT_ATTEMPTS: '100',
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: path.join(ROOT, 'e2e', 'global-setup.ts'),
  outputDir: ARTIFACT_DIR,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(ROOT, 'qa-screenshots', `e2e-${RUN_ID}-report`), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      // Same-origin Vite proxy target (vite.config.ts:11-20).
      command: `"${PYTHON}" -m uvicorn api.app.main:app --host 127.0.0.1 --port 8010`,
      cwd: ROOT,
      env: BACKEND_ENV,
      // openapi.json is DB-free so seeding cannot race the readiness probe.
      url: 'http://127.0.0.1:8010/api/openapi.json',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: ROOT,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
