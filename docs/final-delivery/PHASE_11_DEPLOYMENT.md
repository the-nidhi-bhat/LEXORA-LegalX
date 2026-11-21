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
