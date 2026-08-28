# Sprint 7 Task 4 report

## Delivered

- Added authenticated `POST /v1/margin/analyses` and task-only
  `GET /v1/margin/analyses/:taskId` API routes. Creation accepts only validated
  period/filter/office/agent input; it captures the active immutable agent
  version server-side and creates the exact Task 3 context rows.
- Added a focused Postgres API adapter that validates the office-owned active
  agent and all three required READ grants in a transaction immediately before
  queuing the human `margin.analysis` task, immutable queued event, audit entry,
  and idempotent outbox message.
- Added the read-only `margin.getReport` Tool Registry facade. Its input is one
  task UUID; it loads the task-bound policy context, checks the captured agent
  version against the current active version and authorizes before any report
  read. Report queries are task/office scoped and parameterized.
- Wired the focused margin runtime into the API without changing generic task
  route behavior.

## Validation

- RED: focused Task 4 tests initially failed because the margin service and
  Tool Registry modules did not exist.
- Focused API tests: 8/8 passed.
- Full API suite: 62/62 passed.
- `corepack pnpm --filter @dachbyte-office/api typecheck` passed.
- `corepack pnpm install --offline --frozen-lockfile` passed.
- Targeted Prettier check and `git diff --check` passed.

No environment, migration, provider, external-write, credential, or database
deployment action was performed.

## Review remediation

- Replaced the permissive `Date.parse`/suffix timestamp check with a strict
  ISO-8601 UTC parser that requires complete date/time/seconds and trailing
  `Z`, permits optional fractional seconds, and verifies calendar components
  after parsing. Invalid normalized calendar dates cannot enter immutable task
  context.
- Added RED-to-GREEN HTTP/service regressions for space-separated, date-only,
  impossible-calendar-date, and non-`Z` period values. Each rejects before
  eligibility, task, outbox, or audit writes.
- Remediation validation: focused timestamp/route/tool tests 12/12, full API
  suite 66/66, API typecheck, frozen offline install, Prettier, and diff check
