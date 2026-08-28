import { describe, expect, it } from "vitest";
import {
  createStoreGeneralTools,
  storeGeneralToolDefinitions,
  type CatalogReadRepository,
} from "../src/modules/catalog/store-general-tools.js";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";
import { PostgresPolicyEvaluationContextLoader } from "../src/modules/catalog/postgres-store-general-runtime.js";

const context = {
  officeId: "11111111-1111-4111-8111-111111111111",
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [
    { toolCode: "products.get", accessLevel: "read" as const, revokedAt: null },
  ],
  activeAgentVersionId: "version-1",
  requestedAgentVersionId: "version-1",
  officeTrustLevel: "autonomous" as const,
  agentTrustCeiling: "autonomous" as const,
  policyConditionsSatisfied: true,
  actionLimitsSatisfied: true,
};
class CanonicalRepository implements CatalogReadRepository {
  reads = 0;
  async getBySku(sku: string) {
    this.reads += 1;
    return sku === "SKU-017"
      ? { id: "product-17", sku, name: "Desk Lamp", active: true }
      : null;
  }
  async search() {
    return [];
  }
  async getCost() {
    return null;
  }
  async getListing() {
    return null;
  }
}
const createTools = (
  repository: CatalogReadRepository,
  trustedContext = context,
) => {
  const registry = new ToolRegistry(storeGeneralToolDefinitions);
  return createStoreGeneralTools({
    repository,
    registry,
    authorizationService: new ToolAuthorizationService(registry),
    contextLoader: { load: async () => trustedContext },
  });
};
describe("Store General tools", () => {
  it("uses trusted context to deny a missing read grant", async () => {
    const repository = new CanonicalRepository();
    await expect(
      createTools(repository, { ...context, grants: [] }).invoke({
        taskId: "task-1",
        toolCode: "products.get",
        input: { sku: "SKU-017" },
      }),
    ).resolves.toEqual({ status: "denied", reason: "tool_grant_missing" });
    expect(repository.reads).toBe(0);
  });
  it("does not accept forged caller authorization facts", async () => {
    const repository = new CanonicalRepository();
    const registry = new ToolRegistry(storeGeneralToolDefinitions);
    const tools = createStoreGeneralTools({
      repository,
      registry,
      authorizationService: new ToolAuthorizationService(registry),
      contextLoader: { load: async () => ({ ...context, grants: [] }) },
    });
    await expect(
      tools.invoke({
        taskId: "task-1",
        toolCode: "products.get",
        input: { sku: "SKU-017" },
        grants: context.grants,
      } as never),
    ).resolves.toEqual({ status: "denied", reason: "tool_grant_missing" });
    expect(repository.reads).toBe(0);
  });
  it("loads authorization facts from server-owned task and agent records", async () => {
    const queries: Array<{
      text: string;
      values: readonly unknown[] | undefined;
    }> = [];
    const loader = new PostgresPolicyEvaluationContextLoader({
      query: async (text: string, values?: readonly unknown[]) => {
        queries.push({ text, values });
        if (text.includes("FROM task")) {
          return {
            rows: [
              {
                office_id: "11111111-1111-4111-8111-111111111111",
                agent_id: "agent-1",
                lifecycle_status: "active",
                active_version_id: "version-1",
                trust_ceiling: "autonomous",
                trust_level: "autonomous",
              },
            ],
          };
        }
        return {
          rows: [
            {
              tool_code: "products.get",
              access_level: "read",
              revoked_at: null,
            },
          ],
        };
      },
    } as never);

    await expect(loader.load("task-1")).resolves.toEqual(context);
    expect(queries[0]?.values).toEqual(["task-1"]);
    expect(queries[0]?.text).toContain("assigned_agent_id");
  });
});
