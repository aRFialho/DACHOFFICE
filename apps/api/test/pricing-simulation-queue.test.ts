import { describe, expect, it } from "vitest";
describe("pricing queue repository", () => {
  it("exposes transactional task queueing", async () => {
    const module =
      await import("../src/modules/pricing/postgres-pricing-simulation-runtime.js");
    const repository = new module.PostgresPricingSimulationRepository({
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release: () => undefined,
      }),
    } as never);
    expect(repository).toHaveProperty("queuePricingSimulation");
  });
});
