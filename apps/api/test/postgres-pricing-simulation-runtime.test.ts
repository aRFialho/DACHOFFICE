import { describe, expect, it } from "vitest";

describe("PostgresPricingSimulationRepository", () => {
  it("reads a pricing report only through its task identity", async () => {
    const module =
      await import("../src/modules/pricing/postgres-pricing-simulation-runtime.js").catch(
        () => undefined,
      );
    expect(module).toBeDefined();
    if (!module) return;
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new module.PostgresPricingSimulationRepository({
      query: async <T>(sql: string, values: readonly unknown[]) => {
        queries.push({ sql, values });
        return { rows: [{ report_json: { status: "completed" } } as T] };
      },
    });
    await expect(repository.getReportForTask("task-1")).resolves.toEqual({
      status: "found",
      report: { status: "completed" },
    });
    expect(queries[0]).toMatchObject({ values: ["task-1"] });
    expect(queries[0]?.sql).toContain("pricing_simulation_report");
  });
});
