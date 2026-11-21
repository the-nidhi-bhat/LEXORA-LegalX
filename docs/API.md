# API reference — the real HTTP surface

This document describes the **implemented** FastAPI surface: **15 domain routes across 7 routers**, registered in `api/app/main.py:180–210`. It replaces an earlier note that said "the browser demo currently has no server API" — that was true of an earlier static-prototype state, not of the current backend.

There is **no** HTTP endpoint for review, tamper, verify-execution, Contract IR, `execution/prepare`, `interpret`, `webhooks/chain`, or `health/integrations`. Routes named in `docs/DECISIONS.md` ADR 009 and the old `docs/API.md` include *planned* contracts; they are not implemented here. The only parity routes are the two listed under [Parity](#7-parity-two-routes) below.

## Conventions

- **Base path:** `/api/v1` for all domain routers except health, which is `/api/health` (no version prefix).
- **Interactive docs:** `/api/docs`; OpenAPI JSON at `/api/openapi.json`; ReDoc is disabled.
- **Request ID:** every response carries `X-Request-Id`. A caller-supplied `x-request-id` is echoed.
- **Error envelope:** every failure uses the same shape, produced by `api/app/errors.py:error_body`:
  ```json
  {"error": {"code": "VALIDATION_FAILED", "message": "The request body failed validation.", "details": [{"field": "body.field", "code": "REQUIRED", "message": "Field required"}], "request_id": "..."}}
  ```
  Common codes: `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `CSRF_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`, `INTEGRATION_UNAVAILABLE`, `HASH_MISMATCH`, `ALREADY_APPROVED`, `MISSING_CLARIFICATION`.
- **Authentication:** all `/api/v1` routes except sign-in use the `lx_session` cookie (HttpOnly, SameSite=Lax; `Secure` in production). Sessions are server-side rows; client-supplied roles, user IDs, and workspace IDs are never trusted.
- **CSRF:** every non-GET request (including `DELETE /auth/session`) must send `X-CSRF-Token` with the token returned by sign-in or `GET /me`. Missing/tampered tokens return `403 CSRF_FAILED`.
- **Organization scope:** resources are scoped through `session → membership → permission → resource state → domain gate`. A cross-workspace or unknown ID returns the same `404`, so existence is not leaked. In-tenant permission failures return `403`.
- **Rate limiting:** sign-in, verify, and execution use the shared **per-instance in-memory** limiter in `api/app/ratelimit.py`. Denials return `429 RATE_LIMITED` with `Retry-After`. This limiter is not shared across processes — an owner-accepted, documented limitation.
- **Strict schemas:** request bodies that reach the parity surface use `extra="forbid"`. Additional fields are rejected with `422 VALIDATION_FAILED`.

### Route-inventory caveat (`_IncludedRouter`)

A superficial read of `create_app().routes` shows 3 built-in routes plus 7 `_IncludedRouter` wrappers, which **undercounts** the domain surface. Enumerating `.original_router.routes` yields the 7 routers / 15 routes below. This is a FastAPI/Starlette registration detail, not seven missing endpoints. The count was re-confirmed in `docs/PHASE6_DELIVERY_REPORT.md` §4 and `docs/STATE.md:206–208`.

---

## 1. Health — 1 route (public, unauthenticated)

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | Liveness plus a trivial DB probe; no PII and no configuration values |

Response (illustrative shape from `api/app/routers/health.py:42–48`):

```json
{"status": "ok", "version": "22dbf21f", "db": "ok"}
```

`version` is the first 8 characters of HEAD's git SHA at process start, or `"unknown"` outside a git checkout.

---

## 2. Auth — 3 routes

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/session` | public, rate-limited | Sign in; sets the session cookie and returns a CSRF token. No CSRF header needed — no session exists yet. |
| `GET` | `/api/v1/me` | session | Server-computed identity, permissions, CSRF token, and expiry |
| `DELETE` | `/api/v1/auth/session` | session + CSRF | Revoke the session row and clear the cookie; returns `204` |

Sign-in body: `{"email": "...", "password": "..."}` (`SignInRequest`). Failures are rate-limited per `(email, IP)` with `Retry-After`. A successful `SessionOut` contains `user` (`id`, `email`, `name`, `initials`, `role`, `organization_id`, `organization_name`), `permissions`, `csrf_token`, and `expires_at`.

---

## 3. Agreements — 4 routes

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/agreements` | `agreement:view` | List workspace agreements; optional `status`, `limit` (1–100), opaque `cursor` |
| `POST` | `/api/v1/agreements` | `agreement:create` | Create an idempotent draft, version 1, parties, milestones; `201` |
| `GET` | `/api/v1/agreements/{agreement_id}` | `agreement:view` | Agreement detail: parties, milestones, current version |
| `PATCH` | `/api/v1/agreements/{agreement_id}` | `agreement:edit` | Edit an unapproved current version. If the current version has any approval, returns `409` directing the caller to create a new version. |

`POST` / `PATCH` use an `Idempotency-Key` header and a request hash. A create stores the canonical SHA-256 and canonical length of the text. Validation of the create body includes the client-only party-detail rule.

---

## 4. Versions — 3 routes

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/agreements/{agreement_id}/versions` | `agreement:view` | Versions newest-first with `sha256`, `status`, approval state; `required_approvals` is intentionally omitted from the item shape |
| `POST` | `/api/v1/agreements/{agreement_id}/versions` | `agreement:edit` | Create the next draft version, re-stamp milestones, make it current, reopen an active agreement to draft; `201` |
| `POST` | `/api/v1/agreements/{agreement_id}/versions/{version_number}/approve` | `agreement:approve` | Record a required party's approval of the exact version hash; `201` |

Approval requires `confirm_sha256` to equal the server's stored hash; otherwise `422 HASH_MISMATCH`. Duplicate approval returns `409 ALREADY_APPROVED`. A `UNIQUE(agreement_id, version)` race surfaces as `409 CONFLICT`. Approval of a version freezes it for editing.

---

## 5. Activity — 1 route

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/activity` | `activity:read` | Cursor-paginated activity events, newest-first; optional `agreement_id`, `limit` (1–100), `cursor` |

A cross-workspace `agreement_id` returns `404`; events are restricted to agreements in the session's organization (`api/app/routers/activity.py:60–110`).

---

## 6. Execution — 1 route

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/agreements/{agreement_id}/execution` | `verification:run` + CSRF | Execute an agreement after verification; `Idempotency-Key` supported |

The gate checks, in order: per-instance rate limit (`429` + `Retry-After`), org-scoped agreement load (`404`), required approvals on the **current** version, approved-party membership, and `draft` state. Failures return `403 FORBIDDEN` with an explanatory message. The state transition is a single conditional `UPDATE ... WHERE status = 'draft'`; zero matched rows means a concurrent change won the race and the handler reports the persisted condition rather than a stale cached `draft` value. A repeated `Idempotency-Key` within the 24 h window returns `status: "idempotent_replay"`; a first success returns `status: "executed"`, `agreement_id`, `version`, `approval_policy`, `triggered_by`, `executed_at`, `idempotent`.

**No wallet, network, chain, or transaction call is made.** The result is an application state transition plus an activity event, not an on-chain action.

---

## 7. Parity — 2 routes

These are the only parity endpoints. Both load the agreement through the organization-scoped helper and resolve the target version (explicit number, or current version when omitted).

### `POST /api/v1/agreements/{agreement_id}/versions/{version}/verify`

Permission: `verification:run` + CSRF. Engine-backed; appends an immutable verification run.

Request body (`api/app/schemas/parity.py`, `extra="forbid"` at both levels):

```json
{
  "execution_parameters": {
    "dispute_behavior": "mediate",
    "governing_law": "India"
  }
}
```

`dispute_behavior` and `governing_law` are the **only** client-chosen legal fields. `agreement_id`, `version`, agreed money, parties, milestones, and review terms are derived server-side; sending them yields `422 VALIDATION_FAILED`. A gap that is unfilled on both sides yields `409 MISSING_CLARIFICATION`. Repeated calls past the shared limiter threshold yield `429 RATE_LIMITED` with `Retry-After`.

Response shape (`api/app/parity/service.py:340–347`):

```json
{
  "result": { "...": "serialized ParityResult, including overall_status, is_blocked, field_results, both hashes, engine and rules versions, verified_at" },
  "verification_run_id": "...",
  "approvals_complete": true,
  "passed": true,
  "stale": false
}
```

`passed` is **informational only** — a true value never grants execution. It is `(not result.is_blocked) and approvals_complete`. The frontend sends exactly the two-field payload shown above.

### `GET /api/v1/agreements/{agreement_id}/trust-passport`

Permission: `verification:read`. Query: optional `version` (integer). Response shape (`api/app/parity/service.py:419–442`):

```json
{
  "agreement_id": "...",
  "version": 1,
  "version_id": "...",
  "verification_run_id": "...",
  "overall_status": "match",
  "stale": false,
  "recommendation": "...",
  "is_blocked": false,
  "has_advisory_diffs": false,
  "passed": true,
  "approvals_complete": true,
  "approved_ir_hash": "...",
  "execution_params_hash": "...",
  "canonicalization_version": "...",
  "parity_rules_version": "...",
  "current_approved_ir_hash": "...",
  "current_execution_params_hash": "...",
  "canonicalization_version_current": "...",
  "field_results": [],
  "critical_count": 0,
  "message": "",
  "verified_at": "..."
}
```

The passport is **evidence-only**: re-derived and re-hashed on every call, contains no private document text and no IR JSON, and reports `stale` rather than reusing an outdated "match". The UI renders it read-only.

---

## Route inventory at a glance

| Router | Count | Routes |
| --- | --- | --- |
| health | 1 | `GET /api/health` |
| auth | 3 | `POST`, `DELETE /api/v1/auth/session`; `GET /api/v1/me` |
| agreements | 4 | `GET`, `POST /api/v1/agreements`; `GET`, `PATCH /api/v1/agreements/{agreement_id}` |
| versions | 3 | `GET`, `POST .../versions`; `POST .../versions/{version_number}/approve` |
| activity | 1 | `GET /api/v1/activity` |
| execution | 1 | `POST /api/v1/agreements/{agreement_id}/execution` |
| parity | 2 | `POST .../versions/{version}/verify`; `GET .../trust-passport` |
| **Total** | **15** | **7 routers** |

Related reading: [security](./SECURITY.md), [RBAC](RBAC.md), [testing](TESTING.md), [final delivery report](../final-delivery/FINAL_MASTER_REPORT.md).
