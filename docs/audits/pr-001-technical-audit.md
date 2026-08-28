# PR #1 Technical Audit — Sprint 0/1/2 Boundary

Status: blocking review before merge.

## Summary

PR #1 is no longer a Sprint 0-only change. It currently contains the foundation, authentication, most of Sprint 1 Agent Forge/Admin, and an initial Sprint 2 Task/Event/Outbox/Worker vertical slice. The work is useful, but it must be stabilized and re-scoped before more features are added.

## Sprint classification

### Sprint 0 — Foundations

- root pnpm workspace and lockfile
- Node/TypeScript configuration
- ESLint/Prettier
- `.env.example`
- API health endpoint and health test
- minimal React/Vite shell
- minimal worker package and deterministic worker test
- database health/migration scripts
- CI workflow
- repository instructions
- `docs/sprints/00-foundations.md`

### Authentication foundation

Authentication is a cross-cutting dependency introduced before Sprint 1:

- `db/migrations/001_auth.sql`
- `apps/api/src/modules/auth/**`
- `apps/api/src/scripts/bootstrap-admin.ts`
- authentication tests and configuration

Authentication should be treated as a prerequisite slice, not hidden inside Sprint 0.

### Sprint 1 — Office Admin / Agent Forge

- `db/migrations/002_office_agent_forge.sql`
- `apps/api/src/modules/admin/**`
- Agent/Office/Department lifecycle and repositories
- write gate
- Admin routes/tests
- `docs/sprints/01-office-admin-agent-forge.md`

### Sprint 2 — Task/Event/Queue initial slice

- `db/migrations/003_task_event_queue.sql`
- `apps/api/src/modules/tasks/**`
- `apps/worker/src/task-worker.ts`
- `apps/worker/src/postgres-task-worker.ts`
- task/worker tests

This is an initial slice only. It does not yet satisfy the full Task/Event Engine architecture.

## Blocking findings

### P0 — Refresh-token rotation is broken in the Postgres path

`AuthService.refresh()` currently calls `#createResult(user)`, which persists a new auth session. It then creates another replacement session from the returned refresh token and asks `rotateSession()` to insert it. Because `auth_session.refresh_token_hash` is unique, the second insert can collide with the session already created by `#createResult()`.

Required correction:

1. add a test that exercises refresh rotation semantics;
2. separate token/session construction from session persistence;
3. login persists one fresh session;
4. refresh atomically revokes the old session and inserts exactly one replacement session;
5. verify old refresh token cannot be reused.

### P1 — Agent relational ownership is not fully enforced by the database

The service checks that a department belongs to an Office when an agent is created, but the schema still permits invalid references through direct/future code paths:

- `agent.active_version_id` can reference an `agent_version` belonging to another agent;
- `department.lead_agent_id` can reference an agent from another Office;
- `agent.supervisor_agent_id` can reference an agent from another Office.

Required correction: add composite ownership constraints or deterministic repository validation plus database protection where practical. The database should reject cross-owner relationships rather than relying only on one service implementation.

### P1 — Current Task worker hides intermediate runtime states

`PostgresTaskJobRunner.run()` updates the task from `queued` directly to `completed` inside one transaction, then inserts `assigned`, `executing`, and `completed` events before commit.

This is not sufficient for the product rule that the visual Office reflects authoritative backend state. Other processes never observe durable `assigned`/`executing` task states during execution.

Required correction in Sprint 2:

- persist real lifecycle transitions at meaningful execution boundaries;
- emit/publish state changes through the outbox;
- ensure UI/SSE can observe authoritative intermediate states;
- preserve crash/retry/idempotency behavior.

### P1 — Sprint 2 enums diverge from the approved handoff

Current task priority uses:

- `low`
- `normal`
- `high`
- `critical`

Approved product design uses P0/P1/P2/P3/P4 semantics, including Opportunity priority.

Current status also omits planned states such as waiting dependency, waiting approval and blocked.

Before expanding Sprint 2, freeze one canonical enum contract in code/database/docs.

### P1 — CI is not currently verifiable

GitHub Actions is blocked at account billing level. This is external to the code, but PR #1 cannot be accepted until the quality gate actually runs.

Additionally, once Actions is unlocked, validate the pnpm/setup-node ordering. `setup-node` currently requests `cache: pnpm` before `pnpm/action-setup` installs pnpm, which may prevent cache initialization on a clean runner.

### P2 — PR/branch boundary is too broad

The branch is carrying multiple sprint scopes and is diverged from `main`. Do not add Sprint 3+ changes to this branch.

Recommended recovery:

1. stop feature additions on `sprint/00-foundations`;
2. fix P0/P1 blockers;
3. reconcile the single `main` CI bootstrap commit;
4. get CI green;
5. merge a stabilized baseline;
6. create a clean `sprint/02-task-event-engine` branch for remaining Task Engine work;
7. keep future sprints isolated by branch/PR.

## Important non-blocking findings

- The login route puts `bodyLimit` under Fastify `config`; confirm it is actually enforced as a route body limit. If not, move it to the proper route option and test oversized payload rejection.
- `office_settings` and `agent_schedule` require start time < end time, so overnight schedules are impossible. Accept explicitly for MVP or change the schedule model.
- `audit_log` currently represents a human actor only. Future agent/tool execution audit will need agent/tool/policy/version provenance as specified in the handoff.
- Encoding artifacts are visible in some Portuguese UI/document text and should be normalized to UTF-8 before visual work.
- Outbox retry/dead-letter/backoff behavior is still minimal and belongs to Sprint 2 hardening.

## Merge gate

PR #1 must not be declared complete until:

- refresh rotation P0 is fixed and tested;
- ownership/integrity decision is implemented;
- CI can actually execute and is green;
- branch is reconciled with `main`;
- lint/typecheck/tests/build pass;
- migration runner is validated against the intended Neon development branch;
- Sprint 2 remainder is explicitly moved to its own continuation branch or accepted as an intentional baseline slice.
