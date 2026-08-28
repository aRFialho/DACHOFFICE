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
  it("reads immutable XLSX bytes only through the report task and office joins", async () => {
    const module =
      await import("../src/modules/pricing/postgres-pricing-simulation-runtime.js");
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const repository = new module.PostgresPricingSimulationRepository({
      query: async <T>(sql: string, values: readonly unknown[]) => {
        queries.push({ sql, values });
        return {
          rows: [
            {
              content_bytes: Buffer.from("PKxlsx"),
              media_type:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            } as T,
          ],
        };
      },
    });
    await expect(repository.getWorkbookForTask("task-1")).resolves.toEqual({
      status: "found",
      content: Buffer.from("PKxlsx"),
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(queries[0]).toMatchObject({ values: ["task-1"] });
    expect(queries[0]?.sql).toContain("pricing_workbook_artifact");
    expect(queries[0]?.sql).toContain("report.office_id = task.office_id");
  });
});
