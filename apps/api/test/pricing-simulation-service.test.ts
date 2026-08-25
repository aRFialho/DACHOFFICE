import { describe, expect, it } from "vitest";
import type { Money } from "@dachbyte-office/finance";
import { PricingSimulationService } from "../src/modules/pricing/pricing-simulation-service.js";

describe("PricingSimulationService", () => {
  it("queues a server-owned task with validated context and the active agent version", async () => {
    let received: unknown;
    const service = new PricingSimulationService({
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
      queuePricingSimulation: async (input) => {
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
        discountPercent: "10.0000" as Money,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-08-31T23:59:59.999Z",
      }),
    ).resolves.toEqual({ id: "task-1", status: "queued" });
    expect(received).toMatchObject({
      agentVersionId: "00000000-0000-4000-8000-000000000003",
    });
    expect(received).toMatchObject({
      context: expect.arrayContaining([
        { key: "skus", value: '["SKU-1"]' },
        { key: "channel", value: "tray" },
        { key: "discountPercent", value: "10.0000" },
      ]),
    });
  });
});
