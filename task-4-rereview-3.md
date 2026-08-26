# Sprint 4 — Task 4 Final-correction Re-review

**Scope:** the bounded OAuth-refresh correction on top of `1472bbc`, reviewed
against the approved Sprint 4 specification and the prior Task 4 review.
No environment, database, migration, or live Tray operation was used.

## Verdict: resolved

The final P1 is resolved. The concrete worker-owned Tray OAuth refresh can no
longer leave the worker poll loop pinned by a request that never settles.

## Correction

`createTrayRefreshTransport` now creates an `AbortController` with a
server-owned 10-second deadline; any injected timeout is capped at 30 seconds.
Its signal is supplied to the OAuth `fetch`, and the same deadline wraps
response JSON consumption. The timeout is cleared in `finally` for every
success and failure path.

Abort, network, HTTP, JSON, and malformed-response failures are all reduced
to the fixed retryable code `tray_refresh_failed`. The transport neither logs
nor returns token values, request bodies, headers, URLs, or provider response
text.

## Regression coverage

The fake-timer behavior test keeps the provider fetch pending until it
observes the request signal abort. It proves that the result is the safe,
redacted failure and then proves that the worker settles the failed sweep and
begins its next poll, rather than leaving `consuming` pinned.

## Verification

- `corepack pnpm --filter @dachbyte-office/worker test` — 4 files, 11 tests
  passed.
- `corepack pnpm --filter @dachbyte-office/worker typecheck` — passed.
- `git diff --check` — passed.
