# DAILY_PROGRESS_TEMPLATE.md

> **Status: planning artefact.** This is the reporting template defined by the project brief. It is not yet in
> use — no daily reports exist. Copy the block below per member, per working day.
>
> **Where it goes:** as a comment on your open PR; if you have no open PR that day, append it to the end of
> `docs/PROGRESS.md` (newest at the bottom) and tell the lead you did.
>
> **Who reads it:** Nidhi consolidates the four reports into `docs/PROJECT_STATUS.md` at the end of the day.
> A task is not "done" in that file until its evidence here can be reproduced by someone else.

---

## 1. The template

```markdown
### Daily report — <Member> — <YYYY-MM-DD>

**Task ID(s):** <e.g. P0-05>  ·  **Branch:** <e.g. feat/agreement-versioning>

1. **Completed today**
   - <what is actually finished, in the past tense; one line per item>
2. **Evidence**
   - <commit SHA(s)> · <PR link> · <screenshot path> · <pasted command output>
   - *(if there is no artifact, write "none — item is not complete")*
3. **Currently working on**
   - <the one thing in progress right now, and how far through it is>
4. **Files changed**
   - `<path>` — <what changed, one line>
5. **Tests executed and results**
   - `<exact command>` → <exact result, e.g. "exit 0, 75 passed", "exit 1, 3 failed">
   - *(commands not run must be listed as "not run — <reason>", never omitted)*
6. **Blockers**
   - <blocker> — <who/what it needs> — <since when> — <L1/L2/L3/L4 per TEAM_COORDINATION §5>
   - *(or "none")*
7. **Help required**
   - <specific ask of a named person; "pair for 30 min on X" beats "stuck on auth">
8. **Tomorrow's deliverable**
   - <one concrete artifact, with the AC it satisfies>
9. **Estimated hours remaining**
   - <number> h on <task ID>; <number> h of the week's estimate already used
```

Rules that make the report useful:

- **Field 5 is a command and its output, not an adjective.** "tests pass" is not a report.
- **Field 9 is an estimate, not a commitment.** It is used to re-plan, not to hold anyone to a number.
- Reports are written **before** signing off, not the next morning, so the blocker in field 6 is still live.
- Nothing confidential goes in a report: no `.env` values, no keys, no personal data of anyone outside the team.

---

## 2. Illustrative worked example (not real — do not cite as evidence)

```markdown
### Daily report — Sam — 2026-11-16

**Task ID(s):** P0-03  ·  **Branch:** feat/auth-authorization

1. **Completed today**
   - FastAPI app serving `GET /api/health`; DB reachability reflected in the response.
   - `POST /api/v1/auth/session` issues `lx_session` (HttpOnly, SameSite=Lax) and returns permissions.
2. **Evidence**
   - commit `a1b2c3d` · PR #14
   - `curl -i -X POST localhost:8000/api/v1/auth/session -d '{"email":"owner@legalx.demo",...}'` →
     `HTTP/1.1 200`, `set-cookie: lx_session=…; HttpOnly; Path=/; SameSite=Lax`
   - `GET /me` with the cookie → `200`, `permissions` contains `ir:read`
3. **Currently working on**
   - `require(permission)` dependency; ~60% done, the 403 path is untested.
4. **Files changed**
   - `api/app/auth.py` — session creation, token hashing, cookie flags
   - `api/app/routers/auth.py` — `POST /auth/session`, `DELETE /auth/session`
   - `api/tests/test_auth.py` — 6 tests
5. **Tests executed and results**
   - `pytest api/tests/test_auth.py -q` → exit 0, 6 passed
   - `npm --prefix web run build` → not run — no frontend change today
6. **Blockers**
   - Postgres not reachable from my machine (`psql` not on PATH, Docker daemon state unknown) — L4, needs the
     lead to confirm Supabase vs Docker before D4.
7. **Help required**
   - Nidhi: confirm the Postgres decision, 5 minutes.
8. **Tomorrow's deliverable**
   - 75-cell server matrix passing (`tests/test_rbac_matrix.py`), satisfying P0-03 AC 3.
9. **Estimated hours remaining**
   - 14 h on P0-03; ~4 h of this week's estimate used.
```

---

## 3. Lead consolidation (end of day, one block per day)

Nidhi appends to `docs/PROJECT_STATUS.md`:

```markdown
### <YYYY-MM-DD>
| Member | Reported | Verified | Status | Note |
|---|---|---|---|---|
| Nidhi | <one line> | <what she reproduced herself> | On track / At risk / Blocked | |
| Sam | | | | |
| Iffa | | | | |
| Arati | | | | |

Gates: <G1..G9 status>  ·  Escalations opened: <id>  ·  Decisions needed: <N-xx>
```

**"Verified"** means the lead or another member reproduced the evidence. A report with no reproducible evidence
stays `Unverified` in that column — and `Unverified` is not `Completed`.

---

## 4. Weekly roll-up (only if the week has a gate)

```markdown
### Week of <date>
- Gates passed: <G-numbers> — evidence links
- Gates missed: <G-numbers> — cause, recovery date, what is cut
- Estimate vs actual: <hours planned> / <hours reported>
- Capacity risk: <member> at <n>% of stated estimate
- Scope changes approved by the lead: <none | list with reason>
```
