# Sprint 3 — Tool Registry and Policy Engine

Sprint 3 establishes the deterministic authorization boundary for semantic
tool calls. It does not execute integrations, persist approvals, handle
credentials, or permit agents to construct provider HTTP requests.

## Delivered modules

- `ToolRegistry` contains only server-registered semantic tool definitions.
  Each definition declares its integration, input/output runtime schemas,
  action class, idempotency behavior, retry policy, required grant, and
  rate/cost metadata.
- `ToolAuthorizationService.authorize` validates the requested tool code and
  untrusted input before invoking the pure `evaluateToolPolicy` function.
- The Policy Engine evaluates trusted task authority, lifecycle, active grant,
  current agent version, Office trust, agent-version trust ceiling, policy
  conditions, action limits, and action class in fail-closed order.

## Decisions

| Action class | Grant                    | Result                                                                                               |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| READ         | active `read` or `write` | Allowed after all deterministic checks.                                                              |
| PREPARE      | active `write`           | `approval_required` at analytical trust; otherwise allowed after checks.                             |
| WRITE        | active `write`           | `approval_required` below autonomous effective trust; allowed only at autonomous trust after checks. |
| SENSITIVE    | active `write`           | Always `approval_required` after base checks.                                                        |
| DESTRUCTIVE  | any                      | Denied by default in this MVP.                                                                       |

Effective trust is the lower of the Office trust level and the active agent
version trust ceiling. The pre-existing `agent_tool_grant` table remains the
grant source; this sprint requires no migration.

## Security boundary

- Unknown codes such as `raw.http.post` are denied before schema validation or
  policy evaluation, so a model cannot create or invoke a new tool.
- Input schemas receive `unknown` data and deny malformed values without
  returning the rejected value.
- LLM output, client input, and retrieved provider content are never trusted
  authorization facts.
- Decisions contain only status and a stable non-secret reason code. They do
  not contain credentials, providers, adapters, executors, raw input, or a
  mechanism for an external call.

Future workers and the Action Executor must reload current PostgreSQL facts
and invoke `ToolAuthorizationService` on every attempted tool call. A prior
allow decision cannot survive an agent suspension or grant revocation. Before
any external write, the future executor must create an action/idempotency
record and apply its dedicated approval policy.

## Verification

```powershell
corepack pnpm --filter @dachbyte-office/api test -- tool-registry.test.ts policy-engine.test.ts tool-authorization-service.test.ts
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```
