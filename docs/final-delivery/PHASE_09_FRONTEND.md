# PHASE_09_FRONTEND — delivery report

**Label note:** owner-specified report label, not a product phase. No UI redesign was performed by this workstream; concurrent UI-agent work is preserved.

## Verdict

**Overall verdict: COMPLETED (documentation of the shipped frontend; no UI changes in this workstream).**

The shipped frontend state is documented accurately: real backend-derived parity UI in live mode, a separate deterministic demo path, three.js hero sculpture, light-default theming, and responsive/reduced-motion support. M5 re-ran build (exit 0, Vite v8.3.6, 40 modules, 1.47 s), tsc (exit 0), npm test (9/9), parity E2E (10/0/0 in 1.7m) and rehearse:judge (PASS 30/30 + 5/5); viewport/theme/reduced-motion evidence remains Phase 7 closeout evidence.

## Real vs simulated vs deferred

| Item | Classification | Notes |
|---|---|---|
| Parity Studio live mode: backend-derived result, read-only Trust Passport, 6 stable `data-testid`s | VERIFIED | `src/App.tsx`, `src/api/client.ts`, `e2e/parity.spec.ts`; M5 parity E2E 10/0/0 confirms the previously skipped UI test runs and passes |
| Three.js hero sculpture | VERIFIED | `src/components/Sculpture.tsx` imports `three` (`^0.187.0`); build emits a separate Sculpture chunk |
| Light-default theme; dark is a persisted toggle; reduced-motion fallback | VERIFIED | `index.html:9–22`, `src/main.tsx:8–9`; the old "dark-only" README claim was incorrect and is corrected in the staged README |
| Modular CSS under `src/styles/` | VERIFIED | `src/styles/styles.css`, `theme.css`, `design.css`, `landing.css`, `astra-layout.css`, `controls.css`, `walkthrough.css`; no top-level `src/styles.css` |
| Five-role demo switcher and local-only protected-route policy | VERIFIED (UI) | Demo construct, not production authentication |
| Seeded extraction, source-grounded clauses, document preview | SIMULATED | Deterministic fixtures; no live Gemini |
| Tamper 74 / restore 100, simulated Sepolia records | SIMULATED | Explicitly labelled in the UI |
| Production identity binding, private upload, Trust Passport export | DEFERRED | Roadmap items |

## Evidence

- **Prior authoritative baseline** (`docs/PHASE7_CLOSEOUT_REPORT.md` §3 R2/R3, §9): parity UI proof compares rendered status against a direct backend `postVerify` result (no hardcoded 74); score 0% derived from live `field_results`; `literal74InPageText=false`; 6 `data-testid`s found at runtime; honest empty state "No Contract IR available for parity verification."
- **Rendering evidence (Phase 7 closeout; not re-run in M5):** viewports 320 / 768 / 1024 / 1440 PASS; light/dark at 1440 PASS; reduced motion PASS; `consoleErrors=[]`, `pageErrors=[]`, `failedRequests=[]`; `capture.mjs` 10/10 OK with 12 PNGs.
- **Rehearsal (M5):** `npm run rehearse:judge` PASS pages=30/30, roles=5/5 in 53.747 s, exit 0; `npm run rehearse:demo` 3/3 personas (Phase 7 closeout evidence).
- **Source inspection (this workstream):** `package.json:20` `three: ^0.187.0`; `src/components/Sculpture.tsx:2` `import * as T from 'three'`; `src/main.tsx:4–6` imports three stylesheets from `./styles/`.
- **Documentation artifact:** staged README rewrite at `docs/final-delivery/_rewrite/README.md`, with the stale `src/styles.css` path corrected and the dark-only claim reconciled.

## Limitations

- Keyboard/focus evidence was **heuristic only**; no axe, Lighthouse, WCAG conformance, CLS/INP/LCP measurement is claimed. Contrast was partially assessed.
- No screenshot was captured by this workstream; the 8 screenshots referenced in the staged README are pre-existing repository files whose paths were verified by glob.
- The pre-existing >500 kB bundle advisory (`Sculpture` chunk) is not remediated.
- Rehearsals write to a hardcoded `/home/ubuntu/legalx/docs/rehearsals` path (Windows → `C:\home\ubuntu\...`), a portability limitation.
- No UI change was made by this workstream; appearance criteria are recorded as prior evidence, not a new sign-off.

## Verification status (M5 complete)

- M5 with captured output: `npx tsc --noEmit -p tsconfig.json` exit 0; `npm test` 9/9, exit 0; `npm run build` exit 0 (Vite v8.3.6, 40 modules, 1.47 s); `npm run rehearse:judge` PASS 30/30 + 5/5 in 53.747 s; parity E2E 10/0/0 in 1.7m.
- Confirm the staged README is installed at the repository root and all relative links resolve — delivery step, not yet performed.

Related: [master report](FINAL_MASTER_REPORT.md), [README](../../README.md), [security](../SECURITY.md).
