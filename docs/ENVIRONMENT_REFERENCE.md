# ENVIRONMENT_REFERENCE.md — verified environment and configuration contract

> Phase 0 artefact, 2026-11-13. Everything in §1–§3 was executed on this machine. §4–§6 are the
> **proposed** configuration for the planned `api/`; none of it is installed, created or applied.
> Never put a real credential in this file, in any template here, or in a commit.

---

## 1. Runtime versions found

| Tool | Version | Path / evidence | Verdict |
|---|---|---|---|
| node | **24.13.0** | `node --version` | OK (Vite 8 needs ≥ 20) |
| npm | **11.6.2** | `npm --version` | OK; `package.json` declares `npm@10.9.9` — drift, harmless, do not chase it |
| git | **2.54.0.windows.1** | `git --version` | OK |
| python (as `python`) | **3.11.9** | `…\AppData\Local\Programs\Python\Python311\python.exe` | **use this** |
| python (as `py`) | **3.14.3** | `py --version`; `py -0p` lists 3.14 (default) and 3.11 | do **not** use for this project |
| pip | 24.0 | `pip --version` | OK |
| docker | **29.8.0**, daemon running | `docker info --format "{{.ServerVersion}}"` | OK |
| psql | **absent** | `where psql` → not found | use `docker exec` |
| pg_ctl | **absent** | `where pg_ctl` → not found | — |
| native PostgreSQL | **absent** | no `C:\Program Files\PostgreSQL`, no `postgres*` service | use the container |
| gitleaks | **absent** | not on `PATH` | approval needed (§7) |

`python` resolves to the real 3.11 interpreter today, but the **Microsoft Store stub is third on `PATH`**.
Bare `python` is a latent trap: scripts and docs use `py -3.11`.

**Global site-packages are not a project environment.** Present globally: fastapi 0.141.1, uvicorn 0.52.4,
pydantic 2.13.5, SQLAlchemy 2.0.52, psycopg2 2.9.12, pytest 9.1.1. Absent globally: `pydantic-settings`,
`asyncpg`, `alembic`, `httpx`, `argon2-cffi`, `passlib`. Nothing is pinned or reproducible, so P0-01
creates `api/.venv` and installs into it.

---

## 2. Ports and existing containers

| Port | State | What | Rule |
|---|---|---|---|
| 3000 | **free** | Vite dev server (`vite.config.ts` → 3000) | the browser's only origin in dev |
| 8000 | **free** | planned FastAPI | proxied by Vite, never called directly by the browser |
| 5432 | **free** | planned `legalx-pg` | use this one |
| 55432 | in use | `fairhold-pg-test` (`postgres:16-alpine`, another project) | **do not reuse, stop or remove** |
| 54321–54327 | in use | 12 unrelated `supabase_*_agrin-crop-advisor` containers | **not ours** |

The `postgres:16-alpine` image is already present locally, so no pull is needed for P0-01.

---

## 3. Repository facts

| Fact | Value |
|---|---|
| Root | `C:\Users\theni\OneDrive\Desktop\projects main\LegalX-pro` (**inside OneDrive**) |
| Branch / HEAD | `main` / `db5a2ad5f029e55bb7bb59bab918dded382a326a`, in sync with `origin/main` |
| Tracked files | 59 |
| `.gitignore` | `node_modules`, `dist`, `.DS_Store`, `.env*` |
| `node_modules` | present, ~77 MB, untracked |
| `dist/` | present, untracked |
| `tsconfig.json` include | `["src", "vite.config.ts", "app.config.ts"]` — **excludes `server/`** |
| Root `.env.example` | legacy Next.js/Supabase keys, **no `DATABASE_URL`**; contradicts the approved architecture; do not copy, do not edit without approval |
| Network code | `fetch(` / `XMLHttpRequest` / `import.meta.env` in `src/` → **0** |

---

## 4. Dependency plan (nothing installed)

Approval status is the lead's, not the team's. `install` below means "into `api/.venv`" — never global.

### 4.1 Runtime

| Package | Proposed range | Why | Status |
|---|---|---|---|
| `fastapi` | `>=0.162,<0.163` | ASGI framework; 0.162.6 latest verified on PyPI | propose |
| `uvicorn[standard]` | `>=0.54,<0.55` | ASGI server; 0.54.0 verified | propose |
| `pydantic` | `>=2.14,<2.15` | request/response + IR validation; v2.14.3 verified | propose |
| `pydantic-settings` | `>=2.16,<2.17` | env-driven config, no secrets in code | propose |
| `asyncpg` | `>=0.32,<0.33` | async Postgres driver; **cp311 win_amd64 wheel confirmed**, no compiler needed | propose |
| `argon2-cffi` | `>=25.1,<26` | argon2id password hashing; **cp39-abi3 win_amd64 wheel confirmed** | propose |

### 4.2 Dev only

| Package | Proposed range | Why | Status |
|---|---|---|---|
| `pytest` | `>=8.3,<9` | test runner | propose |
| `pytest-asyncio` | `>=1.5,<2` | async fixtures | propose — pytest-9 × pytest-asyncio-1.5 pairing **UNVERIFIED**, so hold pytest at 8.x |
| `httpx` | `>=0.28,<0.29` | Starlette `TestClient` requires it; absent today | propose |

### 4.3 Deliberately excluded

| Package | Decision | Reason |
|---|---|---|
| `SQLAlchemy` | **excluded (recommended)** | Migrations are plain `.sql`, so an ORM model layer would be a second, silently-drifting schema truth. Use explicit SQL through `asyncpg` in a thin repository layer. *If Sam prefers an ORM, that is a lead decision, not a local one.* |
| `alembic` | **excluded** | One schema author, forward-only, 13 days, and the plan already fixes `NNNN_name.sql` filenames. Alembic also drags SQLAlchemy in. |
| `passlib` | excluded | unmaintained; `argon2-cffi` directly |
| `python-jose` / `PyJWT` | excluded | no JWTs — server-side session rows (D-02) |
| `python-multipart` | excluded | JSON only; revisit only if file upload is approved |
| `psycopg2` | excluded | sync; already present globally by accident |

### 4.4 Frontend (needs lead approval)

| Package | Why | Status |
|---|---|---|
| `@playwright/test` | the E2E gate (P0-11); currently only a system Playwright under Python exists | **needs approval** |
| anything else | — | do not add. No state library, no router, no CSS framework, no chart library. |

**Pin discipline:** after the first successful install, commit `api/requirements.txt` with the exact
installed versions (`pip freeze`) — that is the lockfile. Never upgrade a dependency mid-sprint.

---

## 5. Environment variables (planned, `api/.env`)

`.env` is git-ignored. Values below are placeholders; the only real values live in the operator's shell.

| Variable | Purpose | dev | prod | Placeholder |
|---|---|---|---|---|
| `APP_ENV` | `dev` \| `prod`; controls `Secure` cookie and API docs | required | required | `dev` |
| `DATABASE_URL` | Postgres DSN (`postgresql://user:pass@host:5432/db`) | required | required | `postgresql://legalx:CHANGEME@127.0.0.1:5432/legalx` |
| `SESSION_COOKIE_NAME` | session cookie | optional | optional | `lx_session` |
| `SESSION_TTL_HOURS` | sliding inactivity window | optional | optional | `12` |
| `SESSION_ABSOLUTE_DAYS` | hard cap regardless of activity | optional | optional | `7` |
| `CSRF_HEADER_NAME` | CSRF header | optional | optional | `X-CSRF-Token` |
| `DEMO_TAMPER_ENDPOINT` | enables the demo tamper route (N-05) | `true` | **`false`** | `true` |
| `FEATURE_AI_EXTRACTION` | Gemini IR extraction (P1) | `false` | `false` | `false` |
| `GEMINI_API_KEY` | server-only, never logged, never bundled | not needed | only if flag on | `GEMINI_KEY_PLACEHOLDER` |
| `LOG_LEVEL` | log verbosity | optional | optional | `INFO` |
| `WEB_DIST_DIR` | static dir FastAPI serves in prod | optional | required | `../web/dist` |
| `TRUSTED_HOSTS` | Host allow-list | optional | optional | `localhost,127.0.0.1` |
| `ALLOWED_ORIGINS` | **must stay empty** | — | — | *(empty — single origin, no CORS)* |

No `SESSION_SECRET_PEPPER`: the session token is 32 random bytes from `secrets.token_urlsafe`, stored as
SHA-256. A pepper on a high-entropy token adds custom-crypto surface for no security gain.

No `NEXT_PUBLIC_*` / `VITE_*` variable may hold a secret — anything prefixed is compiled into the bundle.

---

## 6. Configuration templates

Copy these when P0-01 is approved. They are templates, not files that exist today.

`api/requirements.txt`

```
fastapi>=0.162,<0.163
uvicorn[standard]>=0.54,<0.55
pydantic>=2.14,<2.15
pydantic-settings>=2.16,<2.17
asyncpg>=0.32,<0.33
argon2-cffi>=25.1,<26
```

`api/requirements-dev.txt`

```
-r requirements.txt
pytest>=8.3,<9
pytest-asyncio>=1.5,<2
httpx>=0.28,<0.29
```

`api/.env.example` — names and placeholders only, exactly the keys in §5, all values fake.

`web/vite.config.ts` (the change Iffa makes, 5 lines)

```ts
server: {
  port: 3000,
  proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
},
```

`changeOrigin: false` keeps the `Host` header the browser sent, so cookies are issued for the origin the
browser is actually using. Do not add `credentials: true` CORS config — there is no cross-origin request.

Local database (docker, one-time)

```powershell
docker run -d --name legalx-pg -p 5432:5432 `
  -e POSTGRES_USER=legalx -e POSTGRES_PASSWORD=legalx_dev_only -e POSTGRES_DB=legalx `
  -v legalx_pgdata:/var/lib/postgresql/data postgres:16-alpine
```

---

## 7. Absent tooling and the approval queue

| Item | Needed for | Blocking | Owner |
|---|---|---|---|
| `@playwright/test` (dev dep) | E2E gate P0-11 | the freeze criterion | Arati → Nidhi |
| `gitleaks` | pre-commit / CI secret scan | security hygiene, not a demo blocker | Sam → Nidhi |
| Python venv + 6 packages | the entire backend | P0-01 | Sam → Nidhi |
| Docker container `legalx-pg` | persistence | P0-04 | Sam → Nidhi |
| Hosting account / URL | deploy + submission | freeze criterion 7 | Nidhi |

Interim secret check, if `gitleaks` is not approved — run before every push:

```powershell
git diff --cached | Select-String -Pattern 'sk-[A-Za-z0-9]{16,}|BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[^:\s]+:[^@\s]+@|api[_-]?key\s*[:=]\s*\S'
```

It is weaker than a real scanner (no entropy analysis, no history scan) and must be described as such.

---

## 8. Budget notes

- **Do not run `npm install <anything>`** without checking `package-lock.json` first — a new dependency
  rewrites large parts of the lockfile and creates a merge conflict for every teammate at once.
- **Do not upgrade** Node, npm, Vite, React or TypeScript during the sprint. The lockfile is the contract.
- `npm ci` (not `npm install`) in CI and on a fresh clone; `ci` cannot mutate the lockfile.
