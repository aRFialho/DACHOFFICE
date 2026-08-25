import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  MarginAnalysisTask,
  MarginAnalysisTaskContextItem,
  MarginAnalysisTaskRepository,
  MarginAnalysisTaskTransaction,
  PersistMarginTaskReportInput,
} from "./margin-analysis-task-handler.js";

type TaskRow = { office_id: string; agent_id: string; status: string };
type ContextRow = { context_key: string; value_text: string };
type AgentRow = { lifecycle_status: string; active_version_id: string };
type GrantRow = { tool_code: string; access_level: string };
type DeliveryRow = { idempotency_key: string };
type ReportRow = { id: string; idempotency_key: string };

export class PostgresMarginAnalysisTaskRepository implements MarginAnalysisTaskRepository {
  constructor(private readonly pool: Pool) {}

  async isMarginAnalysisTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM task WHERE id = $1 AND type = 'margin.analysis'",
      [taskId],
    );
    return result.rowCount === 1;
  }

  async inTransaction<T>(
    action: (transaction: MarginAnalysisTaskTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(
        new PostgresMarginAnalysisTaskTransaction(client),
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original error so the queue can safely retry it.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

class PostgresMarginAnalysisTaskTransaction implements MarginAnalysisTaskTransaction {
  constructor(private readonly client: PoolClient) {}

  async loadTask(taskId: string): Promise<MarginAnalysisTask | null> {
    const result = await this.client.query<TaskRow>(
      `SELECT t.office_id, t.assigned_agent_id AS agent_id, t.status
       FROM task t
       JOIN agent a ON a.id = t.assigned_agent_id AND a.office_id = t.office_id
       WHERE t.id = $1 AND t.type = 'margin.analysis'
       FOR UPDATE OF t, a`,
      [taskId],
    );
    const row = result.rows[0];
    return row
      ? { officeId: row.office_id, agentId: row.agent_id, status: row.status }
      : null;
  }

  async loadContext(
    taskId: string,
  ): Promise<readonly MarginAnalysisTaskContextItem[]> {
    const result = await this.client.query<ContextRow>(
      `SELECT context_key, value_text
       FROM task_context_item
       WHERE task_id = $1
       ORDER BY context_key ASC`,
      [taskId],
    );
    return result.rows.map((row) => ({
      key: row.context_key,
      value: row.value_text,
    }));
  }

  async authorizeReadAccess(input: {
    officeId: string;
    agentId: string;
    requestedAgentVersionId: string;
    requiredGrants: readonly string[];
  }): Promise<boolean> {
    const agent = await this.client.query<AgentRow>(
      `SELECT a.lifecycle_status, a.active_version_id
       FROM agent a
       JOIN agent_version active_version
         ON active_version.id = a.active_version_id
        AND active_version.agent_id = a.id
       WHERE a.id = $1 AND a.office_id = $2
       FOR UPDATE OF a`,
      [input.agentId, input.officeId],
    );
    const state = agent.rows[0];
    if (
      !state ||
      state.lifecycle_status !== "active" ||
      state.active_version_id !== input.requestedAgentVersionId
    ) {
      return false;
    }

    const grants = await this.client.query<GrantRow>(
      `SELECT tool_code, access_level
       FROM agent_tool_grant
       WHERE agent_id = $1
         AND revoked_at IS NULL
         AND valid_from <= now()
       FOR SHARE`,
      [input.agentId],
    );
    const allowed = new Set(
      grants.rows
        .filter(
          (grant) =>
            (grant.access_level === "read" || grant.access_level === "write") &&
            grant.tool_code.trim() !== "",
        )
        .map((grant) => grant.tool_code),
    );
    return input.requiredGrants.every((grant) => allowed.has(grant));
  }

  async claimDelivery(idempotencyKey: string): Promise<boolean> {
    const result = await this.client.query<DeliveryRow>(
      `INSERT INTO worker_job_delivery (idempotency_key)
       VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey],
    );
    return result.rows.length === 1;
  }

  async persistReport(input: PersistMarginTaskReportInput): Promise<{
    status: "created" | "unchanged" | "conflict";
    reportId: string;
  }> {
    const { report } = input;
    const inserted = await this.client.query<{ id: string }>(
      `INSERT INTO margin_analysis_report (
         id, office_id, task_id, agent_id, agent_version_id, period_start, period_end,
         filters_json, report_json, evidence_json, provenance_json, status, confidence,
         revenue_numeric, cmv_numeric, taxes_numeric, marketplace_fees_numeric,
         seller_discounts_numeric, logistics_numeric, ads_cost_numeric, other_costs_numeric,
         contribution_amount_numeric, contribution_percent_numeric, calculated_at, idempotency_key
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
       ) ON CONFLICT (office_id, task_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        report.provenance.officeId,
        report.provenance.taskId,
        report.provenance.agentId,
        report.provenance.agentVersionId,
        report.provenance.periodStart,
        report.provenance.periodEnd,
        JSON.stringify(report.provenance.filters ?? {}),
        JSON.stringify(report),
        JSON.stringify(report.evidence),
        JSON.stringify(report.provenance),
        report.status,
        report.confidence,
        report.totals.revenue,
        report.totals.cmv,
        report.totals.taxes,
        report.totals.marketplaceFees,
        report.totals.sellerDiscounts,
        report.totals.logistics,
        report.totals.adsCost,
        report.totals.otherCosts,
        report.totals.contributionAmount,
        report.totals.contributionPercent,
        input.calculatedAt,
        input.idempotencyKey,
      ],
    );
    const reportId = inserted.rows[0]?.id;
    if (reportId) return { status: "created", reportId };

    const existing = await this.client.query<ReportRow>(
      `SELECT id, idempotency_key
       FROM margin_analysis_report
       WHERE office_id = $1 AND task_id = $2
       FOR SHARE`,
      [report.provenance.officeId, report.provenance.taskId],
    );
    const row = existing.rows[0];
    if (!row) return { status: "conflict", reportId: "" };
    return row.idempotency_key === input.idempotencyKey
      ? { status: "unchanged", reportId: row.id }
      : { status: "conflict", reportId: row.id };
  }

  async completeTask(taskId: string): Promise<void> {
    const task = await this.client.query<{ id: string }>(
      `UPDATE task
       SET status = 'completed', completed_at = now()
       WHERE id = $1 AND status = 'queued'
       RETURNING id`,
      [taskId],
    );
    if (task.rows.length !== 1)
      throw new Error("margin_analysis_task_not_queued");
    for (const [sequence, from, to] of [
      [2, "queued", "assigned"],
      [3, "assigned", "executing"],
      [4, "executing", "completed"],
    ] as const) {
      await this.client.query(
        `INSERT INTO task_event (
           id, task_id, sequence_number, event_type, from_status, to_status
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), taskId, sequence, `task.${to}`, from, to],
      );
    }
  }
}
