# Sprint 4 — Tray Canonical Catalog

## Status

Sprint 4 code and local fixture coverage are complete. Connected Tray
validation is **pending**: it must be run by the controller with provisioned,
non-production credentials. This document does not claim that a connected Tray
sync has passed.

## Ownership and trust boundary

Store General owns canonical product identity, external SKU mappings, and all
catalog reads. Tray is a read-only provider of untrusted external facts. Tray
payloads are validated, normalized, versioned through sync snapshots, and
persisted before they can be used by Store General.

Tray access and refresh tokens are encrypted server-only material. The
credential provider decrypts them only in the worker process, refreshes them
at most once when necessary, and atomically stores replacement encrypted
material. Tokens must never appear in browser code, agent context, API/tool
responses, events, audit records, errors, or logs.

## Configuration

Use the names in `.env.example`; supply values only through the deployment
secret mechanism or ignored local environment. The Tray-related names are:

- `TRAY_TOKEN_ENCRYPTION_KEY`
- `TRAY_BOOTSTRAP_CLIENT_ID`
- `TRAY_BOOTSTRAP_CLIENT_SECRET`
- `TRAY_BOOTSTRAP_AUTHORIZATION_CODE`
- `TRAY_BOOTSTRAP_OFFICE_ID`
- `TRAY_BOOTSTRAP_INTEGRATION_ID`
- `TRAY_BOOTSTRAP_API_ADDRESS`

These values are server-only. The bootstrap authorization code is for the
controlled connection bootstrap path, not a browser callback or public route.
The bootstrap command requires an explicit office and a Tray integration owned
by that office; it never selects a connection from another Office.

## Sync operation

An Admin Master starts a catalog synchronization with
`POST /v1/integrations/tray/catalog-sync`. An optional bounded
UUID `integrationId` selects an active Tray integration; otherwise the earliest
active Tray integration is used. A successful request returns HTTP 202 with a
sync-run ID.

The request only persists `catalog_sync_run` and an outbox message. It does
not call Tray inline. The worker claims `catalog.sync.requested`, obtains the
server-only credential, performs bounded Tray GET reads, and checkpoints the
run. Observe progress through the persisted sync-run and outbox records using
the run ID; inspect only sanitized counts, status, and failure codes.

Tray sync uses a maximum budget of 180 requests per minute and a bounded
request timeout. The adapter exposes no POST, PUT, DELETE, generic request, or
raw URL capability, so Sprint 4 introduces no Tray provider-write capability.

## Mapping outcomes

Each provider product or variation receives an explicit external mapping:

- `mapped`: an established mapping or one unique exact canonical SKU/reference
  match exists. The worker upserts the Tray channel listing and appends a
  numeric cost snapshot.
- `unresolved`: the reference is missing, ambiguous, or has no canonical
  match. The unresolved mapping is persisted with a reason; it creates no
  guessed product, listing, or cost snapshot.

Replaying a page or sync run is idempotent for listings, mappings, and an
observation-equivalent cost snapshot.

## Store General read contract

The registry contains only these semantic READ tools, each authorized by the
existing Tool Authorization Service and served from canonical PostgreSQL data:

- `products.get` — canonical product by SKU.
- `products.search` — canonical products by bounded query.
- `products.getCost` — latest canonical cost snapshot by SKU.
- `products.getListing` — mapped canonical Tray listing by SKU.

These tools never call Tray or another agent during a request. A missing item
returns `mapping_not_found`; an explicitly unresolved listing returns
`mapping_unresolved`. The tools return no raw provider payload or credential,
and there is no Store General or Tray write tool in this sprint.

## Retry and recovery

The worker keeps completed pages, marks a provider failure as retryable, and
reuses the run checkpoint on the next attempt. Retry delivery is bounded to
five attempts with backoff; recovery is performed by correcting the underlying
server-side configuration or provider condition, then allowing the queued
delivery to retry or starting a new Admin-authorized sync.

Safe codes to use for operations and incident triage include:

- Retryable provider conditions: `tray_auth_retryable`, `tray_rate_limited`,
  `tray_timeout`, `tray_upstream_unavailable`, and
  `catalog_provider_retryable`.
- Non-retryable credential or payload conditions:
  `tray_credentials_invalid`, `tray_response_invalid`, and
  `tray_rate_budget_invalid`.
- Queue/delivery conditions: `catalog_sync_retryable`,
  `catalog_sync_retry_exhausted`, `catalog_worker_lease_reclaimed`, and
  `catalog_outbox_payload_invalid`.

Treat the code as the diagnostic surface. Do not copy request URLs, headers,
provider bodies, access tokens, refresh tokens, or secret values into tickets
or logs.

## Validation record

Local non-live fixture tests cover Tray-shaped product and variation parsing,
credential redaction and bounded refresh, GET-only adapter behavior, rate
budgeting, mapping outcomes, idempotent sync, queue delivery, and canonical
Store General reads. Type checking is also part of the local release gate.

Connected acceptance remains pending until the controller runs the controlled
bootstrap, starts the API sync operation, lets the worker consume it, and
confirms a known mapped SKU through `products.get` without exposing a
credential.
