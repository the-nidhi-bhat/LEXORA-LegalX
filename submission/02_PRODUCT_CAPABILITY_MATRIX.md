# Product evidence at main 259e33a

Use this snapshot for judge claims. VERIFIED denotes source and executable or recorded test evidence. A production deployment can differ from this snapshot.

| Capability | Classification | Evidence and limit |
|---|---|---|
| Cinematic public site, responsive demo | VERIFIED | [Hero](../src/components/FilmHero.tsx), [story](../src/components/ContractStory.tsx), [layout checks](../e2e/layout.spec.ts). Browser observations in 07. |
| Session identity and workspace boundaries | VERIFIED | [Auth router](../api/app/routers/auth.py), [authorization tests](../api/tests/test_agreements_authz.py). Backend derives identity. |
| Create agreements, revise versions, confirm hash | VERIFIED | [Agreements](../api/app/routers/agreements.py), [versions and approvals](../api/app/routers/versions.py), [HTTP journey](../e2e/api-journey.spec.ts). |
| Canonical Contract IR and source mapping | VERIFIED | [Derivation](../api/app/ir/derive.py), [schema](../api/app/schemas/ir.py), [tests](../api/tests/test_ir_derive.py). Supported fields have explicit representations. |
| Deterministic parity and evidence-only Passport | VERIFIED | [Service](../api/app/parity/service.py), [verification and Passport tests](../api/tests/test_parity_api.py). Separate run ID, input hashes and field results. |
| Off-chain execution transition | VERIFIED | [Gate](../api/app/routers/execution.py), [tests](../api/tests/test_execution.py). Database transition and activity event. |
| Local extraction, role switch and tamper story | SIMULATED | [Demo state](../src/demo-state.ts), [workspace](../src/App.tsx). Label the local fixture on screen. |
| Gemini-assisted extraction | PARTIAL | [Adapter](../api/app/intelligence/gemini_provider.py), [mocked provider tests](../api/tests/test_intelligence_gemini_provider.py), [opt-in live test](../api/tests/test_intelligence_gemini_live.py). No paid request or hosted provider path verified. |
| Solidity generation | PARTIAL | [Generator](../src/solidity.ts), [generation checks](../scripts/test-solidity-generation.mjs). Source generation and local checks only. |
| Wallet signing, deployment, escrow settlement | DEFERRED | Execution router changes application state. No chain receipt in this workflow. |
| Vercel Services and managed PostgreSQL | PARTIAL for current public demo | [Service routing](../vercel.json), [prior deployment evidence](../docs/final-delivery/PHASE_11_DEPLOYMENT.md). Public API reported database unavailable during this audit. |

## Engineering reconciliation

Main advanced to e1beead before delivery. The newer code distinguishes real, simulated and unavailable provider status, scores live evaluations on captured output, and audits blocked execution attempts. The UI eligibility check is read-only. Use the disposable authenticated execution endpoint for the missing-approval demonstration. These changes preserve the trust boundaries above.
