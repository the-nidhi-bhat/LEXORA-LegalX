# EXECUTION_PLAN.md — v2 (revised for project-lead decisions, 2026-11-13)

> **Status:** planning only. Nothing here has been implemented, installed, migrated, committed or deployed.
> **Revision note:** v2 supersedes v1 of this file (same path, authored by this assistant). It incorporates
> Nidhi's decisions of 2026-11-13: D-01 modified (least-privilege, resource-scoped), D-02 approved,
> D-05 approved, D-06 modified (multi-party approvals), Q1 estimates recorded, Q2 target = judged demo on
> **2026-12-01**. v1's proposed `audit:view` grant is **withdrawn**.
> **Audit reports are untouched.** They remain the evidence base; this plan does not restate or edit them.

---

## 0. What is true today (so nothing below is mistaken for existing capability)

Verified by the audit (`docs/audit/*`) against the running application and the actual source:

| Area | State today |
|---|---|
| Frontend | React 19 + Vite 8 SPA, 59 tracked files; `src/App.tsx` is 110 lines / 98 737 B containing 37 components |
| Backend | **None.** `server/authorization.ts` (39 lines) is imported by nothing and is outside `tsconfig.include` |
| Database | **None.** 13 `localStorage` keys; no schema, no migrations |
| Network | **0** `fetch(` in `src/` + `server/`; `import.meta.env`/`process.env` occurrences = 0 |
| Auth | Email-only sign-in, no password field, no session; unknown email produces no error and no navigation |
| RBAC | Client-side only, 5 roles, 15 app routes. **Owner is denied 6 of 15 routes** (`contract-ir`, `parity`, `team`, `activity`, `transactions`, `help`) — three of them are links in the owner's own sidebar |
| Parity | `const score = tampered ? 74 : 100`; mismatch sentence hard-coded; no approved version stored |
| Hash | Displayed hash is a literal string; no computation anywhere |
| AI | Fixture only; typed input ignored; honestly labelled "not live AI" |
| Chain | Simulation only; `window.confirm`, fake address, no SDK |
| Tests | 4 scripts pass; all four are text/substring or self-referential assertions (see `TEST_REPORT.md` §2–3) |

**Consequence for planning:** every P0 task is net-new capability, not a refactor of existing logic — except
P0-01 (move) and P0-02 (policy fix), which must change **no** behaviour beyond the **three** disclosed
access changes in §3.3 (verified 2026-11-13 by executing the real `canAccessRoute` for the full 5×15 grid).

---

## 1. Approved decisions (authoritative)

| ID | Decision | Status | Consequence |
|---|---|---|---|
| **D-01** | **Least-privilege, resource-scoped** read permissions. Owner does **not** receive broad `audit:view`. Contract IR gated by `ir:read`; Parity by `verification:read`; Activity by `activity:read`; system-wide audit logs by `audit:read_global` (restricted). | **APPROVED (modified)** | §3 rewrites the RBAC matrix; §4 lists every route whose access changes (3 changes, all Owner) |
| **D-02** | FastAPI-managed server sessions. HttpOnly + SameSite cookies, CSRF protection, expiry + revocation, reputable password hashing, server-side authorization, **no custom crypto/auth**. | **APPROVED** | Standard libraries only: `argon2-cffi` for passwords, `secrets.token_urlsafe` for tokens, SHA-256 via `hashlib`. No bespoke schemes |
| **D-05** | `execution_parameters` is a separate, version-bound artefact; approved agreement and execution parameters are hashed and verified **independently**; any mismatch prevents execution authorization. | **APPROVED** | Independent hashes + parity over two independently stored inputs (P0-05, P0-07, P0-08) |
| **D-06** | Owner may initiate approval; lawyer reviews and recommends revisions. **Where multiple parties must approve, each approval is recorded separately.** Execution requires **all** required approvals for the **exact current version**. | **APPROVED (modified)** | New `version_approvals` table; approval = per-party rows, not a single flag (§6.3, §8) |
| **D-10** | Deterministic-first: IR derived deterministically in P0; Gemini behind `FEATURE_AI_EXTRACTION` with explicit document-data consent. | **APPROVED (earlier)** | AI is advisory, never approves, never authorizes |
| **D-11** | Blockchain simulated for this milestone. | **APPROVED (earlier)** | No contract, no SDK, no real funds |
| **Q1** | Availability estimates: **Nidhi 10–14 h/wk · Sam 10–15 · Iffa 15–20 · Arati 5–10** | **ESTIMATES — require confirmation** | §13 scheduling arithmetic is parameterised on the midpoints; Arati's is the least certain and the plan has a contingency for it |
| **Q2** | Target: judged hackathon demo + deployable product + submission materials. **Deadline 2026-12-01.** | **APPROVED** | §13 splits the calendar into a 8-day implementation sprint and a 5-day integration/hardening/deploy/rehearsal phase |

### 1.1 New decisions this revision requires (open)

| ID | Proposal | Why needed | Default if unanswered |
|---|---|---|---|
| **N-01** | Route permission map becomes **data-driven with any-of semantics**: `ROUTE_PERMISSIONS: Record<string, readonly Permission[] \| undefined>`, and the three hard-coded branches at `src/rbac.ts:71-73` are replaced by entries. | Without this, the least-privilege change cannot be expressed without new special cases, and the invariant "nav ≡ reachable" is untestable | keep branches; the fix becomes 3 more special cases (worse, but shippable) |
| **N-02** | `audit:view` is **retired** and replaced by `ir:read`, `verification:read`, `activity:read`, `audit:read_global`. | D-01 names distinct capabilities; one overloaded permission cannot express them | keep `audit:view` alongside the new ones (messier, duplicates authority) |
| **N-03** | Approval policy per agreement: `all_parties` (default) or `client_only`. | D-06 requires "where multiple parties must approve"; some agreements legitimately need one signature | `all_parties` for the demo agreement |
| **N-04** | Text becomes immutable the moment **any** party approves that version (not when all do). | If one party approves v3 and the text then changes, their approval no longer refers to anything real | freeze on first approval (**strongly recommended**) |
| **N-05** | Demo tamper uses a demo-only endpoint guarded by `DEMO_TAMPER_ENDPOINT=false` in production config. | The tamper demo must not exist as a reachable write path in a deployed build | environment-gated, off by default in prod |
| **N-06** | Retire two orphan permissions: `workspace:view_activity` (superseded by `activity:read`) and `agreement:approve_parity` (granted to no role, absent from the matrix). `trust:export` is **kept** but documented as a declared capability that gates no route in P0 — its export action stays client-only and labelled simulated until a real export endpoint exists. | Least privilege by construction; an unused grant cannot be audited | keep both orphans; the matrix then proves less than it claims |
| **N-07** | Add `verification:run` (owner + reviewer only) and require it for `POST …/parity`, `POST …/verify` and the tamper route; `verification:read` then gates GETs only. Tamper additionally requires `agreement:edit`. | Without this, an auditor holding a *read* grant can mint persisted parity/verification rows — evidence produced by the party that is supposed to verify evidence independently | single `verification:read` for read and write; accepted risk, documented |

---

## 2. Task overview (P0)

| ID | Task | Owner | Support | Est. (h) | Depends on | Deliverable |
|---|---|---|---|---|---|---|
| P0-02 | Least-privilege RBAC fix | **Iffa** | Sam | 3 | — | Policy + matrix test + browser proof |
| P0-01 | Repo restructure `web/` + `api/` | **Sam** | Iffa, Arati | 8 | P0-02 (policy correct before move) | Two buildable projects, zero content change |
| P0-03 | Server sessions + authorization | **Sam** | Nidhi, Arati | 22 | P0-01 | Real login, 75-cell server matrix, CSRF |
| P0-04 | Agreements + parties + milestones | **Sam** | Iffa, Arati | 26 | P0-03 | Persisted agreements from UI, validated |
| P0-05 | Versions, SHA-256, per-party approval | **Sam** | Nidhi, Iffa | 14 | P0-04 | Immutable approved versions with real hashes |
| P0-06 | Contract IR schema + deterministic deriver | **Nidhi** | Sam, Arati | 12 | P0-05 (version rows) | Typed IR, validated, version-bound, provenance |
| P0-07 | Deterministic parity engine | **Nidhi** | Arati | 12 | P0-05, D-05 fields | Field-by-field comparison with severities |
| P0-08 | Verification + execution gate | **Sam** | Nidhi | 10 | P0-05, P0-07 | `PARITY_BLOCKED` enforced server-side |
| P0-09 | Review & revision flow (bounded) | **Arati** | Sam, Iffa | 6 | P0-05 | Request-change → new draft version + audit event |
| P0-10 | Frontend wiring to real API | **Iffa** | Nidhi | 14 | P0-03…P0-08 | No fixture fallback left unlabelled |
| P0-11 | E2E demo gate (Playwright) | **Arati** | Iffa | 10 | P0-10 | One test file proving D1–D10 |
| P0-12 | Demo-blocker fixes | **Iffa** | Arati | 6 | P0-01 | Sign-in errors, guided-demo dead end, 403/404 messaging, named buttons |
| | **Total** | | | **143** | | + ~15 h review overhead = **158 h** |

**Capacity arithmetic (assumption-based, see §13):** midpoint capacity is 49.5 h/week for the team
(Nidhi 12 + Sam 12.5 + Iffa 17.5 + Arati 7.5). 2026-11-13 → 2026-12-01 contains **13 weekdays ≈ 129 h**, and
**4 weekend days ≈ 25 h** if the team chooses to use them at half rate. **158 h of work does not fit in
129 h.** §13.4 states exactly what is cut and what the demo then honestly claims.

---

## 3. P0-02 — Least-privilege RBAC (revised per D-01)

**Task ID:** P0-02 · **Branch:** `fix/p0-02-owner-parity-access` · **Owner:** Iffa · **Reviewer:** Sam

**Objective.** Make the route gate express what D-01 actually decided, and make "every route in a role's
navigation is reachable by that role, and nothing else is" a test rather than a hope.

**Business purpose.** The Owner persona is the default persona a judge sees. Today it hits a 403 on the
Contract IR and Parity screens — the two screens that carry the product's entire claim. A judge who clicks
"Verification" in the owner's own sidebar is told they lack permission. That is the single most damaging
90 seconds in the demo.

**Files expected to change (exact).**

| File | Change |
|---|---|
| `src/rbac.ts:2` | `Permission` union: add `ir:read`, `verification:read`, `activity:read`, `audit:read_global`; remove `audit:view` (N-02) |
| `src/rbac.ts:31-37` | `ROLE_PERMISSIONS` per the matrix in §3.1 |
| `src/rbac.ts:40` | `ROLE_NAV.owner`: **remove** `['Team', '/app/team', 'users']` |
| `src/rbac.ts:47-56` | `ROUTE_PERMISSIONS`: type becomes `readonly Permission[]`; entries for `contract-ir`, `parity`, `activity`, `ai-workspace`, `smart-contracts`, `transactions` rewritten per §3.2 |
| `src/rbac.ts:67-76` | `canAccessRoute` loses the three hard-coded `if` branches; becomes nav-check + any-of permission check (N-01) |
| `src/rbac.ts:71,72,73` | deleted (logic moved into the data table) |
| `src/App.tsx` | **no change** — if the fix needs one, the fix is wrong |
| `tests/rbac-matrix.mjs` *(new)* | zero-dependency matrix runner (lands at repo root — P0-02 precedes the §4 restructure; P0-01 moves it to `web/tests/` and updates this command in the same commit) |
| `tests/matrix.snapshot.json` *(new)* | committed 5×15 grid |
| `tests/rbac-before-after.json` *(new)* | the 3 access changes, asserted as a diff, so a fourth change fails the build |

**Dependencies.** None. This is deliberately first.

**API contracts.** None — this is a client-side policy module. The **same table** is ported to Python in
P0-03 and the port must reproduce this matrix byte-for-byte (Sam owns the cross-check).

**Data requirements.** None.

### 3.1 Permission matrix after D-01

| Permission | owner | freelancer | legal_reviewer | org_admin | technical_auditor |
|---|:--:|:--:|:--:|:--:|:--:|
| `agreement:create` | ✅ | — | — | — | — |
| `agreement:view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `agreement:edit` | ✅ | — | — | — | — |
| `agreement:suggest` | ✅ | ✅ | ✅ | — | — |
| `agreement:approve` *(new, D-06)* | ✅ | ✅ | — | — | — |
| `agreement:approve_legal` | — | — | ✅ | — | — |
| `escrow:fund` | ✅ | — | — | — | — |
| `escrow:view_financials` | ✅ | ✅ | — | — | — |
| `milestone:submit` | ✅ | ✅ | — | — | — |
| `milestone:approve` | ✅ | — | — | — | — |
| `workspace:manage` | — | — | — | ✅ | — |
| ~~`workspace:view_activity`~~ | retired → `activity:read` (N-06) | | | | |
| **`ir:read`** *(new)* | ✅ | — | ✅ | — | ✅ |
| **`verification:read`** *(new)* | ✅ | — | ✅ | — | ✅ |
| **`verification:run`** *(new)* | ✅ | — | ✅ | — | — |
| **`activity:read`** *(new)* | ✅ | ✅ | — | ✅ | ✅ |
| **`audit:read_global`** *(new)* | — | — | — | — | ✅ |
| `trust:export` | ✅ | ✅ | ✅ | — | ✅ |
| ~~`audit:view`~~ | retired | retired | retired | retired | retired |

Notes: `agreement:approve` is added to **owner and freelancer** because both are parties that may be
required to approve (D-06). `activity:read` is granted to freelancer and org_admin to **preserve** access
they already have today via the `milestone:submit` (freelancer) and `workspace:view_activity` (org_admin)
fallbacks — this is preservation, not expansion, and it is load-bearing: deleting it regresses org_admin's
activity route. `audit:read_global` is auditor-only: system-wide audit logs are an audit
function, and `org_admin` manages membership, not evidence. `agreement:approve_parity` is **retired** (N-06):
it is declared in `src/rbac.ts:2`, granted to no role and absent from every route.

### 3.2 Route map after D-01 (any-of semantics)

| Route | Required (any of) |
|---|---|
| `/app/contract-ir` | `ir:read` |
| `/app/parity` | `verification:read` |
| `/app/activity` | `activity:read` |
| `/app/ai-workspace` | `agreement:create`, `agreement:approve_legal` — **`ir:read` was removed on 2026-11-13 after executing the real `canAccessRoute`**: keeping it would have handed the auditor a fourth route (it holds no `agreement:create`/`approve_legal`) |
| `/app/smart-contracts` | `escrow:fund`, `escrow:view_financials`, `audit:read_global`, `workspace:manage` |
| `/app/transactions` | `escrow:view_financials`, `audit:read_global` |
| `/app/milestones` | `milestone:submit` |
| `/app/team` | `workspace:manage` |
| `/app/settings` | *(none)* |
| `/app`, `/app/agreements`, `/app/notifications`, `/app/help`, `/app/profile`, `/app/agreements/website-project` | *(none — nav membership governs)* |

### 3.3 Every route whose access changes (D-01 disclosure requirement)

| # | Role | Route | Before | After | Reason |
|---|---|---|---|---|---|
| 1 | **owner** | `/app/contract-ir` | 403 | **allowed** | `ir:read` granted — D-01 "Contract IR: authorized agreement read" |
| 2 | **owner** | `/app/parity` | 403 | **allowed** | `verification:read` granted — D-01 "Parity: authorized verification read" |
| 3 | **owner** | `/app/team` | 403 **and a dead sidebar link** | still 403, **link removed from nav** | owner has no `workspace:manage`; least privilege says do not grant team management to fix a UI link |

**No other role changes any route.** Proof: the new test asserts the full 5×15 grid equals
`matrix.snapshot.json`, and separately asserts the **diff** against the pre-change grid equals exactly
these three rows. A fourth difference fails CI.

**Executed verification of the "before" grid (2026-11-13, Phase 0).** Applying the real
`canAccessRoute` (`src/rbac.ts:66-76`) to all five roles × fifteen routes gives the today-denials:

| Role | Denied routes today (of 15) |
|---|---|
| owner | `/app/contract-ir`, `/app/parity`, `/app/team`, `/app/activity`, `/app/transactions`, `/app/help` |
| freelancer | `/app/ai-workspace`, `/app/contract-ir`, `/app/parity`, `/app/smart-contracts`, `/app/team`, `/app/settings` |
| legal_reviewer | `/app/team`, `/app/transactions`, `/app/smart-contracts`, `/app/activity`, `/app/settings`, `/app/profile`, `/app/help`, `/app/milestones` |
| org_admin | `/app/contract-ir`, `/app/parity`, `/app/transactions`, `/app/notifications`, `/app/profile` |
| technical_auditor | `/app/ai-workspace`, `/app/milestones`, `/app/team`, `/app/settings`, `/app/notifications`, `/app/help`, `/app/profile` |

Only owner changes. Note that owner gains **nothing** on `activity`, `transactions` or `help`: those routes
are not in the owner's navigation, and nav membership is checked first (`src/rbac.ts:69`) — granting
`activity:read` alone does not create a link. That is why the diff is exactly three rows and not six.

### 3.4 Acceptance criteria

1. For every role and every entry in `ROLE_NAV[role]` ∪ `SHARED_ROLE_ROUTES[role]`, `canAccessRoute` is `true`.
2. For every role and every route **not** in its navigation, `canAccessRoute` is `false` (the reverse
   direction — this is what catches "reachable but invisible").
3. Owner can open `/app/contract-ir` and `/app/parity` in a browser; the screens render their own `<h1>`
   and no "ACCESS CONTROL · 403" text appears.
4. `/app/team` is absent from the owner's rendered sidebar (count and screenshot).
5. The 5×15 grid differs from the pre-change grid in **exactly** the three rows of §3.3.
6. No role other than owner changes any route.
7. No duplicated permission/nav tables exist in the test — it imports the real module.

### 3.5 Tests required

| Test | Command | Expected |
|---|---|---|
| Matrix (forward) | `node tests/rbac-matrix.mjs` | `5 roles · 15 routes · 0 unreachable · 0 hidden` |
| Matrix (diff) | `node tests/rbac-matrix.mjs --check` | `snapshot matches; 3 approved differences` |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Browser | Playwright: owner opens contract-ir, parity, activity, team | 2 screens render; `/app/team` 403 **and** no sidebar link |
| Screenshots | `tests/shots/p0-02-*.png` (4) | committed as PR evidence |

### 3.6 Definition of Done

Matrix green both directions; diff limited to the three approved rows; browser proofs + 4 screenshots
attached; `docs/PROGRESS.md` entry with commands and output; **no other file changed**; a non-owner
(Arati) re-ran the commands and pasted them.

### 3.7 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Removing the owner's Team link is judged a UX regression | it is a **truth fix** — the link was a 403; docs state Team is `org_admin`'s surface |
| R2 | Any-of route semantics silently widens access somewhere | the full-grid snapshot + explicit diff test makes widening impossible to merge unnoticed |
| R3 | `tsc` cannot be imported from `.mjs` | compile with `npx tsc src/rbac.ts --outDir .tmp --module esnext --target es2020`, then import; **no new dependency** |
| R4 | The Python port drifts from this table (P0-03) | one authored JSON table; both sides regenerate; CI diffs them |
| R5 | Retiring `audit:view` breaks an unseen consumer | `rg "audit:view" src/` must return only the (changed) rbac file; the matrix proves the 15 routes |

**Estimated effort:** 3 h (Iffa 2 h, Sam 1 h review). **Expected deliverable:** a merged-or-PR-ready branch
where the Owner sees Contract IR and Parity, the sidebar no longer offers a 403, and the invariant is
enforced by a test that will fail on the next policy mistake.

---

## 4. P0-01 — Repository restructure

**Objective.** Split the repo into `web/` (React SPA) and `api/` (FastAPI) with **zero behaviour change**.

**Business purpose.** Four people cannot work in one 98 737-byte, 110-line file. The backend cannot exist
without a home. Every later task is blocked on this.

**Files.** *Moved:* `src/**` → `web/src/**` (single exception: `src/rbac.ts` → `web/src/lib/rbac.ts`, the path
§5/P0-03 assume; every other file keeps its relative path, and `tests/rbac-*.{mjs,json}` + `tests/shots/` move
to `web/tests/`); `public/**` → `web/public/**`; `index.html`,
`vite.config.ts`, `tsconfig.json`, `tsconfig.node.json` → `web/`; `scripts/*.mjs` → `web/scripts/`;
`server/authorization.ts` → `api/app/rbac.py` (contents verbatim). *Deleted:* `app.config.ts` (verified
unused by any `src/` file). *Changed:* `.github/workflows/quality.yml` (two jobs), root `package.json`
(zero-dependency delegator: `npm --prefix web run …` so every README command keeps working).
*New:* `api/{app/main.py,app/config.py,app/db.py,app/deps.py,app/routers/health.py,app/rbac.py,tests/test_health.py,pyproject.toml,.env.example}`,
`web/tests/route-parity.mjs`.

**API contracts.** `GET /api/health` → `200 {"status":"ok","version":"<8-char sha>","db":"ok"|"unavailable"}`.
Public, no auth. This is the only endpoint in this task.

**Data requirements.** None (health reports DB reachability only if a URL is configured; otherwise `"unavailable"`).

**Acceptance criteria.** 1. `npm --prefix web ci && npm --prefix web run build` → `✓ built`; 2.
`npm --prefix web exec tsc --noEmit` → exit 0; 3. `npm --prefix web test` → the same 4 "passed" lines as the
audit recorded; 4. `GET /api/health` → 200; 5. **file-hash parity**: every moved file's SHA-256 identical
before/after (table in PR); 6. **route parity**: 8 routes screenshot-identical at 1440×900; 7. CI runs both
jobs; 8. `git diff -M` shows renames only.

**Tests required.** build · tsc · existing 4 suites · `pytest api/tests -q` (1 passed) · `route-parity.mjs`
(8/8 diff 0).

**DoD.** `main` green on both jobs; hash table + screenshot diff attached; no logic line touched; no
dependency version changed.

**Risks.** Import-path breakage across `App.tsx` (~40 relative imports) → `tsc` after each move batch ·
**OneDrive sync race while moving 59 files** → pause OneDrive or use a worktree, verify `git status` before
and after · `server/authorization.ts` silently lost (it is outside `tsconfig`) → explicit hash row ·
temptation to rewrite while splitting → the split commit is moves only; any deletion that is not a
corresponding move is rejected.

**Effort:** 8 h (Sam 6, Iffa 1, Arati 1). **Deliverable:** two buildable projects, `api/health` live,
identical UI.

---

## 5. P0-03 — Server sessions and server-side authorization

**Objective.** Identity and role come from a server-issued session; every permission decision is made where
the user cannot edit it.

**Business purpose.** Without this, "who approved what" is unprovable, and the audit's **H1/H2**
(client-only RBAC, no real auth) remain open. Every downstream claim — approval, verification, audit trail —
is meaningless if the role can be set in `localStorage`.

**Files.** *Changed:* `web/src/App.tsx` (`Auth` component replaced; `AppShell` gate becomes
session-driven), `web/src/lib/rbac.ts` (consumes `/me` permissions), `web/src/lib/state.ts` (stop persisting
role). *New (api):* `app/auth.py`, `app/models/{user,session,membership}.py`,
`app/schemas/auth.py`, `app/deps.py` (`require(permission)`), `app/routers/{auth,me}.py`,
`app/scripts/seed_demo_users.py`, `tests/test_auth.py`, `tests/test_rbac_matrix.py`, `tests/test_csrf.py`,
`tests/test_session_revocation.py`. *New (web):* `web/src/features/auth/{SignIn,SignUp,SignOut}.tsx`,
`web/src/lib/api.ts`, `web/src/lib/session.ts`, `web/tests/auth.spec.ts`. *New (docs):*
`docs/DEMO_ACCOUNTS.md`.

**API contracts.** `POST /api/auth/session`, `POST /api/auth/sign-out`, `GET /api/me`, plus
`require(permission)` applied to every protected route. Full schemas: `docs/API_CONTRACTS.md` §3.

**Data requirements.** `users`, `sessions`, `memberships`, `organizations` (see `PROJECT_STATUS.md` §5).

**Acceptance criteria.** 1. Wrong credentials → `401 INVALID_CREDENTIALS` **and a visible inline error**
(today: silence); 2. no session → `401` on every protected route; 3. the 75-cell matrix passes **server-side**;
4. a reviewer's cookie cannot reach an owner endpoint by editing `localStorage`, query, or body (three
tests); 5. sign-out revokes the row; replay → 401; 6. `rg "legalx:role" web/src` → 0 hits;
7. mutation without `X-CSRF-Token` → `403 CSRF_FAILED`; 8. no custom crypto (`rg "hashlib|hmac|secrets" api/app` → only token generation + SHA-256 helpers, reviewed).

**Tests.** `pytest api/tests -q` (auth, matrix 75, csrf, revocation) · Playwright persona sign-in ×5 ·
`rg` hygiene checks.

**DoD.** Every decision server-side; five demo accounts seeded idempotently and documented as demo-only;
Arati reproduced the matrix and the nav walk independently.

**Risks.** Cookie/proxy misconfiguration burns a day → prove ONE endpoint end-to-end before the matrix ·
`allow_origins=["*"]` never appears → same-origin only (Vite proxy in dev, FastAPI serves `web/dist` in
prod) · policy drift TS↔PY → one authored JSON table · lockout → idempotent seed script run by CI ·
password reset absent → the UI says so instead of faking it.

**Effort:** 22 h (Sam 16, Nidhi 4, Arati 2). **Deliverable:** real login, five personas, server-enforced 403s.

---

## 6. P0-04 — Agreements, parties, milestones

**Objective.** Agreements become rows with real parties; validated before they exist; visible after reload
and from a second browser.

**Business purpose.** The audit found **no parties in the IR and no party table anywhere**. A contract
between two people cannot be represented. This is the first table that makes LEGALX a legal product rather
than a contract-shaped UI.

**Files.** *New (api):* `app/models/{agreement,party,milestone}.py`, `app/schemas/agreement.py`,
`app/routers/agreements.py`, `migrations/0003_agreements.sql`, `app/scripts/seed_demo_agreement.py`,
`tests/test_agreements.py`, `tests/test_agreement_validation.py`, `tests/test_tenant_isolation.py`.
*New (web):* `web/src/features/agreements/{AgreementList,AgreementCreate,AgreementDetail}.tsx`,
`web/src/features/agreements/validation.ts`. *Changed:* the four hard-coded agreement cards and the
"Create agreement" → `/app/ai-workspace` redirect.

**API contracts.** `GET|POST /api/agreements`, `GET|PATCH /api/agreements/{id}` — schemas in
`docs/API_CONTRACTS.md` §4.

**Data requirements.** `agreements`, `agreement_parties`, `milestones`, `agreement_versions` (row 1, draft).

**Acceptance criteria.** 1. Create → hard reload → still listed; second browser/session → listed;
2. parties stored and rendered (`client`, `provider`, name + email each); 3. eight invalid payloads rejected
with `VALIDATION_FAILED` + `details[].field` **and** surfaced inline; 4. money is integer minor units
end-to-end (`₹50,000` = `5000000`); posting `50000.5` is rejected; 5. cross-org → 404, no leak;
6. `rg "Website project" web/src` → only seed/tests; 7. every create/patch calls `record_event(...)` (no-op
body until P1-01).

**Tests.** CRUD · validation matrix (8) · tenant isolation · minor-units · Playwright create→reload→second
context.

**DoD.** No agreement data hard-coded in these screens; seeded ₹50 000 fixture exists as a row via
idempotent `uuid5` ids; Arati reproduced AC 1 and AC 3.

**Risks.** Schema churn when versions land → create `agreement_versions` now (draft) to avoid a data
migration · builder creep → field list is closed · milestone/version duplication (D-07) → milestones carry
`version_id` · non-idempotent seed → fixed `uuid5` ids · float money → `int` columns + pydantic `conint` +
rejection test.

**Effort:** 26 h (Sam 12, Iffa 12, Arati 2). **Deliverable:** real, validated, persisted agreements with parties.

---

## 7. P0-05 — Versions, hashing, per-party approval

**Objective.** Version numbers and hashes become facts; an approved version cannot be changed by anyone;
each required party's approval is recorded separately (D-06).

**Business purpose.** This is the product. Without an immutable approved version, a post-approval change
cannot be detected even in principle — the demo's climax is impossible.

**Files.** *New (api):* `app/hashing.py`, `app/versions.py`, `app/schemas/version.py`,
`app/models/approval.py`, `migrations/0004_versions_approvals.sql` (+ immutability trigger),
`tests/test_hashing.py`, `tests/test_version_immutability.py`, `tests/test_approvals.py`.
*New (web):* `VersionBadge.tsx`, `ApproveDialog.tsx`, `ApprovalChecklist.tsx`. *Changed:* detail screen's
literal `v1.2` and literal hash.

**API contracts.** `POST /api/agreements/{id}/versions`,
`POST /api/agreements/{id}/versions/{v}/approve`, `GET /api/agreements/{id}/versions` — see
`docs/API_CONTRACTS.md` §5.

**Data requirements.** `agreement_versions` (+`sha256`, `hash_algorithm`, `canonical_length`),
`version_approvals`.

**Canonicalization (normative — D-04, server-only hashing):**

```python
text_norm      = text.replace("\r\n", "\n").replace("\r", "\n")
canonical_text = "\n".join(line.rstrip() for line in text_norm.split("\n")).strip("\n")
canonical_text = unicodedata.normalize("NFC", canonical_text)
sha256_hex     = hashlib.sha256(canonical_text.encode("utf-8")).hexdigest()   # 64 lowercase hex
```

The original text is stored unmodified; the hash is over the canonical form.

**Approval semantics (D-06 / N-03 / N-04).** `agreements.approval_policy` ∈ {`all_parties`, `client_only`}.
`POST …/approve` inserts **one row** in `version_approvals` for the caller's party role (unique per
`version_id, party_role`) with the `confirmed_sha256` the client displayed. `version.is_fully_approved` is a
**query**, never a stored flag. Execution authorisation later requires *every* required party.

**Acceptance criteria.** 1. one character changes the hash; 2. CRLF/LF, trailing spaces, and NFC variants do
**not** change it (3 tests); 3. `UPDATE`/`DELETE` on a version with any approval **fails at DB level**;
4. a second approval from the same party → `409 ALREADY_APPROVED`; 5. approvals are per party — owner +
freelancer both appear with actor and timestamp; 6. `is_fully_approved` false until all required parties
present; 7. approving with a `confirm_sha256` that does not match the current text → `422 HASH_MISMATCH`
(catches a concurrent edit); 8. the UI renders only hashes returned by the API (`rg "[a-f0-9]{64}" web/src`
→ fixtures/tests only); 9. every approval writes a `version.approved` audit event with actor + hash.

**Tests.** `test_hashing.py` (known vector + 4 normalisation cases) · `test_version_immutability.py`
(update/delete raise) · `test_approvals.py` (per-party, 409, policy) · double-approve 409 ·
`rg "crypto.subtle" web/src` → 0.

**DoD.** Every displayed hash is server-computed and stored; approved versions immutable at DB level;
per-party approvals visible with actor + time; Arati reproduced AC 1, 3, 5.

**Risks.** Canonicalization ambiguity later (BOM, CRLF) → spec above is normative and tested; only the
server hashes · trigger blocks legitimate correction → corrections are new versions, and the UI must say so
· approval authority ambiguity (D-06) → resolved: owner initiates, parties approve, lawyer advises ·
stale hash displayed mid-save → always render the mutation response · double-approve race → unique
constraint, not a check-then-insert.

**Effort:** 14 h (Sam 9, Nidhi 2, Iffa 3). **Deliverable:** real, immutable, per-party-approved version history.

---

## 8. P0-06 — Contract IR schema + deterministic deriver

**Objective.** A typed, version-bound, validated Contract IR with per-field provenance, derived
deterministically from the approved version (D-10).

**Business purpose.** The IR is the artefact parity compares. Today it is an inline object literal with 8
fields, no parties, no schema and no validation (`AI_AUDIT.md` §3).

**Files.** *New (api):* `app/schemas/ir.py` (pydantic v2), `app/ir/derive.py` (deterministic deriver),
`app/routers/ir.py`, `migrations/0005_ir.sql`, `tests/test_ir_schema.py`, `tests/test_ir_derive.py`,
`tests/fixtures/ir/{clean,ambiguous,missing_party,business_days}.json`. *New (web):*
`web/src/features/ir/{IRView,FieldProvenance}.tsx`, generated `web/src/lib/types/ir.ts`.

**API contracts.** `POST /api/agreements/{id}/versions/{v}/ir` → `201 {ir, ir_sha256, derived_by:'deterministic', provenance}`;
`GET` same path → current IR or `404 NO_IR`. IR must reference an **approved** version, else `409 VERSION_NOT_APPROVED`.

**Data requirements.** `ir_documents(id, version_id unique, schema_version, ir jsonb, provenance jsonb, ir_sha256, derived_by, created_at)`.

**IR v1 fields (minimum).** `schema_version` · `agreement_id` · `version_id` · `agreement_type` ·
`currency` · `total_amount_minor` · `parties[{role,name,email}]` · `milestones[{seq,name,amount_minor,due_date,acceptance_criteria}]` ·
`review_period_days` · `review_period_basis`(`calendar|business`) · `dispute_behavior` · `governing_law?` ·
`provenance[{field, source_span:{start,end}}]`.

**Acceptance criteria.** 1. schema rejects: missing parties, `Σ milestones ≠ total`, `amount ≤ 0`, review
period outside 1…90, unknown currency, unknown enum; each with a field-level error; 2. `derived_by` is
`deterministic` in P0 and the UI says so; 3. IR for a draft version → `409`; 4. `ir_sha256` is stable across
two runs on the same version (and equal to a committed test vector); 5. parties appear in the IR (the audit's
missing-party defect is closed); 6. provenance spans point at real offsets in the stored text (asserted:
`text[start:end]` contains the amount literal); 7. no AI call exists in the P0 path
(`rg "gemini|google.generativeai" api/app` → 0 outside a disabled module).

**Tests.** schema unit tests (7 rejections) · deriver golden tests (4 fixtures) · hash stability ·
provenance offset test · 409 on draft.

**DoD.** IR stored, version-bound, validated, hash-stable, provenance real; `derived_by` visible in the UI;
Nidhi's fixture set covers clean/ambiguous/missing-party/business-days.

**Risks.** Deriver becomes "regex over prose" and is brittle → it derives from **structured agreement rows**
(milestones, parties, policy), using text only for provenance and for the `business|calendar` basis
detection, which is explicit; schema churn → `schema_version` is stored and parity refuses cross-version
comparison; AI leaking into P0 → feature flag defaults false and the module is not imported.

**Effort:** 12 h (Nidhi 9, Sam 2, Arati 1). **Deliverable:** a real IR document per approved version, with
provenance and a stable hash.

---

## 9. P0-07 — Deterministic parity engine

**Objective.** Compare **approved IR** against **execution parameters** field by field, with severities and a
reproducible result hash. No score, no hard-coded message (D-05).

**Business purpose.** The product's claim is "the executable terms match the approved terms, provably".
This function *is* that claim.

**Files.** *New (api):* `app/parity/compare.py` (pure), `app/schemas/parity.py`, `app/routers/parity.py`,
`app/scripts/derive_exec_params.py`, `migrations/0006_parity.sql`, `tests/test_parity.py` (≥20 cases),
`tests/fixtures/parity/*.json`. *Changed (web):* the Parity screen replaces `tampered ? 74 : 100` with
rendered rows from the API.

**API contracts.** `POST /api/agreements/{id}/versions/{v}/parity` → `200 ParityResult`;
`GET` → latest run or 404. `POST /api/agreements/{id}/execution-parameters` (derive) →
`{params, params_sha256, source:'derived'}`; `POST …/execution-parameters/tamper` → demo-only, gated by
`DEMO_TAMPER_ENDPOINT` (N-05), sets `source='tampered_demo'`.

**Data requirements.** `execution_parameters`, `parity_runs`.

**Comparison table (fixed order ⇒ deterministic output).** critical: `parties` (set on role+email),
`currency`, `total_amount_minor`, `milestone_count`, `milestones[i].amount_minor`, `milestone_sum`,
`milestones[i].due_date`, `review_period_days`, `review_period_basis`, `dispute_behavior`,
`schema_version`. advisory: `milestones[i].name`, `milestones[i].acceptance_criteria`, `governing_law`,
unknown fields. Money compared as integers; no tolerance; no floats.

**Acceptance criteria.** 1. ₹50 000 → ₹5 000 produces **critical** rows naming
`total_amount_minor`, `milestones[2].amount_minor`, `milestone_sum`; `passed=false`; 2. identical inputs →
`passed=true`, zero critical; 3. same inputs 100× → one unique `result_sha256`; 4. a 5→2 day review window
produces a critical row naming `review_period_days`; 5. a `business` vs `calendar` basis difference is
critical; 6. no UI string contains a score or a mismatch sentence (`rg "74" web/src/features/parity` → 0);
7. `compare()` performs no I/O, no clock, no randomness (unit test with a frozen input).

**Tests.** ≥20 table-driven cases · determinism repeat-100 · tamper → critical · restore → pass ·
`policy_version` bump changes the result hash.

**DoD.** Every mismatch the demo shows is computed, named by field, and reproducible from stored inputs.

**Risks.** Comparison drift from the IR schema → parity imports the same pydantic models, and refuses
cross-`schema_version`; float leakage → integer-only assertions with rejection of `bool`/`float`;
"tamper" endpoint reachable in prod → env-gated and off by default, asserted by a config test.

**Effort:** 12 h (Nidhi 10, Arati 2). **Deliverable:** a real comparison engine with a reproducible result hash.

---

## 10. P0-08 — Verification runs + execution gate

**Objective.** Execution is refused unless a **passing** verification exists for the **exact current
version**, with **all required party approvals**.

**Business purpose.** Detection without blocking is a warning label. The brief's step 8 ("block execution")
is the whole point.

**Files.** *New (api):* `app/verification.py`, `app/routers/verification.py`,
`app/routers/execution.py`, `migrations/0007_verification.sql`, `tests/test_execution_gate.py`.
*Changed (web):* Smart Contracts / milestones screens read the gate result instead of local state.

**API contracts.** `POST /api/agreements/{id}/versions/{v}/verify` → `VerificationRun`;
`POST /api/agreements/{id}/milestones/{seq}/release` → `200` or `409 PARITY_BLOCKED` /
`409 APPROVALS_INCOMPLETE`; `GET /api/agreements/{id}/verification-status` → aggregate.

**Data requirements.** `verification_runs`; reads `version_approvals`, `execution_parameters`, `parity_runs`.

**Authorisation rule (exact, one query):**

```sql
SELECT 1 FROM verification_runs v
JOIN agreements a ON a.id = v.agreement_id
WHERE v.agreement_id = :id AND v.version_id = a.current_version_id AND v.passed
```
plus: `count(version_approvals for current_version_id) == required_party_count`. Any change to
`current_version_id` makes every prior run structurally ineligible — no stale window, no cleanup job.

**Acceptance criteria.** 1. tampered params → release returns `409 PARITY_BLOCKED` with the critical field
names; 2. restoring + re-verifying → release succeeds; 3. both runs appear in the history with timestamps;
4. releasing a *previous* version's milestone after a new approval → `409` (stale run);
5. incomplete approvals → `409 APPROVALS_INCOMPLETE` naming the missing party; 6. verification against a
draft → `409 VERSION_NOT_APPROVED`; 7. no client-supplied `passed` value is trusted anywhere.

**Tests.** gate matrix (tampered/restored/stale/draft/incomplete) · release blocked → audit event ·
approval-count query · one test that flips `current_version_id` and asserts the old run stops authorising.

**DoD.** "Blocked" is enforced by the server, returns a machine-readable reason, and is visible in history.

**Risks.** Gate implemented in the UI again → the UI may only *display*; every test hits the API ·
approval requirement mis-counted (duplicate roles) → unique constraint on `(version_id, party_role)` ·
verification cached as a flag → it is a row, always queried.

**Effort:** 10 h (Sam 8, Nidhi 2). **Deliverable:** a real execution gate.

---

## 11. P0-09 / P0-10 / P0-11 / P0-12 (bounded, sprint-2 candidates)

| ID | Objective | Owner / Support | Files | Key AC | Effort |
|---|---|---|---|---|---|
| **P0-09** | Bounded review flow: lawyer requests a specific change with a reason; system creates the next draft version | **Arati** / Sam, Iffa | `app/versions.py` (+`request-change`), `docs/` activity copy, `ReviewRequest.tsx` | request creates draft `v+1` + `review.requested` audit event; reason required; cannot request on an approved-frozen version without creating a new draft; the requesting lawyer cannot self-approve as owner | 6 h |
| **P0-10** | Frontend wired to the real API; **no silent fixture fallback** | **Iffa** / Nidhi | `web/src/features/**`, `web/src/lib/api.ts` | every screen reads the API; every remaining fixture is labelled in-UI (`data-source="fixture"`); loading/empty/error states exist; `rg "tampered ? 74"` → 0 | 14 h |
| **P0-11** | Playwright E2E proving D1–D10 | **Arati** / Iffa | `web/tests/e2e/demo.spec.ts`, `playwright.config.ts` | one file: 5 personas, nav has no 403, create ₹50 000, approve as both parties, tamper to ₹5 000, assert mismatch fields + blocked release, restore, re-verify, assert 2 runs in history | 10 h |
| **P0-12** | Demo blockers from `UI_AUDIT.md` | **Iffa** / Arati | `App.tsx` (auth error, guided demo, 403/404 copy), icon buttons (`aria-label`) | unknown email shows an error; guided demo either advances or is removed; unknown `/app/*` → 404 not 403; 3 unnamed icon buttons labelled | 6 h |

---

## 12. Shared contracts (summary — normative versions in `docs/API_CONTRACTS.md`)

| Concern | Rule |
|---|---|
| Base path / origin | `/api/v1` for business endpoints (wire path — see `docs/API_CONTRACTS.md` §1.1); `/api/health` unversioned; dev = Vite proxy → `:8000`; prod = FastAPI serves `web/dist` (single origin, no CORS) |
| Auth | `lx_session` cookie: HttpOnly, SameSite=Lax, Secure in prod, 12 h sliding, revocable |
| CSRF | `X-CSRF-Token` required on every non-GET |
| Money | integer **minor units** + ISO-4217; `₹50,000` = `5000000`; no floats anywhere |
| Time | ISO-8601 UTC (`Z`); legally-date fields `YYYY-MM-DD` |
| IDs | UUID v4; seed ids deterministic `uuid5` |
| Errors | `{"error":{code,message,details[{field,code,message}],request_id}}` |
| Codes | `VALIDATION_FAILED`, `MISSING_CLARIFICATION`, `PARITY_BLOCKED`, `WRONG_NETWORK`, `INTEGRATION_UNAVAILABLE` (from `docs/API.md`) + `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `CSRF_FAILED`, `NOT_FOUND`, `ALREADY_APPROVED`, `VERSION_NOT_APPROVED`, `APPROVALS_INCOMPLETE`, `HASH_MISMATCH` |
| Validation ownership | **Server is authoritative**; the client mirrors rules only for inline UX and must never be the only check |
| Contract source | `api/openapi.yaml` (Sam); CI diffs it against the running app's schema |

---

## 13. Schedule against the real deadline

### 13.1 Facts

- **Today:** 2026-11-13 (Friday). **Deadline:** 2026-12-01 (Tuesday) → **13 weekdays**, plus 4 weekend days.
- **Availability (Q1, midpoints):** Nidhi 12 h/wk · Sam 12.5 · Iffa 17.5 · Arati 7.5 = **49.5 h/week**.
  All four are **ESTIMATES pending confirmation**; Arati's 5–10 range is the least certain and the schedule
  has a contingency (§13.5).
- **Work required for the full demo:** §2 total **158 h** including review overhead. 13 weekdays ≈ 129 h.
  **The plan does not fit.** §13.4 is the honest resolution.

### 13.2 Phase split

| Phase | Dates | Goal | Exit evidence |
|---|---|---|---|
| **Sprint 1 — core** | Fri 11-13 → Tue 11-24 (8 weekdays) | P0-01…P0-08 + minimal P0-12 | the tamper scenario works via API + one UI path |
| **Sprint 2 — product** | Wed 11-25 → Fri 11-27 | P0-10 completion, P0-09, deploy, hardening | deployed URL + complete submission pack |
| **Sprint 3 — proof & rehearsal** | Mon 11-30 → Tue 12-01 | P0-11 green, two clean rehearsals, freeze | E2E green in CI + rehearsal log |

### 13.3 Day-by-day (Sprint 1)

| Day | Nidhi (12 h/wk) | Sam (12.5 h/wk) | Iffa (17.5 h/wk) | Arati (7.5 h/wk — **unconfirmed**) | Daily gate |
|---|---|---|---|---|---|
| **D1 Fri 11-13** | Read this plan; confirm N-01…N-05; write IR v1 field list (§8) | P0-01 move (branch `feat/backend-foundation`), `api/health` | **P0-02** (branch `fix/p0-02-owner-parity-access`) | Baseline screenshots of 8 routes; AC checklists for P0-01…P0-05 | **P0-02 → PR with E1–E5**; P0-01 branch builds |
| **D2 Mon 11-16** | IR schema models w/ Sam; error-code review | P0-01 merged; P0-03 session + `/me` | P0-03 sign-in/sign-out UI states | Reproduce P0-01 hash + route parity | **P0-01 merged**; one real session works |
| **D3 Tue 11-17** | IR deriver from structured rows | P0-03 policy port + 75-cell matrix | P0-12 auth error state (+2 fixes) | Cross-check TS↔PY matrix | **matrix 75/75 server-side** |
| **D4 Wed 11-18** | IR fixtures (4 cases) | P0-04 models + migrations + create/list | Agreements list from mock → API | Validation matrix as pytest cases | **P0-03 merged** (Arati-verified) |
| **D5 Thu 11-19** | IR provenance spans | P0-04 builder + detail + seed | Agreement builder + inline errors | create→reload→second-browser test | **P0-04 merged** |
| **D6 Fri 11-20** | Hash review; IR `ir_sha256` | P0-05 hashing + trigger + per-party approvals | Version badge + approve dialog | Immutability + per-party repro | **hash + immutability green** |
| **D7 Mon 11-23** | IR API + UI wiring | P0-07 exec params + parity (pair w/ Nidhi) | Detail: approvers + real hash | E2E skeleton (personas + nav) | **P0-05 merged** |
| **D8 Tue 11-24** | Parity result UI | P0-08 gate + release refusal | Parity screen from API | Tamper → blocked repro | **P0-06/07/08 merged**; tamper blocked via API |

**Weekend 11-21/22 is optional buffer** (not assumed). If used, it absorbs P0-05 slippage — the most likely
slip, because hashing + approvals + trigger is the densest task.

### 13.4 What does not fit, and the honest choice

| Must-have for D1–D10 | Hours | In Sprint 1? |
|---|---|---|
| P0-01, 02, 03, 04, 05, 06, 07, 08 | 107 | **yes** |
| P0-12 (3 of 6 fixes: auth error, 403/404 copy, labels) | 3 | yes |
| P0-10 partial (IR, parity, approve, detail screens — not the whole shell) | 8 | yes |
| **Sprint 1 total** | **118 h vs ~79 h weekday capacity** | **does not fit at midpoints** |

Therefore Sprint 1 is planned **with the weekend buffer and/or reduced hours elsewhere**, and Sprint 2
absorbing P0-09/P0-11. If neither weekend is used, the fallback is:

> Ship P0-01, P0-02, P0-03, P0-05 (135 h→ reduced to 45 h by seeding the demo agreement through the API
> instead of building the builder UI). The demo then shows a **seeded** ₹50 000 agreement, a real hash, real
> per-party approval and a real blocked release — and says "created via API for the demo" out loud. **Never**
> by faking a hash or keeping the boolean score.

### 13.5 Contingency if Arati confirms < 5 h/week

P0-09 → Nidhi (2 h, request-change only); P0-11 → Iffa (with Arati reviewing the test plan instead of
writing it). Everything else unchanged. This must be decided on **D1**, because P0-11 is the gate for
freeze.

### 13.6 Unconfirmed inputs (do not treat as commitments)

| Ref | Item | Confirmation needed by |
|---|---|---|
| A1 | Everyone's hours (Q1) | D1 |
| A2 | Arati's availability specifically | **D1** (drives §13.5) |
| A3 | Postgres availability (Supabase project or Docker daemon — daemon **unverified**, `psql` not on PATH) | **D1 end** |
| A4 | Hosting choice + account owner | D3 |
| A5 | Gemini key + written consent for third-party document text | P1-04 only — **not** a P0 blocker |
| A6 | Demo accounts may be seeded fixtures (not production credentials) | D1 |

---

## 14. What must be true before the demo (freeze criteria)

1. D1–D10 from `audit/FINAL_TEAM_ASSIGNMENT.md` each demonstrated **and** covered by P0-11.
2. P0-11 green in CI on `main`.
3. Two consecutive clean rehearsals, logged with timestamps.
4. Every P0 acceptance criterion verified by someone who did not implement it.
5. No screen shows a hash, score, balance, or approval the system did not compute.
6. Every simulated surface labelled (`SIMULATED`, `DEMO`, `not live AI`).
7. Deployed URL reachable with the five demo accounts working.
8. `docs/PROJECT_STATUS.md` updated with the final evidence set.

---

## 15. Scope boundary

In scope: P0-01…P0-12. **Not in scope without a new approval:** real Solidity/escrow contract, wallet SDK,
real funds, file uploads/OCR, multi-tenant UI, notifications infrastructure, Trust Passport, AI extraction
beyond the feature flag, any P1/P2/P3 item. Adding any of these mid-sprint requires replacing something in
§13.4, not adding hours that do not exist.
