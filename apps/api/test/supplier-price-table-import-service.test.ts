import { describe, expect, it } from "vitest";
import {
  SupplierPriceTableImportService,
  type SupplierPriceTableImportRepository,
} from "../src/modules/pricing/supplier-price-table-import-service.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

describe("SupplierPriceTableImportService", () => {
  it("accepts explicit structured rows and persists their deterministic import evidence", async () => {
    const calls: unknown[] = [];
    const repository: SupplierPriceTableImportRepository = {
      importTable: async (input) => {
        calls.push(input);
        return {
          status: "created",
          tableId: "44444444-4444-4444-8444-444444444444",
          mappedRows: 1,
          unresolvedRows: 1,
        };
      },
    };
    const service = new SupplierPriceTableImportService(repository);
    await expect(
      service.importTable({
        officeId,
        supplierId,
        importedByUserId: userId,
        sourceName: "Fornecedor ACME agosto",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        observedAt: "2026-08-02T00:00:00.000Z",
        rows: [
          {
            sourceRowNumber: 1,
            sku: "SKU-1",
            cost: "20.0000",
            currency: "BRL",
            sourceFields: { sourceSku: "SKU-1" },
          },
          {
            sourceRowNumber: 2,
            sku: "SKU-2",
            cost: "30.0000",
            currency: "BRL",
            sourceFields: {},
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: "created",
      mappedRows: 1,
      unresolvedRows: 1,
    });
    expect(calls).toEqual([
      expect.objectContaining({
        officeId,
        supplierId,
        importedByUserId: userId,
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        rows: expect.arrayContaining([
          expect.objectContaining({
            sourceRowNumber: 1,
            sku: "SKU-1",
            cost: "20.0000",
          }),
        ]),
      }),
    ]);
  });

  it("rejects untrusted malformed or duplicate row identities before persistence", async () => {
    const service = new SupplierPriceTableImportService({
      importTable: async () => {
        throw new Error("must not persist");
      },
    });
    await expect(
      service.importTable({
        officeId,
        supplierId,
        importedByUserId: userId,
        sourceName: "ACME",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        observedAt: "2026-08-02T00:00:00.000Z",
        rows: [
          {
            sourceRowNumber: 1,
            sku: "SKU-1",
            cost: "20.0000",
            currency: "BRL",
            sourceFields: {},
          },
          {
            sourceRowNumber: 1,
            sku: "SKU-2",
            cost: "20.0000",
            currency: "BRL",
            sourceFields: {},
          },
        ],
      }),
    ).rejects.toThrow("supplier_price_table_input_invalid");
  });
});
