import { describe, expect, it } from "vitest";

describe("pricing simulation eligibility", () => {
  it("does not treat read access as authority to prepare an internal price action", async () => {
    const { PostgresPricingSimulationRepository } =
      await import("../src/modules/pricing/postgres-pricing-simulation-runtime.js");
    const repository = new PostgresPricingSimulationRepository({
      query: async <T>(sql: string) => {
        if (sql.includes("FROM agent WHERE"))
          return {
            rows: [
              {
                office_id: "office-1",
                agent_id: "agent-1",
                lifecycle_status: "active",
                active_version_id: "version-1",
              } as T,
            ],
          };
        return {
          rows: [
            {
              tool_code: "products.get",
              access_level: "read",
              revoked_at: null,
            },
            {
              tool_code: "products.getCost",
              access_level: "read",
              revoked_at: null,
            },
            {
              tool_code: "products.getListing",
              access_level: "read",
              revoked_at: null,
            },
            {
              tool_code: "finance.getRules",
              access_level: "read",
              revoked_at: null,
            },
            {
              tool_code: "pricing.prepareAction",
              access_level: "read",
              revoked_at: null,
            },
          ] as T[],
        };
      },
    });
    await expect(
      repository.getAgentEligibility({
        officeId: "office-1",
        agentId: "agent-1",
      }),
    ).resolves.toMatchObject({
      grants: [
        "products.get",
        "products.getCost",
        "products.getListing",
        "finance.getRules",
      ],
    });
  });
});
