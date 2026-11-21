---
document_status: "DRAFT — AWAITING OWNER APPROVAL"
prepared_by: "Business Analyst (requirements-only closeout subagent)"
date: "2026-11-21"
scope_type: "Closeout of the already-committed parity frontend integration + browser proof of a real backend result + demo readiness + security/regression + GitHub delivery. REQUIREMENTS ONLY — no source edits, no git/test commands by this BA."
owner_specified_filename: "docs/PHASE7_CLOSEOUT_FRS.md"
workstream_functional_name: "Phase 6 frontend closure + demo-readiness closeout"
baseline: "integration/legalx-v1; backend parity surface already committed at 22dbf21 (owner-provided current-state fact — NOT independently verified by this BA; no git commands were run). All concurrent UI-agent work in the working tree is IN scope for preservation, including the dev servers on ports 8010 (pid 23840) and 3002 (pid 36736) — do not kill."
---

# LEGALX–ASTRA — "Phase 6 Frontend Closure + Demo-Readiness Closeout" — Functional Requirements Specification (FRS)

> **Naming note (authoritative — do not re-litigate):** The owner originally asked for "Phase 7 = smart contracts/blockchain". Authoritative repository documentation contradicts that framing, and the owner then chose **"Honor repo truth"**. Consequently this FRS **does not define any numbered "Phase 7" product spec and creates no smart-contract / on-chain / blockchain implementation requirement**. The work is named **by function** only — *"Phase 6 frontend closure + demo-readiness closeout"*. The filename `PHASE7_CLOSEOUT_FRS.md` (and the companion closeout report `PHASE7_CLOSEOUT_REPORT.md`) are **owner-specified deliverable names only** and assert no product phase. See §2.4 for the recorded scope conflict / deviation.

---

## 1. Objective

Produce a truthful, testable closeout specification for the LEGALX post-Phase-6 workstream. Specifically:

1. **Close the Phase 6 frontend integration** into the verified remote branch without disturbing concurrent UI-agent work (R1).
2. **Prove in a browser** that a real backend-derived parity result renders — closing the one remaining Phase 6 gap (R2).
3. **Confirm demo readiness** using the canonical ₹30,000 / 3×₹10,000 / ₹35,000 example, with honest simulation labels and no state repair (R3).
4. **Verify security and regression boundaries** are unchanged, with full-suite evidence and no fabricated results (R4).
5. **Deliver honestly to GitHub** with a closeout report, scoped commits, a verified remote SHA, and the correct remote target (R5).

This effort is **closeout of work already built**: the parity backend surface is committed at `22dbf21` and the frontend parity code already exists in `src/api/client.ts` and `src/App.tsx`. It adds no product features, no redesign, no on-chain work, and no new phase spec.

**Authority / trace for the objective:** owner workstream brief (2026-11-21, via orchestrating session) — R1–R5 below; locked owner scope decision "Honor repo truth" (§2.4); discovery evidence in §5.

---

## 2. Scope

### 2.1 In scope

- **R1 — Scoped closure of the Phase 6 frontend parity integration** into `integration/legalx-v1`, preserving every concurrent UI-agent edit. Recommended organization: extract parity code into a dedicated feature directory (`src/features/parity/`: api, hooks, components, types, verification view, findings, trust-passport display) **reusing existing modules**; the extraction shape is an implementation note, not a new feature (§6 R1).
- **R2 — An isolated, valid backend agreement scenario** that produces a real Contract IR, drives a live `POST .../verify`, and renders the backend result in the browser; backend→local IR bridge; stable semantic test selectors; trust-passport display (P1 if time).
- **R3 — Demo-readiness rehearsal** from a clean browser session using the canonical example preserved in `src/components/ContractStory.tsx:5-9`, with honest labels and preserved design/interaction invariants.
- **R4 — Security and full-regression verification**, with byte-identity checks on legal-gate files and honest gate status.
- **R5 — Closeout documentation and GitHub delivery**: `docs/PHASE7_CLOSEOUT_REPORT.md`, scoped meaningful commits, fetch-then-push to the correct origin branch, and verified remote SHA/URL.

### 2.2 Out of scope (explicitly forbidden or deferred)

- **Any smart-contract / Solidity / blockchain / on-chain implementation or claim**: no `.sol` files, ABI, Hardhat/Foundry, compiler pipeline, ethers/wagmi, wallet lifecycle, RPC wiring, on-chain indexing, transaction tables, or "Sepolia integration" work. `src/solidity.ts` remains an untouched string-template generator (§5.6).
- **Inventing a "Phase 7" spec** or any new product/phase requirement; no renumbering of roadmap items.
- **UI redesign**, new screens, aesthetic changes, or reverting/overwriting the external UI agent's work. `src/App.tsx` is a moving target (SHA changing, e.g. `B456C7E1…`) — never replace it with an old snapshot (§6 R1.2).
- **Weakening any boundary**: strict backend schema (`extra='forbid'`), org isolation, RBAC, CSRF, approval rules, or the execution gate.
- **Branch switch, force-push, `reset --hard`, `git clean`, blanket deletion, merge to `main`, DB deletion, or migration changes.**
- **Secrets, `.env`, credentials, DB files, or generated artifacts** in any commit or in any report text.
- **Fabricated test results, sign-offs, or remote verifications**; no "Passed" by inference.
- **Feature development** beyond closeout (TODO.md:78 stops feature development; only defects/security/reliability/release-blocking fixes remain).

### 2.3 Hard constraints (authoritative, not re-litigated)

| ID | Constraint | Source |
|---|---|---|
| HC-1 | No branch switch; no force-push / reset --hard / git clean / blanket deletion; no commit or push to `main`. | Owner hard constraints (brief) |
| HC-2 | Preserve **all** concurrent contributor / UI-agent work. Ports 8010 (pid 23840) and 3002 (pid 36736) belong to the UI agent — do not kill. | Owner hard constraints; `docs/STATE.md:218` |
| HC-3 | `src/App.tsx` is a moving target; re-hash before editing, minimal localized edits, preserve unrelated edits, never overwrite with an old snapshot. If a genuine concurrent conflict prevents the scoped change, preserve both versions and report **Blocked** (R1.6). | Owner brief (R1); discovery §5.3 |
| HC-4 | Keep the verified **2-field** live request body `{dispute_behavior, governing_law}`; other commercial terms stay backend-derived; do **not** weaken the strict backend schema (`extra='forbid'`). | Owner brief (R1); `src/App.tsx:686-689`; `docs/PHASE6_DELIVERY_REPORT.md:30` |
| HC-5 | No DB deletion or migration change. No secrets / `.env` / credentials printed or committed. | Owner hard constraints |
| HC-6 | No fabricated results or sign-offs; every status must follow the §4 vocabulary with captured evidence. | Owner hard constraints; §4 |
| HC-7 | This BA writes **only** `docs/PHASE7_CLOSEOUT_FRS.md`; no source edits and no git/test commands. | Subagent task directive |

### 2.4 Scope conflict / owner decision (documented deviation and limitation)

This section is the **explicit record of the deviation** required by the brief; it is a limitation of this FRS, not a pending requirement.

| Item | Record |
|---|---|
| Owner's initial framing | "Phase 7 = smart contracts/blockchain". |
| Authoritative repo truth | `docs/PRODUCT_ROADMAP.md:10` places Sepolia contract integration, wallet lifecycle and on-chain event indexing in **"Later"**, not "Next", and uses **no phase numbers**. `docs/DECISIONS.md:253` records the ownership matrix entry *"Blockchain execution, blockchain contracts \| Out of scope \| Not implemented"*. `docs/audit/BLOCKCHAIN_AUDIT.md:117-126` recommends *"freeze the blockchain surface at simulation for this milestone"* (C11 at `:110`: nobody on the team has demonstrated Solidity; C12 at `:111`: an INR escrow on a public chain is not a legal payment rail in India). `docs/STATE.md:227` requires **fresh owner authorization** for on-chain/Solidity work. |
| Owner decision (locked) | **"Honor repo truth."** |
| Resulting deviation | The requested "Phase 7" is **not specification**. No smart-contract/on-chain/blockchain requirement appears anywhere in this FRS (R1–R5 contain none). The closeout is named by function (§ title + §1) and the filename is retained only as an owner-specified label. |
| Resulting limitation | Any future blockchain work would be a **new scope** requiring fresh owner authorization (`docs/STATE.md:227`) and an independent FRS; it is **Not applicable** to this closeout. Any claim that this closeout delivered chain integration would be false and is forbidden (HC-6). |

### 2.5 Appearance criteria (separate from functionality — UI is involved in R1/R2/R3)

These are **not** functional criteria; they must be checked **in addition to** the functional ACs. Functional requirements R4 and R5 have appearance criteria **Not applicable**.

- **A-1 — Build integrity.** **Given** the scoped closeout changes are applied, **When** `npm run build` is run, **Then** it exits 0 with no new advisory beyond the pre-existing bundle-size note. **Verification command:** `npm run build`.
- **A-2 — Design system preserved (Astra Noir).** **Given** the final diff, **When** appearance is reviewed, **Then** the Astra Noir design direction, existing theme tokens, and existing styling are preserved; no new styling system, no hardcoded colors introduced by the parity work, no UI redesign. **Verification check:** review `git diff` for styling changes; confirm changes are confined to parity scope.
- **A-3 — All 30 manifest routes intact.** **Given** the app is running, **When** a route smoke pass runs, **Then** all **30** routes declared in `public/manus-routes.json` resolve and no route is added or removed by this closeout. **Verification check:** navigate every manifest route and record results; cross-check `npm test`.
- **A-4 — Theme toggle and reduced-motion.** **Given** the app toggled light→dark and with reduced-motion enabled, **When** the parity verification view and canonical demo are viewed, **Then** content (score, status, blocking reasons, comparison rows, labels) remains legible and functional with no overflow or unstyled elements. **Verification check:** manual light/dark + reduced-motion smoke in the browser; record observations.
- **A-5 — No heavy 3D in legal workflows.** **Given** a legal workflow route (agreement, parity, execution, team), **When** it renders, **Then** no heavy 3D scene is introduced into that workflow. **Verification check:** diff review + browser smoke.
- **A-6 — Honest simulation labels preserved.** **Given** any simulated/demo content shown in the browser, **When** it is displayed, **Then** it is labelled as simulation/demo and is never presented as a real backend result. **Verification check:** browser smoke + `npm run rehearse:judge`.

> Cross-reference: A-1/A-2/A-3/A-5 relate to R1 and R3; A-4/A-6 relate to R2 and R3. A-1 also supports R4. Each is independently testable as written.

---

## 3. Authority and traceability of requirements

Every requirement below traces to an explicitly identified source; none is an invented extra feature.

| Requirement | Trace (owner request / approved decision) |
|---|---|
| R1 | Owner brief R1 (close Phase 6 frontend into verified remote branch preserving concurrent UI work); HC-3/HC-4; §2.4 owner decision. |
| R2 | Owner brief R2 (prove real backend-derived parity result renders in browser; the remaining Phase 6 gap). |
| R3 | Owner brief R3 (demo readiness with canonical example from `src/components/ContractStory.tsx:5-9`). |
| R4 | Owner brief R4 (security & regression, no weakened boundaries; full suite). |
| R5 | Owner brief R5 (honest documentation & GitHub delivery to the correct origin branch). |

---

## 4. Status vocabulary (used in every AC and in verification reporting)

| Status | Meaning |
|---|---|
| **Passed** | Verification was executed and succeeded; exact command output/artifact was captured. |
| **Failed** | Verification was executed and did not meet the criterion; output was captured. |
| **Blocked** | Cannot be performed due to an explicit owner constraint (e.g., HC-1 no main merge; HC-3 concurrent conflict; HC-7 no git/test commands by this BA). |
| **Unverified** | No executable evidence or harness was run in this session; not claimed as passed. |
| **Not applicable** | Out of scope for the requirement (e.g., appearance criteria for R4/R5; all blockchain requirements under the §2.4 decision). |

> **Evidence honesty (HC-6):** This BA ran **no** git or test commands. All "Passed" outcomes below are **conditional** on the implementer running the named command and attaching real output. Discovery baselines (§5) are cited as **reference only** and must not be claimed as this session's results. Any check not executed is **Unverified** (or **Blocked** where an owner constraint forbids it), never **Passed** by inference. Where the brief labels an item P1-if-time and time is unavailable, its status is **Unverified** with the reason recorded — not silently dropped and not fabricated.

---

## 5. Discovery basis (read-only inspection; verified against the repository)

This BA used only file reads, greps and glob inspection. No git or test commands were executed (HC-7).

### 5.1 Scope conflict evidence (authoritative)
- `docs/PRODUCT_ROADMAP.md:10` — "## Later": Gemini provider with server-side validation, **Sepolia contract integration, wallet lifecycle, on-chain event indexing**, organizations, templates, notification delivery, usage analytics, billing readiness, support operations. **No phase numbers anywhere in the file.**
- `docs/PRODUCT_ROADMAP.md:7` — "## Next" (the **real** remaining roadmap to record in R5.1): Supabase Auth/Database/Storage, canonical Contract IR module, real parity engine package, private document upload, version history, comments, reviewer assignment, Trust Passport export, resettable seeded demo state, and Playwright coverage.
- `docs/DECISIONS.md:253` — ownership matrix: "Blockchain execution, blockchain contracts | Out of scope | Not implemented".
- `docs/audit/BLOCKCHAIN_AUDIT.md:117-126` — the demo can be delivered without chain work; **"Recommendation: freeze the blockchain surface at simulation for this milestone"**; `:110` C11 nobody on the team has demonstrated Solidity; `:111` C12 INR escrow on a public chain is not a legal payment rail in India.
- `TODO.md:78` — "Feature development stops after this addition; only defects, security, reliability, or release-blocking fixes remain in scope."
- `docs/STATE.md:227` — on-chain/Solidity work requires **fresh owner authorization**.
- Smart-contract infrastructure audit: **zero** `.sol`, ABI, Hardhat/Foundry, compiler, ethers/wagmi, wallet, RPC, or transaction-table artifacts were found (`glob **/*.sol` returned no files); `src/solidity.ts` is a TypeScript string-template generator with string-level tests only (e.g., `src/solidity.ts:1-30`), not a compiler pipeline.

### 5.2 Current frontend parity code (the integration to close)
- `src/api/client.ts:157-162` — `parityApi.verify` (`:158-159`, posts `{ execution_parameters: executionParameters }` to `/agreements/{id}/versions/{version}/verify`) and `parityApi.trustPassport` (`:160-161`, GET `/trust-passport` with `version` query).
- `src/App.tsx:11` — parity import from `./api/client.ts`; `:658-660` — `backendResult`/`verifying`/`verifyError` state; `:678-701` — `runBackendVerification`, with the **2-field** live payload at `:686-689` (`dispute_behavior` plus conditional `governing_law`) and `parityApi.verify` call at `:692`; `:709-751` — backend-derived display logic.
- Owner-provided diff characteristics (not re-measured by this BA): `src/api/client.ts` +83/−7 with only ~6 parity lines (rest is the Phase-5 client rewrite); `src/App.tsx` +334/−616 with parity sub-hunks entangled in UI-redesign hunks, so `git add -p` cannot isolate parity cleanly.
- `src/App.tsx` is a **moving target** under an external UI agent (SHA changing, e.g. `B456C7E1…`) — HC-3 applies.

### 5.3 Raw-text-assert scripts (must be preserved or updated in the same change)
- `scripts/final-demo-checklist.mjs:39-42` asserts the literals `"onNavigate('/app/parity')"`, `'Run verification'`, `'Open team review'`, `'Open verification'`; `:71` lists those steps in the completed-workflow contract.
- `scripts/test-workflows.mjs:23-27` asserts `'Run verification'`, `'verification-next'`, `'Open team review'`, `'Open verification'`.
- `scripts/test-resilience.mjs:3,7-25` reads `src/App.tsx` and `src/features/contract-ir/ContractIR.tsx` and asserts Judge Mode / resilience contracts (e.g. `'legalx:guided-step'`, `'no success is shown'`, `'.recovery-banner'` in CSS).
- These are raw-text contracts over the same files the closeout edits; changing a literal without updating its script breaks `npm test` / `npm run rehearse:judge` (R1.5).

### 5.4 The remaining Phase 6 gap (missing backend→local IR bridge)
- `src/App.tsx:729` — "No Contract IR available for parity verification." This is **honest and correct for empty local state** and must be preserved for legitimately incomplete data.
- `src/backend-pages.tsx:71` — selecting a real backend agreement sets `localStorage['legalx:active-agreement']`, but does **not** populate local IR.
- `src/App.tsx:657` — `canRun = !!ir && validation.status === 'valid'`; with no local IR, `canRun` stays false and live verify cannot run. `parityApi.trustPassport` (`:160-161`) is never called.
- Therefore a **valid scenario** must be seeded (R2.1) rather than weakening the honest empty-state message.

### 5.5 Canonical demo example and route inventory
- `src/components/ContractStory.tsx:5-9` — canonical story: ₹30,000 agreement; three milestones of ₹10,000 each; proposed specification encodes **₹35,000**; mismatch **₹5,000**; release blocked. This is distinct from the separate **₹50,000** interactive demo story at `src/App.tsx:19-20`.
- `public/manus-routes.json` — exactly **30** routes (must all remain, A-3).
- `package.json:11-14` — `test` (9 chained scripts), `rehearse:judge` (`:13`), `test:e2e` = `playwright test` (`:14`).
- `api/app/routers/execution.py:210-229` — execution gate `attempt_execution`, `require("verification:run")`, cross-workspace 404, approval/stale checks; byte-identity required (R4.1).
- `docs/STATE.md:216-217` — reference baselines: pytest **442 passed / 3 skipped / 1 warning** (29.45s), tsc 0, build exit 0 (Vite v8.3.6, 32 modules, ~468 kB, no advisory), npm test 9/9. These are **discovery-recorded, not this BA's runs**.
- `docs/STATE.md:223-225` — legal-gate files were byte-identical at Phase 6 (`execution.py` C3007F0E…B4B2; `engine.py` 85E4D3EE…ACC2; `comparison_rules.py` C0FDBF4A…DE434); branch `integration/legalx-v1` was push-ready but not pushed; `origin/integration/legalx-v1` did not exist remotely at that time.

### 5.6 Remote target (authoritative for R5)
- `origin = https://github.com/the-nidhi-bhat/LEXORA-LegalX.git` is the **correct** remote (confirmed `docs/audit/PROJECT_DISCOVERY.md:52`); target branch `origin/integration/legalx-v1`. The legacy "LegalX-pro" push is **disabled** by owner decision. Exact GitHub branch URL to be verified in R5.5.

---

## 6. Requirements (R1–R5)

Each AC is Given/When/Then, explicitly testable, and names a concrete verification command or check. Statuses follow §4.

### R1 — Close Phase 6 frontend integration into the verified remote branch, preserving concurrent UI-agent work

**Source trace:** owner brief R1; HC-3, HC-4; §5.2–§5.3; §2.4 owner decision.
**Implementation note (not a requirement):** extract parity into `src/features/parity/` (api, hooks, components, types, verification view, findings, trust-passport display) **reusing existing modules and not duplicating working components**. Exact file layout is an implementation choice finalized in the plan; it does not expand scope.

**R1.1 — Scoped commit contains only verified Phase 6 frontend + closeout files.**
- **Given** a completed closeout change, **When** the staged diff is reviewed, **Then** it contains only the parity/frontend integration files and closeout files — no DB files, no credentials/`.env`, no generated artifacts, no migration changes, and no unrelated contributor/UI-agent work.
- **Verification command/check:** `git status --short`, `git diff --cached --stat`, and manual allowlist review; confirm no `.env`/migration/DB/generated paths. **Status:** Passed on clean scoped review; Failed if any disallowed file is staged.

**R1.2 — Concurrent App.tsx work preserved (moving-target discipline).**
- **Given** `src/App.tsx` is being edited concurrently by an external UI agent (SHA changing, e.g. `B456C7E1…`), **When** the parity change is applied, **Then** the file is re-hashed immediately before editing, edits are minimal and localized, every unrelated edit is preserved, and no old snapshot overwrites current content.
- **Verification command/check:** record `git hash-object src/App.tsx` before and after; review `git diff -- src/App.tsx` to confirm parity-only hunks plus preserved external edits; confirm ports 8010/3002 still alive (do not kill). **Status:** Passed on hash record + diff review; **Blocked** per HC-3 if no safe scoped edit is possible (see R1.6).

**R1.3 — Parity UI present in the verified branch.**
- **Given** the scoped commit is on `integration/legalx-v1`, **When** the source is inspected, **Then** the parity UI code (verify action and backend-derived display) is present via the parity API helper (`src/api/client.ts:157-162`) and the parity view, and the verified 2-field payload `{dispute_behavior, governing_law}` (`src/App.tsx:686-689`) is retained; other commercial terms remain backend-derived and the strict schema (`extra='forbid'`) is not weakened.
- **Verification command/check:** source review of the parity files + `npx tsc --noEmit`; grep for the 2-field payload. **Status:** Passed on review + exit 0; Failed if the payload is widened or the schema relaxed.

**R1.4 — Raw-text-assert contracts preserved or co-updated.**
- **Given** the three raw-text-assert scripts (`scripts/test-resilience.mjs`, `scripts/test-workflows.mjs`, `scripts/final-demo-checklist.mjs`), **When** the closeout change is complete, **Then** every asserted literal in `src/App.tsx`/`ContractIR.tsx` (including `'Run verification'`, `'verification-next'`, `'Open team review'`, `'Open verification'`, `"onNavigate('/app/parity')"`) is either preserved or its script is updated **in the same change**, and all three scripts pass.
- **Verification command/check:** `npm test` (9/9, includes the three scripts) and `npm run rehearse:judge`. **Status:** Passed only with captured output.

**R1.5 — No duplicate working components.**
- **Given** the extraction into `src/features/parity/`, **When** the diff is reviewed, **Then** existing working components/modules are reused rather than copied, and no duplicate parity logic or second source of truth is introduced.
- **Verification command/check:** diff review of the new feature directory against `src/features/contract-ir/`, `src/api/client.ts`, and existing UI components. **Status:** Passed on review.

**R1.6 — Genuine concurrent conflict → preserve both and report Blocked.**
- **Given** a real concurrent edit makes a scoped parity extraction/edit unsafe, **When** the conflict is detected, **Then** neither version is overwritten, both versions are preserved, and the workstream status for R1 is reported **Blocked** with the conflicting SHA(s) recorded — never silently forced.
- **Verification command/check:** record both SHAs and the conflict description in the closeout report (R5.1); review. **Status:** **Blocked** when triggered; otherwise Not applicable.

### R2 — Prove a real backend-derived parity result renders in the browser

**Source trace:** owner brief R2; §5.4; HC-4, HC-6.

**R2.1 — Isolated valid agreement scenario produces a real Contract IR.**
- **Given** a clean test environment, **When** an isolated valid agreement scenario is seeded via backend test setup and its agreement/version is selected, **Then** a real Contract IR exists for that version such that `canRun` (`src/App.tsx:657`) becomes true and live verification can run. No production demo data is altered or falsified.
- **Verification command/check:** backend seed/setup script in test setup + a browser E2E step asserting IR present and verify enabled; `npm run test:e2e -- <parity spec finalized in plan>`. **Status:** Passed only with captured output.

**R2.2 — Honest empty state preserved; valid scenario created instead.**
- **Given** legitimately incomplete local data (no IR), **When** the parity view renders, **Then** the message "No Contract IR available for parity verification." (`src/App.tsx:729`) still appears and is not replaced with a fabricated result; the valid scenario of R2.1 is the path used to prove live verification.
- **Verification command/check:** browser assertion for the empty-state message on a clean session, plus the valid-scenario E2E. **Status:** Passed on both assertions.

**R2.3 — Live verify posts the real 2-field body and renders the backend result.**
- **Given** the valid scenario with `legalx:active-agreement` set (`src/backend-pages.tsx:71`) and a CSRF token, **When** the user runs verification, **Then** the app calls `parityApi.verify` (`src/api/client.ts:158-159`) with the 2-field body `{dispute_behavior, governing_law}` and **displays the returned backend result**: matching/mismatching conditions, real findings/evidence, and unsupported/unverified conditions explained — **not a simulated 74/100 score**. No backend field is overridden client-side.
- **Verification command/check:** browser E2E asserting the rendered status/fields equal a known backend fixture response; network assertion on the request body. **Status:** Passed only with captured E2E output.

**R2.4 — Execution eligibility shown independently; gate still blocks.**
- **Given** a rendered backend parity result, **When** execution eligibility is displayed, **Then** it is shown **independently** of informational parity status, and the execution gate (`api/app/routers/execution.py:210-394`) still blocks unauthorized execution (no approval / forbidden role / cross-workspace / stale). Parity "match" alone never authorizes execution.
- **Verification command/check:** browser E2E attempting execution while gated + `git diff -- api/app/routers/execution.py` (expected empty) + existing execution tests in pytest. **Status:** Passed on E2E + empty diff + green tests.

**R2.5 — State correct after reload.**
- **Given** a completed live verification, **When** the page is reloaded, **Then** the displayed state (result/status, findings, eligibility, blocking reasons) is correct and consistent — no false success, no stale result presented as current, no reversion to simulated values.
- **Verification command/check:** E2E reload assertion. **Status:** Passed only with captured output.

**R2.6 — Stable semantic test selectors.**
- **Given** the parity verification view, **When** E2E selectors are authored, **Then** stable semantic selectors (e.g. `data-testid`) exist on result status, score, findings and execution eligibility — without weakening any existing assertion to make E2E pass.
- **Verification command/check:** E2E spec review + `npm run test:e2e -- <parity spec>`. **Status:** Passed only with captured output; Failed if assertions were weakened.

**R2.7 — Trust passport view shows real endpoint data (P1 if time).**
- **Given** the existing `parityApi.trustPassport` helper (`src/api/client.ts:160-161`, currently never called) and sufficient time, **When** the trust-passport view is opened, **Then** it calls the endpoint and displays real endpoint-derived data, never simulated content. **If time is unavailable**, this AC is reported **Unverified** with the reason and documented as a known limitation — never fabricated.
- **Verification command/check:** browser E2E with a stubbed/real trust-passport response; otherwise honest Unverified note. **Status:** Passed only with captured output, else **Unverified** (P1-if-time).

### R3 — Demo readiness with the canonical example

**Source trace:** owner brief R3; §5.5; §2.5 appearance criteria.

**R3.1 — Canonical example used and not conflated.**
- **Given** the canonical example in `src/components/ContractStory.tsx:5-9` (₹30,000 agreement; 3×₹10,000 milestones; ₹35,000 encoded; ₹5,000 mismatch; release blocked), **When** demo-readiness material is reviewed, **Then** that example is used as-is and is **not** conflated with the separate ₹50,000 interactive demo story (`src/App.tsx:19-20`); no other sample agreement is falsified.
- **Verification command/check:** source review + `npm run rehearse:judge`. **Status:** Passed on review + rehearsal output.

**R3.2 — Golden path from a clean browser session.**
- **Given** a clean browser session with no manual state repair, **When** the golden path (clean session → canonical example → verification → blocking → approval gating) is rehearsed, **Then** it completes successfully end to end with no manual intervention to fix state.
- **Verification command/check:** `npm run rehearse:judge` (and `npm run rehearse:demo` if used); record start/finish, steps, errors, recovery actions, final state, manual-intervention status. **Status:** Passed only with captured rehearsal artifact.

**R3.3 — Honest labels, design invariants, no console errors.**
- **Given** the golden path and appearance criteria A-1…A-6, **When** the rehearsal and smoke checks run, **Then** simulation labels are honest, Astra Noir + all 30 manifest routes + theme toggle + reduced-motion are preserved, no heavy 3D appears in legal workflows, light and dark are both verified, and there are **no browser console errors**.
- **Verification commands/checks:** `npm run rehearse:judge`, `npm run build`, light/dark + reduced-motion smoke, route smoke, browser console log capture. **Status:** Passed only with captured results; Unverified for any smoke check not executed.

### R4 — Security and regression verification (no weakened boundaries)

**Source trace:** owner brief R4; HC-1/HC-5/HC-6; §5.5.

**R4.1 — Legal-gate files byte-identical.**
- **Given** the final working tree, **When** legal-gate integrity is checked, **Then** `api/app/routers/execution.py` (`:210-394`) and the parity engine/comparison-rule files (`api/app/parity/engine.py`, `api/app/parity/comparison_rules.py`) are byte-for-byte identical to the verified baseline (recorded SHAs in `docs/STATE.md:224`).
- **Verification command/check:** recompute and compare SHA256 for each file against `docs/STATE.md:224`; `git diff -- api/app/routers/execution.py` expected empty. **Status:** Passed on matching SHAs + empty diff; Failed on any change.

**R4.2 — Org isolation / RBAC / CSRF preserved.**
- **Given** the full test suite, **When** authorization tests run, **Then** org isolation (cross-workspace 404), RBAC permissions, and CSRF enforcement still pass unchanged; no boundary is relaxed to accommodate the closeout.
- **Verification command/check:** `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` (including RBAC/CSRF/isolation tests) + `npm test` (RBAC client tests). **Status:** Passed only with captured output.

**R4.3 — No disallowed files in any commit; no forbidden git operations.**
- **Given** every commit produced by this closeout, **When** commit contents and git history are reviewed, **Then** no secrets/`.env`/credentials/DB/generated/migration files are present, and there was no force-push, `reset --hard`, `git clean`, branch switch, or merge to `main`.
- **Verification command/check:** `git show --stat <commit>` for each commit; `git status --short`; history review; confirm HC-1/HC-5 compliance. **Status:** Passed on review; Failed if any disallowed path or operation is found.

**R4.4 — Full suite executed with honest counts.**
- **Given** the implementation is complete, **When** verification runs, **Then** the exact commands and outputs are captured: pytest (**expect 442 passed / 3 skipped / 1 warning**, deviations explained), `npx tsc --noEmit` (**0**), `npm test` (**9/9**), `npm run build` (no advisory), isolated parity E2E (`npm run test:e2e -- <parity spec>`) with **honest pass/fail/skip counts**, and `npm run rehearse:judge`.
- **Verification commands:** `.venv\Scripts\python.exe -m pytest api/tests -q --no-header`; `npx tsc --noEmit`; `npm test`; `npm run build`; `npm run test:e2e -- <parity spec finalized in plan>`; `npm run rehearse:judge`. **Status:** Passed only with captured output for each; any discrepancy explained; any un-run check **Unverified**.

**R4.5 — Gate statuses honest; no fabrication.**
- **Given** all R4.1–R4.4 results, **When** the closeout report is written, **Then** every gate is marked **Passed / Failed / Blocked / Unverified / Not applicable** per §4 with the supporting artifact, and there is **no fabricated result or sign-off**.
- **Verification command/check:** documentation review against §4 and the captured artifacts. **Status:** Passed only if complete and truthful; Failed otherwise.

### R5 — Honest documentation and GitHub delivery

**Source trace:** owner brief R5; §5.1, §5.6; §2.4 owner decision; HC-1, HC-5, HC-6.

**R5.1 — Closeout delivery report produced with all required content.**
- **Given** the closeout is complete, **When** `docs/PHASE7_CLOSEOUT_REPORT.md` is written, **Then** it explicitly distinguishes **implementation vs. simulation vs. future** and records: the scope conflict (§2.4) and owner decision; existing code reused vs. new code written; every file changed; actual commands + results; local URLs; commit hashes + remote SHA + GitHub URL; known limitations (including R1.6, R2.7-if-unverified, no on-chain work, no Phase 7 spec); and the remaining real roadmap "Next" items from `docs/PRODUCT_ROADMAP.md:7`.
- **Verification command/check:** document review against this checklist. **Status:** Passed only if every listed item is present and truthful.

**R5.2 — Scoped meaningful commits.**
- **Given** the scoped change, **When** commits are created, **Then** changes are grouped into meaningful commits containing only closeout files (no unrelated contributor/UI-agent work), and a `fetch` is performed before push.
- **Verification command/check:** `git log --oneline -n <count>` + `git show --stat` per commit + `git fetch` record. **Status:** Passed on review; Failed if unrelated files are committed.

**R5.3 — Push to the correct remote branch only.**
- **Given** `origin = https://github.com/the-nidhi-bhat/LEXORA-LegalX.git` (the correct target; legacy LegalX-pro push disabled), **When** delivery occurs, **Then** scoped commits are pushed to **`origin/integration/legalx-v1`** with fetch-first, **no force-push and no merge to `main`**.
- **Verification command/check:** `git remote -v`; `git push origin integration/legalx-v1` record; confirm no force flag and no main merge. **Status:** Passed on verified push; **Blocked** if owner constraints forbid the push action.

**R5.4 — Remote SHA and exact GitHub URL verified.**
- **Given** a completed push, **When** delivery is verified, **Then** the **remote SHA** is verified (e.g., `git ls-remote origin refs/heads/integration/legalx-v1` equals local `git rev-parse HEAD`) and the **exact GitHub branch URL** is recorded, with both values written into R5.1's report.
- **Verification commands/checks:** `git ls-remote origin refs/heads/integration/legalx-v1`; `git rev-parse HEAD`; URL construction from the confirmed `origin`. **Status:** Passed only if remote SHA and local HEAD match and the URL is exact; otherwise **Unverified** with reason.

**R5.5 — Documentation truthful; no unsupported claims.**
- **Given** the final report, **When** it is reviewed, **Then** it contains no blockchain/on-chain claim, no fabricated test result, no false sign-off, and no statement that a numbered "Phase 7" spec was created.
- **Verification command/check:** documentation review against §2.4 and HC-6. **Status:** Passed on review; Failed if any unsupported claim remains.

---

## 7. Assumptions (labelled; not silently converted to requirements)

| ID | Assumption | Basis / impact if wrong |
|---|---|---|
| AS-1 | The backend parity surface committed at `22dbf21` is present and correct on the local `integration/legalx-v1` branch. | Owner-provided current state; not verified by this BA (no git commands). If wrong, R1/R2 baselines must be re-established before implementation. |
| AS-2 | `src/App.tsx` continues to be edited concurrently by the UI agent during closeout. | Owner brief R1; `docs/STATE.md:218`; changing SHA (`B456C7E1…`). If it stops, HC-3/R1.2 still apply harmlessly; if it intensifies, R1.6 may trigger. |
| AS-3 | The recommended `src/features/parity/` extraction is feasible without duplicating modules. | Owner brief "Recommend". It is an implementation note, not a locked requirement; the implementer may finalize a different scoped layout in the plan, provided R1.1/R1.3/R1.5 hold. |
| AS-4 | A valid agreement scenario can be seeded via existing backend test setup without touching production data or migrations. | Owner brief R2 ("seed via backend test setup"). If not, R2 is **Blocked** and must be reported, not worked around with falsified data. |
| AS-5 | Ports 8010/3002 are held by the UI agent and are available for the browser E2E without being killed. | Owner brief; `docs/STATE.md:218`. If unavailable, E2E is **Unverified** with the reason, not claimed. |
| AS-6 | The Pytest baseline 442/3/1, tsc 0, npm test 9/9, and build-no-advisory remain the correct reference figures. | `docs/STATE.md:216-217` (discovery-recorded). Deviations must be explained, not hidden (R4.4). |
| AS-7 | `origin` and the target branch are authoritative for R5 and no owner re-decision has changed them. | Owner brief; `docs/audit/PROJECT_DISCOVERY.md:52`. If the target changed, R5.3/R5.4 must be re-based on the new decision. |
| AS-8 | This BA cannot and must not run git/test commands; all commands here are for the implementer. | HC-7; subagent directive. |

---

## 8. Open questions with conservative defaults (unresolved — not requirements until answered)

| ID | Question | Conservative default (applies if owner gives no direction) |
|---|---|---|
| Q1 | Exact file layout for `src/features/parity/`? | Use the recommended api / hooks / components / types / verification view / findings / trust-passport split; reuse existing modules, duplicate nothing; finalize in the plan (AS-3). |
| Q2 | How to seed the valid agreement scenario? | Use existing backend test setup only; select the seeded agreement/version through the real UI path (`legalx:active-agreement`). No production data, no migration, no fabricated IR (R2.1/AS-4). |
| Q3 | Which E2E spec path should hold the parity browser proof? | Finalize in the plan; report the exact path and honest counts, and add `data-testid` selectors without weakening assertions (R2.6). |
| Q4 | Should R2.7 (trust passport) be fully implemented now? | Treat as P1-if-time; if time is insufficient, mark **Unverified** and document as a known limitation — do not fabricate a pass (R2.7). |
| Q5 | Is the push (R5.3) authorized in this workstream? | The brief authorizes scoped push to `origin/integration/legalx-v1`; still fetch first, no force, no main merge. If any owner constraint forbids pushing, mark R5.3 **Blocked** and report push readiness only (HC-1). |
| Q6 | What if the concurrent UI agent changes a literal asserted by the raw-text scripts? | Preserve both versions and update the script in the same change so all 9 `npm test` scripts and `rehearse:judge` pass; if a safe scoped edit is impossible, report **Blocked** per R1.6. |

---

## 9. Scope-expansion flags (would require NEW owner approval — OUT of scope)

| Item | Why it would expand scope | Disposition |
|---|---|---|
| Smart contracts / Solidity / Sepolia / wallet / on-chain indexing / transaction tables | Contradicted by repo truth; requires fresh authorization (`docs/STATE.md:227`) | **Out of scope** — §2.4 decision; Not applicable |
| New numbered "Phase 7" product spec | No such spec exists; owner chose "Honor repo truth" | **Out of scope** — naming note |
| UI redesign / new screens / aesthetic changes | Forbidden by brief; would overwrite UI-agent work | **Out of scope** — HC-3 |
| Widening the verify payload or relaxing `extra='forbid'` | Weakens strict backend schema | **Out of scope** — HC-4 |
| Weakening E2E/assertions to force a pass | Fabrication | **Out of scope** — HC-6, R2.6 |
| DB deletion, migration change, secrets/.env in commits | Destructive / security-sensitive | **Out of scope** — HC-5 |
| Force-push, reset --hard, git clean, main merge, branch switch | Forbidden git operations | **Out of scope** — HC-1 |
| Killing the UI agent's dev servers (8010/3002) | Destroys concurrent work | **Out of scope** — HC-2 |
| Feature development beyond defects/security/reliability/release-blockers | `TODO.md:78` stops feature work | **Out of scope** |

---

## 10. Requirement → verification traceability matrix

| Requirement | Source (owner brief / approved decision) | AC(s) | Verification command / artifact | Status basis |
|---|---|---|---|---|
| R1 Frontend closure | Brief R1; HC-3/4; §5.2–5.3 | R1.1 | `git status --short`; `git diff --cached --stat`; allowlist review | Passed on scoped review |
| R1 | same | R1.2 | `git hash-object src/App.tsx` before/after; `git diff -- src/App.tsx`; ports alive | Passed on review / **Blocked** per HC-3 |
| R1 | same | R1.3 | source review + `npx tsc --noEmit`; grep 2-field payload | Passed on exit 0 + review |
| R1 | same | R1.4 | `npm test` (9/9); `npm run rehearse:judge` | Passed only with output |
| R1 | same | R1.5 | diff review of `src/features/parity/` | Passed on review |
| R1 | same | R1.6 | SHAs + conflict record in report | **Blocked** when triggered, else N/A |
| R2 Backend result in browser | Brief R2; §5.4; HC-4/6 | R2.1 | backend seed + `npm run test:e2e -- <parity spec>` | Passed only with output |
| R2 | same | R2.2 | E2E empty-state + valid-scenario assertions | Passed on both assertions |
| R2 | same | R2.3 | E2E rendered-result + request-body assertion | Passed only with output |
| R2 | same | R2.4 | E2E gated execution + empty execution.py diff + pytest | Passed on E2E + empty diff |
| R2 | same | R2.5 | E2E reload assertion | Passed only with output |
| R2 | same | R2.6 | E2E spec review + `npm run test:e2e -- <parity spec>` | Passed only with output |
| R2 | same | R2.7 | E2E trust-passport assertion (or honest Unverified) | Passed with output, else **Unverified** (P1) |
| R3 Demo readiness | Brief R3; §5.5; §2.5 | R3.1 | source review + `npm run rehearse:judge` | Passed on review + output |
| R3 | same | R3.2 | `npm run rehearse:judge` rehearsal artifact | Passed only with output |
| R3 | same | R3.3 | `npm run rehearse:judge`; `npm run build`; light/dark + reduced-motion smoke; console log | Passed with results; Unverified if not run |
| R4 Security/regression | Brief R4; HC-1/5/6; §5.5 | R4.1 | SHA256 compare vs `docs/STATE.md:224`; empty execution.py diff | Passed on match; Failed on change |
| R4 | same | R4.2 | pytest (RBAC/CSRF/isolation); `npm test` | Passed only with output |
| R4 | same | R4.3 | `git show --stat` per commit; `git status --short` | Passed on review |
| R4 | same | R4.4 | pytest; tsc; npm test; build; parity E2E; rehearse:judge | Passed only with output |
| R4 | same | R4.5 | report review vs §4 + artifacts | Passed only if truthful |
| R5 Docs & delivery | Brief R5; §5.1, §5.6; HC-1/5/6 | R5.1 | `docs/PHASE7_CLOSEOUT_REPORT.md` review | Passed only if complete |
| R5 | same | R5.2 | `git log --oneline`; `git show --stat`; `git fetch` | Passed on review |
| R5 | same | R5.3 | `git remote -v`; push record (no force/main) | Passed on push / **Blocked** by constraint |
| R5 | same | R5.4 | `git ls-remote origin refs/heads/integration/legalx-v1`; `git rev-parse HEAD`; URL | Passed on exact match, else Unverified |
| R5 | same | R5.5 | report review vs §2.4 + HC-6 | Passed on review |
| Cross-cutting appearance | Brief R3; §2.5 | A-1…A-6 | build; light/dark + reduced-motion smoke; route smoke; rehearse:judge; diff review | Passed only with results |
| Scope conflict deviation | Owner decision "Honor repo truth"; §2.4 | — (recorded, not an AC) | documentation review of §2.4 + report | **Not applicable** as a deliverable requirement; recorded as limitation |

---

## 11. Approval request

This DRAFT FRS is complete for the owner-specified closeout workstream and is ready for owner review. Approval is requested to proceed to an implementation plan and then to implementation under R1–R5.

Owner input is welcome on **Q1–Q6 (§8)**; absent direction, the conservative defaults in §8 apply.

Explicitly reaffirmed from the locked owner decision and hard constraints:
- **No numbered "Phase 7" spec and no smart-contract / on-chain / blockchain requirement or claim** (§2.4, §9). The filenames are labels only.
- **No UI redesign; all concurrent UI-agent work preserved** (HC-2/HC-3); ports 8010/3002 untouched.
- **No weakening of the 2-field payload, strict schema, execution gate, RBAC, org isolation, or CSRF** (HC-4, R4.1–R4.2).
- **No fabricated result or sign-off**; every status follows §4 with captured evidence (HC-6).
- Delivery is fetch-first, scoped, to `origin/integration/legalx-v1`, with no force-push and no main merge (R5.2–R5.4).

**BA statement:** this session wrote **only** `docs/PHASE7_CLOSEOUT_FRS.md`. No source file was created or modified, and **no git or test command was run** by this BA (HC-7). All commands above are verification instructions for the implementer, with outcomes to be recorded only when actually executed.
