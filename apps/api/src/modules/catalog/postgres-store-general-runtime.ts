import type { Pool } from "pg";
import type { PolicyEvaluationContext } from "../policy/tool-authorization-service.js";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import {
  createStoreGeneralTools,
  storeGeneralToolDefinitions,
  type CanonicalCost,
  type CanonicalListing,
  type CanonicalProduct,
  type CatalogReadRepository,
  type PolicyEvaluationContextLoader,
} from "./store-general-tools.js";

type SqlPool = Pick<Pool, "query">;
type ContextRow = {
  agent_id: unknown;
  lifecycle_status: unknown;
  active_version_id: unknown;
  trust_ceiling: unknown;
  trust_level: unknown;
};
type GrantRow = {
  tool_code: unknown;
  access_level: unknown;
  revoked_at: unknown;
};

const trustLevel = (
  value: unknown,
): "analytical" | "supervised" | "autonomous" | null =>
  value === "analytical" || value === "supervised" || value === "autonomous"
    ? value
    : null;
const lifecycleStatus = (
  value: unknown,
): "draft" | "active" | "updating" | "suspended" | "archived" | null =>
  value === "draft" ||
  value === "active" ||
  value === "updating" ||
  value === "suspended" ||
  value === "archived"
    ? value
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export class PostgresPolicyEvaluationContextLoader implements PolicyEvaluationContextLoader {
  constructor(private readonly pool: SqlPool) {}

  async load(taskId: string): Promise<PolicyEvaluationContext | null> {
    const contextResult = await this.pool.query<ContextRow>(
      `SELECT t.assigned_agent_id AS agent_id, a.lifecycle_status, a.active_version_id,
              av.trust_ceiling, o.trust_level
       FROM task t
       JOIN agent a ON a.id = t.assigned_agent_id AND a.office_id = t.office_id
       JOIN agent_version av ON av.id = a.active_version_id AND av.agent_id = a.id
       JOIN office o ON o.id = t.office_id
       WHERE t.id = $1`,
      [taskId],
    );
    const record = contextResult.rows[0];
    if (!record) return null;
    const agentId = text(record.agent_id);
    const lifecycle = lifecycleStatus(record.lifecycle_status);
    const activeVersionId = text(record.active_version_id);
    const agentTrustCeiling = trustLevel(record.trust_ceiling);
    const officeTrustLevel = trustLevel(record.trust_level);
    if (
      !agentId ||
      !lifecycle ||
      !activeVersionId ||
      !agentTrustCeiling ||
      !officeTrustLevel
    )
      return null;

    const grantsResult = await this.pool.query<GrantRow>(
      `SELECT tool_code, access_level, revoked_at
       FROM agent_tool_grant WHERE agent_id = $1`,
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
      hasTaskAuthority: true,
      lifecycleStatus: lifecycle,
      grants,
      activeAgentVersionId: activeVersionId,
      requestedAgentVersionId: activeVersionId,
      officeTrustLevel,
      agentTrustCeiling,
      policyConditionsSatisfied: true,
      actionLimitsSatisfied: true,
    };
  }
}

export class PostgresCatalogReadRepository implements CatalogReadRepository {
  constructor(private readonly pool: SqlPool) {}

  async getBySku(sku: string): Promise<CanonicalProduct | null> {
    const result = await this.pool.query<CanonicalProduct>(
      "SELECT id, sku, name, active FROM product WHERE sku = $1 LIMIT 1",
      [sku],
    );
    return result.rows[0] ?? null;
  }

  async search(query: string): Promise<readonly CanonicalProduct[]> {
    const result = await this.pool.query<CanonicalProduct>(
      `SELECT id, sku, name, active FROM product
       WHERE sku = $1 OR ean = $1 OR name ILIKE $2
       ORDER BY sku LIMIT 50`,
      [query, `%${query.replace(/[\\%_]/g, "\\$&")}%`],
    );
    return result.rows;
  }

  async getCost(sku: string): Promise<CanonicalCost | null> {
    const result = await this.pool.query<CanonicalCost>(
      `SELECT p.id AS "productId", c.cost_numeric::text AS cost, c.currency,
              c.observed_at::text AS "observedAt"
       FROM product p JOIN product_cost_snapshot c ON c.product_id = p.id
       WHERE p.sku = $1 ORDER BY c.observed_at DESC LIMIT 1`,
      [sku],
    );
    return result.rows[0] ?? null;
  }

  async getListing(
    sku: string,
  ): Promise<CanonicalListing | { status: "unresolved" } | null> {
    const listing = await this.pool.query<CanonicalListing>(
      `SELECT p.id AS "productId", l.channel, l.external_listing_id AS "externalListingId",
              l.status, l.current_price_numeric::text AS price, l.currency
       FROM product p JOIN channel_listing l ON l.product_id = p.id
       WHERE p.sku = $1 AND l.channel = 'tray' LIMIT 1`,
      [sku],
    );
    if (listing.rows[0]) return listing.rows[0];
    const unresolved = await this.pool.query<{ status: string }>(
      "SELECT status FROM external_product_mapping WHERE external_sku = $1 AND status = 'unresolved' LIMIT 1",
      [sku],
    );
    return unresolved.rows[0] ? { status: "unresolved" } : null;
  }
}

export const createStoreGeneralRuntime = (pool: Pool) => {
  const registry = new ToolRegistry(storeGeneralToolDefinitions);
  return createStoreGeneralTools({
    repository: new PostgresCatalogReadRepository(pool),
    registry,
    authorizationService: new ToolAuthorizationService(registry),
    contextLoader: new PostgresPolicyEvaluationContextLoader(pool),
  });
};
