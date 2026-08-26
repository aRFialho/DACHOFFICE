import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AgentLifecycleStatus } from "../admin/write-gate.js";
import type { PolicyEvaluationContext } from "../policy/tool-authorization-service.js";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import {
  createPricingTools,
  pricingToolDefinitions,
  type PricingPolicyEvaluationContextLoader,
  type PricingReportReadRepository,
} from "./pricing-tools.js";
import type { PricingSimulationRepository } from "./pricing-simulation-service.js";
type Row = Record<string, unknown>;
type Queryable = {
  query<T extends Row>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};
type Transaction = Queryable & { release(): void };
type SqlPool = Queryable & { connect?: () => Promise<Transaction> };
type PolicyRow = Row & {
  requested_version_id: unknown;
  trust_ceiling: unknown;
  trust_level: unknown;
};
const codes = [
  "products.get",
  "products.getCost",
  "products.getListing",
  "finance.getRules",
  "pricing.prepareAction",
];
export class PostgresPricingSimulationRepository implements PricingSimulationRepository {
  constructor(private readonly pool: SqlPool) {}
  async getAgentEligibility(input: { officeId: string; agentId: string }) {
    const agent = await this.pool.query<Row>(
      "SELECT office_id, id AS agent_id, lifecycle_status, active_version_id FROM agent WHERE id = $1 AND office_id = $2",
      [input.agentId, input.officeId],
    );
    return this.eligibility(this.pool, agent.rows[0]);
  }
  async queuePricingSimulation(
    input: Parameters<PricingSimulationRepository["queuePricingSimulation"]>[0],
  ) {
    if (!this.pool.connect) throw new Error("pricing_queue_connection_missing");
    const client = await this.pool.connect();
    try {
      await client.query<Row>("BEGIN");
      const agent = await client.query<Row>(
        "SELECT office_id, id AS agent_id, lifecycle_status, active_version_id FROM agent WHERE id = $1 AND office_id = $2 FOR UPDATE",
        [input.agentId, input.officeId],
      );
      const current = await this.eligibility(client, agent.rows[0]);
      if (
        !current ||
        current.lifecycleStatus !== "active" ||
        current.activeAgentVersionId !== input.agentVersionId ||
        !codes.every((code) => current.grants.includes(code))
      ) {
        await client.query<Row>("ROLLBACK");
        return { status: "agent_invalid" as const };
      }
      const taskId = randomUUID(),
        eventId = randomUUID();
      await client.query<Row>(
        "INSERT INTO task (id, office_id, type, title, description, source, priority, status, requested_by_user_id, assigned_agent_id, created_at) VALUES ($1, $2, 'pricing.simulation', $3, $4, 'human', 'normal', 'queued', $5, $6, now())",
        [
          taskId,
          input.officeId,
          "Pricing simulation",
          "Calculate a deterministic price scenario from persisted facts.",
          input.requestedByUserId,
          input.agentId,
        ],
      );
      for (const item of input.context)
        await client.query<Row>(
          "INSERT INTO task_context_item (id, task_id, context_key, value_text) VALUES ($1, $2, $3, $4)",
          [randomUUID(), taskId, item.key, item.value],
        );
      await client.query<Row>(
        "INSERT INTO task_event (id, task_id, sequence_number, event_type, to_status, actor_user_id, payload_json) VALUES ($1, $2, 1, 'task.queued', 'queued', $3, $4::jsonb)",
        [
          eventId,
          taskId,
          input.requestedByUserId,
          JSON.stringify({ source: "human", priority: "normal" }),
        ],
      );
      await client.query<Row>(
        "INSERT INTO outbox_message (id, aggregate_type, aggregate_id, topic, payload_json, idempotency_key) VALUES ($1, 'task', $2, 'task.queued', $3::jsonb, $4)",
        [
          randomUUID(),
          taskId,
          JSON.stringify({ taskId, eventId }),
          `task.queued:${taskId}:1`,
        ],
      );
      await client.query<Row>(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, outcome, metadata_json) VALUES ($1, $2, 'pricing_simulation_queued', 'task', $3, 'success', $4::jsonb)",
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
      await client.query<Row>("COMMIT");
      return {
        status: "queued" as const,
        task: { id: taskId, status: "queued" as const },
      };
    } catch (error) {
      await client.query<Row>("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async getReportForTask(taskId: string) {
    const result = await this.pool.query<{ report_json: unknown } & Row>(
      "SELECT report_json FROM pricing_simulation_report report JOIN task ON task.id = report.task_id AND task.office_id = report.office_id WHERE task.id = $1 LIMIT 1",
      [taskId],
    );
    return result.rows[0]
      ? { status: "found" as const, report: result.rows[0].report_json }
      : { status: "not_found" as const };
  }
  async getReportForOfficeTask(officeId: string, taskId: string) {
    const result = await this.pool.query<{ report_json: unknown } & Row>(
      "SELECT report_json FROM pricing_simulation_report report JOIN task ON task.id = report.task_id AND task.office_id = report.office_id WHERE task.id = $1 AND task.office_id = $2 LIMIT 1",
      [taskId, officeId],
    );
    return result.rows[0]
      ? { status: "found" as const, report: result.rows[0].report_json }
      : { status: "not_found" as const };
  }
  private async eligibility(queryable: Queryable, row: Row | undefined) {
    const officeId = text(row?.office_id),
      agentId = text(row?.agent_id),
      lifecycleStatus = text(row?.lifecycle_status),
      activeAgentVersionId = text(row?.active_version_id);
    if (!officeId || !agentId || !lifecycleStatus || !activeAgentVersionId)
      return null;
    const grants = await queryable.query<Row>(
      "SELECT tool_code, access_level, revoked_at FROM agent_tool_grant WHERE agent_id = $1",
      [agentId],
    );
    return {
      officeId,
      agentId,
      lifecycleStatus,
      activeAgentVersionId,
      grants: grants.rows.flatMap((grant) => {
        const code = text(grant.tool_code);
        const access = text(grant.access_level);
        return code &&
          grant.revoked_at === null &&
          (access === "write" ||
            (code !== "pricing.prepareAction" && access === "read"))
          ? [code]
          : [];
      }),
    };
  }
}
export class PostgresPricingPolicyEvaluationContextLoader implements PricingPolicyEvaluationContextLoader {
  constructor(private readonly pool: Queryable) {}

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
       WHERE t.id = $1 AND t.type = 'pricing.simulation'`,
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
    const grantsResult = await this.pool.query<Row>(
      "SELECT tool_code, access_level, revoked_at FROM agent_tool_grant WHERE agent_id = $1",
      [agentId],
    );
    const grants: PolicyEvaluationContext["grants"][number][] = [];
    for (const grant of grantsResult.rows) {
      const toolCode = text(grant.tool_code);
      const accessLevel = grant.access_level;
      if (!toolCode || (accessLevel !== "read" && accessLevel !== "write"))
        continue;
      grants.push({
        toolCode,
        accessLevel,
        revokedAt: grant.revoked_at instanceof Date ? grant.revoked_at : null,
      });
    }
    return {
      officeId,
      hasTaskAuthority: true,
      lifecycleStatus,
      grants,
      activeAgentVersionId,
      requestedAgentVersionId,
      officeTrustLevel,
      agentTrustCeiling,
      policyConditionsSatisfied: true,
      actionLimitsSatisfied: true,
    };
  }
}

export const createPricingSimulationRuntime = (pool: Pool) => {
  const repository = new PostgresPricingSimulationRepository(pool);
  const registry = new ToolRegistry(pricingToolDefinitions);
  return {
    pricingSimulationRepository: repository,
    pricingTools: createPricingTools({
      repository: repository as PricingReportReadRepository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: new PostgresPricingPolicyEvaluationContextLoader(pool),
    }),
  };
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;
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
