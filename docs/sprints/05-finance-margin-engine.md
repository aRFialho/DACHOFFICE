# Sprint 5 — Finance Rules and Deterministic Margin Engine

## Status

Sprint 5 local implementation and accepted task reviews are complete. On
2026-08-24, the primary agent independently ran `scripts/db-migrate.mjs` from
the Sprint 5 worktree with the repository root environment configuration and
observed `Applied migration 006_finance_margin.sql`; it then ran
`scripts/db-health.mjs` and observed health passed. Later that date, the
primary agent independently applied the finance-invariant migration
`007_finance_rule_invariants.sql`; the immediately following health validation
also passed. Both finance migration deployments and their postflight health
validation are complete. Connected marketplace/provider staging validation has
**not** been performed. It remains a separate release gate; this document does
not claim it has passed.

## Financial domain and DRE

`@dachbyte-office/finance` computes an auditable contribution-margin snapshot
from a selected, explicit revenue basis, one rule-version ID, normalized order
evidence, and a supplied calculation timestamp. Money is a validated decimal
string with at most four fractional places. Calculation uses fixed-scale
`bigint` arithmetic; database monetary columns use `numeric(19,4)`. Monetary
results never depend on JavaScript floating-point arithmetic.

The snapshot records these DRE totals and the calculation result:

```text
selected revenue
− CMV
− taxes
− marketplace fees
− seller discounts
− logistics
− ads cost
− other seller costs
= contribution amount

contribution percent = contribution amount / selected revenue × 100
```

Selected revenue must be non-zero. Percentage rounding is deterministic
round-half-up (away from zero at a signed tie). The snapshot retains the
revenue basis, rule version, calculation version, normalized totals, confidence,
timestamp, and component provenance in evidence JSON.

## Evidence, confidence, and no double counting

`REAL` and `ESTIMATED` are controlled financial facts, not model-generated
labels:

- Actual normalized marketplace evidence is `REAL`. A known raw code is
  classified by the explicit mapping in its rule version; an unknown raw code
  remains retained as `REAL` `other`/`unknown`, with its source, raw code, and
  source reference preserved.
- `ESTIMATED` candidates come only from versioned `channel_fee_rule`
  configuration for the matching channel and validity interval. They are not
  marketplace facts and must be labelled `ESTIMATED` wherever shown or used.
- A `REAL` component with the same canonical component type and payer
  suppresses an equivalent `ESTIMATED` candidate before aggregation. The
  suppressed estimate does not lower snapshot confidence.
- Final confidence is `REAL` only when selected revenue, CMV, and every
  included seller-cost input are `REAL`; otherwise it is `ESTIMATED`.

Only seller-paid components enter seller costs. Marketplace subsidies and
marketplace-paid coupons are kept in evidence but are not charged as seller
costs. Evidence with a nonblank provider source reference is deduplicated by
source, reference, raw code, classified type, payer, currency, and item
attribution; conflicting duplicates are rejected. Without a source reference,
the persisted component ID is the conservative identity. This prevents replayed
rebates from being charged twice while allowing genuinely distinct provider fee
lines to remain separate.

## Persistence and immutability

Migration `006_finance_margin.sql` adds rule sets, versioned rules, channel fee
rules, normalized order headers/items/components, and margin snapshots. The
component write path uses a bounded tenant-scoped idempotency key and
`UNIQUE (office_id, idempotency_key)` replay behavior.

Margin snapshots are append-only: database triggers reject their update and
delete. After a snapshot references a rule version, triggers also prevent
mutation or deletion of that rule version and prevent inserting, changing,
moving, or deleting its channel-fee rules. The guards use both the old and new
office/version association on updates, so an association cannot be moved away
from a used version to bypass immutability.

## Read and authorization boundary

Admin Master routes can read the latest office-scoped rule version and latest
immutable order-margin snapshot, and can create a validated versioned rule
configuration. Configuration creation is transactional: an equal retry returns
`unchanged`; a conflicting configuration at the same rule-set/version returns a
fixed conflict outcome. The exact version-key concurrency retry locks and
compares the persisted winner before any fee rows are written.

The Tool Registry exposes only `finance.getRules` and `finance.getMargin` as
semantic READ tools. They require the existing read grant and use the
server-loaded task office from the Policy Evaluation Context. Callers cannot
supply an office ID, so a task cannot read another office's finance data. Tool
and API reads select persisted PostgreSQL fields only; they do not call a
marketplace, provider, integration, worker, or Action Executor.

## Migration 006 and 007 release record

On 2026-08-24, the primary agent independently executed
`scripts/db-migrate.mjs` from the Sprint 5 worktree using the repository root
environment configuration. The observed migration result was
`Applied migration 006_finance_margin.sql`. The immediately following
independent `scripts/db-health.mjs` check observed a passing health result.
This is the deployment and postflight evidence for the database gate; it does
not include a connection value, secret, environment value, or raw financial
evidence.

Migration 006 is additive, but it creates durable financial evidence and can
be referenced by downstream data. Migration 007 is forward-only.

Later on 2026-08-24, the primary agent independently applied
`007_finance_rule_invariants.sql`, the forward finance-invariant migration.
The immediately following database-health validation passed. This is separate
deployment and postflight evidence for the finance invariants and likewise
does not include a connection value, secret, environment value, or raw
financial evidence.
Operational records must not include a connection string, secret, environment
value, or raw financial evidence.

For a future environment, verify the intended target, approved change window,
backup/recovery posture, and reviewed migration revision before applying it.
Use the repository's `db:health` and `db:migrate` scripts through the approved
operational process. Follow an application with health validation and approved
verification of its migration record, tables, constraints, indexes, and
immutability triggers. If a problem is found after application, do not issue a
destructive rollback: create and review a forward migration that preserves any
schema or financial evidence already in use.

## Acceptance evidence

| Requirement                                                            | Evidence                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decimal money, finance contracts, normalized schema                    | `packages/finance/src/contracts.ts`; `db/migrations/006_finance_margin.sql`; finance contract and migration-schema tests (Task 1, accepted after closure review).                                                    |
| Versioned classification, provenance, estimates, component idempotency | `packages/finance/src/classification.ts`; `packages/finance/src/postgres-financial-component-repository.ts`; classification/repository tests (Task 2 re-review accepted).                                            |
| Deterministic DRE and decimal calculation                              | `packages/finance/src/contribution-margin.ts`; golden and review-regression tests, including real-over-estimate suppression, subsidy exclusion, duplicate evidence, and signed rounding (Task 3 re-review accepted). |
| Immutable snapshots and used-rule protection                           | migration 006 immutable triggers; migration-schema regression coverage; Task 1 closure review accepted.                                                                                                              |
| Office-scoped admin reads/configuration and retries                    | `apps/api/src/modules/finance/`; finance repository, route, configuration, and concurrent-retry tests (Task 4 re-review accepted).                                                                                   |
| Authorized semantic finance reads                                      | `apps/api/src/modules/finance/finance-tools.ts`; policy context office binding and `finance-tools-office-scope.test.ts` (Task 4 re-review accepted).                                                                 |
| Local release quality                                                  | Task records report finance/API/workspace tests and typechecks, Prettier, and `git diff --check` passing at their respective accepted revisions.                                                                     |
| Database deployment                                                    | 2026-08-24 primary-agent evidence: 006 applied with subsequent health pass; independent application of forward invariant migration `007_finance_rule_invariants.sql` also had an immediate health pass.              |

## Deferred staging acceptance

The following are deliberately **not passed** by Sprint 5 acceptance:

- Controlled staging validation with provisioned marketplace/provider data.
- End-to-end ingestion of provider financial facts, persistence, calculation,
  and readback against connected infrastructure.

No direct marketplace call is part of Sprint 5. Connected validation must use
the approved worker/integration path and must not expose credentials or raw
provider payloads.
