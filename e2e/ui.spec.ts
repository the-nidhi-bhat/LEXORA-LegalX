import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { agreementPayload, DEMO_PASSWORD, PERSONAS } from './helpers'

// Measured Vite 8 dev-server latency on this host: /src/main.tsx took 15,177ms
// to serve, the full module graph kept locator.fill()/page.evaluate() past the
// 30s test timeout, and proxied /api/v1/* calls through :3000 took 6.2s, 10.0s
// and 26.7s. Default 30s test + 5s expect timeouts are below that floor.
// Navigation uses waitUntil:'commit' so Playwright's locator auto-waits drive
// readiness; give them a >2x budget instead of fixed sleeps.
test.describe.configure({ timeout: 90_000 })

const RUN = Date.now().toString(36)

test('browser sign-in renders a real backend agreement in the workspace', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'commit' })
  await page.getByLabel('Email address').fill(PERSONAS.owner.email)
  await page.getByLabel('Password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByText(/Authenticated with the LEGALX backend/)).toBeVisible({ timeout: 60_000 })

  const session = await page.evaluate(() => ({
    backend: localStorage.getItem('legalx:backend-session'),
    csrf: localStorage.getItem('legalx:csrf'),
  }))
  expect(session.backend).toBe('true')
  expect(session.csrf).toBeTruthy()

  // Use the browser's own cookie jar + CSRF token to persist a record, then
  // assert the SPA renders it from the API (it is not in any local fixture).
  const title = `E2E Browser Live ${RUN}`
  const created = await page.request.post('/api/v1/agreements', {
    data: agreementPayload(title, 'Browser-created agreement for the connected E2E check.'),
    headers: { 'X-CSRF-Token': session.csrf!, 'Idempotency-Key': randomUUID() },
  })
  expect(created.status(), await created.text()).toBe(201)

  await page.goto('/app/agreements', { waitUntil: 'commit' })
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 60_000 })
})

test('401 envelope from the real API client surfaces a populated requestId', async ({ page }) => {
  await page.goto('/sign-in', { waitUntil: 'commit' })
  const result = await page.evaluate(async () => {
    const mod: any = await import('/src/api/client.ts')
    // Both requests share one request id so the comparison is meaningful
    // (the middleware otherwise generates a fresh id per request).
    const requestId = 'e2e-401-request-id'
    const raw = await fetch('/api/v1/me', {
      credentials: 'include',
      headers: { 'X-Request-Id': requestId },
    })
    const rawBody = await raw.json()
    const envelope = await mod.apiClient.get('/me', { headers: { 'X-Request-Id': requestId } })
    return { status: raw.status, rawRequestId: rawBody?.error?.request_id, envelope }
  })

  expect(result.status).toBe(401)
  expect(result.rawRequestId).toBeTruthy()
  expect(result.envelope.ok).toBe(false)
  expect(result.envelope.error.code).toBe('UNAUTHENTICATED')
  // This is the parallel frontend fix: the backend's request_id is mapped to
  // the envelope's requestId instead of being dropped.
  expect(result.envelope.requestId).toBeTruthy()
  expect(result.envelope.requestId).toBe(result.rawRequestId)
})

test('demo-mode fallback is honest when the backend is unreachable', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.abort('failed'))
  await page.goto('/sign-in', { waitUntil: 'commit' })
  await page.getByLabel('Email address').fill(PERSONAS.owner.email)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByText(/Backend unavailable; using a local demo session/)).toBeVisible({ timeout: 60_000 })
  const flags = await page.evaluate(() => ({
    backend: localStorage.getItem('legalx:backend-session'),
    role: localStorage.getItem('legalx:role'),
  }))
  expect(flags.backend).toBe('false')
  expect(flags.role).toBe('owner')
})
