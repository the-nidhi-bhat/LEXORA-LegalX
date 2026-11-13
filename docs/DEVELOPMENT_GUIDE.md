# DEVELOPMENT_GUIDE.md — how to work on LEGALX

> Phase 0 artefact. Everything marked **PLANNED** does not exist yet and must not be described to anyone
> as working. Commands are PowerShell, from the repository root.
>
> Repository root: `C:\Users\theni\OneDrive\Desktop\projects main\LegalX-pro`

---

## 1. What exists today vs what the team is building

| Today (verified) | Target (planned, not built) |
|---|---|
| React 19 + Vite 8 SPA, 59 tracked files | same SPA, moved to `web/` |
| No backend, no database, no network code | FastAPI in `api/`, PostgreSQL, `/api/v1` |
| Role from `localStorage`, email-only sign-in | server sessions, server-side authorization |
| Parity score hard-coded `74/100` | deterministic field-by-field comparison |
| Literal hash strings | SHA-256 computed and stored server-side |
| 4 test scripts that cannot fail on a defect | unit + API + one browser E2E gate |

Do not "improve" the current behaviour while adding a backend. Every task is either a move (P0-01), a
policy fix (P0-02), or net-new capability. Anything else needs the lead's approval first.

---

## 2. Prerequisites (verified on this machine)

| Requirement | Verified | If missing |
|---|---|---|
| Node ≥ 20 | v24.13.0 | install Node LTS — ask before a system-wide install |
| npm | 11.6.2 | ships with Node |
| git | 2.54.0 | |
| Python 3.11 | 3.11.9 via `py -3.11` | `py -0p` to list; do **not** use 3.14 — wheel coverage is thinner |
| Docker Desktop, daemon running | 29.8.0 | start Docker Desktop |
| Free ports 3000, 8000, 5432 | all free | see §9 |

Run `node scripts/check-env.mjs` before reporting a setup problem. It is read-only, installs nothing, and
prints exactly what this machine can do. `--strict` exits non-zero if a required tool is missing.

**Never use bare `python`.** The Microsoft Store stub sits on `PATH`; `py -3.11` is explicit and stable.

---

## 3. First-time setup

### 3.1 Frontend (works today)

```powershell
npm ci
npm run dev          # http://localhost:3000
```

### 3.2 PostgreSQL — PLANNED, requires lead approval (P0-01)

```powershell
docker run -d --name legalx-pg -p 5432:5432 `
  -e POSTGRES_USER=legalx -e POSTGRES_PASSWORD=legalx_dev_only -e POSTGRES_DB=legalx `
  -v legalx_pgdata:/var/lib/postgresql/data postgres:16-alpine
docker exec legalx-pg pg_isready -U legalx
```

Port 5432 is free. **Do not use 55432** — an unrelated `fairhold-pg-test` container already binds it.
`psql` is not on this machine; use `docker exec legalx-pg psql -U legalx -d legalx -c "…"`.
`legalx_dev_only` is a local throwaway password for a container bound to localhost; it is **not** a
secret to reuse and must never be committed to an env file.

### 3.3 Backend — PLANNED (P0-01)

```powershell
py -3.11 -m venv api\.venv
api\.venv\Scripts\python -m pip install -U pip
api\.venv\Scripts\python -m pip install -r api\requirements.txt   # after the lead approves the pins
api\.venv\Scripts\python -m pip freeze                            # this output is the lockfile evidence
```

Proof of life, in order — do not skip to business features until all four pass:

```powershell
# 1. API answers
cd api; .venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload
curl.exe -i http://localhost:8000/api/health     # expect 200 {"status":"ok","db":"ok"|"unavailable"}

# 2. Database answers (only if 3.2 ran)
.venv\Scripts\python -c "import asyncio,asyncpg;print(asyncio.run(asyncpg.connect('postgresql://legalx:legalx_dev_only@127.0.0.1:5432/legalx').fetchval('select 1')))"

# 3. Migration applies to an empty database and is idempotent when re-run from scratch
# 4. One seeded user can sign in and GET /api/v1/me
```

### 3.4 Environment files

`.env` is git-ignored (`.gitignore` contains `.env*`) and must never be committed. Names, defaults and
required-in-dev/prod status are in `ENVIRONMENT_REFERENCE.md` §5. The repository's existing root
`.env.example` is **legacy** (Next.js/Supabase keys, no `DATABASE_URL`) and contradicts the approved
architecture — do not copy it, and do not edit it without approval; it is a tracked file.

---

## 4. Daily loop

Two terminals:

| Terminal | Command | Port |
|---|---|---|
| A | `npm run dev` (later `npm --prefix web run dev`) | 3000 |
| B | `api\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload` | 8000 |

The browser only ever talks to **3000**; Vite proxies `/api` to 8000. That keeps the session cookie and
CSRF token same-origin in development, exactly as they will be in production where FastAPI serves
`web/dist` from one origin. **Never** widen CORS to make a local mistake work — if a request needs CORS,
the proxy is wrong.

Vite is configured for port 3000, and the `/api` proxy does not exist yet (PLANNED, `vite.config.ts`).

---

## 5. Target repository layout (PLANNED — P0-01)

```
legalx-pro/
├─ web/                     React SPA (moved from src/, public/, index.html, vite/ts configs)
│  ├─ src/
│  │  ├─ App.tsx            shell + screens (being decomposed, not rewritten)
│  │  ├─ lib/api.ts         the only module allowed to call fetch
│  │  ├─ lib/types/api.ts   types mirrored from the API contract
│  │  ├─ lib/session.ts     in-memory session + CSRF token
│  │  ├─ features/          agreements, ir, parity, verification, auth
│  │  └─ rbac.ts            policy table (shared semantics with api/app/rbac.py)
│  └─ tests/                rbac-matrix.mjs, unit/, e2e/
├─ api/
│  ├─ app/{main,config,db,deps,errors,security,logging,middleware}.py
│  ├─ app/{models,schemas,routers,ir,parity}/
│  ├─ app/scripts/          seed_demo_users.py, seed_demo_agreement.py
│  ├─ migrations/           NNNN_snake_case.sql (forward-only)
│  └─ tests/
├─ docs/
└─ scripts/                 check-env.mjs, existing demo scripts
```

The root `package.json` becomes a zero-dependency delegator (`npm --prefix web run build`) so every
command already documented keeps working. `server/authorization.ts` moves into `api/app/rbac.py` verbatim
— it is currently dead code and excluded from `tsconfig.json`.

---

## 6. Coding standards that matter here

**Money.** Integer minor units + ISO-4217. `₹50,000` is `5000000` (paise). Never float, never `₹` in a
payload, never string-formatted money in a comparison. Pydantic rejects `bool` for int fields.

**Time.** ISO-8601 UTC with `Z` for instants; `YYYY-MM-DD` for legally-significant dates. No local time
in storage.

**IDs.** UUID v4 for new rows; `uuid5(NAMESPACE_URL, "legalx:…")` for seeded demo rows so seeding is
idempotent.

**Errors.** Exactly one envelope: `{"error":{code,message,details:[{field,code,message}],request_id}}`.
Codes are a closed list (`API_CONTRACTS.md` §1.3). Cross-tenant access is `404`, never `403`. No stack
trace, SQL text, DSN or tenant identifier ever reaches `message`.

**Hashing.** SHA-256 over the documented canonical form, server-side only, 64 lowercase hex. The client
may display a hash it received; it may never compute one.

**Authorization.** Session → membership → permission → resource state → domain gate. Enforced in FastAPI
dependencies, never in React. A UI check is UX, not security.

**React.** Do not add state libraries, routers, or component frameworks. `src/App.tsx` is 98 KB; changes
to it are serialised (see `TEAM_TASK_CARDS.md` §5) and new code goes into `features/`, not into that file.

**Honesty.** Every simulated surface keeps its label (`SIMULATED`, `DEMO`, `not live AI`). If a screen
falls back to fixture data it must say so in the UI with `data-source="fixture"`. Removing an honest
disclosure is a defect, not a polish.

---

## 7. Git workflow

1. `git status` — if there are changes you did not make, stop and tell the lead.
2. `git switch main && git pull --ff-only` (fast-forward only; never merge `main` into a feature branch).
3. `git switch -c <branch>` from `main` only. Never from `backup/pre-lexora` or `lexora-import*` — those
   have a different root commit.
4. Implement only the assigned task.
5. Run the checks in §8 and paste the output into the daily report.
6. `git diff` — review every hunk. `git status` — confirm nothing unrelated is staged.
7. Commit with `P0-XX: what changed why` (one task per commit where possible).
8. Push the feature branch, open a PR against `main` with the evidence block from
   `DAILY_PROGRESS_TEMPLATE.md`.
9. Merge only with the lead's approval and one independent review.

Never: push to `main`, force-push, rebase shared branches, delete `backup/pre-lexora`, modify `legacy` or
`upstream` remotes, commit `.env`, or commit planning documents without approval.

---

## 8. Verification commands

Run what exists; do not claim what does not.

| Check | Command | Exists today? |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | yes (exit 0) |
| Build | `npm run build` | yes |
| Legacy suites | `npm test` | yes — **passes without proving anything** (§10) |
| Environment | `node scripts/check-env.mjs` | yes (Phase 0) |
| RBAC matrix | `node web/tests/rbac-matrix.mjs` | no — P0-02 |
| API tests | `api\.venv\Scripts\python -m pytest api\tests -q` | no — P0-01/P0-03 |
| E2E | `npx playwright test` | no — P0-11 |

Regression set after any merge: typecheck, build, legacy suites, plus the new unit/API suites once they
exist. A green legacy suite is not evidence of correctness — see §10.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `python` opens the Microsoft Store | Store stub on `PATH` | always use `py -3.11` |
| `ModuleNotFoundError` in the API | installed globally instead of into `api\.venv` | activate the venv; `pip freeze` should list the pin |
| `asyncpg` fails to build | wrong interpreter (3.14) | recreate the venv with `py -3.11` |
| Blank page, 404 on `/api/...` | Vite proxy missing | add `server.proxy['/api'] → http://127.0.0.1:8000` (Iffa) |
| Sign-in returns 200 but no session | cookie not HttpOnly/SameSite, or cross-origin request | same-origin only; check `Set-Cookie` in the network tab |
| `403 CSRF_FAILED` on a legit write | token missing from memory or not sent | send `X-CSRF-Token` on **every** non-GET, including DELETE sign-out |
| `401` immediately after sign-in | cookie rejected (Secure in dev, wrong host) | `APP_ENV=dev` must not set `Secure`; use `127.0.0.1`, not `localhost`, if the cookie was set on the other |
| Docker container name clash | `legalx-pg` already exists | `docker ps -a`, then reuse or remove the stopped container |
| `port is already allocated` | something else on 5432 | `Get-NetTCPConnection -LocalPort 5432` |
| Conflict copies `file (1).tsx` | OneDrive syncing during a large `git mv` | pause OneDrive during P0-01 |
| Whole-file diffs on a file you touched | CRLF conversion | agree `.gitattributes` before moving files |

---

## 10. Why the existing tests do not count

`npm test` runs four scripts and all four pass. None of them can fail because of a defect:

- `test-demo.mjs` defines its own `compare()` and asserts against it; the application's real logic is a
  hard-coded `74/100`.
- `test-rbac.mjs` never imports `src/rbac.ts` — it asserts against a duplicated table that has already
  drifted from the real one.
- `test-resilience.mjs` checks that certain phrases appear somewhere in the source text, comments included.
- `test-workflows.mjs` counts string literals.

The owner 403s on `/app/contract-ir` and `/app/parity` while CI is green. That is the whole argument for
P0-02 landing a matrix test that imports the real module before anything else is built on top of the
policy.

---

## 11. Definition of "done" for any task

A task is done when all of the following are true, and not before:

1. The acceptance criteria in `EXECUTION_PLAN.md` are each demonstrated, not summarised.
2. The commands and their exact output are pasted into the PR.
3. Someone other than the author reproduced at least the central claim.
4. No unrelated file changed (`git diff --stat` reviewed).
5. No secret, `.env`, credential or literal key appears in the diff.
6. Any new simulation or fixture is labelled in the UI.
7. `docs/PROJECT_STATUS.md` is updated with the evidence.
