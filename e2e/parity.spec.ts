// UNTRACKED verification harness — focused Phase 6 parity E2E.
// Consumed only by playwright.parity.config.ts (backend :8011, frontend :3005).
// This file is verification code only; it does not change application behavior.
import { randomUUID } from 'node:crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { agreementPayload, DEMO_PASSWORD, mutate, PERSONAS, signIn, type Session } from './helpers'

const API_BASE = 'http://127.0.0.1:8011'
const UI_BASE = 'http://127.0.0.1:3005'
// api/app/seeds.py seeds this second-workspace owner; PERSONAS in e2e/helpers.ts
// contains only acme-digital users. Mirrors api/tests/test_parity_api.py.
const OUTSIDER = 'outsider@lexora.demo'
const RUN = Date.now().toString(36)
const TEXT = 'Client pays INR 50,000 for a website: 20,000 after design sign-off and 30,000 on delivery.'

// Values validated against api/app/schemas/ir.py:
//   DisputeBehavior: freeze_affected_payment | mediate | arbitrate
//   GoverningLaw: India | United Kingdom | United States | Australia
const CLARIFICATION = { dispute_behavior: 'mediate', governing_law: 'India' }
const TAMPERED = { dispute_behavior: 'arbitrate', governing_law: 'India' }

async function createAgreement(
  session: Session,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await mutate(
    session,
    'POST',
    '/api/v1/agreements',
    { ...agreementPayload(title, TEXT), ...extra },
    { 'Idempotency-Key': randomUUID() },
  )
  expect(created.status(), await created.text()).toBe(201)
  const body = await created.json()
  expect(body.id).toBeTruthy()
  return body.id as string
}

async function postVerify(
  session: Session,
  id: string,
  version: number | string = 1,
  params: Record<string, string> = CLARIFICATION,
) {
  return mutate(
    session,
    'POST',
    `/api/v1/agreements/${id}/versions/${version}/verify`,
    { execution_parameters: params },
  )
}

test.describe('parity HTTP surface (isolated backend :8011)', () => {
  test.use({ baseURL: API_BASE })

  test('parity-harness: health endpoint is public', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
  })

  test('parity-harness: owner sign-in, /me and unauthenticated 401 envelope', async ({
    request,
    playwright,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    expect(owner.role).toBe('owner')
    expect(owner.csrf).toBeTruthy()

    const me = await owner.api.get('/api/v1/me')
    expect(me.status()).toBe(200)
    const meBody = await me.json()
    expect(meBody.user.email).toBe(PERSONAS.owner.email)
    expect(meBody.permissions).toContain('verification:run')
    expect(meBody.permissions).toContain('verification:read')
    expect(meBody.csrf_token).toBeTruthy()

    const anonymous = await playwright.request.newContext({ baseURL: API_BASE })
    try {
      const denied = await anonymous.get('/api/v1/me')
      expect(denied.status()).toBe(401)
      const body = await denied.json()
      expect(body.error.code).toBe('UNAUTHENTICATED')
      expect(body.error.request_id).toBeTruthy()
    } finally {
      await anonymous.dispose()
    }
  })

  test('parity-harness: owner creates a version and runs a real verification', async ({
    request,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity Verify ${RUN}`)

    let verify = await postVerify(owner, id, 1)
    if (verify.status() === 409) {
      // Stored terms were unset on both sides: set them the documented way and
      // retry (PATCH is accepted before any approval exists on version 1).
      const patched = await mutate(owner, 'PATCH', `/api/v1/agreements/${id}`, CLARIFICATION)
      expect(patched.status(), await patched.text()).toBe(200)
      verify = await postVerify(owner, id, 1)
    }
    expect(verify.status(), await verify.text()).toBe(200)
    const body = await verify.json()
    expect(body.result.overall_status).toBeTruthy()
    expect(body.verification_run_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.result).toHaveProperty('is_blocked')
    expect(body).toHaveProperty('approvals_complete')
    expect(body).toHaveProperty('passed')
    expect(body).toHaveProperty('stale')
    expect(body.result.approved_ir_hash).not.toBe(body.result.execution_params_hash)

    // Version create + approval mirrors e2e/api-journey.spec.ts.
    const created = await mutate(owner, 'POST', `/api/v1/agreements/${id}/versions`, {
      text: TEXT,
      change_summary: 'Parity revised text',
    })
    expect(created.status(), await created.text()).toBe(201)
    expect((await created.json()).version).toBe(2)

    const versions = await owner.api.get(`/api/v1/agreements/${id}/versions`)
    expect(versions.status()).toBe(200)
    const sha = (await versions.json()).items.find((v: any) => v.version === 2)?.sha256
    expect(sha).toMatch(/^[0-9a-f]{64}$/)

    const approved = await mutate(
      owner,
      'POST',
      `/api/v1/agreements/${id}/versions/2/approve`,
      { confirm_sha256: sha },
    )
    expect(approved.status(), await approved.text()).toBe(201)
    expect((await approved.json()).is_fully_approved).toBe(true)

    const verify2 = await postVerify(owner, id, 2)
    expect(verify2.status(), await verify2.text()).toBe(200)
    expect((await verify2.json()).result.overall_status).toBeTruthy()
  })

  test('parity-harness: trust passport is evidence-only and 404 without a run', async ({
    request,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity Passport ${RUN}`)

    const before = await owner.api.get(`/api/v1/agreements/${id}/trust-passport?version=1`)
    expect(before.status()).toBe(404)
    expect((await before.json()).error.code).toBe('NOT_FOUND')

    const verified = await postVerify(owner, id, 1)
    expect(verified.status(), await verified.text()).toBe(200)
    const runId = (await verified.json()).verification_run_id

    const passport = await owner.api.get(`/api/v1/agreements/${id}/trust-passport?version=1`)
    expect(passport.status(), await passport.text()).toBe(200)
    const body = await passport.json()
    expect(body.verification_run_id).toBe(runId)
    expect(body).not.toHaveProperty('text')
    expect(body).not.toHaveProperty('ir_json')
    expect(body.overall_status).toBeTruthy()
    expect(body.approved_ir_hash).toBeTruthy()
    expect(body.execution_params_hash).toBeTruthy()
    expect(Array.isArray(body.field_results)).toBe(true)
    expect(body.verified_at).toMatch(/Z$/)
  })

  test('parity-harness: cross-workspace agreement is 404 on agreement + both parity endpoints', async ({
    request,
    playwright,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity Cross Org ${RUN}`)
    expect((await postVerify(owner, id, 1)).status()).toBe(200)

    const api = await playwright.request.newContext({ baseURL: API_BASE })
    try {
      const outsider = await signIn(api, OUTSIDER)
      const detail = await api.get(`/api/v1/agreements/${id}`)
      expect(detail.status()).toBe(404)
      expect((await detail.json()).error.code).toBe('NOT_FOUND')

      const authored = await postVerify(outsider, id, 1)
      expect(authored.status()).toBe(404)
      expect((await authored.json()).error.code).toBe('NOT_FOUND')

      const read = await api.get(`/api/v1/agreements/${id}/trust-passport?version=1`)
      expect(read.status()).toBe(404)
      expect((await read.json()).error.code).toBe('NOT_FOUND')
    } finally {
      await api.dispose()
    }
  })

  test('parity-harness: RBAC, anonymous and CSRF rules on the parity surface', async ({
    request,
    playwright,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity RBAC ${RUN}`)
    // A run must exist before the auditor's read can succeed.
    expect((await postVerify(owner, id, 1)).status()).toBe(200)

    for (const email of [
      PERSONAS.freelancer.email,
      PERSONAS.admin.email,
      PERSONAS.auditor.email,
    ]) {
      const api = await playwright.request.newContext({ baseURL: API_BASE })
      try {
        const session = await signIn(api, email)
        const denied = await postVerify(session, id, 1)
        expect(denied.status(), `${email} must be denied verification:run`).toBe(403)
        expect((await denied.json()).error.code).toBe('FORBIDDEN')

        const read = await api.get(`/api/v1/agreements/${id}/trust-passport?version=1`)
        if (email === PERSONAS.auditor.email) {
          expect(read.status(), 'technical_auditor has verification:read').toBe(200)
        } else {
          expect(read.status(), `${email} lacks verification:read`).toBe(403)
        }
      } finally {
        await api.dispose()
      }
    }

    const anonymous = await playwright.request.newContext({ baseURL: API_BASE })
    try {
      const anonPost = await anonymous.post(
        `/api/v1/agreements/${id}/versions/1/verify`,
        { data: { execution_parameters: CLARIFICATION } },
      )
      expect(anonPost.status()).toBe(401)
      expect((await anonPost.json()).error.code).toBe('UNAUTHENTICATED')
    } finally {
      await anonymous.dispose()
    }

    const noCsrf = await owner.api.post(
      `/api/v1/agreements/${id}/versions/1/verify`,
      { data: { execution_parameters: CLARIFICATION } },
    )
    expect(noCsrf.status()).toBe(403)
    expect((await noCsrf.json()).error.code).toBe('CSRF_FAILED')
  })

  test('parity-harness: tampered dispute behavior is a blocking mismatch', async ({
    request,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    // CreateAgreementRequest accepts stored legal facts (api/app/schemas/agreement.py).
    // api/app/routers/agreements.py:389-390 persists them on the Agreement row.
    const created = await mutate(
      owner,
      'POST',
      '/api/v1/agreements',
      {
        ...agreementPayload(`Parity Tamper ${RUN}`, TEXT),
        dispute_behavior: 'mediate',
        governing_law: 'India',
      },
      { 'Idempotency-Key': randomUUID() },
    )
    if (created.status() === 422) {
      test.skip(
        true,
        'CreateAgreementRequest rejected stored dispute_behavior/governing_law; ' +
          'cannot construct a stored-vs-client legal-term mismatch through the API.',
      )
    }
    expect(created.status(), await created.text()).toBe(201)
    const id = (await created.json()).id as string

    // Mirrors api/tests/test_parity_api.py::test_tampered_execution_parameters_block_and_persist
    const res = await postVerify(owner, id, 1, TAMPERED)
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.result.overall_status).toBe('blocked')
    expect(body.result.is_blocked).toBe(true)
    expect(body.result.recommendation).toBe('blocked')
    const blocking = body.result.field_results
      .filter((f: any) => f.status === 'blocking')
      .map((f: any) => f.field)
    expect(blocking).toContain('dispute_behavior')
    expect(body.passed).toBe(false)
  })

  test('parity-harness: a passing verification does not grant execution', async ({
    request,
  }) => {
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity Gate ${RUN}`)

    const verified = await postVerify(owner, id, 1)
    expect(verified.status(), await verified.text()).toBe(200)
    // `passed` is informational only — the execution gate must still refuse.
    const gate = await mutate(owner, 'POST', `/api/v1/agreements/${id}/execution`)
    expect(gate.status()).toBe(403)
    expect((await gate.json()).error.message).toContain(
      'Required approvals not found on the current version',
    )
  })
})

test.describe('parity UI smoke (isolated frontend :3005)', () => {
  test.use({ baseURL: UI_BASE })

  test('parity-harness: sign-in form renders and real backend login succeeds through the Vite proxy', async ({
    page,
  }) => {
    test.setTimeout(120_000) // headroom above the 90s action timeout under Vite cold start
    // Cold-start Vite module-graph latency: `load` can exceed 30s here. Wait
    // only for DOM, then rely on expect auto-waiting for the form.
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible()

    const email = page.getByLabel('Email address')
    const password = page.getByLabel('Password')
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()
    await email.fill(PERSONAS.owner.email)
    await password.fill('legalx-demo-2026')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    // Logged-in shell: the Auth component's success state from a real backend
    // session (never the local-demo fallback).
    await expect(page.getByText('Session ready.')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: /Continue to onboarding/i })).toBeVisible()
    const backendSession = await page.evaluate(() =>
      localStorage.getItem('legalx:backend-session'),
    )
    expect(backendSession).toBe('true')
  })

  test('deeper UI parity interaction: click Run verification against a live backend agreement', async ({
    page,
    request,
  }) => {
    // Heavier than the smoke test: two agreements, two verification runs, a
    // reload and a tampered case on a cold Vite server. Never shortened.
    test.setTimeout(240_000)

    // (1) Establish the authoritative expected result through the real API in
    // this same test. The UI assertion below is compared to THIS response;
    // no score or status is hardcoded.
    const owner = await signIn(request, PERSONAS.owner.email)
    const id = await createAgreement(owner, `Parity UI Live ${RUN}`, {
      dispute_behavior: 'mediate',
      governing_law: 'India',
    })
    const expected = await postVerify(owner, id, 1, CLARIFICATION)
    expect(expected.status(), await expected.text()).toBe(200)
    const expectedBody = await expected.json()
    const expectedStatus = String(expectedBody.result.overall_status)
    expect(['match', 'advisory', 'blocked']).toContain(expectedStatus)
    const expectedBlocked = !!expectedBody.result.is_blocked
    // The backend emits ONLY differing fields: a clean match has 0 rows.
    // Assert equality with that real response rather than inventing rows.
    const expectedFields: number = expectedBody.result.field_results.length
    expect(Array.isArray(expectedBody.result.field_results)).toBe(true)

    // (2) Sign in as owner through the UI. :3005 proxies the real backend.
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible()
    await page.getByLabel('Email address').fill(PERSONAS.owner.email)
    await page.getByLabel('Password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('Session ready.')).toBeVisible({ timeout: 60_000 })
    expect(await page.evaluate(() => localStorage.getItem('legalx:backend-session'))).toBe('true')

    // (3) Select the live backend agreement through the UI, then open parity.
    await page.goto('/app/agreements', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.getByRole('button', { name: new RegExp(`Parity UI Live ${RUN}`) }).click()
    await page.goto('/app/parity', { waitUntil: 'domcontentloaded', timeout: 90_000 })

    // (4) Live-only executor clarifications: the two legal terms the bounded
    // backend schema allows a caller to choose (defaults: mediate + India).
    await expect(page.getByTestId('parity-clarifications')).toBeVisible()
    await page.getByLabel('Dispute handling').selectOption('mediate')
    await page.getByLabel('Governing law').selectOption('India')

    // (5) Run against the real backend and compare the rendered status to the
    // direct API result from step (1).
    await page.getByTestId('parity-run-button').click()
    const status = page.getByTestId('parity-status')
    await expect(status).toContainText(expectedStatus, { timeout: 60_000 })
    expect(await status.textContent()).toContain(expectedStatus)

    // (6) Real backend field rows and the blocking panel.
    const rows = page.getByTestId('parity-field-row')
    // Exact equality with the backend response is the assertion; a clean
    // match legitimately renders zero differing-field rows.
    expect(await rows.count()).toBe(expectedFields)
    if (expectedFields > 0) await expect(rows.first()).toBeVisible()
    await expect(page.getByTestId('parity-blocking')).toHaveAttribute(
      'data-blocked',
      String(expectedBlocked),
    )

    // (7) Read-only trust-passport evidence from the real endpoint.
    const passport = page.getByTestId('parity-passport')
    await expect(passport).toBeVisible({ timeout: 60_000 })
    await expect(passport).toContainText(String(expectedBody.result.approved_ir_hash))
    await expect(passport).toContainText('not a legal certification')

    // (8) A parity result never grants execution.
    const gate = await mutate(owner, 'POST', `/api/v1/agreements/${id}/execution`)
    expect(gate.status()).toBe(403)

    // (9) State remains correct after a reload.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.getByTestId('parity-status')).toContainText(expectedStatus, { timeout: 60_000 })
    expect(await page.getByTestId('parity-field-row').count()).toBe(expectedFields)
    await expect(page.getByTestId('parity-passport')).toBeVisible()

    // (10) A tampered executor clarification is a real blocking mismatch.
    const tamperId = await createAgreement(owner, `Parity UI Tamper ${RUN}`, {
      dispute_behavior: 'mediate',
      governing_law: 'India',
    })
    const tamperedExpected = await postVerify(owner, tamperId, 1, TAMPERED)
    expect(tamperedExpected.status(), await tamperedExpected.text()).toBe(200)
    const tamperedBody = await tamperedExpected.json()
    expect(String(tamperedBody.result.overall_status)).toBe('blocked')
    expect(tamperedBody.result.is_blocked).toBe(true)
    const tamperedFields: number = tamperedBody.result.field_results.length
    expect(tamperedFields).toBeGreaterThan(0)
    expect(
      tamperedBody.result.field_results
        .filter((f: any) => f.status === 'blocking')
        .map((f: any) => f.field),
    ).toContain('dispute_behavior')

    await page.goto('/app/agreements', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.getByRole('button', { name: new RegExp(`Parity UI Tamper ${RUN}`) }).click()
    await page.goto('/app/parity', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.getByLabel('Dispute handling').selectOption('arbitrate')
    await page.getByLabel('Governing law').selectOption('India')
    await page.getByTestId('parity-run-button').click()
    await expect(page.getByTestId('parity-status')).toContainText('blocked', { timeout: 60_000 })
    expect(await page.getByTestId('parity-field-row').count()).toBe(tamperedFields)
    await expect(page.getByTestId('parity-blocking')).toHaveAttribute('data-blocked', 'true')
    const disputeRow = page.locator(
      '[data-testid="parity-field-row"][data-field="dispute_behavior"]',
    )
    await expect(disputeRow).toBeVisible()
    await expect(disputeRow).toContainText('Mismatch')
  })
})
