# TEAM_COORDINATION.md — LEGALX, four-member team

> **Status: planning artefact.** Nothing in this document has been agreed with the four members directly —
> this assistant can only produce instructions for the project lead to distribute. Items marked
> **[PROPOSED]** need a yes/no from Nidhi; items marked **[ESTIMATE]** are not commitments.
> Companion documents: `docs/EXECUTION_PLAN.md` (what to build), `docs/API_CONTRACTS.md` (the shared boundary),
> `docs/DAILY_PROGRESS_TEMPLATE.md` (the reporting unit), `docs/PROJECT_STATUS.md` (current truth).

---

## 1. Who is accountable for what

One accountable owner per task. "Support" means reviews, pairs, or produces fixtures — never co-authorship of
the same file at the same time.

| Member | Accountable for | Supports | Does not touch |
|---|---|---|---|
| **Nidhi** — Project Lead, Agreement Intelligence & Integration | Contract IR schema + deterministic deriver (P0-06), parity engine (P0-07), cross-module integration, product decisions, final approval authority | Sam on error codes + policy port; Iffa on IR/parity UI contracts; Arati on AC wording | Migration files, auth internals (reviews only) |
| **Sam** — Backend & Security | FastAPI architecture, PostgreSQL schema + every migration, auth/authz (P0-03), agreements/parties/milestones (P0-04), versions/hashing/approvals (P0-05), execution gate (P0-08), repo restructure P0-01 | Nidhi on parity persistence; reviews every frontend PR that calls the API | React component internals (reviews only) |
| **Iffa** — Frontend & Product Experience | P0-02 (least-privilege RBAC fix), frontend integration to the real API (P0-10), agreement/review/IR/parity screens, responsive + a11y, frontend regression checks, P0-12 | Sam on `/me`-driven UI; reviews the UX consequences of every API error shape | `api/**`, any SQL, any migration |
| **Arati** — Workflow & Quality | Agreement workflow spec, review/approval acceptance criteria, manual + automated test cases, bug reproduction, regression runs, independent verification of every P0 AC (P0-09, P0-11) | Everyone, by verifying their ACs; writes the E2E spec | Source fixes — she reports, she does not patch another owner's code without that owner's agreement |

**Integration responsibility (explicit, per the brief's rule):** every task that spans two owners names one
integration owner. Nidhi owns integration end-to-end; the concrete pairs are:

| Boundary | Integration owner | Because |
|---|---|---|
| TS permission table → Python permission table | **Sam** | he must prove the port reproduces the 5×15 grid byte-for-byte |
| IR schema (Nidhi) → parity persistence (Sam) | **Nidhi** | one author of the comparison contract |
| API error shapes → UI error states | **Iffa** | she renders them; Sam must not "helpfully" reshape errors later |
| Approval semantics → E2E assertions | **Arati** | the test is the only proof the flow exists |

### 1.1 Skill gaps and the bounded task that closes each [PROPOSED]

Skills were stated by the lead; these are the gaps the plan assumes, each paired with a **timeboxed** task, not
a course.

| Member | Assumed gap | Bounded task | Timebox |
|---|---|---|---|
| Sam | Server-side session cookies + CSRF are easy to misconfigure; no Postgres has been proven reachable in this repo | Build `GET /api/health` and **one** working `POST /auth/session` + `GET /me` before touching the 75-cell matrix | end of D2 |
| Iffa | No experience editing a policy module with a snapshot test; Playwright selectors | Own P0-02 as the first task — it is small, high-value, and teaches the matrix test pattern | 3 h |
| Arati | Playwright is **not installed** in this repo and she has not written E2E before | Pair with Iffa for the first spec (personas + nav, ~40 lines) before owning P0-11 | 4 h paired |
| Nidhi | Deterministic derivation is a different discipline from prompt engineering — the temptation is to reach for the model | Derive IR from structured rows only; the P0 path must contain no model call | enforced by test |

---

## 2. Ownership boundaries (file level)

| Path | Owner | Others |
|---|---|---|
| `web/src/**` | Iffa | Sam/Nidhi may review; changes require Iffa's agreement in the PR |
| `web/src/lib/rbac.ts`, `web/src/lib/api.ts`, `web/src/lib/types/api.ts` | Iffa | Sam co-reviews (they encode the server contract) |
| `web/tests/**` | Arati (specs), Iffa (runner config) | — |
| `api/app/**` | Sam | Nidhi owns `api/app/ir/*` and `api/app/parity/compare.py` **content**; Sam owns their imports, tables, routers |
| `api/migrations/**` | **Sam only** | nobody else writes a migration |
| `api/openapi.yaml` | Sam | Nidhi co-approves shape changes |
| `docs/EXECUTION_PLAN.md`, `docs/PROJECT_STATUS.md` | Nidhi | others propose, do not edit |
| `docs/API_CONTRACTS.md` | Sam | Nidhi co-approves |
| `docs/audit/**` | **frozen** | nobody edits; they are evidence |
| `docs/FINAL_ACCEPTANCE_AUDIT.md` | **frozen** | pre-existing; never modified |
| `.github/workflows/**` | Sam | — |

**Two-people-one-file rule.** If two tasks list the same file, the second task is blocked until the first merges.
Current collisions to watch: `web/src/App.tsx` (P0-03 and P0-10 and P0-12) and `api/app/versions.py` (P0-05 and
P0-09). Both are sequenced in the plan; if the schedule slips, the later task waits rather than branching twice.

---

## 3. Communication protocol [PROPOSED]

There is no chat integration in this environment. Everything below is something **Nidhi distributes and
collects**; nothing here is automated.

| Channel | Purpose | Cadence |
|---|---|---|
| Daily report (template §1 of `DAILY_PROGRESS_TEMPLATE.md`) | one per member per working day | end of each working day |
| PR description | the technical record: what, why, evidence | per PR |
| `docs/PROGRESS.md` | the consolidated day log, newest at the bottom | one entry per day, appended by Nidhi from the four reports |
| Blocker escalation | §5 | as it happens |
| Decision log | `docs/PROJECT_STATUS.md` §7 | when a decision is made |

**Where a daily report goes:** a comment on the member's open PR if one exists; otherwise a block appended to
`docs/PROGRESS.md`. Do not create a file per person per day — 4 × 13 days is noise, not a record.

**Async-first.** A question that blocks someone for more than 2 hours becomes an escalation, not a message
that waits. Nobody waits silently for a day.

---

## 4. Daily reporting format

Every member, every working day, nine fields, exactly the template:

`Completed today · Evidence · Currently working on · Files changed · Tests executed and results · Blockers ·
Help required · Tomorrow's deliverable · Estimated hours remaining`

**Evidence means evidence.** A claim of "done" without one of: a commit SHA, a PR link, a screenshot path, or
pasted command output — is not done. "Tests pass" without the command and its output is not evidence.

**Rule for the lead:** do not carry a task as done in `docs/PROJECT_STATUS.md` on the strength of a message.
Carry it as done when the evidence artifact exists and someone else reproduced it.

---

## 5. Blocker escalation

| Level | Who | Trigger | Expected action | Timebox [PROPOSED] |
|---|---|---|---|---|
| **L1 — self** | the owner | stuck | re-read the AC, reproduce in isolation, check the contract doc | 2 h |
| **L2 — peer** | owner + the other owner of the boundary | contract ambiguity or a shared file | resolve and write the resolution into the PR | same day |
| **L3 — lead** | Nidhi | scope, priority, deadline, or a decision only the lead can make | decide or descope; record in `docs/PROJECT_STATUS.md` §7 | next working day |
| **L4 — stop** | Nidhi | a required external thing is unavailable (Postgres, hosting, Playwright install approval), or a Git safety control blocks an operation | report the exact error and stop; never bypass | immediately |

**Hard stops that must never be worked around:** a denied permission, a failing Git safety check, a missing
credential, a `git push --force`, anything touching `main` directly, anything touching the legacy/upstream
remotes or the `backup/pre-lexora` branch.

**Silent-failure rule.** If a task cannot meet its AC, it is reported as `Blocked` or `Unverified` — never as
`Completed with caveats`. The audit's core finding was that the app claimed things it had not computed; the
process must not repeat that in the project plan.

---

## 6. Integration schedule

Derived from `EXECUTION_PLAN.md` §13.3; repeated here as the coordination view. Availability is an
**[ESTIMATE]** (Nidhi 10–14 h/wk, Sam 10–15, Iffa 15–20, Arati 5–10) pending confirmation.

| Gate | When | Who must deliver | Who verifies | What "green" means |
|---|---|---|---|---|
| **G0** — plan approved | D1 | Nidhi | — | N-01…N-05 answered; Arati's hours confirmed |
| **G1** — P0-02 evidence | D1 | Iffa | Sam | 5 evidence items (matrix before/after, snapshot check, browser shots, PR diff disclosure) |
| **G2** — restructure done | D2 | Sam | Arati | `web/` + `api/` build; `/api/health` 200; file-hash parity table |
| **G3** — one real session | D2 | Sam | Arati | sign-in sets a cookie; `/me` returns the owner's permissions |
| **G4** — server matrix | D3 | Sam | Arati | 75/75 cells enforced server-side; `rg "legalx:role" web/src` → 0 |
| **G5** — persisted agreement | D5 | Sam + Iffa | Arati | create ₹50 000 → reload → second browser sees it |
| **G6** — real hash + per-party approval | D6 | Sam + Iffa | Nidhi | one char changes the hash; both parties' approvals recorded separately |
| **G7** — tamper detected + blocked | D8 | Nidhi + Sam | Arati | ₹50 000 → ₹5 000 produces critical rows **and** `409 PARITY_BLOCKED` |
| **G8** — E2E green | Sprint 3 | Arati | Iffa | one spec covers D1–D10 |
| **G9** — freeze | 2026-12-01 | Nidhi | all | §14 of the plan, all 8 criteria |

**Integration rule:** nobody starts a task whose dependency gate is not green. The temptation on a 13-weekday
deadline is to parallelise across an unmerged dependency and "merge later"; that is how the demo ends up with
two incompatible permission tables.

---

## 7. Review responsibilities

| PR author | Required reviewer | Second look | Notes |
|---|---|---|---|
| Iffa | Sam | Nidhi for anything touching IR/parity copy | Sam checks the API boundary; Nidhi checks the legal meaning of what is on screen |
| Sam | Iffa (frontend impact) + Nidhi (contract) | Arati verifies ACs | no Sam PR merges on Sam's own review |
| Nidhi | Sam | Arati verifies ACs | parity/IR changes are reviewed by the person who has to store and serve them |
| Arati (tests) | Iffa | Sam for API assertions | a test that only asserts a fixture is rejected |

**Every PR must contain, in the description:**

1. the task ID and the AC numbers it claims to satisfy;
2. the exact commands run and their output (pasted, not paraphrased);
3. the diff summary (`git diff --stat`) and confirmation that no unrelated file changed;
4. a secrets check: `git diff --cached | rg -i "api[_-]?key|secret|password|token"` reviewed line by line;
5. for UI work: before/after screenshots at 1440×900 and 390×844.

**A reviewer may not approve a PR whose AC evidence they cannot reproduce.** If a command cannot be run in the
reviewer's environment, the item is `Unverified`, and `Unverified` does not merge into `main` unless the lead
accepts it in writing in `docs/PROJECT_STATUS.md` §7.

---

## 8. Conflict resolution

1. **The document wins.** `docs/API_CONTRACTS.md` for the boundary, `docs/EXECUTION_PLAN.md` for scope, the AC
   list for "done". A verbal agreement that contradicts a document is not an agreement.
2. **Owner of the file wins on implementation detail** (naming, structure) within the agreed contract.
3. **Nidhi wins on product/legal meaning** — but the decision is written down with its reason, not just applied.
4. **If two legitimate readings of an AC exist, stop and narrow the AC** rather than shipping one reading. Write
   the narrowed AC into the PR and, if it changes FRS-level intent, into `docs/PROJECT_STATUS.md` §7.
5. **Escalation of last resort:** descope. On this deadline, "we cut P0-09 and say so" beats "we shipped an
   approval flow nobody tested".
6. **Never resolve a disagreement by weakening a test.** Deleting an assertion to make a PR green is the one
   failure mode this project already suffered from (`TEST_REPORT.md`).

---

## 9. Git workflow

### 9.1 Branches (one per task, from `main`)

| Branch | Task | Owner |
|---|---|---|
| `fix/p0-02-owner-parity-access` | P0-02 | Iffa |
| `feat/backend-foundation` | P0-01 | Sam |
| `feat/auth-authorization` | P0-03 | Sam |
| `feat/agreements` | P0-04 | Sam |
| `feat/agreement-versioning` | P0-05 | Sam |
| `feat/contract-ir` | P0-06 | Nidhi |
| `feat/parity-engine` | P0-07 | Nidhi |
| `feat/verification-gate` | P0-08 | Sam |
| `feat/frontend-integration` | P0-10, P0-12 | Iffa |
| `test/agreement-workflows` | P0-09, P0-11 | Arati |

### 9.2 Per-PR sequence (mandatory order)

1. `git status` — read it, do not assume it is clean.
2. `git fetch origin` → `git log --oneline HEAD..origin/main` — know what you are behind by.
3. `git switch -c <branch> origin/main` (or `git switch <branch>` + `git rebase origin/main` if it already
   exists and is yours).
4. Implement **only the assigned task**.
5. Run the task's required checks; paste the output.
6. `git diff` — read the whole thing before staging.
7. `git status --short` — no stray files, no `.env`, no `dist/`, no editor junk.
8. Stage explicitly (`git add <paths>`), never `git add -A` on a repo with four people.
9. Commit: `<type>(<scope>): <imperative summary>` then a body with the task ID + AC numbers.
10. `git push -u origin <branch>`.
11. Open the PR against `main` with the §7 checklist.
12. **Do not merge.** Merging requires the reviewer's approval **and** Nidhi's approval.

### 9.3 Hard prohibitions (non-negotiable)

- Never push to `main`. Never force-push. Never rebase/rewrite a branch that is not yours.
- Never delete `backup/pre-lexora`. Never touch the legacy or upstream remotes.
- Never `git reset --hard`, `git clean -fd`, or `git checkout --` over another member's work.
- Never commit `.env`, credentials, tokens, keys, or `node_modules`.
- Never commit planning-only work (`docs/EXECUTION_PLAN.md`, this file, the template, the contracts, the status
  file) unless Nidhi explicitly approves that commit.
- If a Git operation fails: report the exact error and stop. Bypassing a safety control is a firer.

### 9.4 Repo state warning specific to this project

The working copy is inside **OneDrive**. A sync client and a `git mv` of 59 files do not mix. P0-01 must
either pause OneDrive synchronisation or be performed in a `git worktree` outside the synced folder, and must
verify `git status` before and after every move batch. This is a real, observed hazard — file moves on a synced
folder can produce partial states that look like deletions.

---

## 10. Shared development standards

Adopted now so four people produce one codebase. **[PROPOSED]** where a tool would be needed.

| Area | Standard | Status |
|---|---|---|
| Language | TypeScript strict (`tsconfig`) frontend, Python 3.11+ with type annotations backend | existing config |
| Type safety | no `any` at an API boundary; response types come from `web/src/lib/types/api.ts` | new rule |
| Money | integer minor units + ISO-4217 everywhere; floats rejected | new rule |
| Time | ISO-8601 UTC on the wire; `YYYY-MM-DD` only for legal dates | new rule |
| Validation | server authoritative; client mirrors only for inline UX | new rule |
| Errors | the single envelope in `API_CONTRACTS.md` §1.5; no ad-hoc `{message}` shapes | new rule |
| Auth | server sessions only; no tokens in `localStorage`; no client-side role as authority | decision D-02 |
| Crypto | `argon2-cffi` for passwords, `hashlib.sha256` for content hashes, `secrets` for tokens. Nothing else | decision D-02 |
| Persistence | every table has a migration; no `create_all()` at import; migrations reviewed by Sam | new rule |
| React | function components, hooks; no new global state library; existing `src/App.tsx` split is allowed **only** as part of an assigned task | new rule |
| Styling | existing Tailwind/utility usage; no new design system or component library | new rule |
| Accessibility | every interactive control has an accessible name; visible focus; keyboard reachable; contrast checked | existing audit gap |
| Labels | every simulated surface says `SIMULATED` / `DEMO`; nothing claims to compute what it does not | audit requirement |
| Tests | a test must be able to fail; no assertions on our own fixture constants; no self-referential checks | `TEST_REPORT.md` |
| Commits | conventional-ish `<type>(<scope>): summary`; body names task ID + ACs | new rule |
| Dependencies | **no new dependency without lead approval.** Known future asks: Playwright (P0-11), `argon2-cffi`, `asyncpg`/`sqlalchemy`, `pytest`, `httpx` | pending |
| Formatting/lint | the repo has **no linter or formatter configured** (`package.json` has none). Do not add one mid-sprint; match surrounding style | recorded limitation |
| Secrets | `.env.example` only; real values live outside the repo; `rg` check before every push | existing rule |
| Docs | `docs/audit/**` frozen; new docs live in `docs/` and never overwrite an audit file | existing rule |

### 10.1 Existing commands (verified present in `package.json`)

```
npm run dev          # vite --host 0.0.0.0 --port 3000
npm run build        # vite build
npm test             # 4 node scripts (test-demo, test-rbac, test-resilience, test-workflows)
npm run rehearse:demo
npm run rehearse:judge
npx tsc --noEmit     # typescript is a dependency; there is no dedicated script
```

There is **no** lint script, **no** formatter script, and **no** Playwright installed. Anything a plan step
requires beyond this list is a dependency request, not a given.

---

## 11. What the lead must do, day one

1. Distribute §1, §2 and §9 to each member (this assistant cannot message them).
2. Confirm the four availability estimates, especially Arati's — it decides §13.5 of the execution plan.
3. Answer N-01…N-05 (route-map data model, retirement of `audit:view`, approval policy, freeze-on-first-approval,
   demo tamper endpoint).
4. Confirm the Postgres availability story (Supabase project vs Docker) — nothing in P0-03 onwards is real without it.
5. Approve or refuse the dependency list: Playwright, `argon2-cffi`, `pytest`/`httpx`, Postgres driver/ORM.
6. Hand Iffa the P0-02 task card verbatim.
