# Contributing to LEGALX

## Development Workflow

1. **Pull the latest main** before starting work.
   ```powershell
   git pull origin main
   ```

2. **Create a task-specific feature branch** from main.
   ```powershell
   git checkout -b feat/<task-description> main
   # or
   git checkout -b fix/<task-description> main
   ```

3. **Implement only the assigned task.** Edit only files assigned to that task. No two people should edit the same critical files concurrently without coordination.

4. **Run tests and checks.**
   - `npm --prefix web run build` — frontend build
   - `npx tsc --noEmit` — TypeScript check
   - `npm test` — existing frontend tests
   - `pytest api/tests -q` — backend health check
   - `node web/tests/rbac-matrix.mjs` — RBAC matrix (P0-02)
   - `node web/tests/rbac-matrix.mjs --check` — snapshot diff

5. **Update the individual progress log** (`docs/progress/<NAME>.md`).
   Record: date, task ID, work completed, current work, files changed, test results, commit SHA, PR link, blockers, next deliverable, estimated remaining effort.

6. **Commit with a meaningful message.**
   ```powershell
   git commit -m "feat: implement P0-03 server sessions (auth + CSRF + RBAC consumption)"
   ```

7. **Push the feature branch.**
   ```powershell
   git push -u origin feat/<task-description>
   ```

8. **Open a Pull Request against main.**
   - Use the `.github/pull_request_template.md` format
   - Include task ID, summary, files changed, tests, screenshots/evidence, blockers
   - Request review from the designated reviewer
   - Wait for approval and passing checks before merging

9. **Synchronize the local branch after merge.**
   ```powershell
   git checkout main
   git pull origin main
   git checkout -b <new-branch> main
   ```

## Branch Rules

- **No direct pushes to main.** Use feature branches and PRs.
- **No force pushes.** Ever.
- **No history rewrites.** Never `rebase` or `reset --shared` on shared branches.
- **No shared working branches.** Each person works on their own feature branch.
- **Branch naming convention:**
  - `feat/nidhi-contract-ir`
  - `feat/sam-auth-foundation`
  - `fix/iffa-p0-02-owner-parity-access`
  - `test/arati-workflow-regression`

## Code Ownership

- **Sam owns database migrations.** Only one person should author a migration at a time.
- **API contract changes** require agreement between the relevant frontend and backend owners (Iffa + Sam).
- **Nidhi coordinates** cross-module decisions (architecture, scope, deadline).
- **Reviewers** are assigned per PR based on file ownership.

## Secret Handling

- **Never commit `.env` files, credentials, tokens, or private keys.**
- `.env*` are listed in `.gitignore` and are untracked by design.
- `.env.example` contains placeholder names only — never real values.
- Pre-push secret check: `gitleaks detect --source . --redact -v` should pass.

## Merge Requirements

- PR must have **at least one approved review** from a designated reviewer.
- All **required checks must pass** (CI, test suite, lint/typecheck).
- No **conflicts** with main or other in-flight branches.
- **No unrelated changes** — the PR must focus on the assigned task only.

## Getting Help

- Report blockers in the PR description or as a discussion.
- Ask Nidhi for coordination on cross-module decisions.
- Reference the relevant task ID (`P0-02`, `P0-03`, etc.) in all communication.