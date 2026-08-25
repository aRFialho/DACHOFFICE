# Sprint 7 — Margin Agent workflow

## Status and scope

Sprint 7 code and its task-level independent reviews are accepted. It adds a
deterministic, asynchronous Margin Agent workflow over persisted finance facts.
On 2026-08-25, the approved forward migration
`008_margin_analysis_reports.sql` was applied to the configured Neon target;
the immediately following repository health check passed. Connected provider
staging remains separate future evidence.

The workflow does not call an LLM, marketplace, integration, provider, or
another agent. Shopee and Mercado Livre integrations remain on standby, and
their connected staging validation is explicitly deferred. No provider
verification is claimed here.

## Flow and ownership

1. A human Admin Master submits a period request to the API.
2. The API validates the request, binds the requested office to its active
   Margin Agent and that agent's current immutable version, and atomically
   creates a human `margin.analysis` task, immutable queued event, audit entry,
   and idempotent outbox message. It never runs analysis inline.
3. The worker claims the durable delivery key first. For a new delivery, it
   loads server-owned task context, re-authorizes the tenant-bound agent, then
   reads only office-scoped persisted snapshots and canonical costs.
4. The pure Margin Agent calculates the period report with fixed-scale bigint
   arithmetic. The worker stores the immutable report and lifecycle events in
   one transaction, then completes the task.
5. API/report consumers read the persisted projection. The Office scene may
   render that state, but is never a source of business truth.

## Request and read contracts

`POST /v1/margin/analyses` requires Admin Master authentication. Its JSON body
accepts exactly `officeId`, `agentId`, `periodStart`, `periodEnd`, and optional
`channels` and `skus`. IDs are UUIDs. Period timestamps are complete ISO-8601
UTC timestamps with seconds and `Z` (fractional seconds are allowed); the
inclusive end cannot precede the start. Channels and SKUs use normalized,
non-empty, duplicate-free arrays. The response is `201` with the queued task;
invalid input or ineligible agent returns `400`.

The server-owned task context has these exact keys:

| Key              | Value                                              |
| ---------------- | -------------------------------------------------- |
| `periodStart`    | Validated inclusive UTC start timestamp.           |
| `periodEnd`      | Validated inclusive UTC end timestamp.             |
| `agentVersionId` | Current immutable version captured server-side.    |
| `channels`       | Optional JSON-serialized normalized channel array. |
| `skus`           | Optional JSON-serialized normalized SKU array.     |

`GET /v1/margin/analyses/:taskId` requires Admin Master authentication and
accepts only the UUID task path parameter. It derives office scope from the
task/report join rather than accepting an office selector, returning the report
projection (`200`) or not found (`404`).

`margin.getReport` is a Tool Registry `READ` tool with `safe_read` retry policy
and no idempotency requirement. Input is exactly `{ "taskId": "<uuid>" }`;
an office ID is neither accepted nor used. It loads task policy context and
runs the existing Tool Registry + Policy Engine authorization before any report
query. Only then does it read the report scoped to that task's office.

## Authorization and financial confidence

Creation and execution require all of these non-revoked grants (either `read`
or the stronger `write` grant):

- `finance.getRules`
- `finance.getMargin`
- `products.getCost`

The assigned agent must belong to the requested office, be `active`, and have
the captured current version. The worker repeats these checks before loading
snapshots or costs. Tool reads likewise deny suspended, revoked,
version-mismatched, cross-office, or otherwise invalid task context before
reading the report.

Reports retain immutable inputs, source snapshot IDs, calculation/rule
versions, timestamps, consultations, and provenance. All-real included inputs
aggregate to `REAL`; any estimated included snapshot aggregates to
`ESTIMATED`. `REAL` and `ESTIMATED` are explicit report and input labels, so a
period containing estimates cannot be presented as real.

## Outcomes, retry, and idempotency

No snapshot for the requested period becomes the deterministic completed
`no_margin_snapshots` report outcome. Missing required canonical-cost evidence
becomes the deterministic unresolved-cost outcome; it is never guessed.
Storage, query, database, or connection failures surface as retryable worker
failures, rather than being fabricated as no-data, missing-cost, conflict, or
not-found outcomes.

Each outbox delivery is claimed by its idempotency key inside the transaction.
A preclaimed delivery returns terminal success before context, authorization,
facts, report, or event work, so completed work is not repeatedly retried. A
newly claimed delivery that fails authorization or storage rolls back the claim
with the transaction for safe retry. Report persistence is idempotent by office
and task and by office and idempotency key; replayed canonical content is
unchanged, while same-key different content conflicts and rolls back before
completion/events. Report and evidence records are append-only immutable.

## Migration posture

`008_margin_analysis_reports.sql` is additive and forward-only. It adds the
immutable, office-scoped report record, tenant-bound foreign keys, report
idempotency constraints, indexes, and a trigger rejecting report update/delete.
After final acceptance, it was applied once to the configured Neon target on
2026-08-25 and the immediate repository health check passed. If an issue
appears after application, preserve financial evidence and prepare a reviewed
forward remediation; do not issue a destructive rollback.

## Acceptance evidence

| Requirement                                                                                              | Source and local evidence                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure deterministic analysis, inclusive filtering, confidence and explicit outcomes                       | `packages/margin-agent/src/period-analysis.ts`; `packages/margin-agent/test/period-analysis.test.ts` (Task 1 accepted).                                                                                                                                                                     |
| Office-scoped persisted facts, strict stored-report validation, immutable schema                         | `apps/worker/src/margin/postgres-margin-analysis-repository.ts`; `apps/worker/test/margin/postgres-margin-analysis-repository.test.ts`; `apps/worker/test/margin/margin-analysis-migration-schema.test.ts`; `db/migrations/008_margin_analysis_reports.sql` (Task 2 final review accepted). |
| Worker authorization-before-facts, duplicate delivery settlement, transactional replay/conflict behavior | `apps/worker/src/margin/margin-analysis-task-handler.ts`; `apps/worker/src/margin/postgres-margin-analysis-task-repository.ts`; worker margin tests (Task 3 final review accepted).                                                                                                         |
| Authenticated create/read API and task-office-bound READ tool                                            | `apps/api/src/modules/margin/margin-analysis-routes.ts`; `margin-analysis-service.ts`; `margin-tools.ts`; `postgres-margin-analysis-runtime.ts`; API margin route/tool tests (Task 4 final review accepted).                                                                                |
| Local quality gates                                                                                      | Accepted task reports record focused suites, affected typechecks/builds, frozen offline install, Prettier, and `git diff --check` at their accepted revisions.                                                                                                                              |
| Database deployment                                                                                      | On 2026-08-25, 008 was applied through the approved forward migration script; the immediate Neon repository health check passed.                                                                                                                                                               |

## Deferred staging acceptance

Sprint 7 does not pass connected Shopee, Mercado Livre, or other provider
staging validation. It also does not validate marketplace ingestion against
connected infrastructure. Future validation must use approved worker and
integration paths, never expose credentials or raw provider payloads, and must
record its own evidence separately.
