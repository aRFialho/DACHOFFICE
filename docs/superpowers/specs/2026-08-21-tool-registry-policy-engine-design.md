# Tool Registry and Policy Engine Design

## Purpose

Sprint 3 introduces the deterministic authorization boundary for semantic
tools. It authorizes a proposed tool action from trusted server-side facts;
it never treats an LLM response, provider payload, or client request as an
authorization decision.

## Scope

The sprint provides a typed in-process registry, a pure policy evaluator, and
an API-facing authorization service. It does not call external providers,
store credentials, execute actions, or create an approval workflow. The
policy evaluator can instead return `approval_required` for the future
Approval and Action Executor modules to persist and resolve.

## Existing foundation reused

- `agent_tool_grant` remains the source of the agent's active semantic tool
  grants. Its existing `read` and `write` levels are reused; no migration is
  needed.
- Office trust is persisted as `analytical`, `supervised`, or `autonomous`.
- Agent lifecycle, active version, trust ceiling, and grant revocation were
  delivered in Sprint 1. The existing write gate remains a focused lifecycle
  check; it is not promoted into a general policy object.
- A Task created in Sprint 2 remains the source of task authority. This
  sprint receives a trusted boolean describing the completed task/actor
  authority check rather than trying to infer it from model input.

## Modules and responsibilities

`apps/api/src/modules/tools/tool-contracts.ts` owns the public types:

- `ToolActionClass`: `READ`, `PREPARE`, `WRITE`, `DESTRUCTIVE`, `SENSITIVE`;
- schemas represented by runtime-safe validators for a tool's input and
  output;
- registry definitions including semantic code, integration name,
  description, schemas, action class, idempotency behavior, retry policy,
  required grant level, and rate/cost metadata;
- the three decision results: `allowed`, `approval_required`, and `denied`.

`apps/api/src/modules/tools/tool-registry.ts` owns registry lookup and schema
validation. Tools are declared by server code, keyed by semantic code. A
request for an unregistered code is denied before it reaches any adapter.
This keeps models and API clients from creating tools dynamically.

`apps/api/src/modules/policy/policy-engine.ts` is a dependency-free pure
function. It evaluates a registered tool and a trusted authorization context
in the following fail-closed order:

1. task/user authority;
2. tool registration and typed input validation;
3. agent lifecycle and matching active grant;
4. requested active agent version;
5. Office trust and agent trust ceiling;
6. policy conditions and action limits supplied by a trusted resolver;
7. action-class rule.

Any failed layer produces `denied` with a stable machine reason. The engine
never returns an executor or adapter and cannot send an external request.

`apps/api/src/modules/policy/tool-authorization-service.ts` joins the
registry with the pure evaluator. Future HTTP/task-worker code may call this
service only after loading its context from PostgreSQL. It deliberately
accepts typed objects rather than untrusted JSON.

## Trust and action-class policy

The highest effective trust is the lower of Office trust and the active
agent-version trust ceiling.

- `READ` needs an active `read` or `write` grant and is allowed at every
  trust level once all other deterministic checks pass.
- `PREPARE` needs an active `write` grant. It creates no external change; at
  `analytical` trust it yields `approval_required`, while `supervised` and
  `autonomous` may prepare when other conditions pass.
- `WRITE` needs an active `write` grant. It is `approval_required` at
  `analytical` and `supervised` trust, and is allowed only at `autonomous`
  trust after all other checks pass.
- `DESTRUCTIVE` is denied in this MVP, including at autonomous trust, as the
  handoff requires a separate explicit policy.
- `SENSITIVE` is always `approval_required` after all base checks; the
  eventual executor must add the dedicated policy before it can execute.

For any class that could issue an external write, a later Action Executor must
also create an idempotency/action record before provider invocation. This
sprint makes no provider invocation and cannot bypass that future boundary.

## Data flow

```text
task/HTTP worker (trusted facts)
  -> ToolAuthorizationService
  -> ToolRegistry: registered semantic definition + schema validation
  -> PolicyEngine: deterministic decision
  -> allowed | approval_required | denied
```

The agent or model can ask for a semantic tool code and typed input, but cannot
provide a grant, trust level, current version, or policy result. Provider text
and model output remain untrusted data.

## Errors and audit boundary

The decision contains a non-secret reason code and the semantic tool code,
safe for a future audit record. Input values, credentials, provider payloads,
and token material are never included in a reason. The authorization service
does not log requests.

## Test strategy

Unit tests precede production code and use real registry and evaluator logic.
They prove:

- `READ`, `PREPARE`, and `WRITE` behavior across trust levels;
- missing/revoked grants, suspended agents, version mismatch, failed task
  authority, failed limits, and invalid tool input deny deterministically;
- unknown semantic tool codes cannot be invoked;
- destructive tools remain denied;
- approval-required decisions expose no secrets or executors.

No migration is required because the existing semantic grant table is reused.
The sprint's documentation will explain the contracts and validation commands.
