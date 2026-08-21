import { randomUUID } from "node:crypto";
import type { MappingResolution } from "./contracts.js";
import type { NormalizedCatalogItem } from "./catalog-normalizer.js";

export type CatalogRun = {
  id: string;
  officeId: string;
  integrationId: string;
  provider: string;
  observedAt: Date;
  checkpointCursor: string | undefined;
  pagesSeen: number;
  itemsSeen: number;
  mappedCount: number;
  unresolvedCount: number;
};

export type PersistCatalogItemInput = {
  run: CatalogRun;
  provider: string;
  item: NormalizedCatalogItem;
};

export type PersistCatalogItemResult = MappingResolution;

export interface CatalogRepository {
  startRun(input: CatalogRun): Promise<void>;
  claimRun(runId: string): Promise<CatalogRun | null>;
  checkpointRun(input: {
    runId: string;
    nextCursor: string | undefined;
    pagesSeen: number;
    itemsSeen: number;
    mappedCount: number;
    unresolvedCount: number;
  }): Promise<void>;
  persistItem(
    input: PersistCatalogItemInput,
  ): Promise<PersistCatalogItemResult>;
  completeRun(runId: string): Promise<void>;
  failRun(input: {
    runId: string;
    failureCode: "catalog_provider_retryable";
  }): Promise<void>;
}

type QueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> = {
  rows: Row[];
};

export interface CatalogSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
}

export interface CatalogSqlPool {
  connect(): Promise<CatalogSqlClient>;
}

type MappingRow = {
  id: string;
  status: "mapped" | "unresolved";
  product_id: string | null;
  resolution_reason:
    | "missing_sku"
    | "ambiguous_sku"
    | "mapping_not_found"
    | null;
};

export class PostgresCatalogRepository implements CatalogRepository {
  constructor(
    private readonly options: {
      pool: CatalogSqlPool;
      currency: string;
    },
  ) {
    if (!/^[A-Z]{3}$/.test(options.currency)) {
      throw new Error("catalog_currency_invalid");
    }
  }

  async startRun(input: CatalogRun): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO catalog_sync_run
          (id, office_id, integration_id, checkpoint_json, pages_seen, items_seen, mapped_count, unresolved_count)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [
          input.id,
          input.officeId,
          input.integrationId,
          JSON.stringify(checkpoint(input.checkpointCursor)),
          input.pagesSeen,
          input.itemsSeen,
          input.mappedCount,
          input.unresolvedCount,
        ],
      );
    });
  }

  async claimRun(runId: string): Promise<CatalogRun | null> {
    return this.transaction(async (client) => {
      const result = await client.query<{
        id: string;
        office_id: string;
        integration_id: string;
        checkpoint_json: unknown;
        requested_at: Date;
        pages_seen: number;
        items_seen: number;
        mapped_count: number;
        unresolved_count: number;
      }>(
        `UPDATE catalog_sync_run
         SET status = 'running', started_at = COALESCE(started_at, now()),
             retry_count = retry_count + CASE WHEN status = 'retryable' THEN 1 ELSE 0 END,
             failure_code = NULL
         WHERE id = $1 AND status IN ('queued', 'retryable')
         RETURNING id, office_id, integration_id, checkpoint_json, requested_at,
           pages_seen, items_seen, mapped_count, unresolved_count`,
        [runId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        officeId: row.office_id,
        integrationId: row.integration_id,
        provider: "tray",
        observedAt: row.requested_at,
        checkpointCursor: cursorFromCheckpoint(row.checkpoint_json),
        pagesSeen: row.pages_seen,
        itemsSeen: row.items_seen,
        mappedCount: row.mapped_count,
        unresolvedCount: row.unresolved_count,
      };
    });
  }

  async checkpointRun(input: {
    runId: string;
    nextCursor: string | undefined;
    pagesSeen: number;
    itemsSeen: number;
    mappedCount: number;
    unresolvedCount: number;
  }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `UPDATE catalog_sync_run
         SET checkpoint_json = $2::jsonb, pages_seen = $3, items_seen = $4,
             mapped_count = $5, unresolved_count = $6
         WHERE id = $1 AND status = 'running'`,
        [
          input.runId,
          JSON.stringify(checkpoint(input.nextCursor)),
          input.pagesSeen,
          input.itemsSeen,
          input.mappedCount,
          input.unresolvedCount,
        ],
      );
    });
  }

  async persistItem(
    input: PersistCatalogItemInput,
  ): Promise<PersistCatalogItemResult> {
    return this.transaction(async (client) => {
      const variationKey = input.item.externalVariationId ?? "";
      const existing = await client.query<MappingRow>(
        `SELECT id, status, product_id, resolution_reason
         FROM external_product_mapping
         WHERE office_id = $1 AND provider = $2 AND external_product_id = $3
           AND external_variation_key = $4
         FOR UPDATE`,
        [
          input.run.officeId,
          input.provider,
          input.item.externalProductId,
          variationKey,
        ],
      );
      const mapping =
        existing.rows[0] ??
        (await this.createMapping(client, input, variationKey));
      if (mapping.status === "unresolved") {
        return {
          status: "unresolved",
          reason: mapping.resolution_reason ?? "mapping_not_found",
        };
      }
      if (!mapping.product_id) throw new Error("catalog_mapping_invalid");

      await client.query(
        `INSERT INTO channel_listing
          (id, office_id, product_id, external_product_mapping_id, channel, external_listing_id,
           source_provider, source_external_product_id, external_variation_id, external_sku,
           source_external_variation_id, source_external_variation_key, current_price_numeric,
           current_promo_price_numeric, currency, status, observed_at)
         VALUES ($1, $2, $3, $4, 'tray', $5, $6, $7, $8, $9, $8, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (office_id, channel, external_listing_id, COALESCE(external_variation_id, ''))
         DO UPDATE SET product_id = EXCLUDED.product_id,
           external_product_mapping_id = EXCLUDED.external_product_mapping_id,
           source_provider = EXCLUDED.source_provider,
           source_external_product_id = EXCLUDED.source_external_product_id,
           external_sku = EXCLUDED.external_sku,
           source_external_variation_id = EXCLUDED.source_external_variation_id,
           source_external_variation_key = EXCLUDED.source_external_variation_key,
           current_price_numeric = EXCLUDED.current_price_numeric,
           current_promo_price_numeric = EXCLUDED.current_promo_price_numeric,
           currency = EXCLUDED.currency, status = EXCLUDED.status,
           observed_at = EXCLUDED.observed_at, updated_at = now()`,
        [
          randomUUID(),
          input.run.officeId,
          mapping.product_id,
          mapping.id,
          input.item.externalProductId,
          input.provider,
          input.item.externalProductId,
          input.item.externalVariationId ?? null,
          input.item.externalSku ?? null,
          variationKey,
          input.item.price,
          input.item.promotionalPrice ?? null,
          this.options.currency,
          input.item.status,
          input.item.observedAt,
        ],
      );

      await client.query(
        `INSERT INTO product_cost_snapshot
          (id, office_id, product_id, provider, external_product_id, external_variation_id,
           external_variation_key, external_product_mapping_id, mapping_status, source,
           cost_numeric, currency, valid_at, observed_at, source_reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'mapped', 'tray', $9, $10, $11, $11, $12)
         ON CONFLICT (product_id, source, observed_at, COALESCE(source_reference, '')) DO NOTHING`,
        [
          randomUUID(),
          input.run.officeId,
          mapping.product_id,
          input.provider,
          input.item.externalProductId,
          input.item.externalVariationId ?? null,
          variationKey,
          mapping.id,
          input.item.costPrice,
          this.options.currency,
          input.item.observedAt,
          observationFingerprint(input.provider, input.item),
        ],
      );
      return { status: "mapped", productId: mapping.product_id };
    });
  }

  async completeRun(runId: string): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `UPDATE catalog_sync_run
         SET status = 'completed', completed_at = now(), failure_code = NULL
         WHERE id = $1 AND status = 'running'`,
        [runId],
      );
    });
  }

  async failRun(input: {
    runId: string;
    failureCode: "catalog_provider_retryable";
  }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `UPDATE catalog_sync_run
         SET status = 'retryable', failure_code = $2
         WHERE id = $1 AND status = 'running'`,
        [input.runId, input.failureCode],
      );
    });
  }

  private async createMapping(
    client: CatalogSqlClient,
    input: PersistCatalogItemInput,
    variationKey: string,
  ): Promise<MappingRow> {
    const resolution = await resolveExactSku(
      client,
      input.run.officeId,
      input.item.externalSku,
    );
    const mapping: MappingRow =
      resolution.status === "mapped"
        ? {
            id: randomUUID(),
            status: "mapped",
            product_id: resolution.productId,
            resolution_reason: null,
          }
        : {
            id: randomUUID(),
            status: "unresolved",
            product_id: null,
            resolution_reason: resolution.reason,
          };
    await client.query(
      `INSERT INTO external_product_mapping
        (id, office_id, provider, external_product_id, external_variation_id,
         external_variation_key, external_sku, product_id, status, resolution_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        mapping.id,
        input.run.officeId,
        input.provider,
        input.item.externalProductId,
        input.item.externalVariationId ?? null,
        variationKey,
        input.item.externalSku ?? null,
        mapping.product_id,
        mapping.status,
        mapping.resolution_reason,
      ],
    );
    return mapping;
  }

  private async transaction<T>(
    operation: (client: CatalogSqlClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.options.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function resolveExactSku(
  client: CatalogSqlClient,
  officeId: string,
  externalSku: string | undefined,
): Promise<MappingResolution> {
  if (externalSku === undefined)
    return { status: "unresolved", reason: "missing_sku" };
  const result = await client.query<{ id: string }>(
    "SELECT id FROM product WHERE office_id = $1 AND sku = $2 FOR SHARE",
    [officeId, externalSku],
  );
  if (result.rows.length === 1)
    return { status: "mapped", productId: result.rows[0]!.id };
  return {
    status: "unresolved",
    reason: result.rows.length === 0 ? "mapping_not_found" : "ambiguous_sku",
  };
}

function checkpoint(cursor: string | undefined): { cursor?: string } {
  return cursor === undefined ? {} : { cursor };
}

function cursorFromCheckpoint(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const cursor = (value as Record<string, unknown>).cursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : undefined;
}

function observationFingerprint(
  provider: string,
  item: NormalizedCatalogItem,
): string {
  return `${provider}:${item.externalProductId}:${item.externalVariationId ?? ""}:${item.observedAt.toISOString()}`;
}
