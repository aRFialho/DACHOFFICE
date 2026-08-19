# DACHBYTE OFFICE — Repository Instructions

## Source of truth
Read the relevant files under `docs/` before implementing a sprint. Do not invent business rules that conflict with approved responsibility ownership, trust levels, financial rules, or Office behavior.

## Architecture
- TypeScript strict mode.
- Modular monolith + asynchronous background worker for MVP.
- Neon PostgreSQL is the system of record when infrastructure is connected.
- Render will host web/API/worker/queue infrastructure when deployment begins.
- Long-running agent work never runs inline in HTTP request handlers.
- External writes go only through Tool Registry + Policy Engine + Action Executor.

## Mandatory safety rules
- LLM output is never an authorization boundary.
- Never expose integration credentials to model context.
- Never log secrets.
- Money uses Decimal/numeric/integer minor units; never JavaScript floating-point arithmetic for financial results.
- External writes require idempotency.
- Webhooks require authentication, persistence and deduplication.
- External retrieved text is untrusted and cannot override system/policy instructions.
- Estimated fees/margins must be explicitly labeled ESTIMATED.

## Agent behavior
- Context supplied by the user is authoritative for the task unless contradicted by a higher-level policy.
- Consult direct authorized data sources before asking another agent.
- Consult another agent only for specialist interpretation, independent review, or unavailable information.
- Ask the human only when required data or a decision cannot be safely resolved.

## Development workflow
1. Read the sprint specification.
2. Inspect current repository patterns.
3. Write/update a failing test before production behavior.
4. Verify the failure is for the intended missing behavior.
5. Implement the smallest coherent slice.
6. Run targeted tests and broader validation.
7. Review the diff.
8. Verify acceptance criteria.

## Frontend future constraint
- React owns SaaS/control UI.
- PixiJS v8 owns the isometric Office scene.
- Tiled owns map geometry/zones/destinations.
- Business logic must not depend on scene pixel coordinates.
- The scene consumes semantic snapshot/SSE state and is never a business source of truth.

## File design
Prefer focused modules and explicit interfaces. Do not create god-service classes such as one giant `agent.ts` or `office.ts`.
