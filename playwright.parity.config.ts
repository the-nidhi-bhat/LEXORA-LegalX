// UNTRACKED verification harness config — isolated Phase 6 parity E2E.
// Deliberately separate from playwright.config.ts so the concurrent UI agent's
// ports (:8010 backend / :3002 vite) are never touched and flaky api-journey /
// ui specs are not part of this focused parity run.
import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureE2eDatabase } from './e2e/test-env'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PYTHON = path.join(ROOT, '.venv', 'Scripts', 'python.exe')

// Fresh, never-overwritten artifact folder under the existing qa-screenshots/.
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const ARTIFACT_DIR = path.join(ROOT, 'qa-screenshots', `parity-e2e-${RUN_ID}`)

// One throwaway DB per run, resolved identically by globalSetup (marker file)
// and by the backend webServer below. Never touches api/legalx.db or legalx.db.
const DATABASE_URL = configureE2eDatabase()

const BACKEND_ENV: Record<string, string> = {
  APP_ENV: 'test',
  DATABASE_URL,
  CORS_ORIGINS: '',
  // Several personas sign in during one deterministic run; do not rate-limit.
  LOGIN_RATE_LIMIT_ATTEMPTS: '100',
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/parity.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  globalSetup: path.join(ROOT, 'e2e', 'global-setup.ts'),
  outputDir: ARTIFACT_DIR,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(ROOT, 'qa-screenshots', `parity-e2e-${RUN_ID}-report`), open: 'never' }],
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
      // Isolated backend. openapi.json is DB-free so seeding cannot race the
      // readiness probe. Direct API calls go here; Vite proxies here too.
      command: `"${PYTHON}" -m uvicorn api.app.main:app --host 127.0.0.1 --port 8011`,
      cwd: ROOT,
      env: BACKEND_ENV,
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
