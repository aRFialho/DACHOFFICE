# Tray Canonical Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Tray catalog data into canonical PostgreSQL records and expose Store General read-only semantic tools that make missing mappings explicit.

**Architecture:** A shared `@dachbyte-office/catalog` package owns provider-neutral catalog contracts, normalization, encrypted credential access and PostgreSQL persistence. The API only starts authenticated sync runs or reads canonical state; the worker claims and executes the Tray fetch asynchronously. The existing Sprint 3 Tool Registry and Policy Engine authorize each semantic read tool.

**Tech Stack:** TypeScript strict, Node.js 24 fetch and crypto, Fastify 5, pg 8, Vitest 4, Neon PostgreSQL numeric columns, Tray OAuth 2.0 REST API.

**Spec:** `docs/superpowers/specs/2026-08-21-tray-canonical-catalog-design.md`

## Global Constraints

- Tray and all external payloads are untrusted data; adapters validate them and never authorize tools.
- No agent receives Tray credentials, raw HTTP capability, a provider URL or plaintext tokens.
- Product costs and prices remain decimal strings in TypeScript and `numeric(19,4)` in PostgreSQL; no financial float arithmetic.
- The adapter is read-only: no Tray POST, PUT or DELETE method exists.
- A catalog sync always runs in the worker, never in a Fastify request handler.
- A missing/ambiguous mapping is persisted as `unresolved` and returned explicitly; it is never inferred.
- Store General reads canonical PostgreSQL only; a tool invocation does not call Tray or another agent.
- Tray tokens are encrypted with AES-256-GCM using a server secret and are absent from logs, errors, events, responses and audit metadata.
- All external reads observe a bounded timeout and the documented Tray rate-limit budget.
- The branch is stacked on `sprint/03-tool-registry-policy`; its PR targets that branch until PR #2 merges.

---

## File Structure

| File                                                                                   | Responsibility                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`                                                                  | Add `packages/*` to the workspace.                                                                    |
| `packages/catalog/package.json`                                                        | Publish the internal catalog contract package to API and worker workspaces.                           |
| `packages/catalog/src/contracts.ts`                                                    | Canonical/provider records, mapping states, decimal-string validation, and CatalogProvider interface. |
| `packages/catalog/src/tray-credential-provider.ts`                                     | Server-only encrypted Tray token retrieval and one bounded refresh attempt.                           |
| `packages/catalog/src/tray-catalog-adapter.ts`                                         | Read-only Tray product/variation HTTP adapter with response parsing.                                  |
| `packages/catalog/src/catalog-normalizer.ts`                                           | Converts provider records into canonical candidates without guessing mappings.                        |
| `packages/catalog/src/postgres-catalog-repository.ts`                                  | Transactional sync-run, mapping, listing and append-only cost snapshot persistence.                   |
| `packages/catalog/src/catalog-sync-service.ts`                                         | Pages Tray, checkpoints a run, normalizes and persists idempotently.                                  |
| `packages/catalog/src/store-general-tools.ts`                                          | Registered semantic READ definitions and canonical repository handlers.                               |
| `packages/catalog/test/*.test.ts`                                                      | Contract, crypto, adapter, normalization, idempotency and read-tool tests.                            |
| `db/migrations/005_tray_canonical_catalog.sql`                                         | Canonical catalog, integration and durable sync-queue schema.                                         |
| `apps/api/src/modules/catalog/catalog-routes.ts`                                       | Admin-only sync command and canonical product read endpoints.                                         |
| `apps/api/src/server.ts`, `apps/api/src/app.ts`                                        | Wire catalog repository/services/routes with the existing pool and auth.                              |
| `apps/worker/src/tray-catalog-worker.ts`                                               | Claims `catalog.sync.requested` outbox jobs and invokes CatalogSyncService.                           |
| `apps/worker/src/worker.ts`                                                            | Starts bounded consumption for both task and catalog queues.                                          |
| `apps/api/test/catalog-routes.test.ts`, `apps/worker/test/tray-catalog-worker.test.ts` | API queue-boundary and worker-idempotency tests.                                                      |
| `.env.example`, `docs/sprints/04-tray-canonical-catalog.md`, `README.md`               | Secret variable names, operating boundary and delivered-sprint documentation.                         |

### Task 1: Canonical schema and provider-neutral contracts

**Files:**

- Create: `db/migrations/005_tray_canonical_catalog.sql`
- Create: `packages/catalog/package.json`, `packages/catalog/tsconfig.json`, `packages/catalog/src/contracts.ts`
- Modify: `pnpm-workspace.yaml`, `apps/api/package.json`, `apps/worker/package.json`
- Test: `packages/catalog/test/contracts.test.ts`

**Interfaces:**

- `CatalogProvider.listProducts({ cursor?: string }): Promise<CatalogPage>`, `getProduct({ externalProductId: string }): Promise<ProviderProduct>`, and `listVariations({ cursor?: string }): Promise<VariationPage>`.
- `ProviderProduct` preserves string external IDs, reference, EAN, decimal strings, stock, status and variations.
- `MappingResolution = { status: "mapped"; productId: string } | { status: "unresolved"; reason: "missing_sku" | "ambiguous_sku" | "mapping_not_found" }`.
- `assertDecimalString(value: unknown, field: string): string` rejects number, exponent notation, non-finite and over-precision provider values.

- [ ] **Step 1: Write the failing contract tests.** Assert a Tray-shaped product with `price: "19.90"` and `cost_price: "10.0000"` parses; number `19.9`, exponent `"1e3"`, blank reference and duplicate variation identity reject with literal error reasons.
- [ ] **Step 2: Verify red.** Run `corepack pnpm --filter @dachbyte-office/catalog test -- contracts.test.ts`. Expected: missing workspace/package failure.
- [ ] **Step 3: Implement contracts and migration.** Add `packages/*` workspace support. Migration 005 creates `integration`, `supplier`, `product`, `product_cost_snapshot`, `external_product_mapping`, `channel_listing`, `tray_store_connection`, and `catalog_sync_run`; all IDs are UUIDs, decimal columns are `numeric(19,4)`, external mapping status is constrained to `mapped|unresolved`, and unique indexes cover provider external identity, canonical SKU and one listing identity. The migration adds an `outbox_message` topic check only if the existing generic topic column needs no schema change.
- [ ] **Step 4: Verify green.** Run the focused package test, `corepack pnpm --filter @dachbyte-office/catalog typecheck`, and `corepack pnpm db:migrate`. Expected: parser tests pass and migration applies once then is a no-op.
- [ ] **Step 5: Commit.** `git add pnpm-workspace.yaml packages/catalog db/migrations/005_tray_canonical_catalog.sql apps/api/package.json apps/worker/package.json pnpm-lock.yaml && git commit -m "feat: add canonical catalog schema and contracts"`.

### Task 2: Tray credential boundary and read-only adapter

**Files:**

- Create: `packages/catalog/src/tray-credential-provider.ts`, `packages/catalog/src/tray-catalog-adapter.ts`
- Test: `packages/catalog/test/tray-credential-provider.test.ts`, `packages/catalog/test/tray-catalog-adapter.test.ts`
- Modify: `.env.example`

**Interfaces:**

- `TrayCredentialProvider.getAccessToken(connectionId: string): Promise<{ apiAddress: string; accessToken: string }>`.
- `TrayConnectionRepository.loadEncrypted(connectionId)` and `replaceEncryptedTokens(input)` never return a token to callers outside the credential provider.
- `TrayCatalogAdapter` implements `CatalogProvider` and accepts only `fetch`, `TrayCredentialProvider`, timeout and safe rate-budget dependencies.
- `TRAY_TOKEN_ENCRYPTION_KEY` is required server-side, base64-decoded to exactly 32 bytes; `TRAY_BOOTSTRAP_*` names are documented but values remain blank and ignored.

- [ ] **Step 1: Write the failing adapter/credential tests.** Use a real AES-GCM encrypt/decrypt round-trip with a fixed test key. Assert an expired token refreshes once, a second 401 is retryable without exposing the token, `products` and `products/variants` GET calls parse fixture payloads, and the fake fetch sees no POST/PUT/DELETE. Assert every thrown error equals a safe code and does not contain `access_token` or `refresh_token`.
- [ ] **Step 2: Verify red.** Run `corepack pnpm --filter @dachbyte-office/catalog test -- tray-credential-provider.test.ts tray-catalog-adapter.test.ts`. Expected: missing modules.
- [ ] **Step 3: Implement minimally.** Encrypt each token independently with `createCipheriv("aes-256-gcm", key, iv)`; store ciphertext, IV and auth tag. Use the Tray documented `api_address`, product and variation GET paths, URLSearchParams for query encoding, AbortSignal timeout and a bounded 180/min budget. Refresh only through the documented server-side token endpoint and atomically replace encrypted values. Do not log response bodies, URLs or headers.
- [ ] **Step 4: Verify green.** Run focused tests and package typecheck. Expected: contract fixtures parse, bad payloads deny, refresh is bounded and no secret appears in output.
- [ ] **Step 5: Commit.** `git add packages/catalog/src packages/catalog/test .env.example && git commit -m "feat: add read-only Tray catalog adapter"`.

### Task 3: Canonical persistence, explicit mapping and idempotent sync

**Files:**

- Create: `packages/catalog/src/catalog-normalizer.ts`, `packages/catalog/src/postgres-catalog-repository.ts`, `packages/catalog/src/catalog-sync-service.ts`
- Test: `packages/catalog/test/catalog-normalizer.test.ts`, `packages/catalog/test/catalog-sync-service.test.ts`

**Interfaces:**

- `normalizeProviderProduct(product): NormalizedCatalogItem | MappingResolution` accepts a Tray reference only as an explicit SKU source; absent/ambiguous values return unresolved.
- `CatalogRepository.startRun(input)`, `claimRun()`, `checkpointRun()`, `persistItem(input)`, `completeRun()`, and `failRun()` are transactional.
- `CatalogSyncService.run(runId: string): Promise<SyncSummary>` consumes paginated provider pages without calling an agent or an HTTP route.

- [ ] **Step 1: Write the failing sync tests.** Assert an exact Tray reference creates/updates one canonical product and one mapped listing, appends a numeric cost snapshot, and replays without duplicate listing or same-observation snapshot. Assert missing reference and two canonical products sharing a candidate SKU produce a persisted unresolved mapping and no listing. Assert a second run page resumes from its checkpoint.
- [ ] **Step 2: Verify red.** Run `corepack pnpm --filter @dachbyte-office/catalog test -- catalog-normalizer.test.ts catalog-sync-service.test.ts`. Expected: missing normalizer/service modules.
- [ ] **Step 3: Implement minimally.** Normalize only validated values. In one transaction, lock by provider external identity, resolve an already mapped product first, otherwise resolve one exact SKU or persist unresolved. Upsert `channel_listing`; insert `product_cost_snapshot` only when its provider observation fingerprint is new; persist cursor/checkpoint after each committed page. On provider failure, preserve completed pages and mark only the run retryable with a safe code.
- [ ] **Step 4: Verify green.** Run focused tests, typecheck, and `corepack pnpm db:migrate` twice. Expected: all mapping/idempotency cases pass and second migration run is a no-op.
- [ ] **Step 5: Commit.** `git add packages/catalog/src packages/catalog/test && git commit -m "feat: sync Tray catalog into canonical data"`.

### Task 4: Async API/worker delivery and Store General reads

**Files:**

- Create: `apps/api/src/modules/catalog/catalog-routes.ts`, `apps/worker/src/tray-catalog-worker.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker.ts`
- Test: `apps/api/test/catalog-routes.test.ts`, `apps/worker/test/tray-catalog-worker.test.ts`, `packages/catalog/test/store-general-tools.test.ts`

**Interfaces:**

- `POST /v1/integrations/tray/catalog-sync` is Admin Master-only, persists `catalog_sync_run` plus an outbox message and returns 202 with the run ID.
- `TrayCatalogOutboxWorker.consumeOne(): Promise<boolean>` claims only `catalog.sync.requested`, invokes `CatalogSyncService.run`, and settles retries idempotently.
- `createStoreGeneralTools(repository)` registers `products.get`, `products.search`, `products.getCost`, and `products.getListing` as READ tools.
- Tool handlers receive a trusted `PolicyEvaluationContext`, call `ToolAuthorizationService.authorize`, and return canonical results or `mapping_not_found|mapping_unresolved`.

- [ ] **Step 1: Write failing route, worker and tool tests.** Assert an unauthorized sync request is 401; an Admin request returns 202 and the route never calls the adapter. Assert repeated outbox delivery executes the run once. Assert each Store General handler returns canonical repository data and an unresolved mapping result without invoking Tray; a missing grant produces the Sprint 3 denied decision.
- [ ] **Step 2: Verify red.** Run `corepack pnpm --filter @dachbyte-office/api test -- catalog-routes.test.ts`, `corepack pnpm --filter @dachbyte-office/worker test -- tray-catalog-worker.test.ts`, and `corepack pnpm --filter @dachbyte-office/catalog test -- store-general-tools.test.ts`. Expected: missing route/worker/tool modules.
- [ ] **Step 3: Implement minimally.** Inject catalog services through `BuildServerOptions` and the API server composition root. Reuse `authenticateAdminMaster`; parse only an optional bounded `integrationId`. Add a separate worker queue focused on the catalog topic rather than modifying task state transitions. Register only READ semantic tools, with required grant `read`, and return no raw provider field or secret.
- [ ] **Step 4: Verify green.** Run the three focused suites plus API/worker/catalog typechecks. Expected: 202 only queues work, worker no-ops repeated delivery, reads are authorized and database-only.
- [ ] **Step 5: Commit.** `git add apps/api apps/worker packages/catalog && git commit -m "feat: queue Tray sync and Store General reads"`.

### Task 5: Documentation, connected validation and release gates

**Files:**

- Create: `docs/sprints/04-tray-canonical-catalog.md`
- Modify: `README.md`, `.env.example`

**Interfaces:**

- Documents the secret names only, OAuth bootstrap/refresh ownership, mapping outcomes, operation to start and observe a sync, and recovery from a retryable Tray error.
- Documents the read-tool semantic contract and the deliberate absence of provider writes.

- [ ] **Step 1: Write documentation acceptance statements.** State that product reads are canonical, a Tray sync is asynchronous, missing mapping is explicit, tokens are server-only encrypted material, and no write tool exists.
- [ ] **Step 2: Verify connected path.** With user-provisioned non-production Tray credentials in ignored environment variables, run the controlled bootstrap command, `POST /v1/integrations/tray/catalog-sync`, worker consumption, then `products.get` for a known mapped SKU. Expected: a numeric snapshot and listing are persisted; command output never prints a credential. If credentials are unavailable, run recorded fixture validation and mark the connected acceptance as pending rather than simulating success.
- [ ] **Step 3: Complete docs and README.** Set status to Sprints 0–4 delivered only after the connected path is proved. Otherwise state precisely that Sprint 4 code is complete with connected validation pending.
- [ ] **Step 4: Run full gates.** Run `corepack pnpm format:check`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `corepack pnpm db:migrate`, `corepack pnpm db:health`, `git diff --check`, and `git status --short`.
- [ ] **Step 5: Commit.** `git add docs/sprints/04-tray-canonical-catalog.md README.md .env.example && git commit -m "docs: complete Sprint 4 Tray catalog"`.

## Acceptance Criteria

- A connected Tray product/variation fixture becomes canonical product/listing/cost data with numeric persistence and idempotent replay.
- The Store General read tools resolve canonical product, cost and listing data without calling Tray or another agent.
- Unknown, malformed, absent and ambiguous mappings remain explicit and never create guessed mappings.
- Credentials are server-only encrypted material; no test, response, audit record or log contains token material.
- All Tray requests are bounded GET reads with validated payloads and a documented rate budget.
- A sync is queued, processed by a worker and retry-safe; no HTTP handler performs provider work.
- READ tools are registry-defined and gated by the Sprint 3 authorization service.
- No external write, destructive tool, raw HTTP tool or financial float calculation is introduced.
