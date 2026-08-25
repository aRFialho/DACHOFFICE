import { describe, expect, it } from "vitest";

describe("PricingSimulationService", () => {
  it("queues server-owned context with the active agent version", async () => {
    const module =
      await import("../src/modules/pricing/pricing-simulation-service.js").catch(
        () => undefined,
      );
    expect(module).toBeDefined();
    if (!module) return;
    let received: unknown;
    const service = new module.PricingSimulationService({
      getAgentEligibility: async () => ({
        officeId: "00000000-0000-4000-8000-000000000001",
        agentId: "00000000-0000-4000-8000-000000000002",
        lifecycleStatus: "active",
        activeAgentVersionId: "00000000-0000-4000-8000-000000000003",
        grants: [
          "products.get",
          "products.getCost",
          "products.getListing",
          "finance.getRules",
          "pricing.prepareAction",
        ],
      }),
      queuePricingSimulation: async (input: unknown) => {
        received = input;
        return {
          status: "queued" as const,
          task: { id: "task-1", status: "queued" as const },
        };
      },
      getReportForTask: async () => ({ status: "not_found" as const }),
    });
    await expect(
      service.create({
        officeId: "00000000-0000-4000-8000-000000000001",
        agentId: "00000000-0000-4000-8000-000000000002",
        requestedByUserId: "00000000-0000-4000-8000-000000000004",
        skus: ["SKU-1"],
        channel: "tray",
        discountPercent: "10.0000",
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toEqual({ id: "task-1", status: "queued" });
    expect(received).toEqual(
      expect.objectContaining({
        agentVersionId: "00000000-0000-4000-8000-000000000003",
        context: [
          {
            key: "agentVersionId",
            value: "00000000-0000-4000-8000-000000000003",
          },
          { key: "skus", value: '["SKU-1"]' },
          { key: "channel", value: "tray" },
          { key: "discountPercent", value: "10.0000" },
          { key: "periodStart", value: "2026-08-01T00:00:00.000Z" },
          { key: "periodEnd", value: "2026-08-31T23:59:59.999Z" },
        ],
      }),
    );
  });
});
