import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { agreementPayload, mutate, PERSONAS, signIn } from './helpers'

// These tests exercise the backend HTTP contract only. Sending them through the
// Vite dev-server proxy (port 3000) couples them to frontend compilation: Vite
// can stall for >30s while rebuilding large modules, which shows up here as a
// test timeout. Talk to the managed uvicorn webServer directly instead.
test.use({ baseURL: process.env.E2E_API_BASE ?? 'http://127.0.0.1:8010' })

const RUN = Date.now().toString(36)

test('health endpoint is public and reports a live database', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe('ok')
})

test('owner sign-in, /me and the unauthenticated 401 envelope', async ({ request, playwright, baseURL }) => {
  const owner = await signIn(request, PERSONAS.owner.email)
  expect(owner.role).toBe('owner')

  const me = await owner.api.get('/api/v1/me')
  expect(me.status()).toBe(200)
  const meBody = await me.json()
  expect(meBody.user.email).toBe(PERSONAS.owner.email)
  expect(meBody.permissions).toContain('agreement:create')
  expect(meBody.csrf_token).toBeTruthy()

  // A session-free context must get the typed 401 envelope with a request id.
  const anonymous = await playwright.request.newContext({ baseURL })
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

test('connected journey: agreements, versions, approval, execution gate, activity, CSRF and sign-out', async ({
  request,
}) => {
  const owner = await signIn(request, PERSONAS.owner.email)
  const title = `E2E Website Project ${RUN}`
  const revisedTitle = `${title} (revised)`
  const text = 'Client pays INR 50,000 for a website: 20,000 after design sign-off and 30,000 on delivery.'
  let id = ''

  await test.step('POST/GET agreements and PATCH detail', async () => {
    const created = await mutate(
      owner,
      'POST',
      '/api/v1/agreements',
      agreementPayload(title, text),
      { 'Idempotency-Key': randomUUID() },
    )
    expect(created.status(), await created.text()).toBe(201)
    const body = await created.json()
    id = body.id
    expect(id).toBeTruthy()
    expect(body.status).toBe('draft')
    expect(body.current_version).toBe(1)

    const list = await owner.api.get('/api/v1/agreements')
    expect(list.status()).toBe(200)
    const listBody = await list.json()
    expect(listBody.items.map((a: any) => a.id)).toContain(id)

    const detail = await owner.api.get(`/api/v1/agreements/${id}`)
    expect(detail.status()).toBe(200)
    expect((await detail.json()).title).toBe(title)

    const patched = await mutate(owner, 'PATCH', `/api/v1/agreements/${id}`, { title: revisedTitle })
    expect(patched.status(), await patched.text()).toBe(200)
    const afterPatch = await owner.api.get(`/api/v1/agreements/${id}`)
    expect((await afterPatch.json()).title).toBe(revisedTitle)
  })

  let version2Sha = ''
  await test.step('version create + approval with the correct confirm_sha256', async () => {
    const versionsBefore = await owner.api.get(`/api/v1/agreements/${id}/versions`)
    expect(versionsBefore.status()).toBe(200)
    expect((await versionsBefore.json()).items).toHaveLength(1)

    const created = await mutate(owner, 'POST', `/api/v1/agreements/${id}/versions`, {
      text,
      change_summary: 'E2E revised text',
    })
    expect(created.status(), await created.text()).toBe(201)
    const version = await created.json()
    expect(version.version).toBe(2)
    expect(version.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(version.is_fully_approved).toBe(false)

    const versions = await owner.api.get(`/api/v1/agreements/${id}/versions`)
    const items = (await versions.json()).items
    expect(items).toHaveLength(2)
    version2Sha = items.find((v: any) => v.version === 2).sha256
    expect(version2Sha).toMatch(/^[0-9a-f]{64}$/)

    // A hash that is not the server-issued one is rejected.
    const wrong = await mutate(owner, 'POST', `/api/v1/agreements/${id}/versions/2/approve`, {
      confirm_sha256: '0'.repeat(64),
    })
    expect(wrong.status()).toBe(422)
    expect((await wrong.json()).error.code).toBe('HASH_MISMATCH')

    const approved = await mutate(owner, 'POST', `/api/v1/agreements/${id}/versions/2/approve`, {
      confirm_sha256: version2Sha,
    })
    expect(approved.status(), await approved.text()).toBe(201)
    const approval = await approved.json()
    expect(approval.version).toBe(2)
    expect(approval.is_fully_approved).toBe(true)
    expect(approval.approvals[0].confirmed_sha256).toBe(version2Sha)
  })

  await test.step('execution gate: blocked before approval, prereqs satisfied after approval', async () => {
    // A second agreement keeps the before/after observation independent of the
    // already-approved agreement above.
    const provisional = await mutate(
      owner,
      'POST',
      '/api/v1/agreements',
      agreementPayload(`E2E Gate Probe ${RUN}`, text),
    )
    expect(provisional.status(), await provisional.text()).toBe(201)
    const probeId = (await provisional.json()).id

    const blocked = await mutate(owner, 'POST', `/api/v1/agreements/${probeId}/execution`)
    expect(blocked.status()).toBe(403)
    expect((await blocked.json()).error.message).toContain('Required approvals not found on the current version')

    const versions = await owner.api.get(`/api/v1/agreements/${probeId}/versions`)
    const sha = (await versions.json()).items[0].sha256
    const approved = await mutate(owner, 'POST', `/api/v1/agreements/${probeId}/versions/1/approve`, {
      confirm_sha256: sha,
    })
    expect(approved.status(), await approved.text()).toBe(201)
    expect((await approved.json()).is_fully_approved).toBe(true)

    // The approval gate is now satisfied. The only remaining refusal is the
    // lifecycle state gate: full approval moves draft -> active, while this
    // endpoint only executes agreements still in draft.
    const after = await mutate(owner, 'POST', `/api/v1/agreements/${probeId}/execution`)
    expect(after.status()).toBe(403)
    const afterBody = await after.json()
    expect(afterBody.error.message).not.toContain('Required approvals not found')
    expect(afterBody.error.message).toContain("must be in 'draft' state")
  })

  await test.step('activity persists across independent reads', async () => {
    // Activity filtering is asserted client-side here for UI-flow coverage;
    // the `?agreement_id=` server-side filter is separately covered by
    // api/tests/test_activity.py (previously affected by a NameError now fixed).
    const first = await owner.api.get('/api/v1/activity')
    expect(first.status(), await first.text()).toBe(200)
    const types = (await first.json()).items
      .filter((e: any) => e.agreement_id === id)
      .map((e: any) => e.event_type)
    for (const expected of ['agreement.created', 'agreement.updated', 'version.created', 'version.approved']) {
      expect(types, `activity should contain ${expected}`).toContain(expected)
    }

    const second = await owner.api.get('/api/v1/activity')
    expect(second.status()).toBe(200)
    expect((await second.json()).items.filter((e: any) => e.agreement_id === id).map((e: any) => e.event_type)).toEqual(types)
  })

  await test.step('CSRF and method rejection', async () => {
    const noCsrf = await owner.api.post('/api/v1/agreements', { data: agreementPayload('E2E No CSRF', text) })
    expect(noCsrf.status()).toBe(403)
    expect((await noCsrf.json()).error.code).toBe('CSRF_FAILED')

    const badCsrf = await owner.api.post('/api/v1/agreements', {
      data: agreementPayload('E2E Bad CSRF', text),
      headers: { 'X-CSRF-Token': 'not-the-token' },
    })
    expect(badCsrf.status()).toBe(403)
    expect((await badCsrf.json()).error.code).toBe('CSRF_FAILED')

    const badMethod = await owner.api.put('/api/v1/agreements')
    expect(badMethod.status()).toBe(405)
    expect((await badMethod.json()).error.code).toBe('METHOD_NOT_ALLOWED')
  })

  await test.step('sign-out revokes the session', async () => {
    const out = await mutate(owner, 'DELETE', '/api/v1/auth/session')
    expect(out.status()).toBe(204)
    const me = await owner.api.get('/api/v1/me')
    expect(me.status()).toBe(401)
    const repeat = await mutate(owner, 'DELETE', '/api/v1/auth/session')
    expect(repeat.status()).toBe(401)
  })

  expect(version2Sha).toMatch(/^[0-9a-f]{64}$/)
})

test('RBAC denies technical_auditor and org_admin writes, but allows reads', async ({
  playwright,
  baseURL,
}) => {
  for (const email of [PERSONAS.auditor.email, PERSONAS.admin.email]) {
    const api = await playwright.request.newContext({ baseURL })
    try {
      const session = await signIn(api, email)
      expect(session.role).toBe(email === PERSONAS.auditor.email ? 'technical_auditor' : 'org_admin')

      const denied = await mutate(session, 'POST', '/api/v1/agreements', agreementPayload(`E2E Denied ${RUN}`, 'Denied body'))
      expect(denied.status(), `${email} create must be denied`).toBe(403)
      expect((await denied.json()).error.code).toBe('FORBIDDEN')

      const readable = await api.get('/api/v1/agreements')
      expect(readable.status(), `${email} should still be able to list`).toBe(200)
    } finally {
      await api.dispose()
    }
  }
})
