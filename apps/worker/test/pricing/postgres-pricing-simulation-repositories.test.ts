import { describe, expect, it } from "vitest";
import {
  PostgresPricingSimulationFactsRepository,
  PostgresPricingSimulationTaskRepository,
} from "../../src/pricing/postgres-pricing-simulation-repositories.js";

describe("Postgres pricing simulation repositories", () => {
  it("reads tenant-scoped facts with mapped supplier cost precedence and no provider access", async () => {
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const client = {
      async query(text: string, values?: readonly unknown[]) {
        queries.push({ text, ...(values === undefined ? {} : { values }) });
        if (
          text.includes("FROM product p") &&
          !text.includes("supplier_price_table_row") &&
          !text.includes("channel_listing")
        )
          return {
            rows: [
              {
                product_id: "product-1",
                sku: "SKU-1",
                name: "Chair",
                supplier_id: "supplier-1",
              },
            ],
          };
        if (text.includes("supplier_price_table_row"))
          return {
            rows: [
              {
                sku: "SKU-1",
                source: "supplier_table",
                cost: "20.0000",
                currency: "BRL",
                effective_at: "2026-08-01T00:00:00.000Z",
                source_reference: "supplier-row:1",
              },
            ],
          };
        if (text.includes("channel_listing"))
          return {
            rows: [
              {
                sku: "SKU-1",
                listing_id: "listing-1",
                price: "100.0000",
                currency: "BRL",
                observed_at: "2026-08-20T00:00:00.000Z",
                source_reference: "listing:1",
              },
            ],
          };
        if (text.includes("channel_fee_rule"))
          return {
            rows: [
              {
                rule_id: "rule-1",
                component_type: "marketplace_commission",
                payer: "seller",
                fee_mode: "percentage",
                value: "10.0000",
                confidence: "ESTIMATED",
                valid_from: "2026-01-01T00:00:00.000Z",
                valid_to: null,
              },
            ],
          };
        return { rows: [] };
      },
      release() {},
    };
    const facts = new PostgresPricingSimulationFactsRepository({
      connect: async () => client,
    } as never);
    const products = await facts.loadProducts({
      officeId: "office-1",
      skus: ["SKU-1"],
    });
    await expect(
      facts.loadCosts({
        officeId: "office-1",
        products,
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        sku: "SKU-1",
        cost: expect.objectContaining({ source: "supplier_table" }),
      }),
    ]);
    await expect(
      facts.loadListings({
        officeId: "office-1",
        channel: "tray",
        skus: ["SKU-1"],
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toEqual([expect.objectContaining({ sku: "SKU-1" })]);
    await expect(
      facts.loadFeeAssumptions({
        officeId: "office-1",
        channel: "tray",
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toHaveLength(1);
    expect(queries.map((query) => query.text).join("\n")).toContain(
      "supplier_price_table_row",
    );
    expect(queries.map((query) => query.text).join("\n")).not.toMatch(
      /fetch\(|shopee|mercado/i,
    );
  });

  it("requires write access for prepare while keeping read grants for fact access", async () => {
    const queries: string[] = [];
    const client = {
      async query(text: string) {
        queries.push(text);
        if (text.includes("FROM agent a"))
          return {
            rows: [
              { lifecycle_status: "active", active_version_id: "version-1" },
            ],
          };
        if (text.includes("agent_tool_grant"))
          return {
            rows: [
              { tool_code: "products.get", access_level: "read" },
              { tool_code: "products.getCost", access_level: "read" },
              { tool_code: "products.getListing", access_level: "read" },
              { tool_code: "finance.getRules", access_level: "read" },
              { tool_code: "pricing.prepareAction", access_level: "read" },
            ],
          };
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const repository = new PostgresPricingSimulationTaskRepository({
      connect: async () => client,
    } as never);
    await repository.inTransaction(async (transaction) => {
      await expect(
        transaction.authorize({
          officeId: "office-1",
          agentId: "agent-1",
          requestedAgentVersionId: "version-1",
          requiredGrants: [
            "products.get",
            "products.getCost",
            "products.getListing",
            "finance.getRules",
            "pricing.prepareAction",
          ],
        }),
      ).resolves.toBe(false);
    });
    expect(queries).toContain("BEGIN");
    expect(queries).toContain("COMMIT");
  });
});
