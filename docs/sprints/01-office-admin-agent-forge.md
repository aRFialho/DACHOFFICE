# Sprint 1 ? Office Admin and Agent Forge

Sprint 1 establishes the administrative configuration layer. PostgreSQL remains the source of truth; it does not run agents, invoke models, issue integration credentials, or perform external writes.

## Scope delivered

- Admin Master-only Office and department creation.
- Agent creation as an atomic transaction with initial immutable version, schedule and grants.
- Append-only agent versions. Existing `agent_version` rows are protected by a database trigger.
- Lifecycle transitions: `draft -> active`, `active -> updating|suspended|archived`, `updating -> active|suspended|archived`, and `suspended -> active|archived`.
- Schedule replacement inside a transaction.
- Grant revocation by `revoked_at`; grants are never deleted.
- Sanitized audit records for lifecycle, schedule, version and grant-revocation mutations.

## HTTP commands

All commands below require an active Admin Master access token in `Authorization: Bearer <token>`.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/v1/admin/offices` | Create an Office and initial settings. |
| POST | `/v1/admin/offices/:officeId/departments` | Create a department. |
| POST | `/v1/admin/agents` | Create a draft agent with version 1. |
| POST | `/v1/admin/agents/:agentId/versions` | Append an immutable version. |
| POST | `/v1/admin/agents/:agentId/lifecycle` | Apply a validated lifecycle transition. |
| PUT | `/v1/admin/agents/:agentId/schedule` | Atomically replace its schedule. |
| DELETE | `/v1/admin/agents/:agentId/tool-grants/:grantId` | Revoke the active grant logically. |

## Security and operating boundaries

- Request bodies are validated from `unknown`; actor IDs are derived from the verified session, never from the body.
- Invalid or absent administrative credentials resolve to `401`.
- The write gate rejects suspended or non-active agents, and rejects revoked or absent grants before a future executor can perform any external write.
- Version text, credentials and secret values are not written to audit metadata.
- Removing a grant changes the database record immediately. Future workers must query the grant boundary for every write attempt rather than relying on cached permissions.

## Verification

```powershell
pnpm db:migrate
pnpm --filter @dachbyte-office/api typecheck
pnpm --filter @dachbyte-office/api test
```

Migration `002_office_agent_forge.sql` is already included in the migration runner and is safe to re-run through `pnpm db:migrate`.
