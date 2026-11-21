import { expect, type APIRequestContext } from '@playwright/test'

export const DEMO_PASSWORD = 'legalx-demo-2026'

export const PERSONAS = {
  owner: { email: 'owner@legalx.demo', role: 'owner' },
  freelancer: { email: 'freelancer@legalx.demo', role: 'freelancer' },
  auditor: { email: 'auditor@legalx.demo', role: 'technical_auditor' },
  admin: { email: 'admin@legalx.demo', role: 'org_admin' },
} as const

export interface Session {
  api: APIRequestContext
  csrf: string
  email: string
  role: string
}

/** Sign in through the real POST /auth/session and capture the CSRF token. */
export async function signIn(
  api: APIRequestContext,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<Session> {
  const res = await api.post('/api/v1/auth/session', { data: { email, password } })
  expect(res.status(), `sign-in ${email}`).toBe(200)
  const body = await res.json()
  expect(body.csrf_token, 'sign-in response must carry csrf_token').toBeTruthy()
  expect(String(body.user.email).toLowerCase()).toBe(email)
  return { api, csrf: body.csrf_token, email, role: body.user.role }
}

/** Unsafe method with the session's X-CSRF-Token header attached. */
export async function mutate(
  session: Session,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers = { 'X-CSRF-Token': session.csrf, ...extraHeaders }
  if (method === 'POST') return session.api.post(path, { data, headers })
  if (method === 'PATCH') return session.api.patch(path, { data, headers })
  return session.api.delete(path, { headers })
}

/** Contract-shaped payload; valid, client_only, two distinct party roles. */
export function agreementPayload(title: string, text: string) {
  const future = (days: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  return {
    title,
    agreement_type: 'service_agreement',
    currency: 'INR',
    total_amount_minor: 5_000_000,
    approval_policy: 'client_only',
    parties: [
      { role: 'client', name: 'Priya Nair', email: 'owner@legalx.demo' },
      { role: 'provider', name: 'Rahul Mehta', email: 'freelancer@legalx.demo' },
    ],
    milestones: [
      {
        seq: 1,
        name: 'Design sign-off',
        amount_minor: 2_000_000,
        due_date: future(10),
        acceptance_criteria: 'Figma file approved',
      },
      {
        seq: 2,
        name: 'Build complete',
        amount_minor: 3_000_000,
        due_date: future(25),
        acceptance_criteria: 'Staging URL signed off',
      },
    ],
    review_period_days: 5,
    review_period_basis: 'business',
    text,
  }
}
