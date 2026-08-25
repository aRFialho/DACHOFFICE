import { describe, expect, it } from "vitest";
import { PostgresSupplierPriceTableImportRepository } from "../src/modules/pricing/postgres-supplier-price-table-import-repository.js";

describe("PostgresSupplierPriceTableImportRepository", () => {
  it("persists only exact office+supplier+SKU mappings and retains unresolved rows", async () => {
    const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const client = {
      async query<T>(sql: string, values?: readonly unknown[]) {
        queries.push({ sql, ...(values === undefined ? {} : { values }) });
        if (sql.includes("INSERT INTO supplier_price_table"))
          return { rows: [{ id: "table-1" } as T] };
        if (sql.includes("SELECT id FROM product"))
          return {
            rows: values?.[2] === "SKU-1" ? [{ id: "product-1" } as T] : [],
          };
        return { rows: [] as T[] };
      },
      release() {},
    };
    const repository = new PostgresSupplierPriceTableImportRepository({
      connect: async () => client,
    } as never);
    await expect(
      repository.importTable({
        officeId: "11111111-1111-4111-8111-111111111111",
        supplierId: "22222222-2222-4222-8222-222222222222",
        importedByUserId: "33333333-3333-4333-8333-333333333333",
        sourceName: "ACME",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        observedAt: "2026-08-02T00:00:00.000Z",
        contentSha256: "a".repeat(64),
        rows: [
          {
            sourceRowNumber: 1,
            sku: "SKU-1",
            cost: "20.0000" as never,
            currency: "BRL",
            sourceFields: {},
          },
          {
            sourceRowNumber: 2,
            sku: "SKU-2",
            cost: "30.0000" as never,
            currency: "BRL",
            sourceFields: {},
          },
        ],
      }),
    ).resolves.toEqual({
      status: "created",
      tableId: "table-1",
      mappedRows: 1,
      unresolvedRows: 1,
    });
    const mappedRow = queries.find(
      ({ sql, values }) =>
        sql.includes("INSERT INTO supplier_price_table_row") &&
        values?.includes("mapped"),
    );
    const unresolvedRow = queries.find(
      ({ sql, values }) =>
        sql.includes("INSERT INTO supplier_price_table_row") &&
        values?.includes("unresolved"),
    );
    expect(mappedRow?.values).toContain("product-1");
    expect(unresolvedRow?.values).toContain("mapping_not_found");
    expect(queries.map(({ sql }) => sql).join("\n")).not.toMatch(
      /update product|channel_listing/i,
    );
  });
});
