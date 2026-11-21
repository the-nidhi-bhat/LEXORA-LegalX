# PHASE_08_BACKEND_API — delivery report

**Label note:** owner-specified report label, not a product phase. This report covers the **implemented** FastAPI HTTP surface and its documentation; it does not claim any planned-but-unimplemented endpoint.

## Verdict

**Overall verdict: COMPLETED (documentation and route census; verification completed in M5).**

The API reference was rewritten from the real registered routes, and every documented path/method was cross-checked against router decorators. No new endpoint was added by this workstream. M5 verification passed: pytest 447 passed / 3 skipped / 1 warning in 91.04 s, tsc exit 0 (see `PHASE_10_TESTING.md`).

## Real vs simulated vs deferred

| Item | Classification | Notes |
|---|---|---|
| 15 real routes across 7 routers | VERIFIED | `api/app/main.py:180–210` registers health, auth, agreements, versions, activity, execution, parity |
| Session auth, CSRF, RBAC, org-scoped 404, strict schema | VERIFIED | M5 backend tests (pytest 447/3/1, exit 0); source review this workstream |
| Parity `POST .../verify` + `GET .../trust-passport` | VERIFIED | Engine-backed, append-only run, re-derived evidence-only passport |
| Execution gate state transition | VERIFIED | Conditional UPDATE + idempotency; 403/409/429 contracts |
| `interpret`, `execution/prepare`, `webhooks/chain`, `health/integrations`, IR/review/tamper endpoints | DEFERRED — DO NOT DOCUMENT AS LIVE | Named in older ADRs/planned contracts; not implemented. The previous `docs/API.md` claiming "no server API" was stale and has been replaced with a staged accurate rewrite under `_rewrite/`. |
| Gemini provider / on-chain webhooks | DEFERRED | No route, no provider, no chain |

## Evidence

- **Route census (read-only):** decorator inventory returned exactly 15 matches: health 1 (`GET /api/health`, no `/v1` prefix); auth 3 (`POST`/`DELETE /api/v1/auth/session`, `GET /api/v1/me`); agreements 4 (`GET`/`POST /api/v1/agreements`, `GET`/`PATCH /api/v1/agreements/{agreement_id}`); versions 3 (`GET`/`POST .../versions`, `POST .../versions/{version_number}/approve`); activity 1 (`GET /api/v1/activity`); execution 1 (`POST /api/v1/agreements/{agreement_id}/execution`); parity 2 (`POST .../versions/{version}/verify`, `GET .../trust-passport`).
- **`_IncludedRouter` caveat:** `create_app().routes` shows 3 built-in + 7 wrapper entries; enumerating `.original_router.routes` yields the 15 domain routes. A superficial read undercounts them. Corroborated in `docs/PHASE6_DELIVERY_REPORT.md` §4 and `docs/STATE.md:206–208`.
- **Request/response shapes:** verify body from `api/app/schemas/parity.py` (`extra="forbid"`, exactly `execution_parameters.{dispute_behavior, governing_law}`); verify response from `api/app/parity/service.py:340–347`; trust-passport response from `api/app/parity/service.py:419–442`; error envelope from `api/app/errors.py:error_body`.
- **M5 verification:** pytest 447 passed / 3 skipped / 1 warning in 91.04 s, exit 0; tsc exit 0 (see `PHASE_10_TESTING.md`).
- **Documentation artifact:** staged accurate rewrite at `docs/final-delivery/_rewrite/API.md` (destined for `docs/API.md`; the tracked original cannot be overwritten in place by this workstream).

## Limitations

- No server was started and no HTTP request was issued by this workstream; route truth is from static source inspection plus prior recorded evidence.
- Live schema validation / framework auto-detection for the Vercel topology remains **Unverified** until a deploy is authorized (FRS §5.3).
- The historical "25 vs 30 route count" discrepancy is explicitly out of scope (FRS §2.2) and was not reconciled.
- No claim of a public URL, live database, or deployed service.

## Verification status (M5 complete)

- M5 full pytest suite: Passed (447/3/1, exit 0).
- Cross-check `GET /api/openapi.json` against the 15 documented routes remains **Unverified** until a backend instance is available (no live deploy; no `DATABASE_URL`).
- Confirm the staged `API.md` is installed at `docs/API.md` and that its links resolve — delivery step, not yet performed.

Related: [API reference](../API.md), [security](../SECURITY.md), [master report](FINAL_MASTER_REPORT.md).
