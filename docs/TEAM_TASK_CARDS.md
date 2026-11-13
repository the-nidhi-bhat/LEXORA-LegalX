# TEAM_TASK_CARDS.md — Phase 0 preparation for four parallel engineers

> Phase 0 artefact. These cards exist so each person can start a bounded task without a meeting, and so
> two people do not silently edit the same file. They assign **preparation and ownership**, not
> authorisation: P0-01 and P0-02 still need the lead's explicit approval before any implementation.
>
> Effort figures are estimates, not commitments. Availability estimates are unconfirmed except where noted.

---

## 1. Ownership matrix

One owner per path. "Shared" means two people must both agree before a change lands.

| Path | Owner | Second reader | Notes |
|---|---|---|---|
| `src/App.tsx` | Iffa | Nidhi | 98 KB, 36 declarations — **serialised**, see §6 |
| `src/styles.css` | Iffa | — | |
| `src/rbac.ts` | **Sam** (semantics) | Iffa (consumption) | P0-02 is the one exception: Iffa implements, Sam reviews |
| `src/demo-state.ts`, `src/main.tsx` | Iffa | — | |
| `src/lib/api.ts`, `src/lib/types/api.ts`, `src/lib/session.ts` | Iffa | Sam | the seam |
| `src/features/**` | Iffa | Nidhi for `features/ir`, `features/parity` | |
| `public/` | Iffa | — | |
| `api/app/**` | Sam | Nidhi for `ir/`, `parity/` | |
| `api/migrations/*.sql` | **Sam only** | Nidhi | edits to this path require approval by repo rule |
| `api/app/ir/**`, `api/app/parity/**` | **Nidhi** | Sam | Sam owns the router/DB plumbing around them |
| `api/tests/**` | Sam (author) | Arati (verifier) | |
| `web/tests/**`, `web/e2e/**` | Arati | Iffa | |
| `vite.config.ts`, `tsconfig*.json`, root `package.json` | Sam | Iffa | build topology |
| `.github/workflows/**` | Sam | Nidhi | |
| `docs/**` (planning) | Nidhi | — | never overwrite `docs/audit/**` |
| `docs/PROGRESS.md` | Arati | — | new daily log, one entry per person per day |

`server/authorization.ts` currently has no owner because it is dead code; it becomes `api/app/rbac.py`
verbatim in P0-01, and Sam owns it from then on.

---

## 2. Nidhi — Project Lead, Agreement Intelligence & Integration

**Mandate.** Own the artefact the product is judged on: the Contract IR, its derivation, and the parity
semantics. Own cross-module integration and every product decision that changes scope.

**Owns.** `api/app/ir/**`, `api/app/parity/**` (pure logic), IR fixtures, the IR/parity sections of the
contract, `docs/**`, integration decisions D-…/N-…, PR approval and merge.

**Ready to start now — preparation only (no code):**
1. Confirm or reject N-01…N-07 (`EXECUTION_PLAN.md` §1.1). They are blocking P0-02 on D1.
2. Write the IR v1 field list and the four fixtures described in `EXECUTION_PLAN.md` §8
   (clean / ambiguous / missing party / business-days basis) as JSON on paper — these become
   `api/tests/fixtures/ir/*.json` in P0-06.
3. Decide the two environment questions that gate other people: PostgreSQL = Docker `postgres:16` on 5432
   (recommended, evidence in `SETUP_READINESS.md` §6) and the dependency list in
   `ENVIRONMENT_REFERENCE.md` §4.
4. Decide hosting for the demo URL (needed by D3).

**Depends on.** Nothing to start. **Blocks.** Everyone, on N-01…N-07 and on the P0-02 approval.

**DoD for the lead's own P0 work.** IR is version-bound, schema-validated, hash-stable across runs, with
provenance spans that actually index the stored text; parity compares values field by field and returns a
reproducible `result_sha256` with no score anywhere.

**Do not.** Implement backend plumbing (Sam), edit `src/App.tsx` (Iffa), write tests as verification of
your own code (Arati).

---

## 3. Sam — Backend & Security

**Mandate.** Make identity, permission and integrity facts that live on the server. Own the schema, the
session, and the gate that refuses execution.

**Owns.** `api/**` except `ir/` and `parity/` logic; all migrations; the auth/session/CSRF implementation;
the verification/execution gate; build topology; CI.

**Ready to start now — preparation only:**
1. Read `SETUP_READINESS.md` §5–§6 and `ENVIRONMENT_REFERENCE.md` §4–§6. Confirm or challenge the
   "asyncpg, no ORM, no Alembic" recommendation — it is a lead decision, but the reasoning must survive you.
2. Prepare (do not apply) the P0-01 move plan: the exact file list, the `.gitattributes` line, and the
   order of moves so `tsc` can pass after each batch.
3. Draft `api/app/` skeleton files locally on the branch **only after approval**; nothing in Phase 0.
4. Decide the migration file for P0-03/P0-04 before writing either, so `0003_agreements.sql` does not
   arrive after code that assumes a different column.

**First task after approval.** P0-01 restructure, then P0-03. Review P0-02 (Iffa's) before that.

**Depends on.** P0-02 merged (policy correct before the move); lead's dependency approval; Docker approval.
**Blocks.** P0-03…P0-08, and therefore the entire demo.

**DoD.** Every permission decision happens server-side and is proven by a negative test; a client-supplied
`role`, `passed`, `sha256` or `status` changes nothing; `UPDATE` on an approved version fails at the DB.

**Do not.** Grant yourself schema authority beyond the migrations you list; add an ORM; install anything
globally; weaken CORS to make a local request work.

---

## 4. Iffa — Frontend & Product Experience

**Mandate.** Own the surface a judge touches, and the seam to the server. Make the 403s disappear, then
make the screens read real data without ever lying about it.

**Owns.** `src/App.tsx`, `src/styles.css`, `src/features/**`, `src/lib/**` (client side), `public/`,
frontend tests' fixtures, and the `/api` proxy in `vite.config.ts` (with Sam's review).

**Ready to start now:**
1. **P0-02** — the only implementation task that may start on approval, on
   `fix/p0-02-owner-parity-access`, exactly the change set in `EXECUTION_PLAN.md` §3:
   three routes change, all owner; Team link removed; three hard-coded branches replaced by table entries;
   `audit:view` retired. Nothing else.
2. Before touching code, add the missing `/api` proxy and record the 5 pre-change screenshots (baseline) —
   those are evidence for G1.
3. Write `src/lib/types/api.ts` against `API_CONTRACTS.md` — no network code, no behaviour change.

**Depends on.** Lead's approval of D-01/N-01/N-02/N-06/N-07 (these change the exact edits); Sam's review.
**Blocks.** P0-10, and G2's route-parity screenshots.

**DoD for P0-02.** Matrix green in both directions, snapshot diff exactly the three approved rows,
4 screenshots, PR lists every changed route, Arati reproduces the commands.

**Do not.** Add features while fixing policy; touch another role's permissions; delete the Team screen
(only the link); rewrite `App.tsx` into components as a side effect — decomposition is not in P0-02.

---

## 5. Arati — Workflow & Quality

**Mandate.** Own the acceptance criteria and the evidence that they are met. Be the person who reproduces
someone else's claim and says it is not done yet.

**Owns.** `web/tests/**`, `web/e2e/**`, `docs/PROGRESS.md`, AC checklists, bug reproduction, regression
runs. Verification authority over every gate G1–G9; authorship of none of the code under test.

**Ready to start now:**
1. Convert the primary scenario in `EXECUTION_PLAN.md` §2–§10 into a numbered AC checklist with
   given/when/then per item (`INTEGRATION_GUIDE.md` §8 gates map to it).
2. Baseline: capture the 15-route × 5-role matrix **from the running app** (screenshots of each 403), so
   P0-02's "after" has something to be compared against.
3. Write the acceptance test plan for the ₹50,000 → ₹5,000 scenario as prose cases first; the code comes
   after the API exists (P0-11).

**Depends on.** Nothing to start. **Blocks.** The freeze (P0-11 is the gate).
**Do not.** Verify your own implementation, accept a summary as evidence, or mark a criterion "passed" when
the command could not be run — that is `Blocked`/`Unverified`.

**Note.** Availability 5–10 h/week is **unconfirmed**. If it lands below 5, the contingency in
`EXECUTION_PLAN.md` §13.5 moves P0-09 to Nidhi and P0-11 to Iffa. Decide on D1.

---

## 6. Shared files and serialisation rules

| File | Rule |
|---|---|
| `src/App.tsx` | **One editor at a time.** Announce in `docs/PROGRESS.md` before starting; nobody else touches it until that entry says done. Applies to Iffa primarily. |
| `src/rbac.ts` | Sam owns semantics, Iffa owns consumption. A change to the permission union requires both. |
| `vite.config.ts`, `tsconfig.json`, `package.json`, lockfile | Sam only; Iffa requests. A lockfile change is a merge-conflict generator — batch them. |
| `docs/API_CONTRACTS.md` | Change requires both the client owner and the server owner to acknowledge in the PR. |
| `api/migrations/**` | Sam only. Never edit a migration that has been merged; add the next number. |
| `docs/audit/**` | Read-only forever. |

Conflict protocol: whoever discovers the overlap stops and posts the intended diff; the lead decides who
proceeds; the other rebases. Never resolve a shared-file conflict by keeping "their version".

---

## 7. Handoff protocol

A handoff is complete when the receiver can act without asking a question. Every handoff states:

1. **What is ready** (endpoint live / test green / doc written) with the exact command to see it.
2. **What is still fake** in that area, and where the label is.
3. **What the receiver must not change** without a new agreement.
4. **The one thing most likely to break** next.

Recorded in `docs/PROGRESS.md`, same day. A verbal handoff is not a handoff.

The five handoffs that matter: Iffa→Sam (P0-02 policy), Sam→Arati (P0-01 hash parity), Sam→Nidhi (P0-05
approval rows), Nidhi→Iffa (IR/parity response shapes), Iffa→Arati (P0-10 wired screens).

---

## 8. Skill gaps → bounded tasks

| Gap | Who | Bounded task that closes it without a course |
|---|---|---|
| Server-side auth and session/CSRF in FastAPI | Sam (strong backend, new to this exact pattern) | P0-03, but **prove one endpoint end-to-end before the matrix** — a 20-line sign-in that works beats 20 endpoints that half-work |
| Migrations and DB constraints | Sam | one migration per task; the trigger in P0-05 is the hardest single item — pair with Nidhi for 30 minutes on the SQL, not on the design |
| React state ↔ API without a data library | Iffa | `P0-10`, starting with one screen (Agreements) fully wired before touching the rest |
| Writing tests that can fail | Arati | P0-02's matrix test, because it fails on day one and proves the harness |
| Contract IR domain modelling | Nidhi | the four fixtures, before any code |
| Playwright/E2E | Arati | P0-11, one file, driven by the AC checklist already written |

Nobody is asked to learn something with a deadline attached to the learning. If a task needs a new skill,
it is split so the first half is a spike that produces evidence, not a feature.

---

## 9. What nobody may do without the lead

- Change a permission, role, or route policy beyond the three disclosed P0-02 changes.
- Add a dependency, a service, a framework, or a database.
- Change the approved architecture (`EXECUTION_PLAN.md` §15).
- Commit or push a planning document; merge any PR; push to `main`; force-push; delete a branch.
- Weaken an honest label, a simulated marker, or a security control — including disabling a permission
  prompt to make a tool work.
- Claim a gate passed without the evidence recorded in `docs/PROGRESS.md`.
