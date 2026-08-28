# Sprint 2 — Task, Event and Queue Engine

Sprint 2 provides the asynchronous task spine. PostgreSQL is authoritative for task state, context, events, outbox delivery and worker idempotency; the virtual Office is only a later projection of these facts.

## Delivered flow

1. An Admin Master creates a human task through `POST /v1/tasks`.
2. One transaction writes the queued task, source-first context, `task.queued` event, outbox message and sanitized audit record.
3. The worker claims a pending outbox message with `FOR UPDATE SKIP LOCKED`.
4. A stable idempotency key prevents a repeated delivery from applying work twice.
5. The worker records `assigned`, `executing` and `completed` task events. It does not call a model, tool registry or integration.
6. `GET /v1/tasks/:taskId` returns the authoritative task and sequence-ordered events to an authenticated Admin Master.

## Operational boundaries

- HTTP handlers only persist and enqueue; they never execute task work inline.
- Event rows are append-only. State/event/outbox writes are transactional.
- Retry after a failed delivery returns the message to pending. Completed idempotency keys are no-ops.
- No external write, credential, model call or visual state decides task status in this sprint.

## Verification

```powershell
pnpm db:migrate
pnpm --filter @dachbyte-office/api test
pnpm --filter @dachbyte-office/worker test
pnpm db:health
```
