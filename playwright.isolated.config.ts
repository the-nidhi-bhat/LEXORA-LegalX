// Isolated full-suite E2E config — same as playwright.config.ts but on the
// dedicated :8011 backend / :3005 frontend pair so the concurrent UI agent's
// :8010 backend and :3002 vite are never touched.
import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureE2eDatabase } from './e2e/test-env'
process.env.E2E_API_BASE ??= 'http://127.0.0.1:8011';

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PYTHON = path.join(ROOT, '.venv', 'Scripts', 'python.exe')

// Fresh, never-overwritten artifact folder under the existing qa-screenshots/.
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const ARTIFACT_DIR = path.join(ROOT, 'qa-screenshots', `isolated-e2e-${RUN_ID}`)

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
    ['html', { outputFolder: path.join(ROOT, 'qa-screenshots', `isolated-e2e-${RUN_ID}-report`), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3005',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      // Isolated backend; Vite on :3005 proxies /api/v1 and /api/health here.
      command: `"${PYTHON}" -m uvicorn api.app.main:app --host 127.0.0.1 --port 8011`,
      cwd: ROOT,
      env: BACKEND_ENV,
      // openapi.json is DB-free so seeding cannot race the readiness probe.
      url: 'http://127.0.0.1:8011/api/openapi.json',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Isolated frontend with the parity-only Vite proxy (3005 -> 8011).
      command: 'npx vite --config vite.parity.config.ts --host 127.0.0.1 --port 3005 --strictPort',
      cwd: ROOT,
      url: 'http://127.0.0.1:3005',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
