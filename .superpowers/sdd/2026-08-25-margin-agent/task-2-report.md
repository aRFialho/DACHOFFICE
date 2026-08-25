# Sprint 7 Task 2 report

## Delivered

- Added forward-only `008_margin_analysis_reports.sql` without applying it. It
  creates the office-scoped immutable margin report system of record with
  office/task and agent/version tenant-safe foreign keys, immutable trigger,
  bounded idempotency key, DRE `numeric(19,4)` totals, report JSON evidence and
  provenance, and latest-report indexes.
- Added the worker-owned parameterized Postgres Margin Analysis repository.
  It reads the latest per-order office-scoped snapshot in an inclusive UTC
  period, preserves source evidence and finance/calculation provenance, loads
  deterministic valid canonical costs, makes missing or ambiguous mappings
  explicit, and persists retry-safe immutable reports with `created`,
  `unchanged`, and fixed `conflict` outcomes.
- Added schema and repository unit coverage for immutability, tenant scope,
  parameterization, deterministic snapshot/cost selection, unresolved costs,
  source preservation, replay, and conflict behavior.
- Added the minimal Worker workspace dependency/importer for Margin Agent.

## TDD and validation

- RED: focused worker tests failed before implementation because both the
  migration and repository module were absent.
- GREEN: `corepack pnpm --filter @dachbyte-office/worker test -- postgres-margin-analysis-repository.test.ts margin-analysis-migration-schema.test.ts` (36 tests passed).
- `corepack pnpm --filter @dachbyte-office/worker typecheck` passed.
- `corepack pnpm --filter @dachbyte-office/margin-agent typecheck` passed.
- `corepack pnpm install --offline --frozen-lockfile` passed.
- Prettier check passed for touched supported files; the repository's Prettier
  configuration has no inferred parser for `.sql`, so the migration was left
  as the established hand-formatted SQL style.
- `git diff --check` passed.

No environment, Neon, external API/provider, route, or migration-deployment
action was performed.
