# PHASE_11_DEPLOYMENT — deployment report

**Label note:** owner-specified report label, not a product phase.

## Verdict

**Overall verdict: BLOCKED (live deployment).**

Local scaffolding exists — `vercel.json` was created by concurrent M2 work and read by this workstream — but **no live deploy was executed**, no Vercel project or managed Postgres instance was created, no public URL exists, and no migration was run against a real database. The owner-approved target is **preview-only** with an **owner-provided `DATABASE_URL` only**; that value has not been provided, so live DB deploy remains BLOCKED. Licensing/media consent is also unresolved.

## Real vs simulated vs deferred

| Item | Classification | Notes |
|---|---|---|
| `vercel.json` Services scaffolding | VERIFIED BY SOURCE (local file) | Read this workstream: frontend Vite service (`buildCommand: npm run build`, `outputDirectory: dist`, SPA rewrite to `/index.html`); backend FastAPI service (`entrypoint: api.app.main:app`, `pip install -r api/requirements.txt`); rewrites `/api/(.*)` → backend, `/(.*)` → frontend |
| Alembic environment-readiness change | VERIFIED BY SCOPE ONLY | Required by FRS R2.2; this workstream did not edit migrations and did not run `upgrade head` |
| Env var **names** documented in README | VERIFIED (names only) | `APP_ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `DEMO_TAMPER_ENDPOINT`, `LOG_LEVEL`, `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS`, `FEATURE_AI_EXTRACTION`, `LOGIN_RATE_LIMIT_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `GEMINI_API_KEY`, `LEGALX_GEMINI_MODEL`, `VITE_API_BASE_URL` — no values |
| Live Vercel preview deployment | DEFERRED / BLOCKED | Owner decision preview-only; no deploy command executed |
| Production release / public URL / DNS | DEFERRED / BLOCKED | Not authorized |
| Managed Postgres provisioning + billing | DEFERRED / BLOCKED | Owner only; agent creates no accounts, handles no credentials |
| `upgrade head` against a real database | BLOCKED | No owner-provided `DATABASE_URL`; HC-1 forbids production mutation |
| Seeding demo accounts in production | BLOCKED | Owner decision Q6 default: do not seed |
| Committing media files (~4.27 MiB) | BLOCKED | Unresolved provenance; owner consent required (§8e) |
| Blockchain / RPC / wallet deployment | DEFERRED | Out of scope; no mainnet or testnet transaction |

## Evidence

- `vercel.json` present at repository root, read directly (25 lines); Services topology routes `/api/(.*)` to the FastAPI service and the catch-all to the Vite SPA with `index.html` fallback.
- `docs/OMEGA_FRS.md` §8a–b records the owner gate: preview-only, owner-provided `DATABASE_URL`, no agent provisioning or billing. `docs/STATE.md:262–265` records the same decisions as approved.
- `docs/OMEGA_FRS.md` §5.3 explicitly lists what could **not** be verified read-only: Vercel Services schema validity, framework auto-detect, Vite env inlining, static-asset resolution. These remain **Unverified**, not passed.
- `api/app/config.py:97–102` hard-rejects non-PostgreSQL `DATABASE_URL` when `APP_ENV=production` (per FRS discovery).
- No `vercel deploy`, project creation, DNS change, cloud resource, or paid action was performed by this workstream.

## Limitations

- Scaffolding validity is **Unverified** until an authorized preview deploy performs health/smoke checks.
- No live HTTP smoke result, no preview URL, no database connection proof, no migration proof.
- Media files remain untracked; a Git-based deploy requiring them cannot proceed without owner consent.
- Licensing remains Blocked; no active license asserted.
- This is a documentation report; appearance criteria are **Not applicable**.

## Verification still required (M5 / owner gate)

1. Owner provides `DATABASE_URL` (never in chat or docs) and authorizes a preview target.
2. Authorized preview deploy → health check `GET /api/health` and SPA smoke; capture output.
3. Validate Vercel Services schema, framework auto-detect, Vite env inlining, static-asset resolution — all currently Unverified.
4. Confirm no production DB mutation or seeding occurred.

Related: [deployment guide](../DEPLOYMENT.md), [security](../SECURITY.md), [master report](FINAL_MASTER_REPORT.md).

---

## Update 2026-11-22 — PR merge + Vercel project/config work (live deploy still BLOCKED)

This addendum records verified actions taken after the original report above. It does **not** change the overall verdict: live full-stack deployment remains **BLOCKED** pending the owner-provided `DATABASE_URL`. Nothing here claims a hosted deployment.

### Verified actions

| Action | Evidence | Result |
|---|---|---|
| PR #2 merged into `main` | `gh pr merge 2 --merge`, merge commit `629a07c1adbee7a12c1f424d76ed9b61b4a2b9d6`; remote `main` ls-remote = same SHA | PASS (no force-push) |
| Correct Vercel project created + linked | `vercel project create lexora-legalx` → `prj_s7ofWrePH1qlRrJpnFjCj6Tp7WBn`; `vercel link --project lexora-legalx --yes` → exit 0; `.vercel/project.json` (gitignored) | PASS. The FORBIDDEN `legalx` project (Next.js, `legalx-three.vercel.app`) was NOT touched. |
| `vercel.json` validated against official schema | Fetched `https://openapi.vercel.sh/vercel.json`; confirmed `services` is a valid top-level key, `{ "service": name }` rewrites valid (`type` optional), service names `app`/`api` valid, `framework: fastapi` valid, no unsupported top-level build keys | Structurally SCHEMA-VALID; recorded in `docs/VERCEL_CONFIG_VALIDATION.md` |
| `vercel pull --environment preview` | exit 0, downloaded project settings + preview env | PASS |
| `vercel build --environment preview` | CLI recognized BOTH Services (`app` Vite + `api` FastAPI), ran `[vc:service:app] npm install` (0 vulnerabilities), then failed with `spawn cmd.exe ENOENT` | Windows Vercel-CLI defect in the local build-command phase (reproduced via a short path junction, so not path length and not config). Local build cannot fully validate on Windows; the **cloud preview build is the authoritative validation**, still pending. |
| Env var confidentiality | `.env.local` created by `vercel link` is gitignored; no env files in git status; `DATABASE_URL` never handled in chat | PASS |

### Documented configuration deviation

Backend service root is `.` (not `api` as the owner's shorthand stated) because `api/app/main.py` uses ~140 absolute `from api.app...` imports; setting root `api` would break them. The service is still named `api` and reaches `/api` via rewrite. Service names match the owner's `app`/`api` requirement.

### Still BLOCKED (owner-only, unchanged)

1. Create a **Neon free-tier** PostgreSQL database (owner authorized Neon free tier on 2026-11-22).
2. Owner sets `DATABASE_URL` in the `lexora-legalx` **Preview** environment themselves — never in chat or docs.
3. Authorized cloud preview deploy → `GET /api/health` + SPA/full-workflow smoke; apply `alembic upgrade head` once against the preview DB.
4. Production promotion requires separate explicit owner approval.
5. Licensing consent and film/noir media provenance remain unresolved; assets stay unpublished.

No live URL, deployment ID, migration, or runtime test result can be reported until items 1–4 are complete. This report will be updated again after the authorized preview deploy.

---

## Addendum 2026-11-22 (verified preview deployment) — deploy READY; full-stack still BLOCKED on seed

This addendum supersedes the earlier in-file statements that "no live deploy was executed" and that "no live URL, deployment ID, migration, or runtime test result can be reported." Those were true when written; a real, authorized **Preview** deployment has since succeeded. Nothing below claims hosted end-to-end E2E has passed — it has **not** (see Blocker).

### Deployment — VERIFIED (Preview only, no `--prod`)

| Item | Verified value |
|---|---|
| Vercel project | `lexora-legalx` (the forbidden `legalx` project was **NOT** used) |
| Deployment ID | `dpl_9MTe9FaxsdwTqBGx89kQeqZGTAqz` |
| URL | https://lexora-legalx-jdfumza5y-thenidhibhat-6721s-projects.vercel.app |
| readyState | `READY` |
| Target | Preview (`vercel deploy` **without** `--prod`) |
| Source branch | `release/readme-refresh` |
| Cloud build | Succeeded — the earlier local `spawn cmd.exe ENOENT` defect did **NOT** recur in the cloud |

**Deployment Protection:** Vercel `vercel_authentication` is **ENABLED**. Raw, unauthenticated HTTP receives a Vercel auth-wall HTML page that is **NOT our app** (its `data-dpl-id` differs). Every hosted probe below was made with `vercel curl <url> --yes` to bypass that wall; those results are the app's real responses.

**Deploy #1 failed:** 275 MB bundle exceeded Vercel's 225 MB limit because `qa-screenshots` were bundled. Fixed by a NEW, deliberately **untracked** `.vercelignore` excluding `.venv`, `node_modules`, `qa-screenshots`, `test-results`, `public/film`, `public/noir`, `.git`, `.vercel`, `.env*`, `*.db`. `public/film` and `public/noir` are excluded because media **RIGHTS ARE UNRESOLVED** — they must stay unpublished.

### Hosted API smoke (via `vercel curl ... --yes`) — VERIFIED

| Probe | Result |
|---|---|
| `GET /api/health` | `{"status":"ok","version":"unknown","db":"ok"}` — `version:unknown` is expected (no git metadata at runtime); `db:ok` confirms PostgreSQL connectivity (psycopg 3.3.9) |
| `GET /api/openapi.json` | 200 |
| `GET /manus-routes.json` | 200 |
| `GET /app/parity` | 200 |
| `GET /` | 200 |

Content-type verified on `/` (SPA `text/html`) vs `/manus-routes.json` (JSON). Health/route smoke passed; **full workflow E2E did not run / did not pass.**

### Migration — VERIFIED (owner-executed)

- Alembic revision `e25c7211a088` confirmed by the owner in the Neon SQL Editor (project `lexora-legalx` / `production` branch / `neondb` / Singapore region).
- Schema = 15 domain tables + `alembic_version`, created once via reviewed transactional SQL; **NOT rerun**. No agent performed DB mutation.

### CURRENT BLOCKER — hosted auth fails; full-stack E2E BLOCKED

- `POST /api/v1/auth/session` → **HTTP 401 `INVALID_CREDENTIALS`** (NOT 500). Root cause: the migration created tables but **no demo users** were seeded.
- `DATABASE_URL` is a write-only Vercel **Sensitive Preview Secret** (`vercel env pull` returns `[SENSITIVE]`), so a local seed cannot reach the hosted DB.
- Prepared idempotent seed SQL at `C:\Users\theni\AppData\Local\Temp\opencode\neon_seed.sql`: 14 INSERTs (2 orgs / 6 users / 6 memberships), `created_at` present, `ON CONFLICT (id) DO NOTHING`, `BEGIN`/`COMMIT`, no DROP/DELETE, password hashes verified.
- **OWNER MUST run this SQL in the Neon SQL Editor next.** Hosted auth / RBAC / parity / execution E2E is **BLOCKED** until then. Do NOT report hosted E2E as passed.

### Env / Gemini audit

- 12 backend env vars + `VITE_API_BASE_URL`; all optional except `DATABASE_URL`, which is effectively required in production (`api/app/config.py`).
- GEMINI = **IMPLEMENTED-BUT-UNWIRED**: a real `genai.Client` exists at `gemini_provider.py:112`, but there is NO HTTP route or UI, and `FEATURE_AI_EXTRACTION` gates nothing. Adding `GEMINI_API_KEY` alone does NOT enable live AI — that needs an endpoint/UI (a scope change requiring owner authorization). Billable AI was NOT enabled.

### Assets

- Fonts serve real `font/woff2` bytes (not broken); now tracked with OFL 1.1 notices preserved.
- New official `public/favicon.svg` derived from the project's own `Logo()` inline SVG; OG tags added in `index.html` (no `og:image`). No favicon existed before — now fixed.
- Film/noir paths return the SPA `text/html` fallback because `.vercelignore` excludes them — **INTENTIONAL**; rights UNRESOLVED, must not publish without consent.

### Git

- Branch `release/readme-refresh`. Commits: `5bff127` (PR #3 original), `b40e0b0` ("docs: screenshot-free README, official favicon and OFL fonts", pushed).
- PR #3 (https://github.com/the-nidhi-bhat/LEXORA-LegalX/pull/3) **OPEN / MERGEABLE**, head `b40e0b0`, CI checks pass (Vercel deploy pending at record time).
- PR #2 **MERGED** → `main` `629a07c1adbee7a12c1f424d76ed9b61b4a2b9d6`; `origin/integration/legalx-v1` = `838ad0c`.
- Working tree preserves pre-existing `.gitignore` + `docs/STATE.md` contributor edits. **NO main merge and NO production promotion** by this workstream.

### Local tests (real, pre-deploy)

pytest 447 passed / 3 skipped / 1 warning; tsc 0; npm test 9/9; build 0 (479.17 kB main + 539.45 kB Sculpture, pre-existing >500 kB advisory); parity E2E 10/0/0; rehearse:judge 30/30 pages / 5/5 roles. Post-README-change re-verified: tsc 0, build 0, favicon + fonts present in `dist`.

### Verdict (full-stack)

Preview deploy + health/route smoke = **PASS**. Full-stack = **NOT COMPLETE**: blocked on the owner applying `neon_seed.sql`; thereafter hosted E2E (auth, agreements, persistence, IR, parity, trust passport, execution gate, RBAC, routes, mobile) must run and pass. Production promotion requires separate explicit owner approval.

---

## 2026-11-22 addendum — seed applied + hosted E2E + media rights

The owner applied `neon_seed.sql` in Neon SQL Editor (`lexora-legalx` / `production` / `neondb`); hosted sign-in changed from 401 `INVALID_CREDENTIALS` to **HTTP 200** (owner@legalx.demo, Acme Digital, 14 permissions). Seed is applied — do NOT rerun.

**Hosted E2E (tester, real Vercel Preview + Neon DB, via `vercel curl --yes`): 9 groups PASS, 1 FAIL, 1 UNVERIFIED.**
- Auth/session **PASS**: sign-in 200; `/api/v1/me` 200 with cookie, 401 without; sliding expiry. (Real route is `/api/v1/me`.)
- Agreement create + persistence **PASS**: POST 201 `8f44283d-2b47-4f5a-af16-d24d05416b68`; GET in a fresh session returns identical record — Neon persistence confirmed.
- Versions + Contract IR **PASS (with honest note)**: version v2 created, sha `e432d66d`; Contract IR is a server-derived library artifact with **no HTTP IR surface** (no `/ir` endpoint) — hashes evidenced via Trust Passport.
- Parity Engine **PASS**: good payload → `overall_status=match`, `is_blocked=false`, `passed=false` (informational only); tampered `dispute_behavior=arbitrate` → `overall_status=blocked` with the expected/actual field.
- Trust Passport **PASS**: evidence-only (no `text`/`ir_json` leaked); unrun version 404.
- Approval + execution gate **PASS**: execution before approval 403 "Required approvals not found"; approve 201; execution after approval 403 "must be in 'draft' state" — gate intact.
- RBAC **PASS**: freelancer/auditor 403 on create, lawyer 200 verify.
- Workspace isolation **PASS**: outsider@lexora.demo → owner agreement 404 (never 403).
- Errors + rate limit **PASS**: 422 invalid payload, 403 CSRF, 401 anon; 6th verify call 429 `RATE_LIMITED` with Retry-After.
- Frontend routes/assets **FAIL (prior deploy)**: `/favicon.svg` returned `text/html` — the deployed commit lacked `public/favicon.svg`. Fixed in this integration branch (favicon + OG tags included); to be confirmed on redeploy.
- Browser visual/responsive **UNVERIFIED** in the API-level run; covered separately by Playwright UI evidence.

Security post-check: demo accounts are org-scoped with resource-scoped permissions, no global admin — recommend rotating/removing before production. No production data used.

**Media rights:** owner confirmed film, embedded audio/music/voiceover and noir artwork are all-original and authorized for publication (2026-11-22). `.vercelignore` film/noir exclusions removed; assets will be included in the redeploy. Fonts remain SIL OFL 1.1 with notices preserved.

**Remaining:** redeploy with integrated assets, confirm media MIME types (`video/mp4`, `image/webp`, `font/woff2`, `text/vtt`) and favicon, merge reviewed PRs to `main`, then — only with explicit owner approval — Production.
