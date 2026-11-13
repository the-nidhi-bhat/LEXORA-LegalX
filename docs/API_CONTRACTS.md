# API_CONTRACTS.md — LEGALX v1 API contract

> **Status: planning artefact. Not implemented.** No endpoint in this document exists today.
> Sources of truth it is derived from: the approved architecture (`docs/audit/ARCHITECTURE_DECISION.md`),
> the approved task breakdown (`docs/EXECUTION_PLAN.md` v2), and the existing error-code vocabulary in
> `docs/API.md`. Where this document and `docs/API.md` differ, the difference is called out in §1.6.
>
> **Contract owner:** Sam (backend). **Co-owner:** Nidhi (IR + parity shapes). Changes follow §14.

---

## 1. Conventions

### 1.1 Base path and origin

| Environment | Browser origin | API origin | Notes |
|---|---|---|---|
| Dev | `http://localhost:3000` (Vite's actual configured port — **not** 5173) | `http://localhost:8000` via Vite proxy | `fetch('/api/v1/...')` — same-origin from the browser's point of view |
| Prod | `https://<deployed-host>` | same host | FastAPI serves `web/dist`; **single origin, no CORS middleware** |

- Business endpoints: **`/api/v1/...`**
- Infrastructure endpoint: **`/api/health`** (unversioned — liveness probes must not move)
- `EXECUTION_PLAN.md` §12 writes the prefix as `/api` shorthand; the wire path is `/api/v1`.
- `allow_origins=["*"]` may never appear in any config file. If a real CORS need appears, it is a decision,
  not a convenience.

### 1.2 Authentication

Server-managed sessions (decision **D-02**).

| Attribute | Value |
|---|---|
| Cookie name | `lx_session` |
| Cookie flags | `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` in production only |
| Value | opaque random token from `secrets.token_urlsafe(32)` — **not** a JWT, no custom encoding |
| Server storage | `sessions.token_hash` = SHA-256 of the token (raw token never stored) |
| Lifetime | 12 h sliding window, absolute cap 7 days |
| Revocation | `sessions.revoked_at` set on sign-out, password change, or admin action; every request checks it |
| Password hashing | `argon2-cffi` (`argon2id`), parameters tuned by the library defaults — **no hand-rolled hashing** |
| Session inspect | `GET /api/v1/me` returns the caller's identity + effective permissions |

### 1.3 CSRF

- Every non-`GET`/`HEAD` request must carry `X-CSRF-Token`.
- Token is issued by the session endpoint, bound to the session row, double-submitted from the response body
  into the page's memory (not `localStorage`).
- Missing/invalid → `403 CSRF_FAILED`. There is no exempt write endpoint.

### 1.4 Data conventions

| Concern | Rule |
|---|---|
| Body encoding | `application/json; charset=utf-8`; all field names **`snake_case`** |
| IDs | UUID v4 strings. Seed data uses deterministic `uuid5` so re-seeding is idempotent |
| Money | integer **minor units** + ISO-4217 code. `₹50,000` = `{"amount_minor": 5000000, "currency": "INR"}`. Floats rejected with `VALIDATION_FAILED` |
| Time | ISO-8601 UTC with `Z` (e.g. `2026-11-24T09:30:00Z`). Legal dates are plain `YYYY-MM-DD` |
| Version numbers | monotonic integers starting at `1`, per agreement. Never reused, never renumbered |
| Hashes | 64 lowercase hex SHA-256, always server-computed. A hash appearing in a request is only ever a *confirmation* of a hash the server already issued |
| Pagination | `?limit=<1..100, default 20>&cursor=<opaque>`; response `{"items": [...], "next_cursor": null|"..."}` |
| Idempotency | `Idempotency-Key: <uuid>` header supported on `POST /agreements` and `POST /agreements/{id}/versions`; same key + same body replays the original response for 24 h |
| Request correlation | Every response carries `X-Request-Id`; the same value appears in errors and in server logs |

### 1.5 Error envelope (normative)

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Milestone amounts must sum to the agreement total",
    "details": [
      { "field": "milestones[2].amount_minor", "code": "SUM_MISMATCH", "message": "2000000 != 2500000" }
    ],
    "request_id": "0f3c1a9e-8b1d-4c0a-9b1f-3d2e5a7c9b11"
  }
}
```

`details` is `[]` (never `null`) when there is nothing field-specific to say. `message` is safe to show to a
user; it never contains SQL, stack traces, secrets, or another tenant's identifiers.

### 1.6 Error codes

Codes 1–5 already exist in `docs/API.md` and are kept verbatim. The rest are additions this contract needs;
`docs/API.md` is not edited (audit-era document).

| Code | HTTP | Meaning | Retry? |
|---|---|---|---|
| `VALIDATION_FAILED` | 422 | Request body/query failed schema or business validation; see `details[]` | no |
| `MISSING_CLARIFICATION` | 409 | Required legal information absent; caller must resolve before proceeding | no |
| `PARITY_BLOCKED` | 409 | Execution refused because executable terms ≠ approved terms | no |
| `WRONG_NETWORK` | 409 | (P1 chain work only — reserved, unused in P0) | no |
| `INTEGRATION_UNAVAILABLE` | 503 | A configured external service is down; **never** faked | yes, backoff |
| `INVALID_CREDENTIALS` | 401 | Email/password pair rejected (identical response for unknown email and wrong password) | no |
| `UNAUTHENTICATED` | 401 | No session, expired session, or revoked session | no — sign in |
| `CSRF_FAILED` | 403 | Missing/mismatched CSRF token | no |
| `FORBIDDEN` | 403 | Authenticated but not permitted (permission or party check) | no |
| `NOT_FOUND` | 404 | Resource absent **or** outside the caller's organisation (deliberate indistinguishability) | no |
| `CONFLICT` | 409 | Version/legal-state precondition failed (generic) | no |
| `ALREADY_APPROVED` | 409 | This party already approved this exact version | no |
| `VERSION_NOT_APPROVED` | 409 | Operation requires an approved version; current one is a draft | no |
| `APPROVALS_INCOMPLETE` | 409 | Execution requires approvals from parties that have not approved the current version | no |
| `HASH_MISMATCH` | 422 | `confirm_sha256` supplied by the client ≠ hash of the current stored text | no |
| `RATE_LIMITED` | 429 | Too many attempts (sign-in: 5 / 15 min / email+IP) | yes, after `Retry-After` |

`403 FORBIDDEN` vs `404 NOT_FOUND`: cross-tenant access **always** returns 404, never 403 — a 403 would
confirm the resource exists.

> **Recorded divergence (needs a yes from the lead).** The pre-existing `docs/RBAC.md` says "return a generic
> 403 response without leaking resource existence across workspaces". This contract splits it: **404** for a
> resource outside the caller's organisation (nothing is confirmed, including existence), **403** for an
> authenticated member of the correct organisation who lacks the specific permission (their access to the tenant
> is already known, so nothing is leaked). The intent of `RBAC.md` is preserved; the vehicle differs. `RBAC.md`
> is not modified — it is a pre-existing project document, and changing it is the lead's call.

### 1.7 Route naming note

`docs/API.md` §3 proposes `POST /agreements/:id/versions/:version/verify` (verification as a verb on the
version). This contract keeps that path shape and adds an explicit `verification_runs` read model, because the
execution gate must be able to point at a *specific* historical run. No semantic change; a review note for Sam
to raise with Nidhi if she prefers otherwise.

---

## 2. Surface overview

| # | Method | Path | Auth | Permission (any-of) | Task |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | public | — | P0-01 |
| 2 | POST | `/api/v1/auth/session` | public (rate-limited) | — | P0-03 |
| 3 | DELETE | `/api/v1/auth/session` | session | — (any authenticated) | P0-03 |
| 4 | GET | `/api/v1/me` | session | — | P0-03 |
| 5 | GET | `/api/v1/agreements` | session | `agreement:view` | P0-04 |
| 6 | POST | `/api/v1/agreements` | session | `agreement:create` | P0-04 |
| 7 | GET | `/api/v1/agreements/{agreement_id}` | session | `agreement:view` + membership | P0-04 |
| 8 | PATCH | `/api/v1/agreements/{agreement_id}` | session | `agreement:edit` | P0-04 |
| 9 | GET | `/api/v1/agreements/{id}/versions` | session | `agreement:view` | P0-05 |
| 10 | POST | `/api/v1/agreements/{id}/versions` | session | `agreement:edit` | P0-05 |
| 11 | POST | `/api/v1/agreements/{id}/versions/{v}/approve` | session | `agreement:approve` **and** caller is a required party | P0-05 |
| 12 | POST | `/api/v1/agreements/{id}/versions/{v}/ir` | session | `agreement:edit` | P0-06 |
| 13 | GET | `/api/v1/agreements/{id}/versions/{v}/ir` | session | `ir:read` | P0-06 |
| 14 | POST | `/api/v1/agreements/{id}/execution-parameters` | session | `agreement:edit` | P0-07 |
| 15 | GET | `/api/v1/agreements/{id}/execution-parameters` | session | `verification:read` | P0-07 |
| 16 | POST | `/api/v1/agreements/{id}/execution-parameters/tamper` | session + demo flag | `agreement:edit` | P0-07 (N-05) |
| 17 | POST | `/api/v1/agreements/{id}/versions/{v}/parity` | session | `verification:run` | P0-07 |
| 18 | GET | `/api/v1/agreements/{id}/versions/{v}/parity` | session | `verification:read` | P0-07 |
| 19 | POST | `/api/v1/agreements/{id}/versions/{v}/verify` | session | `verification:run` | P0-08 |
| 20 | GET | `/api/v1/agreements/{id}/verification-status` | session | `verification:read` | P0-08 |
| 21 | POST | `/api/v1/agreements/{id}/milestones/{seq}/release` | session | `milestone:approve` | P0-08 |
| 22 | GET | `/api/v1/agreements/{id}/activity` | session | `activity:read` | P0-09 |
| 23 | POST | `/api/v1/agreements/{id}/versions/{v}/request-change` | session | `agreement:suggest` | P0-09 |

Every authenticated route additionally requires the caller to be a member of the agreement's organisation
(checked before the permission, and returning `404` when it fails).

**Every non-GET route — including `DELETE /auth/session` and the tamper route — additionally requires the
`X-CSRF-Token` header (§4). There are no CSRF exemptions.** The column above states authentication and
authorization only, so it is not repeated 11 times.

---

## 3. Authentication endpoints (P0-03)

### 3.1 `POST /api/v1/auth/session` — sign in

**Auth:** public. **Rate limit:** 5 attempts / 15 min per (email, IP). **CSRF:** not applicable (no session yet).

Request:

```json
{ "email": "owner@legalx.demo", "password": "<demo password>" }
```

Response `200`:

```json
{
  "user": {
    "id": "8f14e45f-ceea-467f-a1b2-6c1b2f9a0e33",
    "email": "owner@legalx.demo",
    "name": "Priya Nair",
    "initials": "PN",
    "role": "owner",
    "organization_id": "b2c3d4e5-0000-4000-8000-000000000001",
    "organization_name": "Acme Digital"
  },
  "permissions": ["agreement:create", "agreement:view", "ir:read", "verification:read", "..."],
  "csrf_token": "b7f1…",
  "expires_at": "2026-11-24T21:30:00Z"
}
```

Sets `Set-Cookie: lx_session=…; HttpOnly; Path=/; SameSite=Lax`.

Errors: `401 INVALID_CREDENTIALS` (unknown email and wrong password are indistinguishable, same timing
class), `422 VALIDATION_FAILED` (missing/invalid email shape), `429 RATE_LIMITED`.

**UI requirement:** every non-2xx here must produce a visible inline message. Silence is the current bug
(`UI_AUDIT.md`); a passing test that only asserts a status code does not close it.

### 3.2 `DELETE /api/v1/auth/session` — sign out

**Auth:** session. Sets `revoked_at`, clears the cookie, `204`. Replaying the old cookie → `401 UNAUTHENTICATED`.

### 3.3 `GET /api/v1/me`

Returns the same `user` + `permissions` + `csrf_token` shape as §3.1 **without** `password`/token material.
`401 UNAUTHENTICATED` when there is no live session.

**Contract note:** `permissions` is the *server's* view. The client may use it to hide UI, but every endpoint
re-checks; a client that lies about its permissions changes nothing.

---

## 4. Agreements (P0-04)

### 4.1 `GET /api/v1/agreements`

Query: `?status=draft|active|completed&limit=20&cursor=`. Response:

```json
{
  "items": [
    {
      "id": "0b6f…",
      "title": "Website project",
      "status": "active",
      "currency": "INR",
      "total_amount_minor": 5000000,
      "current_version": 3,
      "approval_policy": "all_parties",
      "parties": [
        { "role": "client", "name": "Priya Nair", "email": "owner@legalx.demo" },
        { "role": "provider", "name": "Rahul Mehta", "email": "freelancer@legalx.demo" }
      ],
      "created_at": "2026-11-18T10:02:11Z",
      "updated_at": "2026-11-20T16:44:03Z"
    }
  ],
  "next_cursor": null
}
```

### 4.2 `POST /api/v1/agreements`

Request (`Idempotency-Key` supported):

```json
{
  "title": "Website project",
  "agreement_type": "services",
  "currency": "INR",
  "total_amount_minor": 5000000,
  "approval_policy": "all_parties",
  "parties": [
    { "role": "client",   "name": "Priya Nair", "email": "owner@legalx.demo" },
    { "role": "provider", "name": "Rahul Mehta", "email": "freelancer@legalx.demo" }
  ],
  "milestones": [
    { "seq": 1, "name": "Design sign-off", "amount_minor": 2000000, "due_date": "2026-12-05", "acceptance_criteria": "Figma file approved" },
    { "seq": 2, "name": "Build complete",  "amount_minor": 3000000, "due_date": "2026-12-20", "acceptance_criteria": "Staging URL signed off" }
  ],
  "review_period_days": 5,
  "review_period_basis": "business"
}
```

Response `201`: the §4.1 item shape plus `"created_version": 1` (a draft `agreement_versions` row is created
in the same transaction — no agreement ever exists without a version).

**Validation rules enforced here (authoritative list, mirrored in `validation.ts` for inline UX only):**

| Rule | Failure |
|---|---|
| `title` 3…200 chars, non-blank | `VALIDATION_FAILED` |
| ≥2 parties, unique `role`+`email`, roles ⊆ {`client`,`provider`,`witness`} | `VALIDATION_FAILED` |
| `total_amount_minor` integer > 0 | `VALIDATION_FAILED` |
| `currency` ∈ ISO-4217 allow-list (P0: `INR`) | `VALIDATION_FAILED` |
| ≥1 milestone; `seq` unique and contiguous from 1 | `VALIDATION_FAILED` |
| Σ `milestones[].amount_minor` == `total_amount_minor` | `VALIDATION_FAILED` + `SUM_MISMATCH` |
| each milestone `amount_minor` integer > 0 | `VALIDATION_FAILED` |
| `due_date` parses as `YYYY-MM-DD` and is not in the past | `VALIDATION_FAILED` |
| `review_period_days` integer 1…90 | `VALIDATION_FAILED` |
| `review_period_basis` ∈ {`calendar`,`business`} | `VALIDATION_FAILED` |
| `approval_policy` ∈ {`all_parties`,`client_only`} | `VALIDATION_FAILED` |
| float anywhere in a money field | `VALIDATION_FAILED` (`TYPE_MISMATCH`) |

### 4.3 `GET /api/v1/agreements/{agreement_id}`

Adds to §4.1: `milestones[]` (with `status`), `extra_terms` (free text, ≤ 20 000 chars), and
`current_version_id`. Cross-organisation → `404 NOT_FOUND`.

### 4.4 `PATCH /api/v1/agreements/{agreement_id}`

Partial update of `title`, `milestones`, `review_period_*`, `approval_policy`. **Not** allowed once the current
version has any approval — that is a contractual change and must go through `POST …/versions`
(`409 CONFLICT` with a message telling the user to create a new version).

---

## 5. Versions and approvals (P0-05)

### 5.1 `POST /api/v1/agreements/{id}/versions`

Creates `version = current + 1` as a draft snapshot.

Request:

```json
{
  "text": "1. Scope …\n2. Payment …\n3. Milestones …\n",
  "change_summary": "Adjusted milestone 2 amount"
}
```

Response `201`:

```json
{
  "version_id": "c1a2…",
  "version": 4,
  "status": "draft",
  "sha256": "9f2c1d…64 hex…",
  "hash_algorithm": "sha256",
  "canonical_length": 812,
  "created_at": "2026-11-20T17:01:22Z",
  "created_by": "8f14e45f-…",
  "is_fully_approved": false,
  "required_approvals": ["client", "provider"],
  "approvals": []
}
```

Server hashes the **canonical** text (documented in `EXECUTION_PLAN.md` §7 and `docs/INTEGRITY_AND_HASHING.md`):
CRLF→LF, per-line trailing whitespace stripped, outer blank lines trimmed, Unicode NFC, then
`sha256(utf-8)`. The original text is stored byte-for-byte.

### 5.2 `POST /api/v1/agreements/{id}/versions/{v}/approve`

Request:

```json
{ "confirm_sha256": "9f2c1d…64 hex…" }
```

Response `201`:

```json
{
  "version": 4,
  "approvals": [
    { "party_role": "client", "actor_name": "Priya Nair", "approved_at": "2026-11-24T09:12:00Z", "confirmed_sha256": "9f2c1d…" }
  ],
  "required_approvals": ["client", "provider"],
  "is_fully_approved": false
}
```

Errors: `409 ALREADY_APPROVED` (unique `(version_id, party_role)`), `422 HASH_MISMATCH` (the text changed
since the client rendered it — catch a concurrent edit), `403 FORBIDDEN` (caller is not a required party),
`409 CONFLICT` (version already frozen by another party's approval and caller is trying to modify text).

**D-06 semantics:** one row per required party. `is_fully_approved` is *computed* (`required ⊆ approved`),
never stored. A single boolean never stands in for multiple parties.

### 5.3 `GET /api/v1/agreements/{id}/versions`

`{"items":[{version, status, sha256, created_at, created_by, is_fully_approved, approvals:[…]}]}` ordered
`version DESC`. Never returns the text of a version the caller's role cannot read.

---

## 6. Contract IR (P0-06)

### 6.1 `POST /api/v1/agreements/{id}/versions/{v}/ir`

Derives and stores the IR for an **approved** version. Response `201`:

```json
{
  "ir": {
    "schema_version": "ir/1",
    "agreement_id": "0b6f…",
    "version_id": "c1a2…",
    "agreement_type": "services",
    "currency": "INR",
    "total_amount_minor": 5000000,
    "parties": [
      { "role": "client",   "name": "Priya Nair", "email": "owner@legalx.demo" },
      { "role": "provider", "name": "Rahul Mehta", "email": "freelancer@legalx.demo" }
    ],
    "milestones": [
      { "seq": 1, "name": "Design sign-off", "amount_minor": 2000000, "due_date": "2026-12-05", "acceptance_criteria": "Figma file approved" }
    ],
    "review_period_days": 5,
    "review_period_basis": "business",
    "dispute_behavior": "escalate_to_arbitration",
    "governing_law": "IN"
  },
  "ir_sha256": "4d1e…64 hex…",
  "derived_by": "deterministic",
  "provenance": [
    { "field": "total_amount_minor", "source_span": { "start": 412, "end": 428 } }
  ]
}
```

Errors: `409 VERSION_NOT_APPROVED` (draft), `404 NOT_FOUND`, `409 MISSING_CLARIFICATION` (a required legal
fact is absent — the deriver refuses rather than guessing).

**`derived_by`** ∈ {`deterministic`}. The P0 enum has exactly one member on purpose; a future `ai` value
requires the feature flag and a new decision. The UI must display this value next to the IR.

### 6.2 `GET /api/v1/agreements/{id}/versions/{v}/ir`

Same body, `200`. `404` + `code: NOT_FOUND` when no IR has been derived. Requires `ir:read`.

**Cross-version rule:** an IR carries `schema_version`; parity refuses to compare two different
`schema_version` values (`409 CONFLICT`).

---

## 7. Execution parameters and parity (P0-07)

### 7.1 `POST /api/v1/agreements/{id}/execution-parameters`

Derives the executable parameter set from the approved IR. Creates a **new artefact row** (D-05) — never
mutates the approved version.

Response `201`:

```json
{
  "id": "77ab…",
  "version_id": "c1a2…",
  "source": "derived",
  "params": {
    "schema_version": "exec/1",
    "currency": "INR",
    "total_amount_minor": 5000000,
    "parties": [{ "role": "client", "email": "owner@legalx.demo" }, { "role": "provider", "email": "freelancer@legalx.demo" }],
    "milestones": [{ "seq": 1, "name": "Design sign-off", "amount_minor": 2000000, "due_date": "2026-12-05", "acceptance_criteria": "Figma file approved" }],
    "review_period_days": 5,
    "review_period_basis": "business",
    "dispute_behavior": "escalate_to_arbitration"
  },
  "params_sha256": "b93a…64 hex…",
  "derived_at": "2026-11-24T09:20:00Z"
}
```

### 7.2 `GET /api/v1/agreements/{id}/execution-parameters`

`200` current artefact for the current version, or `404 NOT_FOUND`. Requires `verification:read`.

### 7.3 `POST /api/v1/agreements/{id}/execution-parameters/tamper` (demo only)

**Guarded by `DEMO_TAMPER_ENDPOINT` (default `false`; `true` only in the demo environment — N-05).** When off,
the route returns `404 NOT_FOUND` and does not exist in the OpenAPI schema.

Request: `{ "field": "total_amount_minor", "value": 500000 }` (₹50,000 → ₹5,000).
Response `200` with `"source": "tampered_demo"` and a recomputed `params_sha256`.

This is the **only** write path that can make executable terms disagree with approved terms, it is explicit,
labelled `tampered_demo` in the database, and it is asserted off in production by a config test. The demo must
never need it in a deployed build.

### 7.4 `POST /api/v1/agreements/{id}/versions/{v}/parity`

Compares the stored **approved IR** against the stored **execution parameters** for the same version. No
request body — inputs are artefacts, not caller-supplied JSON (otherwise a caller could submit a
pre-approved pair and manufacture a "pass").

Response `200`:

```json
{
  "run_id": "5c9d…",
  "agreement_id": "0b6f…",
  "version_id": "c1a2…",
  "policy_version": "parity/1",
  "passed": false,
  "checked_at": "2026-11-24T09:21:03Z",
  "critical_count": 3,
  "advisory_count": 0,
  "rows": [
    { "field": "total_amount_minor", "expected": 5000000, "actual": 500000, "severity": "critical", "code": "VALUE_MISMATCH" },
    { "field": "milestones[1].amount_minor", "expected": 3000000, "actual": 300000, "severity": "critical", "code": "VALUE_MISMATCH" },
    { "field": "milestone_sum", "expected": 5000000, "actual": 500000, "severity": "critical", "code": "SUM_MISMATCH" }
  ],
  "result_sha256": "e07b…64 hex…"
}
```

- `rows` is ordered by the fixed comparison table in `EXECUTION_PLAN.md` §9 → identical inputs always produce
  a byte-identical body, therefore an identical `result_sha256`.
- No `score`. There is no field anywhere in this contract that can hold a percentage or a friendly sentence
  about tampering. A UI that wants to say "3 critical mismatches" must count `critical_count`.

### 7.5 `GET /api/v1/agreements/{id}/versions/{v}/parity`

Latest run for that version, `200`, or `404 NOT_FOUND`.

---

## 8. Verification and the execution gate (P0-08)

### 8.1 `POST /api/v1/agreements/{id}/versions/{v}/verify`

Runs parity (and any other registered check) and persists an immutable `verification_runs` row.

Response `201`:

```json
{
  "run_id": "aa31…",
  "version_id": "c1a2…",
  "passed": false,
  "parity_run_id": "5c9d…",
  "critical_count": 3,
  "blocking_fields": ["total_amount_minor", "milestones[1].amount_minor", "milestone_sum"],
  "approvals_complete": true,
  "verified_at": "2026-11-24T09:21:30Z",
  "verified_by": "8f14e45f-…"
}
```

### 8.2 `GET /api/v1/agreements/{id}/verification-status`

```json
{
  "agreement_id": "0b6f…",
  "current_version": 4,
  "is_fully_approved": true,
  "required_approvals": ["client", "provider"],
  "approved_parties": ["client", "provider"],
  "latest_verification": { "run_id": "aa31…", "passed": false, "verified_at": "2026-11-24T09:21:30Z" },
  "executable": false,
  "blocking_reasons": [
    { "code": "PARITY_BLOCKED", "message": "Executable total (₹5,000) does not match approved total (₹50,000)" }
  ]
}
```

`executable` is computed on every request from stored rows — it is never cached, never client-supplied.

### 8.3 `POST /api/v1/agreements/{id}/milestones/{seq}/release`

The one endpoint that authorises money movement (simulated in P0).

Authorization, in order: session → membership → `milestone:approve` → milestone belongs to the **current**
version → **all required party approvals present for the current version** → a **passing** `verification_runs`
row for the **current** version.

Response `200`:

```json
{ "milestone_seq": 1, "status": "released", "release_id": "f2b7…", "released_at": "2026-11-24T09:24:00Z", "execution_mode": "simulated" }
```

Errors:

| Condition | Response |
|---|---|
| parity failed | `409 PARITY_BLOCKED` + `details[].field` = blocking field names |
| approvals missing | `409 APPROVALS_INCOMPLETE` + `details[].field` listing missing `party_role` |
| version is a draft | `409 VERSION_NOT_APPROVED` |
| milestone belongs to an older version | `409 CONFLICT` (+ message: re-verify the current version) |
| already released | `409 CONFLICT` (`state: released`) |
| not permitted | `403 FORBIDDEN` |
| other tenant | `404 NOT_FOUND` |

`execution_mode` ∈ {`simulated`} in P0. Every refusal writes an activity event with the reason code — a blocked
release is evidence, not a silent no-op.

---

## 9. Activity and review (P0-09)

### 9.1 `GET /api/v1/agreements/{id}/activity`

`{"items":[{ "id", "type", "actor": {"id","name","role"}, "at", "version", "summary", "metadata" }], "next_cursor"}`.
`type` is a closed enum: `agreement.created`, `version.created`, `version.approved`,
`version.rejected`, `ir.derived`, `parity.run`, `verification.run`, `execution.blocked`,
`execution.released`, `review.requested`. Sorted `at DESC`.

### 9.2 `POST /api/v1/agreements/{id}/versions/{v}/request-change`

```json
{ "reason": "Milestone 2 acceptance criteria are ambiguous", "field": "milestones[1].acceptance_criteria" }
```

Response `201`: `{ "new_version": 5, "status": "draft", "requested_by": "…", "event_id": "…" }`.
`reason` required, 10…2000 chars (`422 VALIDATION_FAILED`). Creates the next draft version and a
`review.requested` event. The requester cannot approve as a required party on the same request.

---

## 10. Health

`GET /api/health` → `200`:

```json
{ "status": "ok", "version": "db5a2ad", "db": "ok" }
```

`db` ∈ {`ok`,`unavailable`}. Public, unauthenticated, no PII, no configuration values, never a stack trace.
`status` is `ok` when the process is serving; it does not claim the database is healthy — `db` says that.

---

## 11. Database ownership

Nobody edits another owner's schema without review. One migration = one owner.

| Table | Owner | Written by | Read by |
|---|---|---|---|
| `organizations` | Sam | P0-03 seed | all |
| `users` | Sam | P0-03 seed / sign-up | `/me`, approvals |
| `sessions` | Sam | P0-03 auth | auth dependency |
| `memberships` | Sam | P0-03 seed | authz |
| `agreements` | Sam | P0-04 | everything downstream |
| `agreement_parties` | Sam | P0-04 | IR, parity, approvals |
| `milestones` | Sam | P0-04 | execution, parity |
| `agreement_versions` | Sam | P0-05 (immutable after approval) | IR, parity, verification |
| `version_approvals` | Sam | P0-05 | execution gate |
| `ir_documents` | **Sam** (schema) / Nidhi (content contract) | P0-06 | parity |
| `execution_parameters` | Sam | P0-07 | parity, verification |
| `parity_runs` | **Sam** (schema) / Nidhi (row semantics) | P0-07 | verification |
| `verification_runs` | Sam | P0-08 | execution gate |
| `activity_events` | Sam | P0-04+ | `/activity` |

Rule: Nidhi owns the **pure comparison and derivation logic** (`app/parity/compare.py`, `app/ir/derive.py`) and
may not add tables; Sam owns every table and every migration. Iffa owns no schema and may not create one.

---

## 12. Shared TypeScript / Python types

Wire format is canonical `snake_case` JSON. Python models are pydantic v2 in `api/app/schemas/*.py`. TypeScript
types live in `web/src/lib/types/api.ts`.

| Concept | Python | TypeScript | Notes |
|---|---|---|---|
| Money | `Money(amount_minor: conint(gt=0), currency: Currency)` | `{ amount_minor: number; currency: 'INR' }` | `number` is safe: minor units ≤ 2^53 |
| Party | `Party(role: PartyRole, name, email)` | `Party` | `PartyRole = 'client'\|'provider'\|'witness'` |
| Agreement | `AgreementOut` | `Agreement` | mirrors §4.1 |
| Version | `VersionOut` | `AgreementVersion` | `sha256: string` (64 hex) |
| Approval | `ApprovalOut` | `VersionApproval` | one per `(version, party_role)` |
| IR | `IRDocument` (`app/schemas/ir.py`) | `ContractIR` | `schema_version: 'ir/1'` |
| Exec params | `ExecutionParams` | `ExecutionParameters` | `source: 'derived'\|'tampered_demo'` |
| Parity | `ParityResult` | `ParityResult` | `rows: ParityRow[]`, no score field |
| Verification | `VerificationRun` | `VerificationRun` | immutable |
| Error | `ApiError` | `ApiError` | §1.5 |

**Generation policy.** The single source is `api/openapi.yaml` (Sam). `web/src/lib/types/api.ts` is generated
from it. `openapi-typescript` is a dev dependency **not yet installed**; installing it requires lead approval
(planning-only phase). Until then `api.ts` is hand-maintained and CI diffs it against the OpenAPI schema, so
drift fails the build instead of producing a runtime surprise.

Forbidden: hand-copied enums in components, `any` at an API boundary, a UI type with a field the API does not
return.

---

## 13. Validation responsibility

**The server is authoritative.** Client validation exists only to make errors appear next to the field.

| Check | Server (authoritative) | Client mirror | Test that proves it |
|---|---|---|---|
| Required fields present | ✅ pydantic | ✅ | 8-payload rejection matrix (P0-04) |
| String length / blank | ✅ | ✅ | as above |
| Money is integer minor units | ✅ `conint` + explicit `float`/`bool` rejection | ✅ type guard | post `50000.5` → 422 |
| Σ milestones == total | ✅ model validator | ✅ | `SUM_MISMATCH` |
| Date not in the past | ✅ | ⚠️ display only | `422` test |
| Version is approved before IR | ✅ | ✅ disable button | `409 VERSION_NOT_APPROVED` |
| Caller is a required party | ✅ | ⚠️ hide button | `403` test |
| All approvals present | ✅ | ✅ read-only display | `409 APPROVALS_INCOMPLETE` |
| Parity passed | ✅ | ✅ read-only display | `409 PARITY_BLOCKED` |
| Hash matches current text | ✅ (recomputed) | sends `confirm_sha256` | `422 HASH_MISMATCH` |
| Permission | ✅ `require(permission)` | ⚠️ nav hiding | 75-cell server matrix |

A client-side check that is not backed by a server-side check is a **bug**, not a defence. The specific historic
failure this prevents is `SECURITY_AUDIT.md` H1: an authorization decision that lives in the browser.

---

## 14. Contract change process

1. Any change to a request/response shape is proposed as a PR touching `api/openapi.yaml` + this document.
2. Requires **Sam + Nidhi** approval; a breaking change also requires the project lead (**Nidhi as lead**).
3. Breaking changes are not permitted after the Sprint-1 merge of the affected endpoint — add a field instead
   of renaming one.
4. Every new error code is added to §1.6 in the same PR as the code that raises it.
5. Removing a field requires grepping the frontend: `rg "<field_name>" web/src` must show no live consumer.

## 15. Mock policy

- Mock responses are allowed **only** before the endpoint exists, **only** in `web/src/lib/mocks/`, and every
  screen using one must render `data-source="mock"` plus a visible label.
- A mock may never be returned by `web/src/lib/api.ts` when the real call fails. Failure surfaces as an error
  state; it does not silently degrade to a fixture. Silent fallback is how `74/100` survived the audit.
- Test-fixture data (e.g. the ₹50 000 agreement) is created through the API by the seed script — not imported
  into the UI as a module constant.
