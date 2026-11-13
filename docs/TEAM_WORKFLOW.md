# LEGALX Team Workflow

## Daily Reporting

Each teammate updates their own progress file at the end of every working session.

**Required fields (record in `docs/progress/<NAME>.md`):**

1. **Date** — YYYY-MM-DD format
2. **Task ID** — the task being worked on (e.g., P0-02, P0-03)
3. **Work completed** — what was done this session; include evidence (commit SHA, PR link, test output, screenshot path)
4. **Current work** — what will be done in the next session
5. **Files changed** — list of file paths modified; be specific (e.g., `src/rbac.ts:31-37`, not just `src/rbac.ts`)
6. **Tests executed and actual results** — command + exact output; never claim a test passed without evidence
7. **Commit SHA** — full 40-char hash; or note if no commit was made
8. **PR link** — URL to the pull request; or note if no PR was opened
9. **Blockers** — any obstacles; be specific about what is needed to unblock
10. **Next deliverable** — the concrete item to complete in the next session
11. **Estimated remaining effort** — hours remaining, with caveats if unconfirmed

**Never let all four people edit one shared daily log.** Each person owns their own `docs/progress/<NAME>.md`.

## Central Dashboard

`PROJECT_STATUS.md` is the central project dashboard. It must be updated by Nidhi or a designated coordinator using evidence from individual logs and merged PRs.

A task is not completed just because someone says it is completed. Completion requires evidence (reproducible artifact, test output, screenshot, PR, commit).

## Task Ownership

Ensure the team task cards (`docs/TEAM_TASK_CARDS.md`) specify one accountable owner per task.

- **Nidhi:** Project leadership, Contract IR, agreement intelligence, AI extraction and cross-module integration.
- **Sam:** FastAPI, PostgreSQL, authentication, server-side authorization, versioning, hashing and verification.
- **Iffa:** Existing React application, API integration, Contract IR and parity UI, frontend regression.
- **Arati:** Workflow requirements, acceptance criteria, test plans, manual and automated regression, integration verification.

Dependencies must be explicit. No two people should edit the same critical files concurrently without coordination.

## Conflict Resolution

1. **File ownership** — Sam owns database migrations; API contract changes require Iffa + Sam agreement; Nidhi coordinates cross-module decisions.
2. **Merge conflicts** — resolve using `git merge` or `git rebase`; if uncertain, ask Nidhi. Never avoid a merge conflict or commit unresolved state.
3. **PR review disputes** — Nidhi makes the final decision if reviewers disagree.
4. **Availability conflicts** — Nidhi rebalances task ownership based on confirmed hours; the contingency in §13.5 of EXECUTION_PLAN.md applies.

## Integration Responsibilities

- **Backend→Frontend:** Sam ensures API contracts (`docs/API_CONTRACTS.md`) are implemented in `src/lib/api.ts` (Iffa). Any contract change requires both owners' agreement.
- **Frontend→Backend:** Iffa ensures `src/lib/types/api.ts` types match backend schemas. Any type change requires Sam's sign-off.
- **Database migrations:** Sam only. No other person creates or modifies migration files under `migrations/`.
- **RBAC matrix:** Sam maintains the canonical version in `src/rbac.ts`; Iffa consumes it. Any change to the permission matrix requires Sam+Nidhi coordination.
- **Version approval flow:** Sam implements; Nidhi reviews policy (N-03, N-04).

## How to Report Blockers

1. Add a blocker entry to your `docs/progress/<NAME>.md` progress file.
2. Add the blocker to `PROJECT_STATUS.md` §4 Blockers table (Nidhi or coordinator).
3. @-mention Nidhi in the PR description if the blocker requires immediate attention.
4. Do not code around a blocker — document it and wait for resolution.

## Synchronization After Merge

After a PR is merged to main:

1. Pull latest main: `git pull origin main`
2. Delete the merged feature branch: `git branch -d feat/<name>` (or `git branch -D <name>` for forced delete)
3. Create a new branch from main for the next task: `git checkout -b feat/<new-task> main`
4. Update `PROJECT_STATUS.md` if the merge changes phase, readiness, or task status.

## Repository Safety Rules (Never Do These)

- Never push directly to main.
- Never force-push.
- Never rewrite shared history (rebase on shared branches, reset --hard on tracked files you didn't create).
- Never delete `backup/pre-lexora` branch.
- Never modify legacy or upstream remotes.
- Never commit secrets, `.env` files, or credentials.
- Do not commit or push planning-only work unless the project lead explicitly approves it.
- Do not merge pull requests without the project lead's approval.
- Do not overwrite existing audit reports in `docs/audit/`.

## New Teammate Onboarding

A new teammate should be able to:

1. Clone the repository and understand the project from `docs/PROJECT_OVERVIEW.md`.
2. Locate their personal task card in `docs/TEAM_TASK_CARDS.md`.
3. Read their responsibilities in `docs/progress/<NAME>.md`.
4. Set up their environment using `docs/DEVELOPMENT_GUIDE.md`.
5. Create their first feature branch following the workflow above.
6. Submit a reviewable PR following the `.github/pull_request_template.md`.
7. Report progress daily in their own `docs/progress/<NAME>.md`.

Without needing a long explanation from Nidhi.