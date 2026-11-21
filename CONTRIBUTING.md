# Contributing to LEGALX

## Ground rules

1. **Keep changes focused.** This repository has a documented scope boundary: feature development stopped at `TODO.md:78`; remaining work is defects, security, reliability, and release blockers. Do not invent features, screens, endpoints, or product phases.
2. **Preserve repo truth.** There is no numbered product "Phase 7" spec and no blockchain scope. Blockchain is "Later" in [the roadmap](docs/PRODUCT_ROADMAP.md) and out of scope in [decisions](docs/DECISIONS.md). Do not add wallet, MetaMask, RPC, or on-chain claims.
3. **Never blur real and simulated.** Keep deterministic fixtures labelled as simulated; keep live-backend results labelled as such. Do not present a demo score or a simulated Sepolia record as a real service result.
4. **Do not weaken a boundary.** Strict schema (`extra="forbid"`), org isolation, RBAC, CSRF, session handling, approval rules, the parity gate, and the execution gate are protected. The verified live payload is exactly `{dispute_behavior, governing_law}`.
5. **No secrets, ever.** Never commit `.env`, credentials, tokens, private keys, connection strings, database files, or build output. Use environment **names only** in docs and reports.

## Setup

```bash
npm install
npm run dev
```

The frontend is Vite + React + TypeScript on port 3000 by default. The backend is FastAPI; run it with `uvicorn api.app.main:app --reload --port 8000` using the project virtual environment. The guest demo at `/demo` needs no account and no secret.

Environment variables are documented by name in [deployment](docs/DEPLOYMENT.md) and [API](docs/API.md). Production mode requires PostgreSQL; local development may use SQLite. Do not modify real databases or seed production accounts without explicit authorization.

## Verification before a pull request

Run all of these and report exact output. Numbers below are authoritative **M5 results** with captured output (exit 0 each), not estimates.

```bash
npx tsc --noEmit
npm test
npm run test:e2e -- e2e/parity.spec.ts --config playwright.parity.config.ts
npm run build
npm run rehearse:judge
.venv\Scripts\python.exe -m pytest api/tests -q --no-header
```

M5 results: `npx tsc --noEmit -p tsconfig.json` exit 0; `npm test` 9/9 chained scripts, exit 0; parity E2E (`npx playwright test --config playwright.parity.config.ts --workers=1`) 10 passed / 0 failed / 0 skipped in 1.7m, exit 0; build exit 0 (Vite v8.3.6, 40 modules, 1.47 s) with a pre-existing >500 kB advisory (not a regression); rehearse:judge PASS pages=30/30, roles=5/5 in 53.747 s; pytest 447 passed / 3 skipped / 1 warning in 91.04 s.

A failure or an environmental block is reported honestly (e.g. `Blocked`/`Unverified` with the raw error). Never claim a pass by inference.

## Documentation expectations

- Update the relevant doc whenever you add/change a route, schema, environment variable, security control, or demo behaviour.
- Validate relative links, image paths, and Mermaid blocks after editing. Asset paths in the README are root-relative (`public/film/…`, `docs/screenshots/…`).
- Keep the implemented-vs-simulated distinction explicit in tables and labels.
- Do not assert a project license. Licensing is **proposal only** until owner consent and media provenance are resolved; see [licensing review](docs/LICENSING_REVIEW.md) and [media provenance](docs/MEDIA_PROVENANCE.md).

## Git hygiene

- Work on a feature branch; never commit or push to `main`.
- No force-push, `reset --hard`, `git clean`, branch switch, or destructive git operation.
- No commit or push without explicit authorization; scoped delivery targets `origin/integration/legalx-v1`.
- Preserve concurrent contributors' work, including the live dev servers on ports 8010/3002. Do not kill them.
- Keep commits scoped: no DB files, secrets, `.env`, credentials, generated artifacts, or untracked media with unresolved provenance.
- Use clear commit messages and attach verification evidence to the PR description.

## Review and sign-off

- Capture evidence for each check (command + output + status). Prior QA and reviewer gate outcomes are recorded as evidence only; formal sign-off remains Pending per owner decision in [STATE](docs/STATE.md).
- No professional security audit, WCAG conformance, legal enforceability, live deployment, or blockchain transaction is claimed by this project today.
