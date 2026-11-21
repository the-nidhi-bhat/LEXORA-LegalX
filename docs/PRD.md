# Product Requirements Document — LEGALX

**Status:** Descriptive PRD of the **actually implemented** feature set, plus the scoped OMEGA final-delivery work. It is not a roadmap promise and not a spec for a new product phase. Requirements are derived from `docs/OMEGA_FRS.md` (APPROVED), `docs/PHASE7_CLOSEOUT_REPORT.md`, `docs/STATE.md`, `docs/PRODUCT_ROADMAP.md`, `docs/DECISIONS.md`, and the shipped source.

**Evidence convention:** verification commands are listed for each requirement. Test counts reflect authoritative **M5 verification** (captured output, exit 0 each) where an M5 figure is given; items without an M5 re-run remain honestly labelled as Phase 7 closeout evidence. `VERIFIED` = implemented with recorded evidence; `SIMULATED` = labelled deterministic fixture; `DEFERRED` = not implemented.

## Scope boundary

- **No numbered product "Phase 7" spec exists.** Phase-report filenames are owner-specified delivery labels only.
- **No blockchain/MetaMask/wallet/real escrow** is in scope. Blockchain is "Later" in the roadmap and out of scope in the decision records. Smart-contract UI records are simulated; no transaction is submitted.
- **No live deployment** is performed; Vercel work is scaffolding only. Live DB deploy is blocked pending an owner-provided `DATABASE_URL`.
- **No license is asserted.** Licensing material is proposal-only and Blocked.

## Personas

| Persona | Need |
|---|---|
| Guest / judge | Explore the ₹30k/₹35k story without an account or wallet at `/demo` |
| Agreement Owner | Create agreements, versions, milestones, approve, execute |
| Freelancer / Contractor | See assigned work and permitted payment milestones |
| Legal Reviewer | Review clauses, comments, legal approval |
| Organization Admin | Manage members, roles, integrations, logs |
| Technical Auditor | Read-only IR, parity, hashes, evidence |

The five in-app roles are a **local demo switcher** in the UI; production identity binding is deferred.

---

## Functional requirements

| ID | Requirement | Status | Verification / test mapping |
|---|---|---|---|
| **FR-001** | Public marketing site and guest demo route `/demo` without account or wallet | VERIFIED | `npm run build`; `npm run rehearse:judge` (`scripts/final-demo-checklist.mjs`); `docs/DEMO_GUIDE.md` |
| **FR-002** | Canonical problem story: ₹30,000 agreed / 3 × ₹10,000 milestones / ₹35,000 encoded / ₹5,000 mismatch | VERIFIED | Fixture at `src/components/ContractStory.tsx:5–9`; `npm run rehearse:demo` (3/3 personas); `scripts/test-demo.mjs` |
| **FR-003** | Session sign-in/out with server-side `lx_session` row and CSRF token issuance | VERIFIED | `api/tests/test_auth.py`, `api/tests/test_session_revocation.py`; `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` |
| **FR-004** | CSRF enforcement on every non-GET `/api/v1` request, including session deletion | VERIFIED | `api/tests/test_csrf.py`; full pytest |
| **FR-005** | Role-aware workspaces and protected-route policy for five roles | VERIFIED (UI) | `api/tests/test_rbac_matrix.py`; `node --experimental-strip-types scripts/test-rbac.mjs`; `docs/RBAC.md` |
| **FR-006** | Organization isolation: cross-workspace or unknown IDs return 404; in-tenant denial returns 403 | VERIFIED | `api/tests/test_agreements_authz.py`; full pytest |
| **FR-007** | Agreement create/list/get/patch, with idempotent create and version-approval freeze on edit | VERIFIED | `api/tests/test_agreements_validation.py`, `api/tests/test_agreements_authz.py`; `docs/API.md` |
| **FR-008** | Version creation, canonical SHA-256, per-party approval of the exact hash, HASH_MISMATCH / ALREADY_APPROVED / CONFLICT | VERIFIED | `api/tests/test_versions.py`; full pytest |
| **FR-009** | Deterministic Contract IR derivation and integrity hashing with provenance | VERIFIED (backend) | `api/tests/test_ir_derive.py`, `api/tests/test_ir_schema.py`; `node --experimental-strip-types scripts/test-drift-version-audit.mjs` |
| **FR-010** | Activity event timeline scoped to the workspace, cursor-paginated | VERIFIED | `api/tests/test_activity.py`; full pytest |
| **FR-011** | Deterministic seeded extraction and source-grounded clauses (no Gemini provider) | SIMULATED | `api/tests/test_intelligence_extractor.py`, `test_intelligence_parsing.py`, `test_intelligence_gemini_safety.py`; full pytest |
| **FR-012** | Contract IR structured and JSON views in the UI | VERIFIED (UI) | `scripts/test-workflows.mjs`; `npm run rehearse:judge`; `docs/AI_PIPELINE.md` |
| **FR-013** | Parity verification HTTP endpoint with the exact 2-field payload `{dispute_behavior, governing_law}` and `extra="forbid"` | VERIFIED | `api/tests/test_parity_api.py`, `api/tests/test_parity_service.py`; `e2e/parity.spec.ts` via `npm run test:e2e -- e2e/parity.spec.ts --config playwright.parity.config.ts` |
| **FR-014** | Evidence-only Trust Passport, re-derived on every call, no private document text, stale detection | VERIFIED | `api/tests/test_parity_service.py`, `api/tests/test_parity_version_binding.py`; parity E2E |
| **FR-015** | Parity engine comparison rules, canonicalization, and property checks | VERIFIED | `api/tests/test_parity_engine.py`, `test_parity_rules.py`, `test_parity_canonicalization.py`, `test_parity_properties.py`; full pytest |
| **FR-016** | Version/hash binding: new version or rules bump invalidates prior verification | VERIFIED | `api/tests/test_parity_version_binding.py`; full pytest |
| **FR-017** | Execution gate: approvals on current version, approved party, draft state, 403 on failure | VERIFIED | `api/tests/test_execution.py`; parity E2E confirms gate still 403 |
| **FR-018** | Idempotency-Key replay for execution and agreement creation | VERIFIED | `api/tests/test_execution.py`; `node --experimental-strip-types scripts/test-api-client.mjs` |
| **FR-019** | Execution rate-limit 429 + `Retry-After` path reachable by recording attempts | VERIFIED (M1) | `api/tests/test_execution_ratelimit.py` (M1 concurrent work); source review of `api/app/routers/execution.py`; M5 pytest 447/3/1, exit 0 |
| **FR-020** | `POST .../verify` rate limited per authenticated principal + agreement | VERIFIED (M1) | `api/tests/test_parity_ratelimit.py` (M1 concurrent work); source review of `api/app/routers/parity.py`; M5 pytest 447/3/1, exit 0 |
| **FR-021** | Truthful concurrency error message after conditional UPDATE, describing persisted state | VERIFIED (M1) | `api/tests/test_execution.py`; source review of the concurrency branch; M5 pytest 447/3/1, exit 0 |
| **FR-022** | Three.js hero sculpture in the public story | VERIFIED | `src/components/Sculpture.tsx` imports `three`; `npm run build` emits a separate Sculpture chunk |
| **FR-023** | Light-default theme with dark toggle, responsive layouts, reduced-motion fallback | VERIFIED | `index.html:9–22`, `src/main.tsx:8–9`; rendered-UI baseline in `docs/PHASE7_CLOSEOUT_REPORT.md` §9; `npm run rehearse:judge` |
| **FR-024** | Simulated smart-contract workspace, milestones, transactions, and activity | SIMULATED | `node --experimental-strip-types scripts/test-solidity-generation.mjs` (generation only, no chain call); `scripts/test-workflows.mjs`; `docs/BLOCKCHAIN.md` |
| **FR-025** | Tamper demo: review window 5 → 2 days lowers score to 74 and blocks; restore returns 100 | SIMULATED | `node scripts/test-demo.mjs`; demo path byte-identical to the fixture; live path never hardcodes a score |
| **FR-026** | Judge rehearsals for demo and judge checklists with honest artifacts | VERIFIED | `npm run rehearse:judge` (M5 PASS, 30/30 pages, 5/5 roles, 53.747 s); `npm run rehearse:demo` (3/3, Phase 7 closeout); `docs/rehearsals/latest.json` |
| **FR-027** | Real HTTP surface limited to 15 routes across 7 routers; no invented endpoints | VERIFIED | Router decorator census in `api/app/main.py` + `api/app/routers/*.py`; `docs/API.md`; `docs/PHASE6_DELIVERY_REPORT.md` §4 |
| **FR-028** | Deployment scaffolding only, no live deploy, env var names only | DEFERRED / BLOCKED | `docs/final-delivery/PHASE_11_DEPLOYMENT.md`; review of config/scaffolding; no deploy command executed |
| **FR-029** | Licensing proposal with no active license assertion | BLOCKED | `docs/proposed-LICENSE.md` (placeholders); `docs/LICENSING_REVIEW.md` (status Blocked); owner consent required |
| **FR-030** | Product film and poster served from real repository paths with captions | VERIFIED (asset presence) | `public/film/legalx.mp4`, `poster.jpg`, `legalx.vtt`, `legalx.en.vtt` confirmed by filesystem glob; rights **UNVERIFIED** per `docs/MEDIA_PROVENANCE.md` |

---

## Non-functional requirements

| ID | Requirement | Status | Verification / test mapping |
|---|---|---|---|
| **NFR-001** | Strict request schema `extra="forbid"` on the parity payload; no widened 2-field contract | VERIFIED | `api/tests/test_parity_api.py`; `api/app/schemas/parity.py`; source review |
| **NFR-002** | No secrets in bundles, repositories, chats, or reports; env var names only | VERIFIED (policy) | Doc review; grep for assigned values; `docs/SECURITY.md`; `CONTRIBUTING.md` |
| **NFR-003** | One error envelope with stable codes and `X-Request-Id` on every response | VERIFIED | `api/tests/test_health.py`, `api/tests/test_parity_api.py`; `api/app/main.py`, `errors.py` |
| **NFR-004** | CORS only with explicitly configured concrete origins; no wildcard | VERIFIED | Source review of `api/app/main.py:128–136`; `api/app/config.py` |
| **NFR-005** | Rate limiting documented honestly as **per-instance in-memory**, not distributed | VERIFIED (documented limitation) | `api/tests/test_parity_ratelimit.py`, `api/tests/test_execution_ratelimit.py`; `docs/SECURITY.md`; FRS §8d owner acceptance |
| **NFR-006** | Session cookie HttpOnly / SameSite=Lax / Secure in production; sliding + absolute expiry | VERIFIED | `api/tests/test_auth.py`, `api/tests/test_session_revocation.py`; `api/app/routers/auth.py` |
| **NFR-007** | Clean typecheck and build with no new advisory | VERIFIED | `npx tsc --noEmit -p tsconfig.json` exit 0; `npm run build` exit 0 (Vite v8.3.6, 40 modules, 1.47 s), pre-existing >500 kB advisory only — M5 |
| **NFR-008** | Responsive rendering at 320/768/1024/1440, light/dark, reduced motion | VERIFIED (heuristic) | Rendered-UI evidence gate in `docs/PHASE7_CLOSEOUT_REPORT.md` §9; no axe/Lighthouse/WCAG claim |
| **NFR-009** | No fabricated pass, screenshot, sign-off, or remote verification | VERIFIED (policy) | Evidence register review in `docs/final-delivery/FINAL_MASTER_REPORT.md`; every status follows FRS §2.5 |
| **NFR-010** | Honest real-vs-simulation labelling across UI and docs | VERIFIED | `docs/PHASE7_CLOSEOUT_REPORT.md` §10; `npm run rehearse:judge`; README feature matrix |
| **NFR-011** | Full backend suite green before release | VERIFIED | `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` — M5 447 passed / 3 skipped / 1 warning in 91.04 s, exit 0 |
| **NFR-012** | Frontend test suite and parity E2E green before release | VERIFIED | M5 `npm test` 9/9, exit 0; `npx playwright test --config playwright.parity.config.ts --workers=1` 10/0/0 in 1.7m, exit 0 |
| **NFR-013** | No weakening of legal-gate files or protected boundaries | VERIFIED | M5 git/gate: HEAD `b1b5eba`, `git diff --check` 0; legal-gate files byte-identical (engine.py `85E4D3EE…ACC2`, comparison_rules.py `C0FDBF4A…DE434`, schemas/parity.py `DCFE9E1E…98B525`); execution.py `06737F3C…24207C` authorized changes with gate logic intact |
| **NFR-014** | No production DB mutation, seeding, or local DB deletion | VERIFIED (policy) | Owner hard constraint HC-1; `docs/STATE.md`; `docs/final-delivery/PHASE_11_DEPLOYMENT.md` |

---

## Explicitly deferred (not requirements of this workstream)

- Live Vercel deployment, cloud resource provisioning, DNS, billing, and credentials.
- Supabase Auth/Database/Storage integration, server-side Gemini validation, private document upload, comments, reviewer assignment, Trust Passport export.
- Wallet lifecycle, Sepolia/Solidity deployment, on-chain indexing, real escrow.
- Production identity binding and a distributed rate limiter.
- Asserting any project license or committing media with unresolved provenance.
- Reconciling the historical "25 vs 30" route-count discrepancy (out of scope per FRS §2.2).

Related reading: [FRS](OMEGA_FRS.md), [closeout report](PHASE7_CLOSEOUT_REPORT.md), [API reference](API.md), [security](SECURITY.md), [final delivery master report](final-delivery/FINAL_MASTER_REPORT.md).
