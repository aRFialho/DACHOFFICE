import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  SupplierPriceTableImportRepository,
  ValidatedSupplierPriceTableImport,
} from "./supplier-price-table-import-service.js";

export class PostgresSupplierPriceTableImportRepository implements SupplierPriceTableImportRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async importTable(input: ValidatedSupplierPriceTableImport) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const table = await client.query<{ id: string }>(
        `INSERT INTO supplier_price_table (id, office_id, supplier_id, source_name, effective_at, observed_at, content_sha256, idempotency_key, imported_by_user_id, row_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (office_id, supplier_id, content_sha256) DO NOTHING RETURNING id`,
        [
          randomUUID(),
          input.officeId,
          input.supplierId,
          input.sourceName,
          input.effectiveAt,
          input.observedAt,
          input.contentSha256,
          `supplier-price-table:${input.contentSha256}`,
          input.importedByUserId,
          input.rows.length,
        ],
      );
      const tableId = table.rows[0]?.id;
      if (!tableId) {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM supplier_price_table WHERE office_id = $1 AND supplier_id = $2 AND content_sha256 = $3 FOR SHARE",
          [input.officeId, input.supplierId, input.contentSha256],
        );
        const existingId = existing.rows[0]?.id;
        if (!existingId) throw new Error("supplier_price_table_conflict");
        const counts = await this.countRows(client, existingId);
        await client.query("COMMIT");
        return { status: "unchanged" as const, tableId: existingId, ...counts };
      }
      let mappedRows = 0;
      for (const row of input.rows) {
        const product = await client.query<{ id: string }>(
          "SELECT id FROM product WHERE office_id = $1 AND supplier_id = $2 AND sku = $3 LIMIT 2",
          [input.officeId, input.supplierId, row.sku],
        );
        const productId =
          product.rows.length === 1 ? product.rows[0]?.id : undefined;
        const mapped = productId !== undefined;
        if (mapped) mappedRows += 1;
        await client.query(
          `INSERT INTO supplier_price_table_row (id, office_id, supplier_id, supplier_price_table_id, source_row_number, source_sku, cost_numeric, currency, source_fields_json, product_id, mapping_status, resolution_reason, mapped_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,CASE WHEN $11 = 'mapped' THEN now() ELSE NULL END)`,
          [
            randomUUID(),
            input.officeId,
            input.supplierId,
            tableId,
            row.sourceRowNumber,
            row.sku,
            row.cost,
            row.currency,
            JSON.stringify(row.sourceFields),
            productId ?? null,
            mapped ? "mapped" : "unresolved",
            mapped ? null : "mapping_not_found",
          ],
        );
      }
      await client.query("COMMIT");
      return {
        status: "created" as const,
        tableId,
        mappedRows,
        unresolvedRows: input.rows.length - mappedRows,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async countRows(client: PoolClient, tableId: string) {
    const result = await client.query<{
      mapping_status: string;
      count: string;
    }>(
      "SELECT mapping_status, count(*)::text AS count FROM supplier_price_table_row WHERE supplier_price_table_id = $1 GROUP BY mapping_status",
      [tableId],
    );
    const mappedRows = Number(
      result.rows.find((row) => row.mapping_status === "mapped")?.count ?? 0,
    );
    const unresolvedRows = Number(
      result.rows.find((row) => row.mapping_status === "unresolved")?.count ??
        0,
    );
    return { mappedRows, unresolvedRows };
  }
}
