// Shared, deterministic environment for the connected E2E harness.
// Both globalSetup (seed) and playwright.config.ts (backend webServer) must
// resolve the SAME throwaway SQLite file. The marker file is written when the
// config is loaded, before globalSetup and before any webServer is started.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MARKER = path.join(os.tmpdir(), 'legalx-e2e-current-db.txt')

export function configureE2eDatabase(): string {
  const runId = `${Date.now()}-${process.pid}`
  const dir = path.join(os.tmpdir(), 'legalx-e2e', runId)
  fs.mkdirSync(dir, { recursive: true })
  const dbFile = path.join(dir, 'legalx-e2e.db')
  const databaseUrl = `sqlite:///${dbFile.replace(/\\/g, '/')}`
  fs.writeFileSync(MARKER, databaseUrl, 'utf8')
  return databaseUrl
}

export function readE2eDatabaseUrl(): string {
  return fs.readFileSync(MARKER, 'utf8').trim()
}
