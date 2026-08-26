# Sprint 9 — Cost & Pricing Agent

## Summary

Implement a deterministic, asynchronous Cost & Pricing workflow over the
canonical PostgreSQL product, listing, cost, supplier-table, and Finance rule
facts already in the repository. It produces a traceable break-even minimum
price, discount scenario, prepared (never executed) price action, and a
downloadable company pricing workbook. No marketplace, ERP, Shopee, Mercado
Livre, Ads, or other provider is called by this sprint.

## Type

Feature.

## Source issue/task

Approved handoff, `09-sprint-roadmap.md`, Sprint 9 — Cost & Pricing Agent;
current user direction: all Shopee and Mercado Livre integrations remain on
standby until a later frontend-oriented handoff.

## Original requirements (100% coverage)

| # | Requirement | Plan step(s) |
| --- | --- | --- |
| 1 | Access current product, cost, and price | 1, 3 |
| 2 | Deterministic minimum-price simulations | 1, 3 |
| 3 | Discount scenarios | 1, 3, 4 |
| 4 | Company spreadsheet template/artifact | 2, 3, 4 |
| 5 | Supplier-table mapping workflow | 2, 4 |
| 6 | Prepared price action, never external execution | 1, 2, 3 |
| 7 | SKU list + channel + discount + period works from supplied context without redundant questions | 3, 4 |
| 8 | Workbook is generated from current product and supplier data | 2, 3, 4 |
| 9 | Shopee/MeLi channel integration remains standby | All steps |
| 10 | Decimal/numeric finance, authorization, provenance, idempotency, untrusted external data, and async worker rules | All steps |

**Coverage check:** 10/10 requirements mapped.

## Current state

- `packages/catalog` and migration 005 provide tenant-scoped `product`,
  `supplier`, `product_cost_snapshot`, and `channel_listing` records. Listings
  currently originate from Tray data but are read as canonical facts.
- `packages/finance` provides strict decimal-string money validation and
  fixed-scale bigint arithmetic. Finance fee rules are versioned and
  `ESTIMATED` by design.
- Sprint 7 provides the accepted pattern for a specialized human task: API
  binds office/agent/version, outbox queues it, worker re-authorizes before
  reading facts, and output is immutable, tenant-scoped, and idempotent.
- There is no supplier-table import persistence, pricing engine, pricing
  report/action model, workbook artifact storage, or pricing route/tool.

## Design decisions

- **Minimum price means deterministic break-even**, not an invented target
  margin policy: `minimum = (cost + seller fixed fees) / (1 - seller variable
  fee rate)`. A non-positive denominator is an explicit unresolved Finance
  assumption. The report names it `breakEvenMinimumPrice`; a future configured
  margin-floor policy may build on it without changing historical reports.
- Price/cost and fee selections are limited to records effective/observed no
  later than the request's inclusive period end. A mapped supplier-table cost
  has precedence over a canonical catalog cost; both source/provenance paths
  are retained. Missing/ambiguous inputs are findings, never guesses.
- Workbooks are rendered from an immutable report in the worker, stored as a
  bounded byte artifact in PostgreSQL, and downloaded through an authenticated,
  task-office-bound endpoint. Financial outputs are calculated before workbook
  rendering with bigint decimal code; cells present values/formulas only for
  auditability and never become the system of record.
- Supplier input arrives as explicit structured rows plus a declared column
  mapping. It is untrusted data, not instructions. Mapping is exact,
  tenant-scoped supplier + SKU matching; unmapped/ambiguous rows remain
  explicit and do not mutate canonical product identity or external listings.
- A prepared price action is an internal immutable proposal only. No external
  price update endpoint, credential, provider call, Action Executor call, or
  write Tool is implemented. Its `PREPARE` tool/policy decision is persisted
  for a later approvals/execution sprint.

## Repository instructions compliance

- TypeScript strict; focused modules, no `pricing.ts` god object.
- Money uses validated decimal strings, PostgreSQL `numeric(19,4)`, and bigint
  arithmetic—never JS floating point.
- Worker only performs long-running task work; API validates/enqueues/reads.
- All agent access is tenant-bound, agent-version-bound, re-authorized before
  data reads, and governed through the existing Tool Registry + Policy Engine.
- External/supplier strings are treated as untrusted data. Provider integration
  and external writes are intentionally absent.
- Existing `AGENTS.md` is the governing repository instruction; no `CLAUDE.md`
  files exist in affected paths.

## Existing types to reuse

- `Money`, `ComponentConfidence`, `assertMoney` from
  `packages/finance/src/contracts.ts`.
- `ToolRegistry`, `defineTool`, `ToolActionClass`, and
  `ToolAuthorizationService` from `apps/api/src/modules/tools/` and `policy/`.
- Canonical `product`, `supplier`, `product_cost_snapshot`, `channel_listing`,
  Finance rule, task, outbox, agent grant/version, and audit patterns.
- Sprint 7 `MarginAnalysisService`, task handler/repository, runtime/context
  loader, and report persistence patterns—adapted, not coupled.

## Types to create

- `PricingSimulationRequest`, `PricingSimulationReport`, input provenance,
  findings, `BreakEvenPrice`, `DiscountScenario`, and `PreparedPriceAction` in
  `@dachbyte-office/pricing-agent`.
- `SupplierTableImport`, mapped/unresolved supplier rows, immutable pricing
  report/artifact/action rows, and specialized API/worker repository contracts.

## Impact analysis

### Files to create

- `packages/pricing-agent/{package.json,tsconfig.json,src/contracts.ts,src/decimal.ts,src/pricing-simulation.ts,test/pricing-simulation.test.ts}` — pure deterministic domain engine.
- `db/migrations/009_cost_pricing_agent.sql` and schema regression tests —
  supplier table rows, immutable pricing report/action/workbook artifact.
- Focused `apps/worker/src/pricing/*` and `apps/worker/test/pricing/*` modules
  — price fact loading, task authorization/dispatch, immutable persistence,
  workbook generation.
- Focused `apps/api/src/modules/pricing/*` and `apps/api/test/pricing-*` —
  supplier import, simulation creation/read/download, Tool Registry facade.
- `docs/sprints/09-cost-pricing-agent.md` — operating boundaries and evidence.

### Files to modify

- Root workspace manifest/lockfile for `@dachbyte-office/pricing-agent` and the
  single production XLSX renderer dependency.
- `apps/worker/src/postgres-task-worker.ts` and `apps/worker/src/worker.ts` for
  injected specialized pricing dispatch while preserving generic and Margin
  fallbacks.
- `apps/api/src/app.ts` and `apps/api/src/server.ts` for explicit pricing
  runtime registration; generic task creation reserves `pricing.simulation`.
- `README.md` for Sprint 9 status once accepted.

### Files to delete

None. No replacement, compatibility, or parallel implementation exists.

### Dependencies and breaking changes

- Add `@dachbyte-office/pricing-agent` as a workspace dependency of Worker/API
  only where its contracts are used.
- Add one pinned, server-side XLSX rendering dependency. It receives typed
  report data only and does not calculate financial outcomes.
- No public generic task API breaking change except reserving
  `pricing.simulation` for the specialized secure route.

## Implementation steps

### Step 1: Pure pricing contracts and deterministic calculator

**Files:** `packages/pricing-agent/*`.

Create tests first for strict request validation, fixed/percentage seller fee
math, signed rounding, zero/negative denominator, mixed data confidence,
missing price/cost/Finance assumptions, discount-at/below/above break-even,
and source provenance. Implement only bigint decimal operations. Inputs include
the period, channel, SKU list, discount, selected catalog/supplier cost,
current listing, and current Finance fee assumptions. Outputs never claim
`REAL` when an estimated rule or incomplete input exists.

### Step 2: Forward persistence and supplier mapping

**Files:** migration 009, API/Worker repository tests and repositories.

Add forward-only, office-scoped tables for supplier imports/rows, pricing
reports, pricing workbook artifacts, and prepared actions. Use UUIDs,
`numeric(19,4)`, source/evidence JSON, unique office/task and idempotency keys,
foreign keys scoped to office/agent/version/task, and immutable triggers.

Import rows using explicit supplier ID/SKU/unit-cost/currency/effective time;
accept only validated structured input. Exact-map against a product belonging to
the same supplier and office. Persist unresolved rows rather than creating or
changing products. Parameterized selections choose latest effective supplier
cost, otherwise latest canonical cost, latest canonical listing, and valid
seller Finance rules as-of period end.

### Step 3: Asynchronous Pricing Agent task and artifact generation

**Files:** focused Worker pricing modules plus dispatcher integration.

Add reserved `pricing.simulation` context (`agentVersionId`, SKU array,
normalized channel, discount percent, strict UTC start/end). Claim delivery
first; for a new delivery validate task type/context/office/agent/version and
the required grants before any price/cost/Finance read. Reuse the pure engine,
persist one canonical report, render one bounded company workbook artifact, and
optionally persist a `prepared` action only when the proposed price is at or
above the calculated break-even minimum. Replays are terminal/idempotent;
storage failures roll back and retry. Generic and Margin dispatch stay intact.

### Step 4: Admin/API and semantic tools

**Files:** `apps/api/src/modules/pricing/*`, app/server wiring and tests.

Add admin-authenticated supplier-table import/read routes; an authenticated
simulation route that receives exactly SKU list, channel, discount, period and
agent ID, captures current agent version, and queues the specialized task; and
task-ID-only report/workbook reads. Register `pricing.getReport` as `READ` and
`pricing.prepareAction` as `PREPARE`; both use task-bound policy context and no
caller-supplied office. The prepare facade never calls a provider and records
the policy result/proposal only.

### Step 5: Documentation, gates, and deployment

**Files:** Sprint 9 doc and README.

Document break-even definition, confidence, provenance, supplier mapping,
workbook layout, prepared-versus-executed boundary, deferred channels, and
migration posture. Run full tests/typechecks/build/format/diff, independent
reviews, then apply migration 009 forward-only with Neon pre/post health checks
and publish the branch. Update docs with only the applied migration identifier
and pass/fail postflight result.

## Removal specification

No old code, endpoint, or file implements Cost & Pricing today. Nothing is
removed. During implementation, do not add a generic-task escape hatch,
temporary parser, legacy price calculator, compatibility route, or fallback
financial calculator.

## Anti-patterns to avoid

- Do not use `number`, spreadsheet formulas, or float arithmetic as financial
  authority.
- Do not fetch or write Shopee, Mercado Livre, Tray, ERP, or supplier systems.
- Do not infer supplier mappings with an LLM or fuzzy matching.
- Do not let a client supply office, agent version, report office, or arbitrary
  task context for agent/read-tool execution.
- Do not treat price preparation as an external price update or add an executor.
- Do not return missing Finance/cost/price evidence as zero or `REAL`.

## Validation criteria

### Pre-implementation

- [x] Approved Sprint 9 scope and standby boundary read.
- [x] `AGENTS.md` read; no relevant `CLAUDE.md` exists.
- [x] Catalog, Finance, Margin, task/outbox, Tool Registry, and schema patterns audited.
- [x] Existing types and final names identified.

### Post-implementation

- [ ] Contract/engine golden tests pass with decimal edge cases.
- [ ] Mapping, migration, worker retry/idempotency, API office-scope, and tool
  authorization regressions pass.
- [ ] Workbook download is derived from current persisted report and contains
  product/supplier evidence without clipped/invalid data.
- [ ] Generic `pricing.simulation` task creation is denied.
- [ ] Full workspace tests, typechecks, builds, frozen offline install,
  formatter, and `git diff --check` pass.
- [ ] Independent review accepts code and docs.
- [ ] Migration 009 is applied only after acceptance and has passing Neon
  postflight health.

## Implementation status ? 2026-08-26

Completed and validated on branch `sprint/09-cost-pricing`:

- Deterministic pricing simulation, supplier table import/mapping, immutable
  reports/prepared proposals, task queue/worker handling, and task-bound Tool
  Registry/Policy Engine authorization are implemented.
- `pricing.getReport` is a tenant-bound `READ` tool and
  `pricing.prepareAction` is a `PREPARE` policy evaluation only; neither calls
  a marketplace or other external provider.
- Migration 009 was previously applied to Neon. API, worker, and pricing-agent
  tests; builds; frozen offline install; and diff checks pass.

Remaining blocker for 100% completion:

- The required spreadsheet artifact runtime is not available in this session.
  The governing spreadsheet workflow permits XLSX creation only through its
  artifact tools, and those tools are not exposed here. No alternative XLSX
  library was introduced. Additionally, `pricing_workbook_artifact` currently
  stores metadata only; the later workbook implementation must add bounded
  PostgreSQL byte storage plus authenticated task-office-bound download tests.
