import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readE2eDatabaseUrl } from './test-env'

// Seed the throwaway database with the five demo personas before any test or
// browser request. Never touches the repository's api/legalx.db / legalx.db.
export default function globalSetup(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const python = path.join(root, '.venv', 'Scripts', 'python.exe')
  const databaseUrl = readE2eDatabaseUrl()

  const result = spawnSync(python, ['-m', 'api.app.seeds'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'test',
      DATABASE_URL: databaseUrl,
      CORS_ORIGINS: '',
    },
    encoding: 'utf8',
  })

  if (result.error) {
    throw new Error(`[e2e] could not start seed process: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `[e2e] seed failed (exit ${result.status}).\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    )
  }
  console.log(`[e2e] seeded ${databaseUrl}: ${result.stdout.trim()}`)
}
