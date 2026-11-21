# P0-08 handoff — verification runs and execution gate

**Owner:** Sam (backend foundation, P0-08).
**Author of this handoff:** Nidhi (P0-06 Contract IR, P0-07 parity engine).
**Status of P0-08: NOT STARTED, NOT COMPLETE.** This document transfers context only.
Nidhi does not implement the backend foundation, does not create Sam's branch, and does
not own any file described below.

What exists today and is usable as a dependency:

- `api/app/schemas/ir.py` — Contract IR (P0-06), strict integer money.
- `api/app/parity/` — P0-07 engine: `ParityEngine`, `ExecutionParameters`, `ParityResult`,
  `VersionBinding`, canonicalization v2, comparison rules.
- `api/tests/` — `python -m pytest api/tests -q` → **161 passed, 1 warning**.

What does **not** exist: any HTTP server, any database, any authentication, any
persistence, any execution path. `docs/API.md` and `docs/DATABASE.md` describe a
production contract, not implemented code.

---

## 1. Blocking architecture conflict — resolve before writing P0-08 code

Two approved-looking documents disagree about the server:

| Source | Target |
|---|---|
| `docs/ARCHITECTURE.md` "Production target" | Next.js App Router frontend + server-side service boundary; **Supabase Auth**, PostgreSQL, Storage |
| `docs/API.md`, `docs/DATABASE.md` | `/api/v1` HTTP contract; Postgres tables `agreements`, `agreement_versions`, `milestones`, `verification_runs`, `execution_records`, RLS through `memberships` |
| `docs/progress/SAM.md` "Next Deliverable" | **FastAPI** service on branch `feat/backend-foundation`, uvicorn, SQLAlchemy + asyncpg + alembic, session cookie `lx_session`, CSRF header |

The parity engine and Contract IR are **Python** (`api/app/...`), with no HTTP layer and no
ORM models. Consequences that must be decided before P0-08 work starts:

1. If the server is **FastAPI**, the engine is imported in-process and the contracts below
   apply directly.
2. If the server is **Next.js + Supabase**, the Python engine has no host: it must either
   become a separate internal service (its own auth, versioning, deployment, and a
   network contract) or be ported to TypeScript (a rewrite with its own test suite). Every
   guarantee in this document — canonical hashes, stale detection, result schema — would
   have to be reproduced and re-verified in the new language, and the current 161 tests
   would no longer cover the production path.

**Action:** record the decision in `docs/DECISIONS.md`, naming the owner (Arati or the BA),
before Sam creates the branch. Do not start P0-08 against an unresolved target.
`docs/progress/SAM.md` also states `feat/backend-foundation` does not exist yet.

---

## 2. Trusted server-side approved ContractIR loading

The engine compares two **in-memory objects**. It cannot tell whether the "approved" side
was supplied by a client. P0-08 must guarantee:

- The approved `ContractIR` is loaded server-side from `agreement_versions` for the exact
  `version_id` that carries a completed human approval (per-party approval, per
  `docs/progress/SAM.md` P0-05).
- The client may supply **only** `ExecutionParameters`, and only fields an executor may
  legitimately choose. `agreement_id`, `version_id`, and the approved IR are never
  client-chosen inputs to the comparison.
- If an approved version cannot be loaded, return a typed error (`VALIDATION_FAILED` or a
  dedicated `APPROVED_VERSION_NOT_FOUND`); never fall back to client data.

## 3. Party identity binding — deployment blocker

The engine compares **roles** (client/provider required, witness optional) and now also
reports party **name**, **email** and **count** differences as **advisory** results.
It does **not** verify identity. A swapped counterparty therefore yields
`overall_status == "advisory"`, not `"blocked"`:

```
provider name swapped (Sam → Samantha) -> advisory | review | parties.provider.name=advisory
```

That reporting gap is deliberate: `engine_design.md` §7 defers identity to trusted context.
**Until P0-08 binds identity, no execution gate may be trusted.** Required work:

- Store the verified party identities (user id / organization membership, or a verified
  legal entity record) on the approved version.
- Bind every execution party to those records server-side and treat any mismatch as
  **blocking**, independently of the advisory engine result.
- Decide the identity policy explicitly: what identifier is authoritative, whether email
  case-folding is allowed (the canonicalizer currently strips whitespace only and treats
  `CLIENT@EXAMPLE.COM` as different), and what evidence a witness requires.

The engine's advisory name/email results are a visibility aid, not the control.

## 4. Persistent verification runs

`verification_runs` (see `docs/DATABASE.md`) must store, per run and immutably:

| Field | Source |
|---|---|
| `agreement_id`, `version_id` | engine result |
| `approved_ir_hash`, `execution_params_hash` | engine result — **never interchangeable** |
| `canonicalization_version` | engine result (`v2` today) |
| `parity_rules_version` | engine result (`v1` today) |
| `overall_status`, `recommendation`, `is_blocked`, `has_advisory_diffs` | engine result |
| `field_results` | engine result, stored verbatim as JSON |
| `message` | engine result |
| `verified_at` | engine result; now typed `datetime`, caller-supplied |
| `engine_version`, `request_id`, `actor_id` | server-supplied |

Rules: rows are append-only (no update of a stored result), scoped to an
`organization_id` through `memberships`, and written in the same transaction that returns
the result to the caller — a result the caller saw must exist in the database.

## 5. Version and hash binding

`ParityResult` binds `agreement_id`, `version_id`, both hashes,
`canonicalization_version` and `parity_rules_version`. `ParityEngine.is_stale()` recomputes
both hashes from the live objects, so a mutation after `compare()` is detected.

P0-08 must enforce:

- Before any reuse (trust passport display, execution preflight), **reload the approved IR
  and re-verify the stored hashes**; never trust a stored `"match"` alone.
- A new agreement version invalidates prior verification runs (`ARCHITECTURE.md` state
  policy). Treat a `version_id` mismatch as stale, not as a new verification.
- A `canonicalization_version` or `parity_rules_version` bump invalidates older runs for
  gate purposes. Existing hashes are not comparable across versions.
- `ExecutionParameters` are part of the binding: if the caller changes any execution field,
  the previous result is stale and a new run is required.

## 6. Atomic preflight and one-time consumption

`POST /agreements/:id/execution/prepare` must be one transaction that:

1. Locks the agreement/version row (`SELECT ... FOR UPDATE`) so two concurrent requests
   cannot both pass preflight.
2. Re-runs or re-validates parity (never reuse a client-supplied result).
3. Checks authorization (membership + permission + resource state).
4. Checks network, funding and wallet session.
5. Marks the verification run **consumed** exactly once — a `UNIQUE` constraint on
   `consumed_by_execution_id`, or an equivalently unique token, so a replay cannot reuse it.
6. Returns a preview only; the actual signing stays client-side in the wallet.

Idempotency: require a client idempotency key and return the same preview for repeats
instead of creating a second consumption.

## 7. Authentication and authorization

Per `docs/progress/SAM.md` (P0-03 design, already specified — reuse, do not redesign):
session cookie `lx_session` (HttpOnly, SameSite=Lax, Secure in prod), SHA-256 stored token,
`X-CSRF-Token` on every non-GET, argon2id passwords, authorization chain
session → membership → permission → resource state → domain gate, 404 for cross-tenant and
403 in-tenant without permission. Every verification/execution query is organization-scoped.

## 8. Database transactions and concurrency

- Isolation sufficient to prevent two consumptions of one verification run (row locks or a
  unique constraint — do not rely on application-level checks alone).
- `field_results` is JSON and must be stored without lossy normalization.
- Never mark execution confirmed before chain evidence (`ARCHITECTURE.md` state policy).
- Migrations via alembic (SAM.md plan); `migrations/*.sql` edits require approval in this
  environment's permission model.

## 9. Required API contracts and tests

Mapped to `docs/API.md`:

| Route | P0-08 responsibility |
|---|---|
| `POST /agreements/:id/versions/:version/verify` | load approved IR server-side, build/validate `ExecutionParameters`, run engine, persist run, return result |
| `GET /agreements/:id/trust-passport` | return version-specific evidence **without** private document content; include hashes, versions, status, timestamp |
| `POST /agreements/:id/execution/prepare` | atomic preflight per §6; return `PARITY_BLOCKED`, `STALE_VERIFICATION`, `WRONG_NETWORK`, `INTEGRATION_UNAVAILABLE` as typed errors |
| `POST /webhooks/chain` | idempotent, signature-verified |

Minimum tests P0-08 should add (beyond the engine's own 161):

- A `"blocked"` engine result cannot produce a preparation preview.
- A stored `"match"` with a mutated approved IR is reported stale, not reused.
- Verification run from version N cannot be used for version N+1.
- Two concurrent `prepare` calls consume the run at most once.
- Party identity mismatch (bound in trusted context) blocks even though the engine reports
  only advisory name/email differences.
- Cross-tenant access returns 404; in-tenant without permission returns 403.
- Canonicalization/rules version bump invalidates older runs for gate purposes.

## 10. What the engine does and does not claim

- `overall_status == "match"` means **the supplied execution parameters equal the supplied
  approved IR** under canonicalization v2 and rules v1.
- It is **not** a legal opinion, **not** authorization to execute, and **not** proof that
  the approved IR is itself valid or that the parties are who they claim to be.
- No I/O, no network, no clock dependency (pass `verified_at`), no authority grant.

## 11. Open decisions requiring a named owner

1. **Server target:** FastAPI vs Next.js/Supabase (§1) — blocking.
2. **Identity policy:** authoritative party identifier and email normalization rule (§3) —
   blocking for the execution gate.
3. **"Affects deadline" signal:** `review_period_basis` is blocking only while
   `review_period_days` matches, and `governing_law` is blocking only on a declared
   conflict, because neither model carries an explicit "affects the deadline / execution
   obligations" flag (`engine_design.md` A.12/A.14 vs B.4/B.5). A first-class field is
   needed for the design's conditional semantics to be stated, not inferred.
4. **Consumption semantics:** what exactly is consumed (verification run, preflight token),
   its TTL, and whether re-verification is allowed after consumption.
