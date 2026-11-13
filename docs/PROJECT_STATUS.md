# PROJECT_STATUS.md — LEGALX

> **Living document.** Update it at the end of every working session. It answers one question: *what is actually
> true right now, with what evidence, and what happens next.*
>
> **Last updated:** 2026-11-13 (**Phase 0 foundation setup** — still no implementation)
> **Updated by:** orchestrator, on behalf of Nidhi
> **Companion documents:** `EXECUTION_PLAN.md` (plan of record) · `API_CONTRACTS.md` (boundary) ·
> `TEAM_COORDINATION.md` (process) · `DAILY_PROGRESS_TEMPLATE.md` (reporting unit) · `docs/audit/**` (evidence base, frozen)
> **Phase 0 setup documents:** `SETUP_READINESS.md` (what was actually verified) · `DEVELOPMENT_GUIDE.md` (how to run it) ·
> `ENVIRONMENT_REFERENCE.md` (versions, ports, env vars, dependency ranges) · `INTEGRATION_GUIDE.md` (how the halves meet) ·
> `TEAM_TASK_CARDS.md` (per-person handoffs)

---

## 1. Current phase

**PHASE: PHASE 0 COMPLETE (environment and foundation readiness) — implementation is still not authorised.**

| Phase | State |
|---|---|
| Audit / discovery | ✅ **Complete** — 15 reports in `docs/audit/`, produced against the running app |
| Architecture decision | ✅ **Complete** — `ARCHITECTURE_DECISION.md` (keep SPA, add FastAPI + Postgres + real authz) |
| Execution planning | 🟡 **Complete, awaiting the lead's signature** on N-01…N-07 and the dependency list |
| **Phase 0 — foundation setup** | ✅ **Complete (2026-11-13)** — six workstreams (repo/git, frontend, backend, database/DevOps, security, QA) run in parallel; 5 new setup documents; 1 preflight script; 5 corrections raised against the plan. **Zero application source changes** |
| Implementation (P0-01…P0-12) | ⛔ **Not started.** Zero dependencies installed. Nothing migrated, deployed, committed or pushed |
| Verification / freeze | ⛔ Not started |

**No application file has been modified by the planning or setup work.** `git diff --stat` is empty; the working
tree contains only untracked documents under `docs/` plus one new untracked script, `scripts/check-env.mjs`. The
application source is byte-identical to commit `db5a2ad5f029e55bb7bb59bab918dded382a326a`.

---

## 2. Overall readiness (honest)

| Readiness dimension | State | Evidence / why |
|---|---|---|
| **Judged visual demo** | ~70 % | The UI is genuinely polished and navigable; the audit's UI pass recorded it working. What is missing is that two of its claims are not computed (hash, parity score) |
| **Functional product** | ~15 % | No backend, no database, no auth, no network calls, no real hashing, no real comparison |
| **Security** | ~10 % | Client-only RBAC (`RBAC.ts`), no sessions, role in `localStorage`; H1/H2 of `SECURITY_AUDIT.md` open |
| **Test confidence** | ~10 % | 4 suites pass; all four assert on text/self-referential fixtures (`TEST_REPORT.md` §2–3) |
| **Deployability** | ~20 % | Static build exists; no API, no database, no environment documentation for a deployed run |
| **Submission materials** | ~40 % | Extensive docs exist, several describing capabilities that are not implemented |
| **Production-ready** | **0 %** | It is not production-ready, and no document in this set claims otherwise |

**The single sentence that matters:** LEGALX today is a convincing *demonstration* of a product that does not
yet do the thing it demonstrates. Every P0 task exists to close that gap, and the demo's climax — detect
₹50,000 → ₹5,000 and block execution — is impossible today because neither the 74/100 nor the hash is computed.

---

## 3. Task status

Status vocabulary — use exactly these, never a synonym:

- `Not started` · `In progress` · `Blocked` · `Unverified` (implemented, evidence not reproduced by a second
  person) · `Done` (implemented **and** AC-evidenced **and** independently reproduced) · `Descoped` (approved by
  the lead, with the reason recorded).

| ID | Task | Owner | Depends on | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| P0-02 | Least-privilege RBAC fix | **Iffa** | — | **Not started** | none | First task; card in `EXECUTION_PLAN.md` §3. Reviewer: Sam |
| P0-01 | Repo restructure `web/` + `api/` | **Sam** | P0-02 (policy correct before the move) | Not started | none | OneDrive sync hazard — see `TEAM_COORDINATION.md` §9.4 |
| P0-03 | Server sessions + server-side authorization | **Sam** | P0-01 | Not started | none | Blocked in practice until Postgres is confirmed |
| P0-04 | Agreements, parties, milestones | **Sam** | P0-03 | Not started | none | |
| P0-05 | Versions, SHA-256, per-party approval | **Sam** | P0-04 | Not started | none | Densest task; most likely slip |
| P0-06 | Contract IR schema + deterministic deriver | **Nidhi** | P0-05 | Not started | none | |
| P0-07 | Deterministic parity engine | **Nidhi** | P0-05, D-05 fields | Not started | none | |
| P0-08 | Verification runs + execution gate | **Sam** | P0-05, P0-07 | Not started | none | |
| P0-09 | Review & revision flow (bounded) | **Arati** | P0-05 | Not started | none | First cut if capacity fails |
| P0-10 | Frontend wiring to the real API | **Iffa** | P0-03…P0-08 | Not started | none | |
| P0-11 | E2E demo gate (Playwright) | **Arati** | P0-10 | Not started | none | Playwright not installed — needs approval |
| P0-12 | Demo-blocker fixes | **Iffa** | P0-01 | Not started | none | 3 of 6 fixes pulled into Sprint 1 |

**Totals:** 12 tasks · 0 done · 0 in progress · 0 blocked · 12 not started · estimated 143 h + ~15 h review = **158 h**.

**No task may be marked `Done` on the strength of a message.** The evidence column is filled only with a
reproducible artifact (commit, PR, screenshot path, pasted command output), and a second person's reproduction
note.

---

## 4. Blockers (open, and who clears them)

| # | Blocker | Blocks | Owner of the unblock | Needed by |
|---|---|---|---|---|
| B1 | **Postgres availability unverified** — `psql` not on PATH, Docker daemon state unknown | P0-03, and everything after it | **Nidhi** (Supabase project or local Docker) | D1 end |
| B2 | **Arati's availability unconfirmed** (5–10 h/wk estimate only) | P0-09/P0-11 ownership; the capacity arithmetic | **Nidhi** | D1 |
| B3 | **N-01…N-05 unanswered** (see §6) | P0-02 (N-01/N-02), P0-05 (N-03/N-04), P0-07 (N-05) | **Nidhi** | D1 |
| B4 | **Playwright not installed** in this repo | P0-11, and all browser evidence after P0-02 | **Nidhi** (dependency approval) | D1, before P0-02's browser step |
| B5 | **Productive dependency set unapproved** (`argon2-cffi`, `pytest`, `httpx`, DB driver/ORM) | P0-01, P0-03 | **Nidhi** | D2 |
| B6 | **Hosting choice + account owner undecided** | Sprint 2 deploy | **Nidhi** | D3 |
| B7 | **OneDrive sync on the working copy** | P0-01's 59-file move | Sam (worktree or pause sync) | D1–D2 |
| B8 | **No linter/formatter configured** in the repo | code consistency across four authors | Sam (decision: adopt none this sprint) | — |

None of these is a reason to start coding around them. Each is a decision, and decisions are cheap on day one.

---

## 5. Data the plan assumes (not yet created)

Recorded so nobody mistakes this for existing schema. Owner of every table: **Sam**.

`organizations` · `users` · `sessions` · `memberships` · `agreements` · `agreement_parties` ·
`milestones` · `agreement_versions` (+ `sha256`, `hash_algorithm`, `canonical_length`) ·
`version_approvals` · `ir_documents` · `execution_parameters` · `parity_runs` · `verification_runs` ·
`activity_events`

Invariants that must hold in the schema, not in application code alone:

1. A version with any approval cannot be `UPDATE`d or `DELETE`d (DB trigger).
2. `version_approvals` is unique on `(version_id, party_role)` — approvals are per party (D-06).
3. Execution authorisation is a query over `verification_runs` joined to the agreement's **current** version,
   never a stored boolean.
4. Money columns are integers. There is no float column anywhere.

---

## 6. Decisions

### 6.1 Approved (project lead, 2026-11-13)

| ID | Decision | Consequence recorded in |
|---|---|---|
| **D-01** | Least-privilege, resource-scoped permissions. Owner does **not** get broad `audit:view`; Contract IR gated by `ir:read`, Parity by `verification:read`, Activity by `activity:read`, system-wide audit logs by `audit:read_global` | `EXECUTION_PLAN.md` §3.1–3.3 (matrix + the 3 changed routes) |
| **D-02** | FastAPI-managed server sessions: HttpOnly/SameSite cookies, CSRF, expiry + revocation, reputable hashing, server-side authz, no custom crypto | `EXECUTION_PLAN.md` §5, `API_CONTRACTS.md` §1.2–1.3 |
| **D-05** | `execution_parameters` is a separate version-bound artefact; agreement and exec params hashed and verified independently; mismatch blocks execution | `EXECUTION_PLAN.md` §7, §9; `API_CONTRACTS.md` §7 |
| **D-06** | Owner initiates approval; lawyer reviews/recommends. Where multiple parties must approve, **each approval is recorded separately**; execution requires all required approvals for the exact current version | `EXECUTION_PLAN.md` §7, §10; `API_CONTRACTS.md` §5.2 |
| **D-10** | Deterministic-first IR; Gemini behind a feature flag with explicit consent; AI never approves or authorises | `EXECUTION_PLAN.md` §8 |
| **D-11** | Blockchain simulated for this milestone | `EXECUTION_PLAN.md` §15 |
| **Q1** | Availability **estimates**: Nidhi 10–14 h/wk · Sam 10–15 · Iffa 15–20 · Arati 5–10 | `EXECUTION_PLAN.md` §13; flagged as estimates throughout |
| **Q2** | Optimise for a judged demo + deployable product + submission materials. **Deadline 2026-12-01** | `EXECUTION_PLAN.md` §13.2–13.5 |

### 6.2 Awaiting Nidhi's approval (blocking)

| ID | Question | Default if she says "proceed as planned" |
|---|---|---|
| **N-01** | Make `ROUTE_PERMISSIONS` data-driven with any-of semantics, deleting the three hard-coded branches at `src/rbac.ts:71-73` | adopted |
| **N-02** | Retire `audit:view`, replace with `ir:read` / `verification:read` / `activity:read` / `audit:read_global` | adopted |
| **N-03** | Per-agreement approval policy: `all_parties` (default) or `client_only` | `all_parties` for the demo agreement |
| **N-04** | Text becomes immutable when the **first** party approves, not when all do | adopted (strongly recommended) |
| **N-05** | Demo tamper endpoint gated by `DEMO_TAMPER_ENDPOINT`, off by default in production | adopted |
| **A3** | Postgres: Supabase project or local Docker? | no default — this must be answered |
| **B4/B5** | Approve the dependency set (Playwright, `argon2-cffi`, `pytest`/`httpx`, DB driver/ORM) | no default — required to build |

### 6.3 Decisions this plan expects later (do not pre-empt)

| ID | Question | When it is needed |
|---|---|---|
| L-01 | Does the demo run on a seeded agreement or a UI-created one? | D1 — decides whether the agreement builder UI is in Sprint 1 |
| L-02 | Hosting target and who owns the account | D3 |
| L-03 | Gemini key + written consent for third-party document text | P1-04 only, **not** a P0 blocker |
| L-04 | If capacity fails, which of P0-09/P0-10/P0-11 is cut first | D5, using reported hours |

---

## 7. Planning session log (append only)

> This log records **planning and phase** events. The team's day-by-day log is `docs/PROGRESS.md`, the path
> already named in `docs/audit/FINAL_TEAM_ASSIGNMENT.md` (roadmap/progress log). That file will be created when
> the first member files a report — it is deliberately not created now, so this planning set stays at the five
> documents the brief asked for. Likewise `docs/DECISIONS.md` (named in the same audit file) becomes the
> append-only decision log once implementation starts; §6 here is the decision record until then.

| Date | What happened | Files touched | Verified? |
|---|---|---|---|
| 2026-11-13 | Audit set completed (15 reports, live-browser evidence) | `docs/audit/**` (new, untracked) | yes — pages loaded, routes walked, `git diff --stat` empty |
| 2026-11-13 | Planning set authored: execution plan v1 → v2 after lead decisions, coordination, contracts, status | `docs/EXECUTION_PLAN.md`, `docs/TEAM_COORDINATION.md`, `docs/DAILY_PROGRESS_TEMPLATE.md`, `docs/API_CONTRACTS.md`, `docs/PROJECT_STATUS.md` | planning only — no source touched |

---

## 8. Next action

**The single next thing that happens is Nidhi's, not the team's:**

1. Read `EXECUTION_PLAN.md` §3 (P0-02 card) and §13 (schedule) and §13.4 (what does not fit).
2. Answer **N-01…N-05**, **A3** (Postgres) and the dependency list → they are the only things blocking P0-02.
3. Confirm the four availability numbers, especially Arati's.
4. Hand Iffa the P0-02 card and the branch name `fix/p0-02-owner-parity-access`.

**Then, and only then:** Iffa starts P0-02. Nothing else starts in parallel on day one.

**Explicitly not authorised yet:** any source edit, any dependency install, any migration, any branch creation,
any commit, any push, any deployment. The plan is a proposal until the lead approves it.
