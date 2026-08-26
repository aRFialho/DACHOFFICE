import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

describe("renderPricingWorkbook", () => {
  it("renders the immutable report into bounded XLSX bytes without recalculating money", async () => {
    const module = await import("../../src/pricing/pricing-workbook.js").catch(
      () => undefined,
    );
    expect(module).toBeDefined();
    if (!module) return;
    const report = {
      status: "completed",
      confidence: "ESTIMATED",
      lines: [
        {
          productId: "product-1",
          sku: "SKU-1",
          name: "Chair",
          supplierId: "supplier-1",
          cost: {
            status: "found",
            source: "supplier_table",
            cost: "20.0000",
            currency: "BRL",
            effectiveAt: "2026-08-01T00:00:00.000Z",
            sourceReference: "supplier-row:1",
          },
          listing: {
            status: "found",
            listingId: "listing-1",
            price: "100.0000",
            currency: "BRL",
            observedAt: "2026-08-20T00:00:00.000Z",
            sourceReference: "listing:1",
          },
          breakEvenMinimumPrice: "22.2223",
          discountedPrice: "90.0000",
          actionStatus: "prepared",
          confidence: "ESTIMATED",
          findings: [],
        },
      ],
      provenance: {
        officeId: "office-1",
        taskId: "task-1",
        agentId: "agent-1",
        agentVersionId: "version-1",
        channel: "tray",
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
        costSourceReferences: ["supplier-row:1"],
        listingSourceReferences: ["listing:1"],
        feeRuleIds: [],
      },
    } as never;
    const bytes = await module.renderPricingWorkbook(report);
    expect(bytes.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.length).toBeLessThanOrEqual(module.MAX_PRICING_WORKBOOK_BYTES);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.worksheets).toHaveLength(3);
    expect(workbook.worksheets[0]?.name).toBe("Resumo");
    expect(workbook.worksheets[1]?.getCell("A2").value).toBe("SKU-1");
    expect(workbook.created?.toISOString()).toBe("2026-08-31T23:59:59.000Z");
  });
});
