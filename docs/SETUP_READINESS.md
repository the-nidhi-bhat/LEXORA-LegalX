# SETUP_READINESS.md — Phase 0 foundation report

> **Scope:** Phase 0 only. This document records what was **inspected and verified** on 2026-11-13 so
> parallel implementation can start without rediscovering the environment. It is not an implementation
> plan (that is `EXECUTION_PLAN.md`) and it authorises nothing.
>
> **What Phase 0 did NOT do:** no P0 feature code, no P0-01 restructure, no P0-02 policy change, no
> migrations, no dependency installs, no lockfile edits, no deployment, no commits, no pushes, no
> database creation, no `.env` files with real values, no changes to any existing source file or audit
> report. Evidence for that claim is in §12.

---

## 1. Method

Six read-only workstreams ran in parallel against the working tree, plus a consolidated verification pass:

| Stream | Question | Constraint applied |
|---|---|---|
| **A — Repository & Git** | Can four people branch safely from this repo today? | read-only git only; no fetch, no checkout |
| **B — Frontend** | Where is the seam between UI and a future API? | no edits |
| **C — Backend** | Can this machine run FastAPI, and with which versions? | no installs, no venv creation |
| **D — Database & DevOps** | What PostgreSQL actually exists here? | no containers started or pulled |
| **E — Security** | Are the approved decisions internally consistent and testable? | no edits |
| **F — QA & Integration** | Can the existing tests fail on a defect? | no installs |

Consolidation found **two contradictions inside the approved plan** and **one contradiction inside
`API_CONTRACTS.md`**; all three are corrected in place (§9).

---

## 2. Verified machine facts

Every row below is a command that was actually run, not an assumption.

| Tool | Result | Note |
|---|---|---|
| node | `v24.13.0` | satisfies Vite 8 |
| npm | `11.6.2` | `package.json` declares `packageManager: npm@10.9.9` — harmless drift, do not "fix" mid-sprint |
| git | `2.54.0.windows.1` | |
| python (default) | `3.11.9` at `…\Programs\Python\Python311\python.exe` | **use this one** |
| `py` default | `3.14.3` | `py -0p` lists 3.14 (default) and 3.11 |
| docker | `29.8.0`, daemon **running** | |
| psql / pg_ctl | **not on PATH** | use `docker exec` instead |
| native PostgreSQL | **not installed** | no `C:\Program Files\PostgreSQL`; no `postgres*` service |
| gitleaks | **absent** | secret scanning gap (§8) |

**Python trap.** `where python` returns the real 3.11 interpreter *first*, with the Microsoft Store
stub third on `PATH`. Today `python` works; if `PATH` order ever changes it silently opens the Store.
Always use `py -3.11` in scripts and docs, never bare `python`.

**Global Python packages exist but are not usable.** fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.5,
SQLAlchemy 2.0.52, psycopg2 2.9.12 and pytest 9.1.1 happen to be installed globally. `pydantic-settings`,
`asyncpg`, `alembic`, `httpx`, `argon2-cffi` and `passlib` are **missing**. A global install is not
reproducible and is not pinned, so P0-01 creates `api/.venv` and installs into it. Nothing was installed
in Phase 0.

---

## 3. Ports

| Port | State | Owner |
|---|---|---|
| 3000 | **free** | Vite dev server (`vite.config.ts` configures 3000) |
| 8000 | **free** | planned FastAPI |
| 5432 | **free** | planned `legalx-pg` container |
| 55432 | **in use** | `fairhold-pg-test` (`postgres:16-alpine`, another project) — do not touch |

Port 54321–54327 host twelve unrelated `supabase_*_agrin-crop-advisor` containers belonging to a
different project. They are irrelevant to LEGALX and must not be stopped.

---

## 4. Git readiness

Verified state at `2026-11-13`, HEAD `db5a2ad5f029e55bb7bb59bab918dded382a326a`:

| Fact | Value |
|---|---|
| Branch | `main`, clean, **in sync with `origin/main`** (confirmed via `git ls-remote --heads origin`; no fetch performed) |
| Tracked files | 59 (32 docs, 6 `src/`, 6 `scripts/`) |
| Shallow clone | no |
| Tags | none |
| Untracked | exactly the 5 planning docs + `docs/audit/` (16 files) — nothing unexpected |
| `core.autocrlf` / `filemode` / `ignorecase` | `input` / `false` / `true` |
| `.gitattributes` | **absent** |
| `user.name` | `Nidhi` (email configured; value not printed) |

**Branches and remotes**

| Ref | SHA | Note |
|---|---|---|
| `main` | `db5a2ad` | 22 commits, root `ff3d959` |
| `backup/pre-lexora` | `4baf434` | **local only** — not on `origin`, not a tag; 21 commits, root `2226dbc`; tree identical to `main` but **not an ancestor of it** |
| `legacy/main` | `4baf434` | same commit as the backup |
| `lexora-import`, `lexora-import2`, `lexora-import3` | `430b672`, `35a4d50`, `7bb2840` | historic import branches |

| Remote | URL | Note |
|---|---|---|
| `origin` | `the-nidhi-bhat/LEXORA-LegalX` | the only remote that receives work |
| `legacy` | `the-nidhi-bhat/LegalX-pro` | push URL is deliberately disabled (`disabled://push-blocked-use-origin`) |
| `upstream` | `nidzzgotnochill/legal` | not ours; never push |

**Risks that need a lead decision before P0-01:**

1. **`backup/pre-lexora` exists on one machine only.** A disk failure loses it and a fresh clone cannot
   restore it. Pushing it to `origin` is the fix; that is a remote write and therefore the lead's call.
2. **Branch protection is UNVERIFIABLE.** The protection API returned `401` (no token) and the public
   rulesets API returned `[]`. Treat `main` as unprotected and rely on the process rules in
   `TEAM_COORDINATION.md`. Confirm manually in GitHub settings.
3. **OneDrive + `git mv` of 59 files.** P0-01 moves almost the whole repository. OneDrive will observe 59
   deletions plus 59 creations and can produce conflict copies mid-operation. Pause OneDrive sync for the
   duration, or perform P0-01 in a `git worktree` outside OneDrive.
4. **No `.gitattributes`.** `core.autocrlf=input` is set on this machine but not enforced for anyone else;
   a CRLF-converting teammate will produce whole-file diffs. Adding `* text=auto eol=lf` is a one-line
   change that must be made **by Sam alone, before** any file moves.
5. **`core.ignorecase=true`.** Never create two paths differing only by case.

No planned feature branch exists locally or on `origin`, so all ten branch names are free.

---

## 5. Backend readiness

**READY.** Python 3.11.9, Docker 29.8.0 and a free port 8000 are present. Only a virtualenv and a pinned
install stand between here and a running FastAPI app — both deliberately not done in Phase 0.

- Existing tree has **no** backend: no `api/`, no `pyproject.toml`, no migrations, no `DATABASE_URL`
  anywhere. `server/authorization.ts` (32 lines) is imported by nothing and is excluded by
  `tsconfig.json` (`include: ["src", "vite.config.ts", "app.config.ts"]`).
- Proposed dependency set and the reason each version is held is in `ENVIRONMENT_REFERENCE.md` §4.
  Two pins are deliberately conservative and marked UNVERIFIED there (Alembic/SQLAlchemy 2.1 pairing,
  pytest 9 / pytest-asyncio pairing).
- Architecture conflicts found and resolved in favour of the approved plan: the backend lives in **`api/`**
  (one workstream proposed `backend/`; rejected because `EXECUTION_PLAN.md` P0-01, `API_CONTRACTS.md` and
  `TEAM_COORDINATION.md` all name `api/`), and migrations are **plain numbered `.sql`** (one workstream
  proposed Alembic; rejected because there is one schema author, the plan already fixes filenames
  `0003_…`–`0007_…`, and the repo's edit-approval rule on `**/migrations/*.sql` becomes the review
  checkpoint for free).

**Proof-of-life sequence for Sam** (exact commands, nothing run yet) — `DEVELOPMENT_GUIDE.md` §3.

---

## 6. Database readiness

**READY WITH SETUP.** Nothing is running on 5432, but the hard part already exists.

| Option | Verdict |
|---|---|
| **Docker `postgres:16-alpine`** | **Recommended.** Daemon running, image already pulled, 5432 free, no admin rights, no new dependency |
| Native Windows PostgreSQL | rejected — needs an admin installer and there is no `psql` today |
| Hosted Supabase | rejected for the sprint — adds an account, network dependency and RLS learning curve before the first row exists |
| SQLite | rejected — no real JSONB, weak trigger semantics; the immutability guarantee in P0-05 depends on a DB trigger |

Deciding fact: **the Docker daemon is up and the `postgres:16-alpine` image is already present**, so
PostgreSQL costs ~2 minutes and zero installations. Note that an unrelated container
(`fairhold-pg-test`) already binds **55432** — LEGALX must use 5432 to avoid colliding with it.

Required Postgres features are all satisfied by 16: `JSONB` + `jsonb_path_ops` for IR/provenance,
`BIGINT` minor units, unique `(version_id, party_role)`, and a `BEFORE UPDATE/DELETE` trigger that makes
an approved version immutable.

---

## 7. Frontend integration readiness

**PARTIALLY READY.** The UI is coherent and honest about simulation, but it has no seam to a server.

- **Zero network code.** `fetch(`, `XMLHttpRequest`, `axios`, `import.meta.env` → 0 occurrences in `src/`.
- **15 `localStorage` keys** are the entire application state. Authority must move to the API; the keys
  then become cache only. Full inventory: `INTEGRATION_GUIDE.md` §5.
- **`src/App.tsx` is 110 physical lines / 98 737 bytes / 36 declarations**, several over 2 KB. It is the
  single largest integration risk: every edit lands in a shared file. `TEAM_TASK_CARDS.md` §4 therefore
  serialises edits to it.
- **Vite runs on 3000 and has no `/api` proxy.** `API_CONTRACTS.md` said 5173; corrected. Without the
  proxy, a same-origin cookie cannot be set in development and every request fails CORS. This is Iffa's
  first configuration change (2 lines) but it blocks Sam's first end-to-end test.
- **Fabricated results are localised** and each has a named replacement (`INTEGRATION_GUIDE.md` §4):
  parity score `tampered ? 74 : 100` (`src/App.tsx:58`), literal hashes (`:29`, `:73`, `:98`),
  4 hard-coded agreement rows (`:67`), AI fixture (`:13`, `:68`), blockchain simulation (`:73`).
- **No browser test dependency.** No Playwright/Vitest/Jest in `package.json` or the lockfile. A system
  Playwright with `chromium-1248` is present under the Python install (observed by workstream F, not
  independently re-verified), which is enough to capture evidence without a frontend dependency — but
  `@playwright/test` for the E2E gate still needs the lead's approval.
- **Accessibility gaps that will hide integration failures:** zero `aria-live`/`role="alert"` regions, so
  any API error surfaced only in a toast is silent to assistive tech; six icon-only buttons have no
  accessible name; no loading or error state exists for any data panel.

---

## 8. Security readiness

**BLOCKED (by design — the controls do not exist yet).** The specification is complete and internally
consistent after the §9 corrections; the prerequisites are not built.

Verified "before" state for the audit's H1/H2:

- Role is read from and written to `localStorage` (`src/App.tsx:44,47,48,100,105`). A user can set their
  own role.
- No password field exists — sign-in is email-only (`src/App.tsx:52`), and an unknown email produces
  neither an error nor navigation.
- `server/authorization.ts` has no importer, so the only authorization in force is client-side.

Gaps to close in P0-03/P0-08: server session + CSRF, `require(permission)` on every protected route,
DB-enforced approval immutability, and the execution gate that refuses on stored evidence rather than a
client assertion. Not present today: `gitleaks` (no secret scanning in `.github/workflows/quality.yml`),
rate limiting, and any 404-vs-403 discipline.

**One requirement was added, not changed:** `verification:run` (N-07) so that a read-only role cannot
mint parity/verification rows. See §9.

---

## 9. Corrections made to the approved documents

Found during cross-checking; each is a defect in the document, not a change of decision.

| # | Document | Defect | Correction |
|---|---|---|---|
| C1 | `EXECUTION_PLAN.md` §3.2 | `/app/ai-workspace` was gated by `ir:read`, which the auditor holds — so the auditor would have **gained** that route. That would have made the P0-02 diff four rows instead of three, breaking its own acceptance criterion | `ir:read` removed from that row; route now `agreement:create`, `agreement:approve_legal` |
| C2 | `EXECUTION_PLAN.md` §0, §0-consequence | claimed "two documented 403s" and that owner is denied only `contract-ir` and `parity`; the real grid denies the owner **six** routes (three of them links in its own sidebar) | restated as "exactly three disclosed access changes", with the executed 5×15 denial table added to §3.3 |
| C3 | `EXECUTION_PLAN.md` §3.1 | `workspace:view_activity` and `agreement:approve_parity` gate nothing (orphans), and `verification:read` gated both reads and writes | N-06 retires the orphans; N-07 adds `verification:run` |
| C4 | `API_CONTRACTS.md` §1.1 | documented the dev origin as `:5173`; Vite is configured for **3000** | corrected |
| C5 | `API_CONTRACTS.md` §2 | `POST …/parity` and `POST …/verify` required only `verification:read` | now `verification:run`; a global note states CSRF applies to **every** non-GET with no exemptions |

The three-row P0-02 diff survives these corrections — and it is now *testable*, which it was not before.

---

## 10. QA readiness

**BLOCKED.** No test in the repository can fail on a defect. Verified by reading and running them:

| Suite | Assertions | Why it cannot catch a defect |
|---|---|---|
| `test-demo.mjs` | 2 | defines its own `compare()` locally; the app's real logic is `const score = tampered ? 74 : 100` |
| `test-rbac.mjs` | 23 | **zero imports of `src/rbac.ts`**; duplicates the tables, and the duplicate has already drifted (owner set omits `agreement:suggest` and `workspace:view_activity`) |
| `test-resilience.mjs` | 12 substring needles | `app.includes('…')` passes if the phrase appears in a comment |
| `test-workflows.mjs` | 3 loops over 36 literals | asserts that strings exist, not that behaviour is correct |

Green CI coexisting with the owner's 403s is the proof. `rehearse-demo.mjs` and
`final-demo-checklist.mjs` assert `response.ok`, and a Vite SPA answers 200 for **every** path — plus they
write to a hard-coded `/home/ubuntu/legalx/...` path that does not exist on Windows.

Missing: any runner that imports product code, API tests, a browser harness, coverage, `httpx`
(so Starlette's `TestClient` cannot run).

First test to write, and the reason it is first: `web/tests/rbac-matrix.mjs` importing the **real**
`src/rbac.ts` and asserting the 5×15 grid in both directions. It fails today, which proves the suite can
go red, and it protects the most damaging 90 seconds of the demo.

---

## 11. Readiness matrix

| Area | Status | Owner | Evidence | Next action |
|---|---|---|---|---|
| Repository / Git | **Completed and verified** | Nidhi | `git status`, `ls-remote`, branch/remote inventory | Decide on pushing `backup/pre-lexora`; confirm `main` protection |
| Environment inventory | **Completed and verified** | — | `scripts/check-env.mjs` → 6 pass, 2 warn, 0 fail | — |
| Machine capability (node/python/docker) | **Completed and verified** | — | versions in §2 | — |
| Frontend code inventory | **Completed and verified** | Iffa | component/state/fixture map in `INTEGRATION_GUIDE.md` | Add `/api` proxy (P0-01/P0-10) |
| Backend capability | **Completed but unverified** | Sam | python + docker present; nothing installed | P0-01 proof-of-life |
| PostgreSQL availability | **Completed but unverified** | Sam | daemon up, image present, 5432 free | `docker run` in P0-01 after approval |
| Dependency versions | **Completed but unverified** | Sam | ranges in `ENVIRONMENT_REFERENCE.md` §4 | Approve the list, then install into `api/.venv` |
| Security specification | **Completed and verified** | Sam | `EXECUTION_PLAN.md` §3/§5/§7/§10 + §9 corrections | Build session + CSRF in P0-03 |
| Test strategy | **Completed and verified** | Arati | §10 + `INTEGRATION_GUIDE.md` §9 | Write the RBAC matrix test (P0-02) |
| P0-01 restructure | **Not started** | Sam | — | After P0-02 is approved |
| P0-02 policy fix | **Not started** | Iffa | — | Ready to start on approval |
| Playwright / E2E harness | **Blocked** | Arati | no dependency; needs approval | Approve `@playwright/test` |
| Secret scanning | **Blocked** | Sam | `gitleaks` absent | Approve install, or accept the `rg` pre-commit check |
| Deployment target | **Not started** | Nidhi | hosting choice unmade (A4) | Decide by D3 |

---

## 12. What Phase 0 changed, and what it did not

**Created:** `docs/SETUP_READINESS.md`, `docs/DEVELOPMENT_GUIDE.md`, `docs/ENVIRONMENT_REFERENCE.md`,
`docs/INTEGRATION_GUIDE.md`, `docs/TEAM_TASK_CARDS.md`, `scripts/check-env.mjs`.
**Modified:** `docs/EXECUTION_PLAN.md` (C1–C3), `docs/API_CONTRACTS.md` (C4–C5), `docs/PROJECT_STATUS.md`
(status refresh). All three are planning documents authored in this session, not pre-existing project files.

**Untouched, verified by `git status`:** every tracked file — all of `src/`, `public/`, `scripts/` (the six
existing `.mjs` files), `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`,
`.github/`, `.env.example`, all of `docs/audit/`, and `docs/FINAL_ACCEPTANCE_AUDIT.md`, `docs/RBAC.md`,
`docs/API.md`, `docs/INTEGRITY_AND_HASHING.md`, `docs/TESTING.md`.

Nothing was installed, migrated, committed or pushed.
