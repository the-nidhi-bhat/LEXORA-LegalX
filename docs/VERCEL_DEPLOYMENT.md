# Vercel deployment runbook (SCAFFOLDING ONLY — no live deploy)

Status: **local scaffolding complete; live deploy is BLOCKED.** The owner has
approved a **preview-only** target and an **owner-provided `DATABASE_URL` only**.
This workstream creates no accounts, enables no billing, handles no credentials,
and runs no `vercel deploy`. Nothing here asserts a verified deployment.

## Topology

One Vercel project with Services on a shared domain:

| Service | Root | Purpose |
| --- | --- | --- |
| `frontend` | `.` | Vite/React SPA, `npm run build`, output `dist/` |
| `backend` | `.` | FastAPI Python Function, entrypoint `api.app.main:app` |

Top-level rewrites route `/api/(.*)` to `backend` and everything else to
`frontend`. The frontend service rewrites unmatched paths to `/index.html` so
direct navigation/reload of client-side routes works (the SPA has ~30 routes).
The backend receives the original `/api/...` path.

**Schema caveat (honest limitation):** the Services schema in `vercel.json`
follows the documented `services` + `rewrites` form, but it has **not** been
validated by `vercel build` or `vercel preview` in this workstream. It **must**
be validated before use. Vercel's entrypoint is resolved relative to the
service root; if the CLI requires a service-relative form, the equivalent is
root `api/`, entrypoint `app.main:app`, and install command
`pip install -r requirements.txt`. Adjust to current Vercel docs as needed.
Do not treat this file as a verified config.

## Environment variables — NAMES ONLY

Set these in the Vercel project/dashboard. No values, secrets, or connection
strings are recorded in this document or in the repository.

Backend:

- `APP_ENV`
- `DATABASE_URL`
- `CORS_ORIGINS`
- `DEMO_TAMPER_ENDPOINT`
- `LOG_LEVEL`
- `SESSION_TTL_HOURS`
- `SESSION_ABSOLUTE_DAYS`
- `FEATURE_AI_EXTRACTION`
- `LOGIN_RATE_LIMIT_ATTEMPTS`
- `LOGIN_RATE_LIMIT_WINDOW_SECONDS`
- `GEMINI_API_KEY`
- `LEGALX_GEMINI_MODEL`

Frontend:

- `VITE_API_BASE_URL`

## Database migration (one-time, owner-provided Postgres)

- Apply the single Alembic revision (`e25c7211a088`) with `alembic upgrade head`
  **once**, against the owner-provided managed Postgres instance.
- `api/alembic/env.py` reads `DATABASE_URL` from the environment when present,
  overriding the SQLite URL in `alembic.ini`; when it is unset, the existing
  local SQLite behavior is preserved.
- **Never** run migrations per request and **never** run them against a local
  SQLite database in a deployed context. No `create_all` is added at startup.
- `APP_ENV=production` **hard-rejects** any non-PostgreSQL `DATABASE_URL`
  (`api/app/config.py:97-102`). The owner-supplied value must be a PostgreSQL
  URL before a production-targeted build can boot.
- The migration cannot be executed here: it is **Blocked** until the owner
  supplies the managed-Postgres `DATABASE_URL`.

## Deployment constraints and known limitations

- **Preview-only.** No production release is authorized or performed.
- **No demo seeding in production.** No production database mutation or
  seeding occurs; demo accounts are not created in a deployed environment.
- **In-memory rate limiting.** The shared limiter in `api/app/ratelimit.py` is
  single-process/per-instance by design. In a scaled or multi-instance
  deployment each instance keeps its own counters; a distributed control is
  out of scope and is recorded as a known limitation, not silently faked.
- **Media assets held back.** The discovery note records 8 media files
  (~4.27 MiB); the actual untracked media set under `public/film/`,
  `public/noir/` and `public/fonts/` is **13 files, 4,566,010 bytes (~4.36 MiB)**.
  These remain uncommitted pending owner consent on provenance. A Git-based
  deploy that needs them is blocked until that consent is given; do not work
  around it by committing them.
- **No fabricated verification.** `vercel build` / `vercel preview` have not
  been run here; the schema, framework auto-detection, Vite env inlining and
  static-asset resolution remain **Unverified**.

## Before any authorized deploy

1. Owner supplies the managed-Postgres `DATABASE_URL` and confirms the preview
   target (env var **names** above; no values in chat or reports).
2. Run `vercel build` (read-only validation) and resolve any schema differences.
3. Run `vercel preview` for the preview-only target and capture real output.
4. Apply the one-time `alembic upgrade head` against the managed Postgres.
5. Report the result honestly; do not claim a production release.
