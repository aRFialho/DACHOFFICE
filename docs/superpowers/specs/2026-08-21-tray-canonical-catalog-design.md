# Tray Canonical Catalog Design

## Purpose

Sprint 4 establishes the canonical product catalog owned by the Store General
domain and connects it to Tray as the first ERP/Hub-style catalog source. The
canonical database, not Tray payloads, answers future agent read requests.
Tray remains a provider of untrusted external facts that are normalized,
validated, versioned by snapshots, and persisted before use.

## Scope

The sprint delivers:

- canonical products, suppliers, cost snapshots, channel listings, and explicit
  external SKU mappings;
- a read-only Tray catalog adapter for products and variations;
- a server-only OAuth credential boundary with refresh support;
- asynchronous catalog synchronization through the worker;
- Store General semantic read tools backed only by canonical PostgreSQL data;
- contract, repository, synchronization, and missing-mapping tests.

It does not write to Tray, expose a callback UI, call a model, calculate
margin, infer mappings, or use the virtual Office as a data source.

## Source and ownership

Store General owns consolidated product identity, product-to-channel mappings,
and canonical catalog retrieval. Tray owns its product and variation records.
The adapter must preserve the Tray external identifiers and relevant raw
references, but external strings never become instructions or authorization.

A future ERP/Hub adapter implements the same catalog-provider contract. It
does not require a new product domain or change the Store General read tools.

## Data model

Migration 005 adds the following focused tables. Money and cost values are
PostgreSQL `numeric(19,4)`; TypeScript carries provider decimals as validated
strings until PostgreSQL persists them. No JavaScript floating-point arithmetic
is used for financial values.

- `supplier`: `id`, `name`, `active`, timestamps.
- `product`: `id`, unique `sku`, `name`, optional `supplier_id`,
  optional `ean`, `active`, timestamps.
- `product_cost_snapshot`: `id`, `product_id`, `source`,
  `cost_numeric`, `currency`, `valid_at`, `observed_at`,
  `source_reference`. Snapshots are append-only.
- `channel_listing`: `id`, `product_id`, `channel`,
  `external_listing_id`, nullable `external_variation_id`,
  nullable `external_sku`, `current_price_numeric`,
  nullable `current_promo_price_numeric`, `currency`, `status`,
  `observed_at`. A unique external identity prevents duplicate listings.
- `external_product_mapping`: `id`, `provider`, `external_product_id`,
  nullable `external_variation_id`, nullable `external_sku`, nullable
  `product_id`, `status` (`mapped` or `unresolved`),
  `resolution_reason`, timestamps. The nullable canonical ID records an
  unresolved provider item explicitly; it is never guessed.
- `integration`: the handoff's opaque connection record with type `tray`,
  `name`, `status`, capability metadata and a non-secret `credential_ref`.
- `tray_store_connection`: `integration_id`, `store_id`,
  `api_address`, encrypted access/refresh-token ciphertexts and expiry
  timestamps. It stores no plaintext token.
- `catalog_sync_run`: `id`, `integration_id`, `status`, request and
  completion timestamps, cursor/checkpoint metadata, counts, and a sanitized
  failure code. It supports safe retries and audit reconstruction.

Foreign keys retain company/Office-compatible ownership boundaries. A mapped
listing requires a canonical product. An unresolved external item has a mapping
row but cannot create a listing or cost snapshot until a human or future mapping
workflow resolves it.

## Credentials and Tray connection

Tray OAuth is mediated by `TrayCredentialProvider`, not agents or tools. It
loads encrypted token material from the server-side connection repository,
decrypts it only in process using a Render secret encryption key, refreshes it
when required, and writes a newly encrypted record atomically. Its values are
redacted from all errors, audit payloads, logs, events, and tool results.

The adapter accepts only a ready access token and the stored `api_address`;
it cannot access environment variables, PostgreSQL, or agent context directly.
The initial connection is provisioned by a controlled server-side bootstrap
command using Render/.env secrets, then represented by the encrypted database
record. The browser callback/setup UI is explicitly deferred; no secret is ever
accepted by a public product route.

Tray supplies a per-store `api_address` after OAuth authorization, and its
documented product endpoints return product IDs, references, EAN, price,
cost_price, promotional_price, stock and variation data. The adapter treats
provider decimal fields as strings and validates them before normalization.
[Tray OAuth and products](https://developers.tray.com.br/)

## Adapter contract and sync flow

`CatalogProvider` exposes only semantic read methods:

```ts
interface CatalogProvider {
  listProducts(input: { cursor?: string }): Promise<CatalogPage>;
  getProduct(input: { externalProductId: string }): Promise<ProviderProduct>;
  listVariations(input: { cursor?: string }): Promise<VariationPage>;
}
```

`TrayCatalogAdapter` implements the contract with Tray's product and
variation reads. It applies a bounded timeout, provider-safe pagination,
documented rate limit budget, error classification, and response shape
validation. It does not offer POST, PUT, DELETE, generic request, or raw URL
methods.

An Admin-triggered sync creates a persisted `catalog_sync_run` and queues
work; it never fetches Tray inline in an HTTP handler. The worker obtains the
credential through the provider, pages the adapter, and applies idempotent
upserts in transactions:

1. normalize and validate each Tray product/variation;
2. find an existing mapping by provider external IDs;
3. map only with an explicit established mapping or a unique exact canonical
   SKU/reference match;
4. otherwise persist an `unresolved` mapping with a reason and continue;
5. for mapped items, upsert the channel listing and append a cost snapshot;
6. checkpoint the run and emit sanitized task/catalog events.

A repeated page or run cannot duplicate a listing, mapping, or same-observation
snapshot. A provider failure marks the run retryable with no partial mapping
guess.

## Store General read tools

The registry receives server-defined READ definitions:

- `products.get` by canonical SKU;
- `products.search` by exact SKU, EAN, or bounded name query;
- `products.getCost` returning the most recent canonical cost snapshot;
- `products.getListing` returning mapped Tray listing state.

Their handlers read canonical repositories only. They call the Sprint 3
`ToolAuthorizationService` with trusted task, agent, Office, version, grant,
and policy facts before returning data. They never call Tray during an agent
request, preventing inter-agent dependency and a provider outage from changing
an authoritative result.

An unmapped SKU/listing returns an explicit `mapping_not_found` or
`mapping_unresolved` result rather than null-like guessed data. The handler
does not authorize a write, return credentials, or reveal raw provider payloads.

## Error handling and observability

Provider 401/token expiration triggers the credential provider's bounded
refresh path once; persistent authentication failure marks the integration
unhealthy without exposing token information. Provider rate-limit and
transient failures classify as retryable. Schema/normalization failures record
only provider identifiers and a safe code, leave the item unresolved, and
continue the batch when safe.

Sync run metrics include pages, items seen, mapped/unresolved counts, retry
count, duration and sanitized error code. Audit records include the initiating
task/user, integration ID, sync run ID and counts, never credential or raw
provider data.

## Test strategy

Tests are written before each behavior and use recorded Tray-shaped fixtures
through a real adapter boundary:

- contract parsing preserves external IDs and rejects malformed decimal or
  product/variation payloads;
- a mapped Tray item becomes one canonical listing plus an append-only numeric
  cost snapshot;
- missing or ambiguous mappings persist as `unresolved` and cannot create a
  guessed canonical listing;
- a replayed sync page is idempotent;
- expired-token refresh is server-side and redacted;
- Store General read tools resolve canonical data without calling another
  agent or Tray, require the existing READ authorization gate, and report
  mapping absence explicitly;
- worker/API integration proves a sync is queued and executed out of the HTTP
  request path.

## Branching and acceptance

Sprint 4 is developed on `sprint/04-tray-canonical`, based on
`sprint/03-tool-registry-policy`. Its pull request initially targets Sprint
3, then is retargeted after PR #2 merges.

Acceptance is satisfied only when a connected Tray fixture/credential path
syncs canonical product data, a Store General read tool resolves it from
PostgreSQL, and an absent mapping is explicitly unresolved rather than guessed.
