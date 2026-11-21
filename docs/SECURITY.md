# Security

## Scope and honesty statement

This document records **implemented** controls and **known gaps**. It is not a professional audit, not a penetration-test report, and not a certification. LEGALX makes no claim of legal enforceability, WCAG conformance, or production hardening beyond what is listed here. Where a control is partial or deferred, it is labelled as such.

The application has two halves with different security postures:

- **Public/static SPA** (`src/App.tsx`, `src/components/`, `public/`): a guest demo with deterministic fixtures. No secret belongs in this bundle.
- **FastAPI backend** (`api/app/`): server-side sessions, role-based authorization, organization-scoped queries, and the execution/parity gates. This is the security boundary that matters.

Verification figures referenced below reflect authoritative **M5 results** with captured output (pytest 447/3/1 in 91.04 s, tsc exit 0, npm test 9/9, build exit 0, parity E2E 10/0/0 in 1.7m, rehearse:judge PASS 30/30 + 5/5) as recorded in `docs/final-delivery/PHASE_10_TESTING.md`.

## Implemented controls

### Authentication and sessions

- `POST /api/v1/auth/session` verifies an argon2id password hash and creates a **server-side** session row. The client receives an opaque token in the `lx_session` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when configured for production, path `/`.
- Only a SHA-256 hash of the token is stored (`api/app/security.py:hash_token`). Sliding expiry and an absolute cap are configured through `SESSION_TTL_HOURS` and `SESSION_ABSOLUTE_DAYS` (names only; never values in docs).
- `GET /api/v1/me` returns identity and **server-computed** permissions. The client does not decide its own role.
- `DELETE /api/v1/auth/session` revokes the row before responding and clears the cookie.
- Sign-in is rate-limited per `(email, IP)`; invalid credentials use a dummy verification to reduce user-enumeration timing signal.

### CSRF

- Every non-GET `/api/v1` request — including `DELETE /auth/session` — must send `X-CSRF-Token` with the value returned at sign-in or from `/me`.
- The token is compared in constant time (`api/app/security.py`). Missing or mismatched tokens return `403 CSRF_FAILED`.
- The demo parity flow reads the CSRF token into its state and includes it on live-mode calls; the demo path does not call the backend.

### Authorization (RBAC) and organization isolation

- Authorization chain: `session → membership → permission → resource state → domain gate` (`api/app/deps.py`, `api/app/rbac.py`).
- Client-supplied roles, user IDs, and workspace IDs are **never** trusted. Every protected route uses `require("permission")` and the session context.
- Cross-workspace and unknown resource IDs both return `404`, so resource existence is not disclosed. In-workspace permission failures return `403`.
- Agreement, version, activity, parity, and execution queries are organization-scoped (`ActivityEvent` filtering via agreement join; parity loads through `_load_agreement`).
- Five UI roles exist (Agreement Owner, Freelancer/Contractor, Legal Reviewer, Organization Admin, Technical Auditor). The **frontend role switcher is a local demo construct**; production identity binding is not implemented.
- Protected UI routes are checked before component mount and show a 403-style state when denied; server-side negative tests live in `scripts/test-rbac.mjs`.

### Strict request validation

- Parity payload schema uses `extra="forbid"` at both the outer request and the nested execution-parameters model (`api/app/schemas/parity.py`). Only `dispute_behavior` and `governing_law` are accepted. Attempts to override `agreement_id`, `version`, agreed money, parties, or milestones return `422 VALIDATION_FAILED`.
- The frontend sends exactly that two-field payload. A prior high-severity defect (an 8-field payload causing `422`) was fixed **frontend-side**; the strict backend schema was deliberately not weakened.
- Version approval requires `confirm_sha256` to equal the server's stored hash; otherwise `422 HASH_MISMATCH`. Duplicate approvals return `409 ALREADY_APPROVED`.

### Execution and parity gates

- Execution checks, in order: rate limit, org-scoped load, approvals on the **current** version, approved-party membership, and `draft` state. Failures block with `403`.
- The state transition is one conditional `UPDATE ... WHERE status = 'draft'`; zero matched rows mean a concurrent change won the race, and the message describes the persisted condition rather than a stale cached value.
- `Idempotency-Key` replay is scoped to user + endpoint + request hash within a 24 h window; a mismatched payload on a reused key returns `409`.
- Verification runs are append-only, organization-scoped, and written in the same transaction that returns the result. Hash/version bindings make a stale result report `stale` instead of being reused.
- Trust Passport is **evidence-only**: re-derived and re-hashed on every call, no private document text, no IR JSON, rendered read-only in the UI. A `passed: true` value is informational and never grants execution by itself.
- Legal-gate files were verified at M5 (HEAD `b1b5eba`, `git diff --check` 0): `engine.py 85E4D3EE…ACC2`, `comparison_rules.py C0FDBF4A…DE434`, `schemas/parity.py DCFE9E1E…98B525` are byte-identical. `api/app/routers/execution.py 06737F3C…24207C` carries authorized M1 changes (429/concurrency fix) with gate logic intact; no workstream weakened a gate.

### Error handling and transport

- One error envelope for every failure path, with stable codes and a request ID (`api/app/errors.py`, `api/app/main.py`).
- Unhandled exceptions are logged server-side and returned as `500 INTERNAL_ERROR` — stack traces and SQL are never sent to the client.
- CORS is added only when concrete origins are configured; no wildcard origin. Allowed methods and headers are explicit.
- `X-Request-Id` is echoed for correlation across client and server logs.

### Secrets handling

- Keep server-only secrets out of client bundles and repositories. Never commit `.env`, credentials, private keys, or connection strings.
- Configuration is read from environment **names only**: `APP_ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `DEMO_TAMPER_ENDPOINT`, `LOG_LEVEL`, `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS`, `FEATURE_AI_EXTRACTION`, `LOGIN_RATE_LIMIT_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `GEMINI_API_KEY`, `LEGALX_GEMINI_MODEL`, and frontend `VITE_API_BASE_URL`. No value appears in this document or any report.
- In production (`APP_ENV=production`) the backend hard-rejects a non-PostgreSQL `DATABASE_URL` (`api/app/config.py:97–102`).
- Never place sensitive agreement content in public HTML or public storage paths. A real deployment would use short-lived signed URLs for private documents; that integration is **not connected** today.

## Known limitations — read this before trusting the system

| Limitation | Impact | Disposition |
|---|---|---|
| **Per-instance in-memory rate limiter** | `api/app/ratelimit.py` state is process-local. Multiple workers/instances do not share counters, so an attacker can spread attempts across instances. | Owner-accepted and documented (FRS §8d). Redesigning it is explicitly out of scope; do not claim distributed rate limiting. |
| **No production identity binding** | Frontend role switching is local/demo; there is no verified identity bound to approved parties in production. | Documented; do not treat the role switcher as authentication. |
| **Gemini / AI pipeline** | No live provider and no AI-extraction HTTP route; output path is a deterministic fixture. | Treat AI-derived content as untrusted whenever it is connected; schema-validate and require human review. |
| **Supabase / private document storage** | Not connected. No signed-URL or malware-scanning pipeline is implemented. | Roadmap item, not a present control. |
| **No wallet, chain, or escrow** | No transaction is signed or submitted. No on-chain state exists. | Deliberate scope boundary; do not claim mainnet/Sepolia execution. |
| **No professional security audit** | No independent pen-test, CVE scan report, or formal sign-off is asserted in this workstream. | Prior QA/reviewer gates recorded verdicts as evidence only; formal sign-off Pending. |
| **No WCAG conformance claim** | Rendered-UI checks were heuristic (focusability, partial contrast); no axe/Lighthouse audit, no CLS/INP/LCP metrics. | Evidence gaps, not passes. |
| **Pre-existing bundle advisory** | `Sculpture` chunk >500 kB; no new regression in this workstream. | Not remediated here. |
| **Rehearsal hardcoded path** | Rehearsals write to `/home/ubuntu/legalx/docs/rehearsals` (Windows → `C:\home\ubuntu\...`); portability limitation, no repo file changed. | Documented; not a security control gap. |

## Safe development practice

- Do not weaken `extra="forbid"`, org isolation, RBAC, CSRF, approval rules, the execution gate, or the verified 2-field payload.
- Do not add fake review/tamper/verify-execution/IR endpoints; the HTTP surface is the 15 real routes in [API](./API.md).
- Do not introduce secrets, `.env` files, DB files, or generated artifacts into commits. No force-push, `reset --hard`, `git clean`, branch switch, or merge to `main`.
- Preserve concurrent UI-agent work and the live dev servers (ports 8010/3002).
- Report any control change with a scoped diff review and captured test output; never claim a pass that was not executed.

Related reading: [threat model](./THREAT_MODEL.md), [RBAC](./RBAC.md), [integrity and hashing](./INTEGRITY_AND_HASHING.md), [API](./API.md), [final delivery report](../final-delivery/FINAL_MASTER_REPORT.md).
