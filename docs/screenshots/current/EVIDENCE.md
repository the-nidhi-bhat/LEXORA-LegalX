# Screenshot evidence — current interface

Captured 2026-11-22 from a real Playwright Chromium session driving an isolated
frontend/backend. These are honest captures of the running application; nothing was
Photoshopped or fabricated.

## Capture setup

- Backend: FastAPI `uvicorn api.app.main:app` on `127.0.0.1:8011`, `APP_ENV=test`,
  disposable seeded SQLite DB (2 organizations / 6 users / 6 memberships).
- Frontend: Vite on `127.0.0.1:3005` via `vite.parity.config.ts` (proxy → 8011).
- Sign-in: `owner@legalx.demo` through the real UI with a real CSRF token.
- Viewport: 1440X900 (device scale 1) for all except `mobile.png` at 390X844.

## Honest classification

| Screenshot | Basis | Notes |
|---|---|---|
| `hero.png` | PUBLIC / DEMO | Marketing landing page, no backend state. |
| `dashboard.png` | LIVE BACKEND | Authenticated workspace from real sign-in. |
| `agreements.png` | LIVE BACKEND | Agreement list from the seeded DB. |
| `agreement-intelligence.png` | DEMO SIMULATED | Local deterministic extraction, no backend call. |
| `contract-ir.png` | DEMO SIMULATED | Local deterministic IR view, no backend call. |
| `parity.png` | LIVE BACKEND | Real verification, see parity note below. |
| `trust-passport.png` | LIVE BACKEND | Real Trust Passport from the parity run. |
| `execution-gate.png` | LIVE BACKEND | Real blocked execution response. |
| `dark-mode.png` | LIVE BACKEND | Authenticated dashboard with local theme state toggled. |
| `mobile.png` | LIVE BACKEND | Responsive workspace at 390X844. |

## Parity note (important)

The parity screenshot shows an **authentic backend result**, not a fabricated
amount mismatch. Two real verification runs were driven through `ParityStudio`
with a real CSRF token:

- Run A (`dispute_behavior=mediate`, `governing_law=India`): `overall_status=match`,
  0 differing field rows.
- Run B (`dispute_behavior=arbitrate`, `governing_law=India`, captured in
  `parity.png`): `overall_status=blocked`, `is_blocked=true`. The single blocking
  field is `dispute_behavior` — stored `mediate` vs executor `arbitrate`, message
  "Dispute behavior mismatch".

The canonical **INR 30,000 agreement vs INR 35,000 executable representation and
its INR 5,000 discrepancy** is a product illustration shown on the public landing
page (`ContractStory.tsx`), not a live verification output. It is **not**
constructible through the bounded HTTP schema: all commercial amounts are derived
server-side from stored agreement rows, and only `dispute_behavior` and
`governing_law` are accepted as executor clarifications. The screenshot does not
claim otherwise.

## Trust Passport (from the real blocked run)

- version 1, `overall_status=blocked`, `is_blocked=true`, `approvals_complete=false`.
- `verified_at=2026-11-21T19:28:25Z`.
- approved IR hash `dc021834...a288d0`, execution params hash `174de915...b495b`.
- ruleset v1 / canonicalization v2, 1 finding (`dispute_behavior`, blocking).

## Console / health

- Zero console errors on nine captures; one non-fatal `403 Forbidden` resource
  error during the `execution-gate.png` page, attributed to the preceding
  trust-passport request (expected RBAC/CSRF behavior, not a page failure).

## Integrity

All PNG headers verified IHDR-valid; nine at 1440X900, `mobile.png` at 390X844.
No tracked files were modified during capture. Concurrent UI-agent ports
8010/3002 were never touched.
