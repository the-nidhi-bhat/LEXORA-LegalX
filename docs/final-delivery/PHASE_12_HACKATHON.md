# PHASE_12_HACKATHON — demo readiness report

**Label note:** owner-specified report label for the HackIndia 2026 submission package, **not** a product phase. Participant ID: **HI025038**. Event: HackIndia 2026.

## Verdict

**Overall verdict: PARTIAL.**

The interactive demo is ready and its golden path has a recorded rehearsal baseline, but the **jury package is incomplete**: no jury PDF exists in the repository (filesystem glob for `*.pdf` returned no files). Deployment is not live and licensing is blocked, so this is not a full submission-ready package. `Completed` would be false; `Blocked` would overstate the gaps because the demo itself works.

## Real vs simulated vs deferred

| Item | Classification | Notes |
|---|---|---|
| Canonical golden path ₹30,000 / 3 × ₹10,000 / ₹35,000 / +₹5,000 mismatch | VERIFIED (fixture) | `src/components/ContractStory.tsx:5–9`; separate from the ₹50,000 in-app workflow constant |
| Guest demo entry at `/demo` | VERIFIED | No account or wallet required |
| Judge rehearsal `npm run rehearse:judge` | VERIFIED (M5) | PASS, pages=30/30, roles=5/5, 53.747 s, exit 0; artifact `docs/rehearsals/latest.json` present |
| Demo rehearsal `npm run rehearse:demo` | VERIFIED (Phase 7 closeout) | 3/3 personas: owner, legal_reviewer, technical_auditor; not re-run in M5 |
| Rendered-UI evidence gate | VERIFIED (Phase 7 closeout) | 10/10 OK, 12 PNGs, 320/768/1024/1440, light/dark, reduced motion; heuristic keyboard only; not re-run in M5 |
| Honest simulation labels in the UI | VERIFIED | Tamper score and Sepolia records labelled simulated; no hardcoded 74 in the live path |
| Deterministic extraction, document generation, Sepolia records | SIMULATED | Fixtures only; no live provider, no wallet, no transaction |
| Jury PDF / written submission document | DEFERRED — DOES NOT EXIST | No `.pdf` file in the repository; not fabricated for this report |
| Live demo URL / deployed preview | DEFERRED / BLOCKED | No live deploy; no URL claimed |
| License grant | DEFERRED / BLOCKED | Proposal only; no MIT assertion |

## Evidence

- M5 rehearse:judge PASS (pages=30/30, roles=5/5, 53.747 s, exit 0); demo rehearsal and rendered-UI results are Phase 7 closeout evidence (`docs/PHASE7_CLOSEOUT_REPORT.md` §3 R3.1 / §8.3 / §10), not re-run in M5.
- `docs/rehearsals/latest.json` and `docs/rehearsals/final-checklist.json` exist (filesystem glob confirmed).
- `src/components/ContractStory.tsx:5–9` holds the canonical amounts (per closeout report §10).
- Filesystem glob for `**/*.pdf` returned **no files** — the jury package PDF is absent. This is stated honestly rather than invented.
- README's product-film section points to real media (`public/film/legalx.mp4`, `poster.jpg`, `legalx.vtt`, `legalx.en.vtt`); rights are UNVERIFIED per `docs/MEDIA_PROVENANCE.md`.

## Limitations

- A rehearsal pass is not a jury-submission guarantee. No formal submission confirmation is recorded.
- No live deployment, no public URL, and no production database.
- Rehearsals use a hardcoded output path; no repo file was changed by them.
- The five-role switcher is a local demo construct, not authentication.
- No blockchain transaction or on-chain evidence exists.
- Licensing and media provenance remain unresolved.

## Verification status (M5 complete; owner items Pending)

1. M5 `npm run rehearse:judge`: PASS, pages=30/30, roles=5/5, 53.747 s, exit 0. `rehearse:demo` remains Phase 7 closeout evidence (3/3 personas).
2. Decide whether to author a jury PDF; do not claim one exists until created and verified.
3. Resolve licensing/media consent before any public distribution.
4. If a live preview is authorized, capture a health/smoke result before citing any URL (blocked: no owner-provided `DATABASE_URL`).
5. R7 Git delivery: **Pending** — scoped commit/push not yet performed (see master report).

Related: [demo guide](../DEMO_GUIDE.md), [rehearsal record](../rehearsals/latest.json), [master report](FINAL_MASTER_REPORT.md).
