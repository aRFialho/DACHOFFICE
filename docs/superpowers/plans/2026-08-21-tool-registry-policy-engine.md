# Tool Registry and Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deterministic, fail-closed authorization boundary for registered semantic tool calls.

**Architecture:** A typed in-process registry owns semantic definitions and validates untrusted input with runtime schemas. A dependency-free Policy Engine evaluates only backend-supplied facts and returns `allowed`, `approval_required`, or `denied`; a thin authorization service composes these units without exposing an executor, provider client, or credential.

**Tech Stack:** TypeScript strict mode, Node.js 24, Fastify API workspace, Vitest 4, PostgreSQL existing `agent_tool_grant` data model.

**Spec:** `docs/superpowers/specs/2026-08-21-tool-registry-policy-engine-design.md`

## Global Constraints

- LLM output, HTTP input, and external provider text are untrusted and never authorize a tool call.
- Tools are semantic, server-registered definitions; agents cannot invent a tool or construct raw HTTP requests.
- Credentials, provider clients, action execution, and approval persistence are out of scope.
- Existing `agent_tool_grant` rows are the grant source; no migration is required.
- Every denial is fail-closed and contains only a stable, non-secret reason code.
- `DESTRUCTIVE` remains denied for this MVP even at autonomous trust.
- Any future external write must be re-authorized and use an idempotency/action record before invocation.
- Production code follows test-first red-green-refactor; no business logic belongs in `app.ts` or `server.ts`.

---

## File Structure

| File                                                        | Responsibility                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/tools/tool-contracts.ts`              | Action classes, typed runtime schema contract, tool definition builder, grant levels, and decision/reason types.          |
| `apps/api/src/modules/tools/tool-registry.ts`               | Immutable semantic tool lookup and input validation; rejects unknown tools and duplicate codes.                           |
| `apps/api/src/modules/policy/policy-engine.ts`              | Pure deterministic authorization evaluation from a tool definition and trusted facts.                                     |
| `apps/api/src/modules/policy/tool-authorization-service.ts` | Composes registry lookup/input validation with the pure evaluator; no HTTP, logging, database, or integration dependency. |
| `apps/api/test/tool-registry.test.ts`                       | Registry and schema-validation behavior.                                                                                  |
| `apps/api/test/policy-engine.test.ts`                       | Trust/action-class/grant/authority deterministic policy matrix.                                                           |
| `apps/api/test/tool-authorization-service.test.ts`          | In-process proof that unknown or malformed calls cannot be allowed.                                                       |
| `docs/sprints/03-tool-registry-policy-engine.md`            | Delivered scope, security boundary, decision semantics, and validation commands.                                          |
| `README.md`                                                 | Status update listing delivered Sprints 0–3.                                                                              |

No migration, API route, Fastify registration, database repository, worker consumer, or dependency change is included. A future adapter/Action Executor loads trusted PostgreSQL state and invokes `ToolAuthorizationService` for every tool attempt.

### Task 1: Typed tool contracts and semantic registry

**Files:**

- Create: `apps/api/src/modules/tools/tool-contracts.ts`
- Create: `apps/api/src/modules/tools/tool-registry.ts`
- Test: `apps/api/test/tool-registry.test.ts`

**Interfaces:**

- Produce `ToolActionClass = "READ" | "PREPARE" | "WRITE" | "DESTRUCTIVE" | "SENSITIVE"` and `ToolGrantLevel = "read" | "write"`.
- Produce `RuntimeSchema<T>` with `parse(value: unknown): { ok: true; value: T } | { ok: false }`.
- Produce `defineTool<TInput, TOutput>(definition)` and a definition containing `code`, `integration`, `description`, `inputSchema`, `outputSchema`, `actionClass`, `idempotency`, `retryPolicy`, `requiredGrant`, and `rateLimit`.
- Produce `ToolRegistry.get(code)` and `ToolRegistry.validateInput(code, value)`.
- Validation failures are exactly `tool_unregistered` or `tool_input_invalid`; rejected values are never returned.

- [ ] **Step 1: Write the failing test.** Define a real `products.get` READ tool using a runtime schema requiring a string `sku`. Assert a valid input returns its typed value, `raw.http.post` returns `{ ok: false, reason: "tool_unregistered" }`, malformed input returns `tool_input_invalid`, and duplicate codes throw `tool code must be unique`.
- [ ] **Step 2: Verify red.** Run `pnpm --filter @dachbyte-office/api test -- tool-registry.test.ts`. Expected: module-not-found failure because the tools modules do not exist.
- [ ] **Step 3: Implement minimally.** Create the contracts and a registry backed by a private `ReadonlyMap<string, RegisteredTool>`. Lookup precedes parsing; convert every schema failure into the fixed reason without storing the input.
- [ ] **Step 4: Verify green.** Run `pnpm --filter @dachbyte-office/api test -- tool-registry.test.ts`. Expected: all registry cases pass.
- [ ] **Step 5: Commit.** Run `git add apps/api/src/modules/tools apps/api/test/tool-registry.test.ts` then `git commit -m "feat: add typed semantic tool registry"`.

### Task 2: Deterministic policy engine

**Files:**

- Create: `apps/api/src/modules/policy/policy-engine.ts`
- Test: `apps/api/test/policy-engine.test.ts`

**Interfaces:**

- Consume `RegisteredTool`, `ToolGrantLevel`, and `ToolActionClass` from Task 1 and `AgentLifecycleStatus` from `admin/write-gate.ts`.
- Produce `evaluateToolPolicy(input: PolicyEvaluationInput): ToolAuthorizationDecision`.
- `PolicyEvaluationInput` contains the registered `tool`, `hasTaskAuthority`, `lifecycleStatus`, `grants`, `activeAgentVersionId`, `requestedAgentVersionId`, `officeTrustLevel`, `agentTrustCeiling`, `policyConditionsSatisfied`, and `actionLimitsSatisfied`.
- Produce `allowed`, `approval_required`, or `denied`.
- Denials use exactly `task_authority_missing`, `agent_suspended`, `agent_not_active`, `tool_grant_missing`, `agent_version_mismatch`, `trust_ceiling_exceeded`, `policy_conditions_failed`, `action_limits_exceeded`, or `destructive_action_disabled`.

- [ ] **Step 1: Write the failing test.** Use actual registered READ, PREPARE, WRITE, DESTRUCTIVE, and SENSITIVE definitions. Assert: READ with an active read grant is allowed at analytical trust; PREPARE at analytical trust needs approval; WRITE at supervised trust needs approval; WRITE is allowed only when Office and active version are autonomous; revoked grant, version mismatch, missing authority, suspended lifecycle, failed condition, exceeded limit, and DESTRUCTIVE deny with their exact reasons; SENSITIVE requires approval after base checks.
- [ ] **Step 2: Verify red.** Run `pnpm --filter @dachbyte-office/api test -- policy-engine.test.ts`. Expected: module-not-found failure because the evaluator does not exist.
- [ ] **Step 3: Implement minimally.** Rank trust as analytical 0, supervised 1, autonomous 2 and use the lower of Office trust and active-version ceiling. Check in this order: task authority, lifecycle, matching active grant, version, effective trust, conditions, limits, then action class. A write grant satisfies READ; every other class requires write. PREPARE needs approval at analytical; WRITE needs approval below autonomous; SENSITIVE needs approval; DESTRUCTIVE always denies.
- [ ] **Step 4: Verify green.** Run `pnpm --filter @dachbyte-office/api test -- policy-engine.test.ts`. Expected: full deterministic matrix passes.
- [ ] **Step 5: Commit.** Run `git add apps/api/src/modules/policy/policy-engine.ts apps/api/test/policy-engine.test.ts` then `git commit -m "feat: add deterministic tool policy engine"`.

### Task 3: Registry-to-policy authorization boundary

**Files:**

- Create: `apps/api/src/modules/policy/tool-authorization-service.ts`
- Test: `apps/api/test/tool-authorization-service.test.ts`

**Interfaces:**

- Consume `ToolRegistry` from Task 1 and `evaluateToolPolicy` from Task 2.
- Produce `ToolAuthorizationService.authorize(input: ToolAuthorizationRequest): ToolAuthorizationDecision`.
- `ToolAuthorizationRequest` contains `toolCode`, untrusted `input`, and a `PolicyEvaluationContext` that omits the tool definition.
- Unknown and malformed inputs produce a denied decision before policy evaluation; otherwise the evaluator result is returned unchanged.

- [ ] **Step 1: Write the failing test.** Construct a real registry with semantic `products.get` (READ) and `products.updatePrice` (WRITE) schemas. Assert unregistered `raw.http.post` is denied, malformed write input is denied even under autonomous context, and a valid supervised write returns `approval_required` with `trust_requires_approval`. Assert decision keys never contain `credential`, `provider`, `adapter`, `executor`, or raw input.
- [ ] **Step 2: Verify red.** Run `pnpm --filter @dachbyte-office/api test -- tool-authorization-service.test.ts`. Expected: module-not-found failure because the service does not exist.
- [ ] **Step 3: Implement minimally.** `authorize` calls `registry.validateInput`; it maps a registry failure to `{ status: "denied", reason }`, then invokes `evaluateToolPolicy({ ...context, tool })`. It is synchronous and side-effect free.
- [ ] **Step 4: Verify green.** Run `pnpm --filter @dachbyte-office/api test -- tool-authorization-service.test.ts`. Expected: unknown-code, malformed-input, and approval-required cases pass.
- [ ] **Step 5: Commit.** Run `git add apps/api/src/modules/policy/tool-authorization-service.ts apps/api/test/tool-authorization-service.test.ts` then `git commit -m "feat: compose registry and policy authorization"`.

### Task 4: Documentation and full verification

**Files:**

- Create: `docs/sprints/03-tool-registry-policy-engine.md`
- Modify: `README.md`

**Interfaces:**

- Document the three policy outcomes, action-class table, grant source, trusted authorization context, and absence of action execution.
- Document the future seam `ToolAuthorizationService.authorize`.

- [ ] **Step 1: Draft acceptance documentation.** State that READ needs a valid read grant, PREPARE at analytical needs approval, supervised WRITE needs approval, unknown tools deny, and destructive tools deny. State that `agent_tool_grant` is reused and no migration exists.
- [ ] **Step 2: Verify the documented focused commands.** Run `pnpm --filter @dachbyte-office/api test -- tool-registry.test.ts policy-engine.test.ts tool-authorization-service.test.ts`. Expected: all focused tests pass.
- [ ] **Step 3: Complete docs and README.** Set README status to “Sprints 0–3 delivered: foundations, Admin/Agent Forge, asynchronous task engine, and deterministic Tool Registry + Policy Engine.” Document that future workers must reload current PostgreSQL facts and re-authorize each attempt after a grant revocation or suspension.
- [ ] **Step 4: Run all validation.** Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`, and `git status --short`. Expected: every workspace command passes, diff check has no output, and only intended Sprint 3 changes exist.
- [ ] **Step 5: Commit.** Run `git add docs/sprints/03-tool-registry-policy-engine.md README.md` then `git commit -m "docs: complete sprint 3 policy engine"`.

## Acceptance Criteria

- Only server-defined semantic tool codes are recognized; unknown codes deny before parsing or policy.
- Typed runtime schemas reject malformed input without echoing it.
- READ, PREPARE, and WRITE obey active grants and the lower of Office trust and active agent-version ceiling.
- Missing task authority, non-active/suspended agent, revoked/missing grant, version mismatch, failed policy condition, and limit failure deny.
- PREPARE/WRITE return `approval_required` where trust requires a human; no approval is implicit permission.
- DESTRUCTIVE is denied by default; SENSITIVE never returns allowed in this sprint.
- No result contains credentials, provider payloads, adapters, or executors.
- No migration, external call, credential handling, or raw HTTP tool path is introduced.
