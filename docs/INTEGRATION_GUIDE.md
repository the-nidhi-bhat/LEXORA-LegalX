# INTEGRATION_GUIDE.md — the frontend ↔ backend seam

> Phase 0 artefact. The seam is **specified here and implemented nowhere yet**: today there are zero
> network calls in `src/`. This document exists so Iffa (client) and Sam (server) can work in parallel
> against one agreed shape instead of discovering it in a merge conflict.
>
> Normative request/response schemas: `API_CONTRACTS.md`. Policy and route tables: `EXECUTION_PLAN.md`.
> If this guide and `API_CONTRACTS.md` disagree, `API_CONTRACTS.md` wins and this file gets fixed.

---

## 1. Six rules that decide every argument

1. **One origin.** Production: FastAPI serves `web/dist` at `/` and the API at `/api/v1` — same origin,
   no CORS. Development: the browser talks only to Vite on `:3000`, which proxies `/api` to `:8000`.
   `allow_origins=["*"]` never appears in the codebase. If a feature needs CORS, the proxy is wrong.
2. **The server decides.** Identity, role, permission, approval state, hash, pass/fail and "executable"
   all come from the API. React may hide a button; React may never be the reason something is allowed.
3. **The client displays hashes, it does not compute them.** `crypto.subtle` in `src/` → 0 occurrences.
4. **No silent fallback.** If the API fails, the screen shows an error. It must not render fixture data
   as if it were real. A deliberate fixture is allowed only with an in-UI label and `data-source="fixture"`.
5. **Money crosses the wire as an integer.** `total_amount_minor: 5000000`. Formatting to `₹50,000` is a
   display concern; never parse it back from a string.
6. **One writer per file.** `src/App.tsx` is edited by one person at a time (`TEAM_TASK_CARDS.md` §5).

---

## 2. Session and CSRF flow

```
1. GET  /api/v1/me                → 401 UNAUTHENTICATED   (no session: show sign-in)
2. POST /api/v1/auth/session      {email, password}
      → 200 Set-Cookie: lx_session=<opaque>; HttpOnly; SameSite=Lax; Path=/ [; Secure in prod]
      → body {user:{id,name,email}, role, permissions:[...], csrf_token:"<opaque>"}
3. Every non-GET                  → header X-CSRF-Token: <csrf_token from step 2>
      missing/mismatch            → 403 CSRF_FAILED (before any handler logic)
4. DELETE /api/v1/auth/session     + CSRF header → 204, row revoked, cookie expired
5. Any request after sign-out     → 401 UNAUTHENTICATED (replay must fail)
```

Client-side consequences, in order of importance:

- The CSRF token lives **in memory only** (module variable or React context). Never `localStorage`, never
  a cookie the server did not set. A page reload refetches `/me`, which returns it again.
- `fetch` must send `credentials: 'include'` — same-origin in both dev (via proxy) and prod.
- On `401`, clear the in-memory session and route to sign-in. Do not retry automatically.
- On `403 FORBIDDEN`, render "you do not have access to this" — **not** "sign in again". Silent re-auth
  loops hide authorization bugs.
- Sign-in failure must be **visible inline** (`role="alert"`), not a toast. Today an unknown email produces
  no visible effect at all; that is the single worst first impression in the product.

**Error mapping the UI must implement**

| `error.code` | HTTP | What the user sees |
|---|---|---|
| `UNAUTHENTICATED` | 401 | sign-in screen, preserving the intended destination |
| `INVALID_CREDENTIALS` | 401 | inline form error: "email or password is incorrect" (never which) |
| `CSRF_FAILED` | 403 | refetch `/me`, retry once, then a real error |
| `FORBIDDEN` | 403 | access-denied panel with a link back to a permitted route |
| `NOT_FOUND` | 404 | "not found" — this is also what cross-tenant looks like; do not speculate |
| `VALIDATION_FAILED` | 422 | inline, per-field, from `details[].field` |
| `PARITY_BLOCKED` | 409 | the blocking field list, verbatim from `details[]` |
| `APPROVALS_INCOMPLETE` | 409 | the missing parties by role |
| `HASH_MISMATCH` | 422 | "the document changed while you were signing — reload and review" |
| `VERSION_NOT_APPROVED` | 409 | explain that IR/parity require an approved version |
| `INTEGRATION_UNAVAILABLE` | 503 | "service unavailable" + the `request_id` |
| anything else | 5xx | generic message + `request_id`; never a stack trace |

Always surface `request_id` in a copyable field on error — it is the only way to correlate a judge-visible
failure with a log line.

---

## 3. The API client (one module, one shape)

Only `web/src/lib/api.ts` may call `fetch`. Screens import functions, never URLs.

```ts
// shape, not final code
export class ApiError extends Error {
  code: string
  status: number
  details?: { field?: string; code: string; message: string }[]
  requestId?: string
}

export const api = {
  me(): Promise<Me>,
  signIn(email: string, password: string): Promise<Me>,   // sets CSRF token in memory
  signOut(): Promise<void>,
  listAgreements(): Promise<Agreement[]>,
  createAgreement(input: NewAgreement): Promise<Agreement>,
  getAgreement(id: string): Promise<AgreementDetail>,
  listVersions(id: string): Promise<Version[]>,
  approveVersion(id: string, v: number, confirmSha256: string): Promise<Version>,
  getIr(id: string, v: number): Promise<IrDocument>,
  runParity(id: string, v: number): Promise<ParityResult>,
  verify(id: string, v: number): Promise<VerificationRun>,
  verificationStatus(id: string): Promise<VerificationStatus>,
  releaseMilestone(id: string, seq: number): Promise<ReleaseResult>,
  activity(id: string): Promise<ActivityEvent[]>,
}
```

Non-obvious requirements:

- Exactly one place parses the error envelope, so no screen invents its own error shape.
- `AbortController` on unmount; no state update after unmount.
- No retries except the single CSRF refetch. Retrying a POST that creates a version is a duplicate bug.
- Every call site renders three states: loading, empty, error. A spinner is not a loading state for a
  screen whose layout shifts when data arrives; use a stable skeleton.

---

## 4. Screen → endpoint map

Derived from the real component inventory in `src/App.tsx`; line numbers are in `SETUP_READINESS.md` §7.

| Screen (component) | Renders today | Must call |
|---|---|---|
| `Auth` | email only; role from `localStorage` | `POST /auth/session`, then `GET /me` |
| `App` gate | reads `legalx:role` | `GET /me` on mount; 401 → `Auth` |
| `Agreements` | 4 hard-coded rows, invented tab counts | `GET /agreements` |
| `AgreementDetail` | static text, literal `v1.2`, literal hash | `GET /agreements/{id}`, `GET …/versions` |
| `ContractIR` | inline `ir` object literal | `GET …/versions/{v}/ir` |
| `ParityStudio` | `score = tampered ? 74 : 100` | `POST …/parity`, `GET …/parity`, tooltip from `details[]` |
| `AppShell` verify action | toast only | `POST …/verify`, then `GET …/verification-status` |
| `SmartContracts` | simulated wallet, fake addresses | `GET/POST …/execution-parameters`; keep `SIMULATED` label |
| `Milestones` | `localStorage` array | `POST …/milestones/{seq}/release` |
| `Activity` | static list | `GET …/activity` |
| `Team` | local invites | out of P0 scope — remains `org_admin`-only, unchanged |
| create agreement | button redirects to AI workspace, creating nothing | `POST /agreements` (P0-04) |
| `VersionBadge` / `ApproveDialog` (new) | — | `POST …/versions/{v}/approve` with `confirm_sha256` |

The `POST …/execution-parameters/tamper` route is demo-only: it must be **absent** (404) when
`DEMO_TAMPER_ENDPOINT=false`. The UI must not offer the button unless `/me` or a capabilities field says
the demo route exists — no client-side toggle.

---

## 5. State migration: 15 `localStorage` keys

Authority moves to the server. Nothing is deleted in P0-02; the kill order matters.

| Key | Becomes | Owner |
|---|---|---|
| `legalx:role` | **deleted** — role arrives in `/me` | P0-03 |
| `legalx:profile` | server user record; local copy is a display cache at most | P0-03 |
| `legalx:milestones` | `milestones` rows | P0-04 |
| `legalx:ai-draft`, `legalx:ai-parsed` | server-side IR derivation; text lives on the version row | P0-04/P0-06 |
| `legalx:notifications`, `legalx:invites` | out of P0 scope; keep as-is, still labelled demo | — |
| `legalx:settings`, `legalx:wallet-connected`, `legalx:network-mode` | demo controls; keep, clearly demo-only | — |
| `legalx:guided-step`, `-active`, `-paused` | judge-mode UI state; keep local | — |

Rule: a key may be removed only in the same PR that replaces its reads with an API call and its writes
with a server mutation. Deleting a key first produces an app that silently forgets everything.

---

## 6. Shared types

Single authored shape, mirrored by hand for now (`web/src/lib/types/api.ts` ↔ pydantic models). Field
names are **identical** on both sides; only the casing of the language changes, never the wire.

Naming collisions found in the existing file and their resolution:

| Collision | Resolution |
|---|---|
| component `ContractIR` vs type `ContractIR` | type is `IrDocument`; keep the component name |
| component `Milestones` vs type `Milestone` | no change needed |
| `src/rbac.ts` `Permission` union vs API permissions | one union, extended with `ir:read`, `verification:read`, `verification:run`, `activity:read`, `audit:read_global`, `agreement:approve`; `audit:view`, `workspace:view_activity`, `agreement:approve_parity` removed |
| `rbac.Role` (5 app roles) vs party role (`client`/`provider`/…) | different concepts — never interchangeable; name the party field `party_role` |

Money, dates and ids in §1 rule 5, and: money is `total_amount_minor` (`number`, integer), never a string.

---

## 7. Fixtures: how to stay honest

A fixture is allowed only if a person looking at the screen can tell it is one.

- The element carries `data-source="fixture"` and visible text such as `seeded demo fixture`.
- Fixture data is never mixed with live data in one list.
- No screen shows a hash, a score, a balance or an approval that the system did not compute.
- Existing honest labels (`SIMULATED`, `not live AI`, `no production session`, `simulated download only`)
  must survive every refactor. Removing one is a defect; report it as such.

---

## 8. Integration checkpoints

Each gate is a merge condition, not a meeting. Entry: branch builds and its own tests pass. Exit: the
named evidence exists and someone other than the author reproduced it.

| Gate | After | Exit evidence | Verified by |
|---|---|---|---|
| **G1** | P0-02 | matrix green both directions; snapshot diff = 3 rows; 4 screenshots; PR lists changed routes | Sam |
| **G2** | P0-01 | build + tsc + 4 legacy suites + `GET /api/health` 200; SHA-256 parity table; route screenshots identical | Arati |
| **G3** | P0-03 (session) | one real sign-in end-to-end through the proxy, cookie in devtools, `GET /me` 200 | Nidhi |
| **G4** | P0-03 (authz) | 75-cell matrix server-side; `rg "legalx:role" web/src` → 0; three escalation attempts → 403 | Arati |
| **G5** | P0-04 | create ₹50,000 → hard reload → still there → visible from a second browser context | Arati |
| **G6** | P0-05 | one-character change alters the hash; UPDATE on an approved version raises; two approvals with two actors | Nidhi |
| **G7** | P0-07/P0-08 | tamper ₹50,000 → ₹5,000 → `PARITY_BLOCKED` with the field names; restore → passes | Sam |
| **G8** | P0-10/P0-11 | E2E spec green from a clean database | Arati |
| **G9** | freeze | D1–D10 each demonstrated; two clean rehearsals; deployed URL reachable | Nidhi |

A gate that cannot be evidenced is a gate that has not passed. Record it as blocked, not green.

---

## 9. Changing the contract

1. Propose the change in the PR description: endpoint, fields added/removed, who breaks.
2. Both sides acknowledge in a comment — the client owner and the server owner.
3. Land the server accepting **both** old and new shape for one task cycle if any client already calls it.
4. Update `API_CONTRACTS.md` in the same PR. A contract change without a doc change is rejected.
5. Never silently rename a field to "clean it up". Renames are the most expensive change here.

`api/openapi.yaml` is the machine-readable copy; CI diffs it against the running app's schema so the doc
and the code cannot drift.

---

## 10. Definition of "wired"

A screen is wired when all of the following hold — and "it looked right" is none of them:

1. Every value it displays came from an API response (verified by changing it server-side and reloading).
2. It has a loading, empty and error state, and the error state appears when the API is stopped.
3. Its mutations update from the mutation response, not from optimistic local state.
4. Its permission gate is a server decision surfaced in `/me`, and hiding the control is cosmetic only.
5. It renders no literal hash, score, date or balance that the API did not return.
6. `rg` for the old fixture in `src/` returns nothing but the labelled demo path.
