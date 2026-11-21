---
document_status: "APPROVED by owner @1480@ (2026-11-21) — single material-decision gate resolved with conservative defaults: preview-only Vercel; owner-provided DATABASE_URL only; licensing proposal-only (no MIT assertion); accept+document rate-limiter limitation; hold media commit; no production seeding. See §8/§11 and docs/STATE.md OMEGA section."
prepared_by: "Business Analyst (requirements-only final-delivery subagent)"
date: "2026-11-21"
scope_type: "Requirements only. No source edits, no git/deployment mutations by this BA. Deployment, commit/push, paid resources, and licensing assertions are requirements to be authorized — not actions taken here."
owner_specified_filename: "docs/OMEGA_FRS.md"
workstream_functional_name: "LEGALX–ASTRA 'OMEGA' final delivery"
baseline: "integration/legalx-v1 @ b1b5eba = origin/integration/legalx-v1, no divergence (owner-provided current-state fact; NOT independently verified by this BA — no git commands were run). Remote: https://github.com/the-nidhi-bhat/LEXORA-LegalX.git. Vercel CLI v65.2.0 authenticated as thenidhibhat-6721 (owner-provided)."
owner: "@1433@"
event: "HackIndia 2026 — participant HI025038"
authority: "Owner final-delivery mission brief (2026-11-21, via orchestrating session); three discovery agent reports (engineering gaps / docs-licensing / Vercel feasibility) as summarized in that brief; docs/STATE.md; docs/PRODUCT_ROADMAP.md; docs/DECISIONS.md; README.md; TODO.md; docs/PHASE7_CLOSEOUT_FRS.md (format reference)."
---

# LEGALX–ASTRA — "OMEGA" Final Delivery — Functional Requirements Specification (FRS)

> **DRAFT / REQUIREMENTS ONLY.** This document specifies what the final-delivery workstream must do and how each item will be verified. It is **not** an implementation, not a deployment, and not a git action. This BA performed read-only inspection only: no source file other than this FRS was created or modified, and **no git, test, build, or cloud command was executed**. Every "Passed" outcome below is **conditional** on the implementer running the named command and attaching real output (§4, §5).

> **Repo-truth naming note (do not re-litigate).** The owner chooses **"Honor repo truth"**. Per the authoritative Phase 7 closeout record (`docs/STATE.md:229-256`), there is **no numbered product "Phase 7" spec**; the phase-report filenames `PHASE_07_ENGINEERING.md` … `PHASE_12_HACKATHON.md` required by R4 are **owner-specified deliverable labels only** and assert no product phase. No blockchain / MetaMask / real-escrow requirement appears anywhere in this FRS (§2.2, §9). The label "Phase 12 Hackathon" refers to the HackIndia 2026 submission package, not a product phase.

> **One owner gate.** The owner explicitly does **not** want ordinary-coding questions. Only the six genuinely material decisions in §8 (a–f) are escalated, and they are routed through a **single owner approval gate** (§11). All other detail is resolved by the conservative defaults in §8 or by the implementer within the stated scope.

---

## 1. Objective

Produce a truthful, testable specification for completing the LEGALX–ASTRA final-delivery mission:

1. Close the three remaining in-scope engineering defects and test them without weakening any legal gate (R1).
2. Create Vercel deployment **scaffolding only** — no live deploy — for a Vite/React SPA + FastAPI Python Function + external managed PostgreSQL on a shared domain (R2).
3. Rewrite the project documentation set so it is accurate to the shipped code (README, PRD, API reference, SECURITY, CONTRIBUTING) (R3).
4. Produce the six phase reports and the master report under `docs/final-delivery/`, each with exactly one honest verdict and no fabricated evidence (R4).
5. Prepare licensing material **without asserting any license** and record the blockers for owner decision (R5).
6. Run the full verification battery with honest counts and live/rendered-UI evidence; never claim a pass that was not executed (R6).
7. Deliver via a scoped commit/push to `origin/integration/legalx-v1` **only if the owner authorizes the target and any billing** (R7).

**Authority / trace for the objective:** owner final-delivery mission brief (owner `@1433@`, 2026-11-21, participant HI025038); discovery findings §5; `docs/STATE.md` final-status sections; `docs/PHASE7_CLOSEOUT_FRS.md` (format + honesty conventions). This effort completes and documents existing work; apart from the three R1 defect fixes it adds no product features, no redesign, and no on-chain work.

---

## 2. Scope

### 2.1 In scope

- **R1 — Engineering defects (routine-safe).** Add rate limiting to `POST /verify`; make the execution rate-limit 429 path reachable; correct the misleading concurrency error message. Unit/integration tested. Exact protected-backend files/lines recorded; no legal-gate logic weakened.
- **R2 — Vercel scaffolding (local files only; NO live deploy).** Create `vercel.json` Services config, pin the FastAPI entrypoint and install command; make the minimal `alembic/env.py` change so migrations read `DATABASE_URL` from the environment; add a deployment README section listing env-var **names only**. Do **not** run `vercel deploy` or create any cloud resource.
- **R3 — Documentation rewrite.** README, new PRD, accurate API reference, strengthened SECURITY.md and CONTRIBUTING.md; validate all links, Mermaid blocks, and image paths.
- **R4 — Phase + master reports.** `docs/final-delivery/PHASE_07_ENGINEERING.md` … `PHASE_12_HACKATHON.md` plus `FINAL_MASTER_REPORT.md`; exactly one verdict each; real vs simulated separated.
- **R5 — Licensing preparation.** A proposed MIT-text `LICENSE` and a licensing-review note documenting the blockers; status **Blocked** pending owner consent. Do not assert MIT.
- **R6 — Verification.** Full battery with honest counts: pytest, tsc, npm test, build, parity E2E, `rehearse:judge`, rendered-UI evidence, regression.
- **R7 — Scoped delivery.** Commit/push scoped work to `origin/integration/legalx-v1` only under the conditions in §2.3 and §8; verify the remote SHA; report the GitHub URL.

### 2.2 Out of scope (explicitly forbidden or deferred)

- **Any live Vercel deployment, cloud resource creation, preview/public URL publication, or DNS/domain work** without the owner gate (§8a/§8b); no `vercel deploy`, no project creation, no managed-Postgres provisioning by this workstream.
- **Any paid/billable resource or account action** without explicit written authorization; **no credentials, tokens, or connection strings in chat or any report**.
- **Any production database mutation**, seeding of production demo accounts (unless separately authorized, §8f), local SQLite DB reset/delete, or schema change without a rollback plan. The one-time Alembic `upgrade head` under R2 is a *scaffolding/migration-readiness* requirement whose execution against any real target is gated with deployment (§8b).
- **Public blockchain / MetaMask / wallet / real escrow / on-chain indexing / `.sol` / Sepolia integration** — a new scope requiring fresh authorization; out of scope per `docs/STATE.md:232-233`, `docs/DECISIONS.md:253`, `docs/PRODUCT_ROADMAP.md:10`.
- **Identity binding, an AI-extraction HTTP surface, reconciling the "25 vs 30" route-count discrepancy, in-memory limiter redesign, dead-code cosmetics** — all listed as OUT of scope by the engineering discovery report.
- **UI redesign**, new screens, or reverting/overwriting the concurrent UI agent's work. Preserve all of it and the dev servers on ports **8010/3002** (do not kill).
- **Weakening any boundary**: strict backend schema (`extra='forbid'`), org isolation, RBAC, CSRF, approval rules, or execution/legal gates. No widening of the verified 2-field live payload `{dispute_behavior, governing_law}`.
- **Force-push, `reset --hard`, `git clean`, branch switch, merge to `main`,** or any destructive git operation.
- **Fabricated passes, sign-offs, evidence, or remote verifications**; no "Passed" by inference. No secrets in chat or reports.
- **Feature development** beyond the three defects: `TODO.md:78` stops feature work; only defects/security/reliability/release-blockers remain.

### 2.3 Hard constraints (authoritative, not re-litigated)

| ID | Constraint | Source |
|---|---|---|
| HC-1 | No production DB mutation; no local SQLite DB reset/delete. | Owner hard constraints |
| HC-2 | No merge to `main`; no force-push; no destructive git operations. | Owner hard constraints |
| HC-3 | No billing/paid resources or account changes without explicit authorization. | Owner hard constraints |
| HC-4 | No public blockchain / MetaMask / real escrow; honor repo truth — no invented Phase 7 spec. | Owner hard constraints; `docs/STATE.md:229-256`; `docs/PRODUCT_ROADMAP.md:10` |
| HC-5 | No UI redesign; preserve all concurrent UI-agent work and ports 8010/3002 (do not kill). | Owner hard constraints; `docs/STATE.md:218` |
| HC-6 | No claiming success without live/rendered evidence; no fabricated results or sign-offs. | Owner hard constraints |
| HC-7 | No secrets in chat or reports; env var **names only**. | Owner hard constraints |
| HC-8 | Do not assert MIT (or any license) without owner consent; media/fonts provenance unresolved. | Owner hard constraints; docs/licensing discovery |
| HC-9 | This BA writes **only** `docs/OMEGA_FRS.md`; no source edits and no git/test/deploy commands by this BA. | Subagent task directive |

### 2.4 Routines vs. material decisions (owner gate separation)

The owner requested **no ordinary-coding questions**. Work is therefore split as follows; only §8 is escalated.

**Routine-safe — autonomous (no owner question):**

| Item | Scope | Basis |
|---|---|---|
| R1 fixes + tests | Defect fixes confined to the three named files; unit/integration tests; no legal-gate change. | Discovery engineering report (in-scope real defects) |
| R3 docs | README/PRD/API/SECURITY/CONTRIBUTING rewrites; link/Mermaid/path validation. | Owner mission; docs/licensing discovery |
| R4 reports | Seven report files; one verdict each; no fabricated evidence. | Owner mission |
| R5 proposed license note | Draft MIT text + licensing-review note, status **Blocked**. No assertion of license. | Owner mission; HC-8 |
| R6 verification | Run all named checks; record honest counts and evidence. | Owner mission; HC-6 |

Local, non-mutating scaffolding artifacts under R2 (`vercel.json`, `alembic/env.py` edit, README deployment section) are likewise local file work and are **not** cloud actions; the deploy and the Alembic run against any real target are gated with §8a/§8b.

**Material decisions — single owner gate (§8):** (a) deploy target preview-only vs also production; (b) Postgres provider + billing + owner-provisioned `DATABASE_URL`; (c) MIT consent + media rights; (d) accept documented per-instance rate-limiter limitation vs a stronger control; (e) commit the 8 media files; (f) seed demo accounts in production. R7 (commit/push) is additionally gated on the §8 authorization outcome.

### 2.5 Status vocabulary (used in every AC and verification report)

| Status | Meaning |
|---|---|
| **Passed** | Verification was executed and succeeded; exact command output/artifact captured. |
| **Failed** | Verification was executed and did not meet the criterion; output captured. |
| **Blocked** | Cannot be performed due to an explicit owner constraint or unresolved material decision (e.g., HC-1/§8). |
| **Unverified** | No executable evidence/harness was run for this item; not claimed as passed. |
| **Not applicable** | Out of scope for the requirement (e.g., appearance criteria for backend/docs R1/R2/R5/R6; all blockchain items). |

> **Evidence honesty (HC-6):** This BA ran **no** git, test, build, or cloud command. All "Passed" outcomes below are **conditional** on the implementer running the named command and attaching real output. Discovery baselines (§5.4) are **reference only** and must not be claimed as this session's results. Any check not executed is **Unverified** (or **Blocked** where an owner constraint forbids it), never **Passed** by inference. An item flagged "could not verify read-only" in discovery (§5.3) remains **Unverified** until the implementer validates it live.

### 2.6 Appearance criteria (separate from functionality)

These are **not** functional criteria; where UI is involved they must be checked **in addition to** functional ACs. For backend/docs requirements **R1, R2, R3, R5 and R6, appearance criteria are Not applicable** (R3's README screenshots are documentation-validity checks, not UI appearance checks). UI-facing acceptance is captured by R6 rendered-UI evidence (R6.6).

- **A-1 — Build integrity.** **Given** final changes applied, **When** `npm run build` runs, **Then** it exits 0 with no new advisory beyond the pre-existing bundle-size note. **Verification:** `npm run build`.
- **A-2 — Design system preserved (Astra Noir).** **Given** the final diff, **When** appearance is reviewed, **Then** Astra Noir tokens and existing styling are preserved; no redesign, no heavy 3D in legal workflows, no hardcoded colors introduced by this workstream. **Verification:** `git diff` review + browser smoke.
- **A-3 — Honest simulation labels.** **Given** any simulated/demo content, **When** displayed, **Then** it is labelled simulation/demo and never presented as a real backend result or real on-chain action. **Verification:** browser smoke + `npm run rehearse:judge`.
- **A-4 — Theme/responsiveness/reduced-motion.** **Given** light/dark toggle, 320/768/1024/1440 viewports, and reduced-motion enabled, **When** pages render, **Then** content remains legible with no overflow, unstyled elements, or console errors. **Verification:** rendered-UI evidence capture (R6.6).

> Appearance evidence belongs to R6.6/R6.7; the phase reports (R4) must state "appearance: Not applicable" for backend/docs phases and record UI results only where UI was actually exercised.

---

## 3. Authority and traceability of requirements

Every requirement traces to the owner request or an explicitly recorded decision/discovery. None is an invented extra feature.

| Requirement | Trace (owner request / approved decision / discovery) |
|---|---|
| R1 | Owner mission "complete remaining approved engineering"; engineering discovery report (3 in-scope defects); §5.1. |
| R2 | Owner mission "deploy full stack via Vercel where feasible" + "no deploy without approval"; Vercel feasibility discovery report; §5.3. |
| R3 | Owner mission "complete remaining documentation"; docs/licensing discovery report (README gaps, no PRD/OpenAPI, weak SECURITY/CONTRIBUTING); §5.2. |
| R4 | Owner mission "produce six phase reports + FINAL_MASTER_REPORT under docs/final-delivery/"; §5.2 (dir absent). |
| R5 | Owner mission "licensing prep; do NOT assert MIT"; docs/licensing discovery blockers; HC-8; §5.2. |
| R6 | Owner mission "verify live; no fabricated passes"; `docs/STATE.md` baselines; §5.4. |
| R7 | Owner mission "commit/push scoped work to origin/integration/legalx-v1"; git state §5.5; gated by §8. |
| §2.3 hard constraints | Owner hard-constraint list; `docs/STATE.md` final-status sections. |
| §8 material decisions | Owner directive "only escalate genuinely material decisions (account/billing/credentials, license consent, production release target)". |

---

## 4. Status vocabulary cross-reference

See §2.5. The vocabulary governs all ACs (§6), the traceability matrix (§10), every phase report verdict (R4), and the final approval request (§11).

---

## 5. Discovery basis (read-only inspection)

This BA used only file reads, greps and glob inspection. No git or test command was executed (HC-9). Claims marked "owner-provided" were not independently verified.

### 5.1 Engineering gaps (engineering discovery report)

- **Three in-scope real defects:**
  1. `POST /verify` has **no rate limiting** — `api/app/routers/parity.py:34-53`; each call appends 3–4 DB rows.
  2. **Execution rate-limit dead code** — `api/app/routers/execution.py:47,231-238` calls `limiter.check()`, but `record_failure()` exists only in `api/app/routers/auth.py` (`auth.py:75,78,88`); the 429 + `Retry-After` path is unreachable. Confirmed by read-only grep: `api/app/ratelimit.py` defines `record_failure()` at `:37`; no call in `execution.py`.
  3. **Misleading concurrency error** — `api/app/routers/execution.py:328-330` reports a stale `draft` state before `db.refresh()` at `:333`.
- **Verified DONE but UNCOMMITTED in the working tree** (preserve, do not discard): activity `Agreement` import fix, extractor `Callable` fix, `api/requirements.txt`, `api/tests/test_activity.py`.
- **OUT of scope:** identity binding, AI-extraction HTTP surface, "route count 25 vs 30", in-memory limiter redesign, dead-code cosmetics.
- **0 TODO/FIXME** in active source.

### 5.2 Documentation / licensing (docs-licensing discovery report)

- `README.md` is 174 lines with 2 Mermaid diagrams and 8 screenshots that resolve. Missing: a film section for the real asset `public/film/legalx.mp4` (glob-confirmed present), a real feature matrix; stale path at `:42` (`src/styles.css`, actual `src/styles/styles.css`); omits `three.js` (glob-confirmed in `package.json:20`); dark-only-vs-light contradiction at `:11`. No logo/favicon/OG tags.
- No PRD, no `docs/final-delivery/`, no jury PDF, no OpenAPI spec (glob-confirmed absent). `CONTRIBUTING.md` is 3 lines (read-confirmed).
- **Licensing blockers:** no `LICENSE` (glob-confirmed absent), no copyright holder/year, film MP4s + noir webp lack provenance; fonts are OFL 1.1 compliant but untracked; **all media/fonts untracked**. Do NOT assert MIT without owner consent (HC-8).

### 5.3 Vercel feasibility (Vercel feasibility discovery report)

- One Vercel project with **Services**: Vite static SPA + FastAPI Python Function on a shared domain + external managed Postgres. Same-origin is safe; no serverless anti-patterns (no `lifespan`/`create_all` at startup; sessions/CSRF are DB rows).
- **Postgres is mandatory:** `api/app/config.py:97-102` hard-rejects non-postgresql `DATABASE_URL` when `APP_ENV=production` (read-confirmed); `psycopg[binary]>=3.2` present.
- Concrete scaffolding: `vercel.json` with Services routing `/api/(.*)` → API, catch-all → web, SPA fallback `index.html`; pin `api.app.main:app`; set `installCommand`.
- Minimal `migrations/env.py` fix to read `DATABASE_URL` from the environment (`alembic.ini:89` hardcodes `sqlite:///./legalx.db`, read-confirmed), then a one-off `upgrade head` (single revision `e25c7211a088`), **no `create_all` at startup**.
- Committing the 8 media files (4,476,884 B ≈ 4.27 MiB) before a Git-based deploy is required — **this needs owner consent** given provenance (§8c/§8e).
- Env var **NAMES only** (never values): backend `APP_ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `DEMO_TAMPER_ENDPOINT`, `LOG_LEVEL`, `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS`, `FEATURE_AI_EXTRACTION`, `LOGIN_RATE_LIMIT_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, plus `GEMINI_API_KEY`, `LEGALX_GEMINI_MODEL`; frontend `VITE_API_BASE_URL`.
- **Blockers needing owner:** Vercel project creation; managed Postgres with billing + owner-provisioned `DATABASE_URL`; credentials; rate-limiter security decision; demo-seeding decision; explicit production-deploy approval (`docs/STATE.md:117` bans deploy).
- **Could NOT verify read-only:** `vercel.json` Services schema validity, framework auto-detect, Vite env inlining, static-asset resolution. These remain **Unverified** until validated in implementation/deploy.

### 5.4 Git state, baselines, and repo truth

- Branch `integration/legalx-v1 @ b1b5eba` = remote, no divergence (owner-provided). Correct remote: `https://github.com/the-nidhi-bhat/LEXORA-LegalX.git`; target `origin/integration/legalx-v1`. Legacy "LegalX-pro" push disabled.
- Reference baselines (`docs/STATE.md:216-217,242,258`): pytest **442 passed / 3 skipped / 1 warning**; `npx tsc --noEmit` exit 0; `npm test` **9/9**; `npm run build` exit 0 (Vite ~8.3.6, pre-existing >500 kB advisory). E2E honest baseline: Phase 7 parity E2E **10 passed / 0 failed / 0 skipped in 55.4 s**; earlier 6/7 cold-start issue not permanently fixed (environmental Vite latency) — never claimed fixed.
- HTTP surface = **15 routes** across **7 routers** (`docs/STATE.md:206-208`; read-confirmed `main.py` registers 7 routers). R3's API reference must use these real 15 routes; the separate "25 vs 30" route-count discrepancy is OUT of scope (§2.2).
- Legal-gate files were byte-identical at Phase 6 (`docs/STATE.md:224`): `execution.py` C3007F0E…B4B2, `engine.py` 85E4D3EE…ACC2, `comparison_rules.py` C0FDBF4A…DE434. R1 must not weaken these boundaries (record fresh SHAs; do not treat these as this session's values).
- `docs/PRODUCT_ROADMAP.md` "Next" (real remaining items) vs "Later" (Gemini server-side validation, Sepolia, wallet, on-chain indexing, billing readiness) — blockchain is **Later**, not in this scope.

---

## 6. Requirements (R1–R7)

Each AC is Given/When/Then, explicitly testable, and names a concrete verification command or check. Statuses follow §2.5.

### R1 — Engineering defects (routine-safe)

**Source trace:** owner mission "complete remaining approved engineering"; §5.1; HC-1/HC-5/HC-6.

**Protected-backend files/lines in scope (exact; discovery-reported, re-verify before edit):**
- `api/app/routers/parity.py:34-53` — `POST /verify` handler: add rate limiting using the authenticated key from `api.app.ratelimit` (do not introduce a new limiter design).
- `api/app/routers/execution.py:47,231-238` — execution rate-limit: record attempts so `429` + `Retry-After` become reachable; reuse `api.app.ratelimit` (same pattern as `auth.py:63-88`).
- `api/app/routers/execution.py:328-330` — concurrency error message: correct the stale `draft` wording; state is refreshed at `:333`.

**R1.1 — `POST /verify` is rate limited.**
- **Given** an authenticated principal repeatedly calling `POST /api/v1/agreements/{id}/versions/{version}/verify`, **When** calls exceed the configured threshold, **Then** subsequent calls return `429` with `Retry-After`, using an authenticated key from `api.app.ratelimit`; legitimate single calls still succeed and the response/status contract is unchanged.
- **Verification command/check:** new unit/integration test (path finalized in plan, e.g. `api/tests/test_parity_ratelimit.py`) run via `.venv\Scripts\python.exe -m pytest api/tests -q --no-header`; source review of `parity.py:34-53`. **Status:** Passed only with captured green output; Failed if the verify contract or legal result changes.

**R1.2 — Execution rate-limit 429 path is reachable.**
- **Given** repeated rate-limited execution attempts, **When** the threshold is crossed, **Then** `api/app/routers/execution.py` records each attempt (e.g. `limiter.record_failure(key)`) so `limiter.check()` at `:231` actually returns denied and the handler emits `429` with `Retry-After` (`:234`); no attempt remains unrecorded.
- **Verification command/check:** new test (e.g. `api/tests/test_execution_ratelimit.py`) via `.venv\Scripts\python.exe -m pytest api/tests -q --no-header`; grep confirming `record_failure` appears in `execution.py`. **Status:** Passed only with captured output; Failed if 429 stays unreachable.

**R1.3 — Concurrency error message is truthful.**
- **Given** the concurrent-execution branch at `execution.py:328-330`, **When** it triggers, **Then** the message no longer claims a stale `draft` state before `db.refresh()` at `:333`; it describes the actual state/condition.
- **Verification command/check:** source review + a regression test for the branch; `.venv\Scripts\python.exe -m pytest api/tests -q --no-header`. **Status:** Passed on review + green output.

**R1.4 — No legal-gate weakening and no collateral changes.**
- **Given** the final R1 diff, **When** it is reviewed, **Then** changes are confined to the three files listed above (+ their tests); org isolation, RBAC, CSRF, approval rules, execution gate, strict schema (`extra='forbid'`) and the verified 2-field payload remain intact; legal-gate files (`execution.py` gate logic `:210-229`, `api/app/parity/engine.py`, `comparison_rules.py`) are not weakened. Fresh SHAs recorded; protected files not otherwise modified. The uncommitted fixes in §5.1 are preserved, not discarded.
- **Verification command/check:** `git diff -- <three files> <tests>` review; SHA256 of legal-gate files; `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` (expect ≥442 passed, 3 skipped, 1 warning; deviations explained). **Status:** Passed on scoped diff + green suite; Failed on any boundary change.

### R2 — Vercel scaffolding (NO live deploy)

**Source trace:** owner mission "deploy via Vercel where feasible" + "no deploy without approval"; §5.3; HC-1/HC-3/HC-7/HC-9; §8a/§8b.

**R2.1 — `vercel.json` Services config authored (local file only).**
- **Given** the repository root, **When** `vercel.json` is created, **Then** it defines a single project with Services routing `/api/(.*)` → FastAPI Python Function and catch-all → Vite static SPA with `index.html` SPA fallback, pins `api.app.main:app` as the entrypoint and sets an `installCommand` that installs both Python and frontend dependencies. No deploy command is executed.
- **Verification command/check:** JSON parse/`vercel.json` review; `git status --short` shows a new local file only. **Status:** Passed on review; the schema validity / framework auto-detect / Vite env inlining / static-asset items from §5.3 remain **Unverified** until a live validation is authorized (§8a) — this is an honest limitation, not a fabricated pass.

**R2.2 — Alembic env reads `DATABASE_URL` from the environment.**
- **Given** the hardcoded `sqlite:///./legalx.db` at `alembic.ini:89`, **When** `migrations/env.py` is edited, **Then** it reads `DATABASE_URL` from the environment with the smallest possible change; the single revision `e25c7211a088` is the only migration; no `create_all` is added at startup; no migration file is otherwise changed.
- **Verification command/check:** review `git diff -- migrations/env.py` and confirm `alembic.ini` untouched; grep for `create_all` (expected absent in startup path). **Status:** Passed on scoped diff. **Note:** actually running `upgrade head` against any target is gated with §8b and HC-1 — **Blocked** until owner authorizes the provider/credentials.

**R2.3 — Deployment documentation lists env var NAMES only.**
- **Given** the README deployment section, **When** it is reviewed, **Then** it names exactly the env vars in §5.3 (backend `APP_ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `DEMO_TAMPER_ENDPOINT`, `LOG_LEVEL`, `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS`, `FEATURE_AI_EXTRACTION`, `LOGIN_RATE_LIMIT_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `GEMINI_API_KEY`, `LEGALX_GEMINI_MODEL`; frontend `VITE_API_BASE_URL`) and contains **no values, secrets, or connection strings**.
- **Verification command/check:** README review + grep for `=`-assigned secret-like values; HC-7 check. **Status:** Passed on review; Failed if any value appears.

**R2.4 — No cloud mutation by this workstream.**
- **Given** R2 scaffolding, **When** the workstream ends, **Then** no `vercel deploy`, no Vercel project creation, no managed-Postgres instance, and no DNS change was performed; any such action is **Blocked** pending §8a/§8b.
- **Verification command/check:** workstream log/doc review; confirmation no `vercel deploy` was run. **Status:** Passed on review of "no deploy executed".

### R3 — Documentation rewrite

**Source trace:** owner mission "complete remaining documentation"; §5.2; HC-7/HC-8.

**R3.1 — README rewritten accurately.**
- **Given** the current 174-line README, **When** it is rewritten, **Then** it contains: a hero; the canonical ₹30,000 / 3×₹10,000 / ₹35,000 (₹5,000 mismatch) problem statement; a film section using the real path `public/film/legalx.mp4`; a feature matrix with **VERIFIED / SIMULATED / DEFERRED** labels; Mermaid diagrams for architecture, workflow, IR, execution, DB and demo; the actual stack including `three.js`; the corrected CSS path `src/styles/styles.css`; a resolved dark-only-vs-light statement; test commands; security/limitations; contributors; and the closing line **"Verify the agreement. Then execute."**
- **Verification command/check:** README review against this checklist; `glob` image/Mermaid targets resolve. **Status:** Passed only if every listed item is present and truthful.

**R3.2 — PRD created with FR-###/NFR-### IDs mapped to tests.**
- **Given** the absence of a PRD (§5.2), **When** it is created, **Then** it defines functional requirements `FR-###` and non-functional requirements `NFR-###`, each mapped to a verification test/command consistent with R1–R7 and this FRS's traceability (§10).
- **Verification command/check:** PRD review; cross-check each ID appears in a test or command. **Status:** Passed on complete mapping.

**R3.3 — API reference from the real 15 routes only.**
- **Given** the 15-route `/api/v1` HTTP surface (§5.4), **When** the API reference is written/updated, **Then** it documents exactly those real routes with no invented endpoints; the 2-field verify contract and byte-identity of the strict schema are respected.
- **Verification command/check:** cross-check against `api/app/main.py` router registration and route inventory; review. **Status:** Passed on exact match; Failed if any fake endpoint appears. The "25 vs 30" discrepancy is not reconciled here (§2.2).

**R3.4 — SECURITY.md and CONTRIBUTING.md strengthened.**
- **Given** the 3-line `CONTRIBUTING.md` and current `SECURITY.md`, **When** they are updated, **Then** they cover the implemented security boundaries (session cookie, CSRF, RBAC/org isolation, strict schema, execution gate), the "no secrets / no .env / no force-push" rules, and a real contribution/test workflow — without claiming unimplemented integrations.
- **Verification command/check:** document review. **Status:** Passed on review.

**R3.5 — All links, Mermaid blocks and image paths validated.**
- **Given** the rewritten docs, **When** validation runs, **Then** every internal link, Mermaid block, and image path resolves and no stale `src/styles.css` reference remains.
- **Verification command/check:** path/link validation script or manual resolution log; grep for `src/styles.css`. **Status:** Passed only with a captured validation record.

### R4 — Phase reports + master report

**Source trace:** owner mission "produce six phase reports + FINAL_MASTER_REPORT under docs/final-delivery/"; §5.2 (dir absent).

**R4.1 — Exactly seven report files created with the specified names.**
- **Given** `docs/final-delivery/` is absent, **When** reports are produced, **Then** the directory contains exactly `PHASE_07_ENGINEERING.md`, `PHASE_08_BACKEND_API.md`, `PHASE_09_FRONTEND.md`, `PHASE_10_TESTING.md`, `PHASE_11_DEPLOYMENT.md`, `PHASE_12_HACKATHON.md`, and `FINAL_MASTER_REPORT.md`.
- **Verification command/check:** `glob docs/final-delivery/*.md` returns exactly these 7. **Status:** Passed on exact file set.

**R4.2 — Exactly one verdict per report.**
- **Given** each report, **When** reviewed, **Then** it carries **exactly one** overall verdict from §2.5, with the supporting evidence/command output; no report contains contradictory or multiple final verdicts.
- **Verification command/check:** report review; artifact references. **Status:** Passed on review; Failed on ambiguous/multiple verdicts.

**R4.3 — No fabricated evidence; real vs simulated separated.**
- **Given** all seven reports, **When** reviewed, **Then** every claimed result has captured output, implemented/simulated/deferred work is explicitly separated, R1 fixes are not reported as "deployed/live" unless §8 deployment actually occurred, and appearance is marked Not applicable for backend/docs phases.
- **Verification command/check:** report review against §2.5 and §5; HC-6 check. **Status:** Passed only if truthful.

**R4.4 — Honest deployment/hackathon status.**
- **Given** a deployment that is **scaffolding-only** unless §8 authorizes live deploy, **When** `PHASE_11_DEPLOYMENT.md` and `FINAL_MASTER_REPORT.md` are written, **Then** they state the deployment status honestly (e.g., "scaffolding complete; deploy Blocked pending owner gate"), record HackIndia 2026 / HI025038, and do not claim a live URL without live evidence.
- **Verification command/check:** report review; HC-6. **Status:** Passed on truthful status.

### R5 — Licensing preparation (Blocked)

**Source trace:** owner mission "licensing prep; do NOT assert MIT"; §5.2; HC-8.

**R5.1 — Proposed LICENSE (MIT text) prepared but NOT asserted.**
- **Given** the absence of any `LICENSE` and no copyright holder/year, **When** licensing material is prepared, **Then** a proposed `LICENSE` containing MIT text is drafted with holder/year left as explicit placeholders, and is **not committed or asserted as the project license** without owner consent.
- **Verification command/check:** document review; HC-8. **Status:** **Blocked** pending owner consent (§8c) — this is the required status, not a failure.

**R5.2 — Licensing-review note documents blockers.**
- **Given** the licensing blockers (no holder/year, film MP4 + noir webp provenance, OFL 1.1 fonts with a NOTICE carve-out, all media/fonts untracked), **When** the note is written, **Then** it records each blocker, recommends no license assertion until resolved, and lists the owner decisions required (§8c/§8e).
- **Verification command/check:** note review. **Status:** Passed on complete documentation; the underlying license decision remains **Blocked**.

### R6 — Verification and evidence

**Source trace:** owner mission "verify live; no fabricated passes"; §5.4; HC-6.

**R6.1 — Backend suite.**
- **Given** implementation complete, **When** `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` runs, **Then** it passes with expected **442 passed / 3 skipped / 1 warning** (reference; deviations explained), with output captured.
- **Verification command:** `.venv\Scripts\python.exe -m pytest api/tests -q --no-header`. **Status:** Passed only with captured output.

**R6.2 — TypeScript and frontend test scripts.**
- **Given** implementation complete, **When** `npx tsc --noEmit` and `npm test` run, **Then** tsc exits 0 and npm test passes **9/9** scripts, with output captured.
- **Verification commands:** `npx tsc --noEmit`; `npm test`. **Status:** Passed only with captured output.

**R6.3 — Build.**
- **Given** implementation complete, **When** `npm run build` runs, **Then** it exits 0 with no new advisory beyond the pre-existing bundle-size note.
- **Verification command:** `npm run build`. **Status:** Passed only with captured output.

**R6.4 — Parity E2E, honest counts.**
- **Given** ports 8010/3002 are held by the UI agent and must not be killed (HC-5), **When** parity E2E runs, **Then** the exact pass/fail/skip counts are captured (reference: 10/0/0); any environment-blocked test is reported **Unverified/Blocked** with the raw error, never claimed green. No fabricated pass.
- **Verification command:** `npm run test:e2e -- <parity spec>` (path finalized in plan). **Status:** Passed only with captured output; Unverified/Blocked if ports/harness unavailable.

**R6.5 — Rehearsal and regression.**
- **Given** the demo golden path, **When** `npm run rehearse:judge` runs, **Then** it completes with honest artifact output; regression checks confirm no boundary weakening (R1.4) and no UI-agent work disturbed (ports alive).
- **Verification commands:** `npm run rehearse:judge`; diff review. **Status:** Passed only with captured output.

**R6.6 — Rendered-UI evidence acceptance.**
- **Given** UI was changed or UI claims are made, **When** rendered-UI evidence is captured, **Then** screenshots/DOM assertions for the relevant states exist and are honest (sim labelled as sim, no hardcoded score presented as real); if no UI was changed, this AC is **Not applicable** for that item and stated as such.
- **Verification command/check:** captured screenshots/DOM log + `npm run rehearse:judge`. **Status:** Passed with evidence; Not applicable for backend/docs-only items.

**R6.7 — Evidence register; no fabricated passes.**
- **Given** all R6 results, **When** the final evidence register is compiled, **Then** each check is recorded with command + output + status per §2.5, and no "Passed" appears without captured evidence.
- **Verification command/check:** register review against §2.5. **Status:** Passed only if complete and truthful; Failed otherwise.

### R7 — Scoped commit + push (gated)

**Source trace:** owner mission "commit/push scoped work to origin/integration/legalx-v1"; §5.5; HC-2/HC-7/HC-8; §8.

**R7.1 — Delivery authorized only after the owner gate.**
- **Given** the six §8 material decisions, **When** delivery is considered, **Then** no commit/push occurs until the owner authorizes the target and any billing; absent authorization, R7 is **Blocked** and push-readiness is reported only.
- **Verification command/check:** owner authorization record; `git status --short`. **Status:** Passed on authorized push / **Blocked** otherwise.

**R7.2 — Scoped commit excludes disallowed files.**
- **Given** the scoped change, **When** commits are created, **Then** they contain only R1–R5 work artifacts; **no DB files, secrets, `.env`, credentials, generated artifacts, or migrations**; the uncommitted §5.1 fixes and UI-agent work are handled per owner direction (preserved unless explicitly included). The 8 media files are **excluded unless §8c/§8e consent is given** given unresolved provenance.
- **Verification command/check:** `git status --short`; `git diff --cached --stat`; `git show --stat <commit>` allowlist review. **Status:** Passed on clean scoped review; Failed if any disallowed file is staged.

**R7.3 — Push to the correct branch, no destructive ops.**
- **Given** `origin = https://github.com/the-nidhi-bhat/LEXORA-LegalX.git`, **When** delivery occurs, **Then** scoped commits are pushed to `origin/integration/legalx-v1` with fetch-first, **no force-push, no `reset --hard`, no `git clean`, no branch switch, no merge to `main`**.
- **Verification command/check:** `git remote -v`; `git fetch`; push record. **Status:** Passed on verified push; Blocked if unauthorized.

**R7.4 — Remote SHA and GitHub URL verified.**
- **Given** a completed push, **When** delivery is verified, **Then** `git ls-remote origin refs/heads/integration/legalx-v1` equals local `git rev-parse HEAD`, **and** the exact GitHub URL `https://github.com/the-nidhi-bhat/LEXORA-LegalX/tree/integration/legalx-v1` is reported.
- **Verification commands:** `git ls-remote origin refs/heads/integration/legalx-v1`; `git rev-parse HEAD`. **Status:** Passed only on exact match; otherwise **Unverified** with reason.

---

## 7. Assumptions (labelled; not silently converted to requirements)

| ID | Assumption | Basis / impact if wrong |
|---|---|---|
| AS-1 | Branch `integration/legalx-v1 @ b1b5eba` equals remote, no divergence. | Owner-provided git state; not verified by this BA. If wrong, R7 baselines must be re-established before push. |
| AS-2 | The three R1 defects and their file:line locations are as reported by the engineering discovery. | Discovery report + read-only grep confirmation. Re-verify exact lines before edit; R1 scope is by bug, not by rigid line number. |
| AS-3 | The uncommitted fixes in §5.1 are correct and must be preserved. | Engineering discovery "Verified DONE but UNCOMMITTED". If any is wrong, R1.4 review must flag it rather than silently keep/discard. |
| AS-4 | Vercel "Services" topology is feasible (SPA + Python Function + external Postgres on a shared domain). | Vercel feasibility discovery. Schema validity/auto-detect/env inlining/static assets could NOT be verified read-only (§5.3) → **Unverified** until authorized validation. |
| AS-5 | `DATABASE_URL` will be owner-provisioned; no credentials will be shared in chat. | Owner hard constraint HC-7; §8b. If unavailable, deployment/migration execution is **Blocked**. |
| AS-6 | Reference baselines (442/3/1; tsc 0; npm test 9/9; build 0; parity E2E 10/0/0) remain valid. | `docs/STATE.md` discovery-recorded. Deviations must be explained, not hidden (R6). |
| AS-7 | Ports 8010/3002 remain held by the UI agent throughout. | Owner hard constraint; `docs/STATE.md:218`. If unavailable, E2E is Unverified/Blocked, not claimed green. |
| AS-8 | The phase-report filenames are deliverable labels only, not a product Phase 7 spec. | Owner "Honor repo truth"; `docs/STATE.md:229-256`. No blockchain requirement follows. |
| AS-9 | This BA cannot and must not run git/test/deploy commands. | HC-9; subagent directive. All commands here are for the implementer. |

---

## 8. Open questions — MATERIAL DECISIONS for the single owner gate (unresolved; not requirements until answered)

The owner requested **no ordinary-coding questions**. Only the following are escalated, with conservative defaults that apply **if the owner gives no direction**. All other detail is at implementer discretion within scope.

| ID | Material decision (owner gate) | Conservative default if no direction |
|---|---|---|
| **Q1 — §8a** | Vercel deploy target: **preview-only** vs **also production**? Owner approval for production release target is required. | **Preview-only.** No production deployment. Scaffolding complete; live deploy **Blocked** if neither authorized. |
| **Q2 — §8b** | Managed Postgres provider + billing + owner-provisioned `DATABASE_URL`/credentials (never in chat). | **Do not provision or spend.** Deployment + `upgrade head` against a real DB remain **Blocked**; no billing incurred. |
| **Q3 — §8c** | MIT license consent **and** media/fonts rights (film MP4s, noir webp, OFL fonts carve-out, untracked assets). | **No license assertion.** R5 stays **Blocked**; proposed LICENSE not committed; rights note documents blockers. |
| **Q4 — §8d** | Accept the documented **per-instance in-memory rate-limiter limitation** (from discovery) vs require a stronger distributed control. | **Accept and document the limitation.** Do not redesign the limiter (out of scope, §2.2); record it as a known limitation rather than invent a new control. |
| **Q5 — §8e** | Commit the **8 media files** (4,476,884 B ≈ 4.27 MiB) needed for a Git-based deploy, despite unresolved provenance. | **Do not commit media files** without consent. If deploy requires them and consent is withheld, Git-based deploy is **Blocked** and reported, not worked around. |
| **Q6 — §8f** | Seed demo accounts in **production** (owner@legalx.demo et al.). | **Do not seed production.** No production DB mutation (HC-1); demo seeding remains **Blocked** unless explicitly authorized. |

> R7 (commit/push) is additionally gated on the authorization outcome above. Q1/Q2 are the "production release target" and "account/billing/credentials" escalations; Q3 is "license consent"; Q4–Q6 are the remaining genuinely material decisions tied to security posture, media rights, and production data.

---

## 9. Scope-expansion flags (would require NEW owner approval — OUT of scope)

| Item | Why it would expand scope | Disposition |
|---|---|---|
| Live Vercel deployment / production release target | §8a/§8b; `docs/STATE.md:117` bans deploy | Out of scope until gate |
| Paid resources / billing / credentials in chat | HC-3/HC-7; §8b | Out of scope until gate |
| Asserting MIT or committing LICENSE/media | HC-8; §8c/§8e | Out of scope — Blocked |
| Identity binding / AI-extraction HTTP surface | Engineering discovery OUT of scope | Out of scope |
| Reworking the in-memory limiter / reconciling "25 vs 30" routes / dead-code cosmetics | Engineering discovery OUT of scope | Out of scope |
| Blockchain / MetaMask / wallet / real escrow / numbered Phase 7 spec | Repo truth; `docs/STATE.md:232-233`; HC-4 | Out of scope |
| UI redesign / killing ports 8010/3002 / discarding UI-agent work | HC-5 | Out of scope |
| Weakening strict schema, org isolation, RBAC, CSRF, approval/execution gates, 2-field payload | HC-6; R1.4 | Out of scope |
| Production DB mutation / local DB reset / delete | HC-1 | Out of scope |
| Fabricated passes, sign-offs, or remote verifications | HC-6 | Out of scope |
| Feature development beyond the three defects | `TODO.md:78` | Out of scope |

---

## 10. Requirement → verification traceability matrix

| Requirement | Source | AC(s) | Verification command / artifact | Status basis |
|---|---|---|---|---|
| R1 Engineering defects | Owner mission; §5.1 | R1.1 | `pytest` targeted parity rate-limit test; review `parity.py:34-53` | Passed only with output |
| R1 | same | R1.2 | `pytest` targeted execution rate-limit test; grep `record_failure` in `execution.py` | Passed only with output |
| R1 | same | R1.3 | source review + regression test; `pytest` | Passed on review + output |
| R1 | same | R1.4 | `git diff` scoped review; SHA256 of legal-gate files; full `pytest` | Passed on scoped diff + green suite |
| R2 Vercel scaffolding | Owner mission; §5.3; HC-1/3/7 | R2.1 | `vercel.json` parse/review; `git status --short` | Passed on review; live schema items Unverified |
| R2 | same | R2.2 | `git diff -- migrations/env.py`; grep `create_all` | Passed on scoped diff; run against real DB Blocked (§8b) |
| R2 | same | R2.3 | README review + secret-value grep | Passed on review |
| R2 | same | R2.4 | workstream log / no-deploy confirmation | Passed if no cloud mutation |
| R3 Documentation | Owner mission; §5.2 | R3.1 | README checklist + path validation | Passed if all items present |
| R3 | same | R3.2 | PRD review; FR/NFR → test mapping | Passed on complete mapping |
| R3 | same | R3.3 | cross-check 15 real routes vs router registration | Passed on exact match |
| R3 | same | R3.4 | SECURITY/CONTRIBUTING review | Passed on review |
| R3 | same | R3.5 | link/Mermaid/image validation log; grep stale CSS path | Passed with record |
| R4 Reports | Owner mission; §5.2 | R4.1 | `glob docs/final-delivery/*.md` (exact 7) | Passed on exact set |
| R4 | same | R4.2 | report review (one verdict each) | Passed on review |
| R4 | same | R4.3 | report review vs §2.5/§5; HC-6 | Passed only if truthful |
| R4 | same | R4.4 | deployment/hackathon status review | Passed on truthful status |
| R5 Licensing | Owner mission; §5.2; HC-8 | R5.1 | proposed LICENSE review (placeholders; not asserted) | **Blocked** pending §8c |
| R5 | same | R5.2 | licensing-review note review | Passed on complete blockers; decision Blocked |
| R6 Verification | Owner mission; §5.4; HC-6 | R6.1 | `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` | Passed only with output |
| R6 | same | R6.2 | `npx tsc --noEmit`; `npm test` | Passed only with output |
| R6 | same | R6.3 | `npm run build` | Passed only with output |
| R6 | same | R6.4 | `npm run test:e2e -- <parity spec>` | Passed with output; else Unverified/Blocked |
| R6 | same | R6.5 | `npm run rehearse:judge`; diff review | Passed with output |
| R6 | same | R6.6 | rendered-UI screenshots/DOM log | Passed with evidence; else Not applicable |
| R6 | same | R6.7 | evidence register review | Passed only if truthful |
| R7 Delivery | Owner mission; §5.5; HC-2/7/8 | R7.1 | owner authorization record | Passed if authorized; else **Blocked** |
| R7 | same | R7.2 | `git status --short`; `git diff --cached --stat`; `git show --stat` | Passed on scoped review |
| R7 | same | R7.3 | `git remote -v`; `git fetch`; push record | Passed on verified push |
| R7 | same | R7.4 | `git ls-remote origin refs/heads/integration/legalx-v1`; `git rev-parse HEAD`; URL | Passed on exact match, else Unverified |
| Cross-cutting appearance | Owner mission; §2.6 | A-1…A-4 | build; rendered-UI evidence; rehearse:judge; diff review | Passed with results; N/A for backend/docs |

---

## 11. Approval request (single owner gate)

This **DRAFT** FRS is complete for the owner-specified OMEGA final-delivery workstream and is ready for owner review. Approval is requested to proceed to an implementation plan and then to implementation under R1–R7, with the routine-safe items in §2.4 executed autonomously.

Owner input is requested on the **six material decisions Q1–Q6 (§8a–f)** *only*. Absent direction, the conservative defaults in §8 apply: **preview-only; no provisioning or credentials in chat; no license assertion; document the rate-limiter limitation; no media commit; no production seeding.**

Explicitly reaffirmed from the owner brief and hard constraints:
- **No live deploy, cloud resource, or paid/billed action without the gate** (R2/R7, §8a/§8b, HC-3).
- **No MIT assertion; no media commit; no production DB mutation or seeding** (R5, §8c/§8e/§8f, HC-1/HC-8).
- **No blockchain / MetaMask / real escrow / invented Phase 7 spec** (§2.2, §9, HC-4).
- **No UI redesign; all concurrent UI-agent work preserved; ports 8010/3002 untouched** (HC-5).
- **No weakening of the strict schema, org isolation, RBAC, CSRF, approval/execution gates, or the 2-field payload** (R1.4).
- **No secrets in chat or reports; env var names only** (HC-7).
- **No fabricated pass, sign-off, deployment claim, or remote verification**; every status follows §2.5 with captured evidence (HC-6).
- **Scoped delivery only** to `origin/integration/legalx-v1`, fetch-first, no force-push and no main merge (R7).

**BA statement:** this session wrote **only** `docs/OMEGA_FRS.md`. No source file was created or modified, and **no git, test, build, or cloud command was run** by this BA (HC-9). All commands above are verification instructions for the implementer, with outcomes to be recorded only when actually executed.
