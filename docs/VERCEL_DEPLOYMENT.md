# Vercel deployment runbook

Status (2026-11-22): **Preview full-stack deployment VERIFIED LIVE.** The
`lexora-legalx` project runs Vercel Services (Vite SPA + FastAPI) on a shared
domain with an external Neon PostgreSQL database. The one-time Alembic migration
(`e25c7211a088`) and demo seed were applied by the owner; hosted E2E passed
(9 groups), cinematic media serves with correct MIME types, and browser visual
QA passed at desktop/tablet/mobile. Production release is **separate** and
requires explicit owner approval; it is not performed by this runbook.

Verified Preview URL:
`https://lexora-legalx-git-release-fi-95cd21-thenidhibhat-6721s-projects.vercel.app`

Deployment Protection is enabled — use `vercel curl <url> --yes` to bypass.
This runbook creates no accounts, enables no billing, and handles no credentials.

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
- The one-time migration was applied by the owner in the Neon SQL Editor on
  2026-11-22 (`e25c7211a088` confirmed), and the demo seed was applied afterward.
  The `DATABASE_URL` is a write-only Vercel Preview Secret; do not print it.

## Deployment constraints and known limitations

- **Preview verified; Production not released.** The Preview full-stack E2E is
  passing. No production release is authorized or performed without explicit
  owner approval.
- **Demo seed on Preview only.** The published demo accounts exist in the
  Preview/Neon database and are org-scoped (not global admins). Before any
  Production release, remove or rotate these known-password demo accounts.
- **In-memory rate limiting.** The shared limiter in `api/app/ratelimit.py` is
  single-process/per-instance by design. In a scaled or multi-instance
  deployment each instance keeps its own counters; a distributed control is
  out of scope and is recorded as a known limitation, not silently faked.
- **Cinematic media published.** The owner confirmed the film, audio/music,
  voiceover and noir artwork are all original (2026-11-22) and authorized
  publication. `public/film/`, `public/noir/` and `public/fonts/` are committed
  and served with correct MIME types (`video/mp4`, `image/webp`, `font/woff2`,
  `text/vtt`). Font notices (SIL OFL 1.1) are preserved.
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
