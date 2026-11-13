# LEGALX — PROJECT OVERVIEW

## Problem

Legal professionals and independent contractors need a structured, deterministic way to manage legal agreements from creation through execution, with verifiable integrity checks and clear approval trails. Today, agreement management relies on fragmented tools (email, shared drives, local files), leading to:

- No single source of truth for agreement terms
- Inability to detect term changes after approval
- No deterministic comparison between approved and executed versions
- Lack of transparent audit trails for version changes
- Manual, error-prone workflow for multi-party approvals

Target users: solo practitioners, small legal teams, freelancers, and contract-oriented businesses that need to manage bilateral agreements with milestones, payment conditions, and version control.

## What LEGALX Does

LEGALX is a web-based agreement management platform that captures the full lifecycle of a legal agreement:

1. **Agreement creation** — structured form capturing parties, milestones, payment conditions
2. **Contract IR (Intermediate Representation)** — deterministic derivation from the approved version with field-level provenance
3. **Deterministic parity engine** — field-by-field comparison of approved IR against execution parameters, producing a reproducible result hash (no scores, no hard-coded messages)
4. **Version-bound approval flow** — per-party approvals recorded independently; text immutable after first approval; execution blocked if any required party has not approved
5. **Verification and execution gate** — verification runs are recorded per version; release of milestones is refused unless a passing verification exists for the exact current version with all required approvals
6. **Simulated blockchain execution** — deterministic execution environment without real funds or wallet integration
7. **Gemini-powered extraction** — behind a feature flag with explicit document-data consent; advisory only, never approves or authorizes

## Why It Is Different from a Generic Legal Chatbot

A generic legal chatbot typically provides one-off answers or document summarisation without lifecycle management. LEGALX differs in:

- **Deterministic integrity**: every agreement version has a server-computed SHA-256 hash; any content change produces a different hash, detectable even after approval
- **Version-bound approvals**: approvals are per-party and per-version; the system will not authorise execution if the approved terms have changed
- **Parity enforcement**: the core claim is proven by field-by-field comparison; a tampering scenario (₹50,000 → ₹5,000) is detected and execution is blocked
- **Audit trail**: every approval, verification run, and execution attempt is recorded with actor, timestamp, and hash
- **Feature-flagged AI**: Gemini is explicitly behind a consent gate and never has approval or execution authority

## Complete Product Workflow

```
1. Create agreement → 2 parties captured (client + provider) + milestones with amounts + payment conditions
2. Validate agreement → schema rejects: missing parties, amount mismatch, invalid review period, unknown currency, enum violations
3. Derive Contract IR → deterministic derivation from structured agreement rows; IR includes provenance pointing at real text offsets
4. Approve version → owner initiates; each required party (client + provider) must approve; text freezes on first approval
5. Derive execution parameters → server-side canonicalisation + SHA-256 hash; stored independently from approved version
6. Compute parity → field-by-field comparison of approved IR against execution parameters; result hash reproducible; no score, no hard-coded message
7. Verify → verification run recorded; passing verification required before milestone release
8. Release milestone → refused with PARITY_BLOCKED if verification fails or approvals incomplete; critical rows name the mismatching fields
9. Tamper detection → changing a monetary value from ₹50,000 to ₹5,000 produces critical parity rows naming total_amount_minor; execution blocked; re-verification after restore succeeds
```

## System Architecture

```
Frontend (React 19 + Vite 8 SPA)
  - src/App.tsx (37 components, 110 physical lines)
  - src/rbac.rbac (5 roles, 15 app routes, permission matrix)
  - 15 localStorage keys (profile, settings, role, AI draft/parsed, milestones, etc.)
  - Honest simulation disclosures throughout ("SIMULATED", "not live AI", "seeded demo fixture")

Backend (FastAPI + PostgreSQL)
  - FastAPI app with server-managed sessions (HttpOnly, SameSite=Lax cookie named lx_session)
  - CSRF protection: X-CSRF-Token on every non-GET request
  - Argon2id password hashing (library defaults, per-password salt, ≤5 attempts/15 min/(email,IP))
  - PostgreSQL 16 via Docker (JSONB columns, triggers for version immutability, integer money columns)
  - async SQLAlchemy 2.x + asyncpg driver
  - Alembic-free migration strategy: plain numbered .sql files (0003_agreements.sql … 0007_verification.sql)
  - 15+ API endpoints under /api/v1 (health, auth, me, agreements, versions, IR, parity, verification, execution, activity)
  - Error envelope: {"error":{code,message,details[{field,code,message}],request_id}}
  - Single-origin in production (FastAPI serves web/dist; dev uses Vite proxy)

Authorization Model (least-privilege, D-01)
  - 5 roles: owner, freelancer, legal_reviewer, org_admin, technical_auditor
  - 15 app routes with data-driven any-of permission checks
  - Resource-scoped read perms: ir:read, verification:read, activity:read, audit:read_global
  - Owner gains /app/contract-ir and /app/parity access (previously 403)
  - No broad audit:view; system-wide audit logs by audit:read_global only

Database (PostgreSQL)
  - Tables: users, sessions, organizations, memberships, agreements, agreement_parties, milestones, agreement_versions, version_approvals, ir_documents, execution_parameters, parity_runs, verification_runs, activity_events
  - Unique constraint on (version_id, party_role) in version_approvals
  - DB trigger blocks UPDATE/DELETE on agreement_versions with any approvals
  - Integer money columns (₹50,000 = 5000000 paise); no float columns
  - UUID v4 primary keys; uuid5 deterministic seed ids for demo data

Deterministic Contract IR
  - Schema versioned; derived from approved version only
  - Fields: schema_version, agreement_id, version_id, agreement_type, currency, total_amount_minor,
    parties[{role,name,email}], milestones[{seq,name,amount_minor,due_date,acceptance_criteria}],
    review_period_days, review_period_basis(calendar|business), dispute_behavior, governing_law?,
    provenance[{field, source_span:{start,end}}]
  - Canonicalisation: CRLF→LF, strip per-line trailing whitespace, NFC normalize, sha256(utf-8), 64 lowercase hex
  - Server-side only; original text stored unmodified

Demo Scenario (the judged climax)

- Create a ₹50,000 agreement with 2 milestones
- Extract payment and milestone conditions
- Validate the structured Contract IR
- Review and approve a specific agreement version (both parties)
- Generate executable parameters from the approved terms
- Attempt to change ₹50,000 to ₹5,000
- Detect the mismatch (critical parity rows: total_amount_minor, milestone_sum)
- Block execution (PARITY_BLOCKED with field names)
- Require re-approval and re-verification
- Record the change and verification event

What Is Simulated vs Actually Implemented

| Component | Status |
|---|---|
| React SPA UI | Fully implemented (37 components, navigable) |
| FastAPI backend scaffold | Scaffold designed; dependencies pinned; Postgres Docker verified |
| PostgreSQL with triggers | Designed; Docker daemon running, port 5432 free |
| Server sessions + CSRF | Designed (cookie flags, token rotation, constant-time compare) |
| Argon2id password hashing | Designed (library, policy, no custom crypto) |
| Contract IR schema + derivation | Schema designed; derivation from structured rows |
| Deterministic parity engine | Comparison table designed; no hard-coded score |
| Version approval flow | Policy designed (all_parties, freeze on first approval) |
| Gemini extraction | Feature flag (FEATURE_AI_EXTRACTION=false); advisory only |
| Simulated blockchain | No SDK, no real funds, no wallet; window.confirm + fake address |
| E2E demo gate (Playwright) | Not yet installed; required for P0-11 |
| Real authentication flow | Not yet implemented; planned for P0-03 |

## Product Roadmap and Remaining Work

| Phase | Target Completion | Key Deliverables |
|---|---|---|
| P0 — Foundation (weeks 1–2) | 2026-11-24 | RBAC fix, backend sessions, agreements + parties, versions + hashing, IR schema, parity engine, verification gate. Demo shows seeded agreement with real hash, approval, and blocked tamper scenario. |
| P1 — Polish & Demo (weeks 3–4) | 2026-12-01 | Full E2E demo gate (Playwright), two clean rehearsals, deployment package, submission materials, judged demo readiness. |
| P2 — Post-Competition | 2027 Q1 | Real blockchain integration, wallet SDK, file uploads/OCR, multi-tenant UI, Trust Passport, AI extraction beyond feature flag, production deployment. |

**Remaining work after P0:** full CRUD agreement builder, API integration across all screens, Playwright E2E tests, deployment hardening, demo rehearsal, submission material preparation.

**Demo criteria (D1–D10 from FINAL_TEAM_ASSIGNMENT.md):** each must be demonstrated and covered by P0-11 E2E spec.

**Note:** The product is not production-ready. It is a judged hackathon demo with a deployable working product and complete submission materials as the deadline (2026-12-01).