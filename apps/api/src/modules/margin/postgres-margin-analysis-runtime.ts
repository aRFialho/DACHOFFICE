import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AgentLifecycleStatus } from "../admin/write-gate.js";
import type { PolicyEvaluationContext } from "../policy/tool-authorization-service.js";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import type {
  MarginAgentEligibility,
  MarginAnalysisRepository,
  QueuedMarginAnalysisTask,
} from "./margin-analysis-service.js";
import {
  createMarginTools,
  marginToolDefinitions,
  type MarginPolicyEvaluationContextLoader,
  type MarginReportReadRepository,
} from "./margin-tools.js";

type SqlPool = Pick<Pool, "connect" | "query">;
type AgentRow = {
  office_id: unknown;
  agent_id: unknown;
  lifecycle_status: unknown;
  active_version_id: unknown;
};
type GrantRow = {
  tool_code: unknown;
  access_level: unknown;
  revoked_at: unknown;
};
type PolicyRow = AgentRow & {
  requested_version_id: unknown;
  trust_ceiling: unknown;
  trust_level: unknown;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;
const lifecycle = (value: unknown): AgentLifecycleStatus | null =>
  value === "draft" ||
  value === "active" ||
  value === "updating" ||
  value === "suspended" ||
  value === "archived"
    ? value
    : null;
const trust = (
  value: unknown,
): "analytical" | "supervised" | "autonomous" | null =>
  value === "analytical" || value === "supervised" || value === "autonomous"
    ? value
    : null;

const grants = async (
  client: Pick<Pool, "query"> | PoolClient,
  agentId: string,
): Promise<MarginAgentEligibility["grants"]> => {
  const result = await client.query<GrantRow>(
    "SELECT tool_code, access_level, revoked_at FROM agent_tool_grant WHERE agent_id = $1",
    [agentId],
  );
  return result.rows.flatMap((row) => {
    const toolCode = text(row.tool_code);
    if (
      !toolCode ||
      (row.access_level !== "read" && row.access_level !== "write")
    )
      return [];
    return [
      {
        toolCode,
        accessLevel: row.access_level,
        revokedAt: row.revoked_at instanceof Date ? row.revoked_at : null,
      },
    ];
  });
};

const eligible = (
  row: AgentRow | undefined,
  activeGrants: MarginAgentEligibility["grants"],
): MarginAgentEligibility | null => {
  const officeId = text(row?.office_id);
  const agentId = text(row?.agent_id);
  const lifecycleStatus = lifecycle(row?.lifecycle_status);
  const activeAgentVersionId = text(row?.active_version_id);
  return officeId && agentId && lifecycleStatus && activeAgentVersionId
    ? {
        officeId,
        agentId,
        lifecycleStatus,
        activeAgentVersionId,
        grants: activeGrants,
      }
    : null;
};

export class PostgresMarginAnalysisRepository
  implements MarginAnalysisRepository, MarginReportReadRepository
{
  constructor(private readonly pool: SqlPool) {}

  async getAgentEligibility(input: { officeId: string; agentId: string }) {
    const result = await this.pool.query<AgentRow>(
      `SELECT office_id, id AS agent_id, lifecycle_status, active_version_id
       FROM agent WHERE id = $1 AND office_id = $2`,
      [input.agentId, input.officeId],
    );
    const row = result.rows[0];
    const agentId = text(row?.agent_id);
    return eligible(row, agentId ? await grants(this.pool, agentId) : []);
  }

  async queueMarginAnalysis(
    input: Parameters<MarginAnalysisRepository["queueMarginAnalysis"]>[0],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<AgentRow>(
        `SELECT office_id, id AS agent_id, lifecycle_status, active_version_id
         FROM agent WHERE id = $1 AND office_id = $2 FOR UPDATE`,
        [input.agentId, input.officeId],
      );
      const current = eligible(
        result.rows[0],
        await grants(client, input.agentId),
      );
      if (
        !current ||
        current.lifecycleStatus !== "active" ||
        current.activeAgentVersionId !== input.agentVersionId ||
        !["finance.getRules", "finance.getMargin", "products.getCost"].every(
          (code) =>
            current.grants.some(
              (grant) =>
                grant.toolCode === code &&
                grant.revokedAt === null &&
                (grant.accessLevel === "read" || grant.accessLevel === "write"),
            ),
        )
      ) {
        await client.query("ROLLBACK");
        return { status: "agent_invalid" as const };
      }
      const taskId = randomUUID();
      const eventId = randomUUID();
      const createdAt = new Date();
      await client.query(
        `INSERT INTO task (
          id, office_id, type, title, description, source, priority, status,
          requested_by_user_id, assigned_agent_id, created_at
        ) VALUES ($1, $2, 'margin.analysis', $3, $4, 'human', 'normal', 'queued', $5, $6, $7)`,
        [
          taskId,
          input.officeId,
          "Margin analysis",
          "Analyze persisted contribution margin for the requested period.",
          input.requestedByUserId,
          input.agentId,
          createdAt,
        ],
      );
      for (const item of input.context) {
        await client.query(
          "INSERT INTO task_context_item (id, task_id, context_key, value_text) VALUES ($1, $2, $3, $4)",
          [randomUUID(), taskId, item.key, item.value],
        );
      }
      await client.query(
        `INSERT INTO task_event (
          id, task_id, sequence_number, event_type, to_status, actor_user_id, payload_json
        ) VALUES ($1, $2, 1, 'task.queued', 'queued', $3, $4::jsonb)`,
        [
          eventId,
          taskId,
          input.requestedByUserId,
          JSON.stringify({ source: "human", priority: "normal" }),
        ],
      );
      await client.query(
        `INSERT INTO outbox_message (id, aggregate_type, aggregate_id, topic, payload_json, idempotency_key)
         VALUES ($1, 'task', $2, 'task.queued', $3::jsonb, $4)`,
        [
          randomUUID(),
          taskId,
          JSON.stringify({ taskId, eventId }),
          `task.queued:${taskId}:1`,
        ],
      );
      await client.query(
        `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, outcome, metadata_json)
         VALUES ($1, $2, 'margin_analysis_queued', 'task', $3, 'success', $4::jsonb)`,
        [
          randomUUID(),
          input.requestedByUserId,
          taskId,
          JSON.stringify({
            agentId: input.agentId,
            agentVersionId: input.agentVersionId,
          }),
        ],
      );
      await client.query("COMMIT");
      const task: QueuedMarginAnalysisTask = {
        id: taskId,
        officeId: input.officeId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        status: "queued",
        context: input.context,
      };
      return { status: "queued" as const, task };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getReportForTask(taskId: string) {
    const result = await this.pool.query<{ report_json: unknown }>(
      `SELECT report_json FROM margin_analysis_report report
       JOIN task ON task.id = report.task_id AND task.office_id = report.office_id
       WHERE task.id = $1 LIMIT 1`,
      [taskId],
    );
    return result.rows[0]
      ? { status: "found" as const, report: result.rows[0].report_json }
      : { status: "not_found" as const };
  }

  async getLatestReport(officeId: string, taskId: string) {
    const result = await this.pool.query<{ report_json: unknown }>(
      `SELECT report_json FROM margin_analysis_report report
       JOIN task ON task.id = report.task_id AND task.office_id = report.office_id
       WHERE report.office_id = $1 AND task.id = $2 LIMIT 1`,
      [officeId, taskId],
    );
    return result.rows[0]
      ? { status: "found" as const, report: result.rows[0].report_json }
      : { status: "not_found" as const };
  }
}

export class PostgresMarginPolicyEvaluationContextLoader implements MarginPolicyEvaluationContextLoader {
  constructor(private readonly pool: SqlPool) {}

  async load(taskId: string): Promise<PolicyEvaluationContext | null> {
    const result = await this.pool.query<PolicyRow>(
      `SELECT t.office_id, t.assigned_agent_id AS agent_id, a.lifecycle_status,
              a.active_version_id, requested.value_text AS requested_version_id,
              version.trust_ceiling, office.trust_level
       FROM task t
       JOIN agent a ON a.id = t.assigned_agent_id AND a.office_id = t.office_id
       JOIN agent_version version ON version.id = a.active_version_id AND version.agent_id = a.id
       JOIN office ON office.id = t.office_id
       JOIN task_context_item requested
         ON requested.task_id = t.id AND requested.context_key = 'agentVersionId'
       WHERE t.id = $1 AND t.type = 'margin.analysis'`,
      [taskId],
    );
    const row = result.rows[0];
    const officeId = text(row?.office_id);
    const agentId = text(row?.agent_id);
    const lifecycleStatus = lifecycle(row?.lifecycle_status);
    const activeAgentVersionId = text(row?.active_version_id);
    const requestedAgentVersionId = text(row?.requested_version_id);
    const officeTrustLevel = trust(row?.trust_level);
    const agentTrustCeiling = trust(row?.trust_ceiling);
    if (
      !officeId ||
      !agentId ||
      !lifecycleStatus ||
      !activeAgentVersionId ||
      !requestedAgentVersionId ||
      !officeTrustLevel ||
      !agentTrustCeiling
    )
      return null;
    return {
      officeId,
      hasTaskAuthority: true,
      lifecycleStatus,
      grants: await grants(this.pool, agentId),
      activeAgentVersionId,
      requestedAgentVersionId,
      officeTrustLevel,
      agentTrustCeiling,
      policyConditionsSatisfied: true,
      actionLimitsSatisfied: true,
    };
  }
}

export const createMarginAnalysisRuntime = (pool: Pool) => {
  const repository = new PostgresMarginAnalysisRepository(pool);
  const registry = new ToolRegistry(marginToolDefinitions);
  return {
    marginAnalysisRepository: repository,
    marginTools: createMarginTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: new PostgresMarginPolicyEvaluationContextLoader(pool),
    }),
  };
};
