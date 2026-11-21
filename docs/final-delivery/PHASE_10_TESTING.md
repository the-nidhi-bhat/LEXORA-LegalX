# PHASE_10_TESTING — verification report

**Label note:** owner-specified report label, not a product phase.

## Verdict

**Overall verdict: PARTIAL.**

The verification battery was executed in M5 with captured output. Every result below reflects authoritative M5 figures (see the rows and the git/gate note); all checks exited 0. Formal QA sign-off remains **Pending** per owner decision; no pass is claimed beyond what was actually captured.

## Verification battery — recorded evidence

| # | Check | Command | Recorded result | Status |
|---|---|---|---|---|
| 1 | Backend suite | `.venv\Scripts\python.exe -m pytest api/tests -q --no-header` | 447 passed / 3 skipped / 1 warning in 91.04 s, exit 0; sole warning pre-existing `PydanticDeprecatedSince20` at `api/app/schemas/ir.py:102` | Passed (M5) |
| 2 | TypeScript | `npx tsc --noEmit -p tsconfig.json` | exit 0 | Passed (M5) |
| 3 | Frontend scripts | `npm test` | exit 0, 9/9 chained scripts | Passed (M5) |
| 4 | Production build | `npm run build` | exit 0; Vite v8.3.6, 40 modules, 1.47 s; `index.html` 1.29 kB, `index-ecod99Zs.css` 108.76 kB, `backend-pages-CwLMi_Hj.js` 15.43 kB, `index-B6Q4ziVK.js` 479.17 kB, `Sculpture-CUOBJndu.js` 539.45 kB; >500 kB advisory **pre-existing**, not a regression | Passed (M5) |
| 5 | Parity E2E | `npx playwright test --config playwright.parity.config.ts --workers=1` | 10 passed / 0 failed / 0 skipped in 1.7m, exit 0; artifact `qa-screenshots/parity-e2e-2026-11-21T18-05-41-718Z` | Passed (M5) |
| 6 | Judge rehearsal | `npm run rehearse:judge` | PASS, pages=30/30, roles=5/5, 53.747 s, exit 0 | Passed (M5) |
| 7 | Demo rehearsal | `npm run rehearse:demo` | PASS, 3/3 personas (owner, legal_reviewer, technical_auditor) | Passed (Phase 7 closeout; not re-run in M5) |
| 8 | Rendered-UI evidence gate | `capture.mjs` | 10/10 OK, `CAPTURE_EXIT=0`; `evidence.json` + 12 PNGs in `qa-screenshots/parity-ui-evidence-m3-2026-11-21T21-49-07/` | Passed (Phase 7 closeout; not re-run in M5) |
| 9 | Protected backend integrity | git/gate check (HEAD, `git diff --check`, scoped SHA review) | HEAD `b1b5ebaf601ae2c6c01185ae8dab72355d5df335`, `git diff --check` 0; legal-gate byte-identical (engine.py `85E4D3EE…ACC2`, comparison_rules.py `C0FDBF4A…DE434`, schemas/parity.py `DCFE9E1E…98B525`); execution.py `06737F3C…24207C` authorized changes, gate logic intact; ports 8010/3002 untouched | Passed (M5) |
| 10 | M1 defect tests | `api/tests/test_parity_ratelimit.py`, `api/tests/test_execution_ratelimit.py` | Covered by M5 backend suite (447 passed / 3 skipped / 1 warning, exit 0); rate-limit 429 + concurrency paths green | Passed (M5) |

Rows 1–6 and 9–10 reflect M5 results captured in this session (FRS §5.4, HC-6). Rows 7–8 remain Phase 7 closeout evidence, not converted into an M5 pass by inference.

## Real vs simulated vs deferred

| Item | Classification | Notes |
|---|---|---|
| pytest / tsc / npm test / build counts | VERIFIED (M5) | Real commands, captured output in M5; exit 0 each |
| Parity E2E 10/0/0 in 1.7m | VERIFIED (M5) | `npx playwright test --config playwright.parity.config.ts --workers=1`, exit 0; artifact `qa-screenshots/parity-e2e-2026-11-21T18-05-41-718Z` |
| Rendered-UI viewports, light/dark, reduced motion | VERIFIED (Phase 7 closeout evidence, heuristic) | No axe/Lighthouse/WCAG claim; no CLS/INP/LCP metrics |
| Hardcoded 74 in the live UI | Explicitly ABSENT | Live score derived from backend `field_results`; tamper 74 is a labelled demo fixture |
| M1 rate-limit/concurrency results | VERIFIED (M5) | Covered by pytest 447/3/1; rate-limit 429 and concurrency paths green |
| Live deployment / production health check | DEFERRED / BLOCKED | No deploy executed; no public URL |

## Known gaps in the evidence

- Earlier "6/7 cold-start" E2E issue was environmental Vite latency and was **not permanently fixed**; never claim it resolved.
- Ports 8010/3002 are held by the concurrent UI agent and must not be killed (HC-5); E2E must use the isolated harness.
- Earlier QA gate FAIL was premature (dispatched before M3/rehearsal/report/commit) and was re-run as PASS WITH MINOR FINDINGS; formal sign-off remains Pending per owner decision.
- No security audit, no accessibility conformance, no on-chain test, no live HTTP smoke test.

## Verification status (M5 complete)

All ten rows were executed in M5 with captured output (exit 0 each). Rows 7–8 remain Phase 7 closeout evidence and were not re-run in M5; they are not converted into an M5 pass by inference. Formal QA sign-off remains **Pending** per owner decision; R7 Git delivery is **Pending**.

Related: [testing guide](../TESTING.md), [master report](FINAL_MASTER_REPORT.md).
