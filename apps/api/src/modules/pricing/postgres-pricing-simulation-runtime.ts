import type { Pool } from "pg";
import type { PricingSimulationRepository } from "./pricing-simulation-service.js";
type SqlPool = { query<T>(sql: string, values: readonly unknown[]): Promise<{ rows: T[] }> };
export class PostgresPricingSimulationRepository implements Pick<
  PricingSimulationRepository,
  "getReportForTask"
> {
  constructor(private readonly pool: SqlPool) {}
  async getReportForTask(taskId: string) {
    const result = await this.pool.query<{ report_json: unknown }>(
      `SELECT report_json FROM pricing_simulation_report report JOIN task ON task.id = report.task_id AND task.office_id = report.office_id WHERE task.id = $1 LIMIT 1`,
      [taskId],
    );
    return result.rows[0]
      ? { status: "found" as const, report: result.rows[0].report_json }
      : { status: "not_found" as const };
  }
}
