import { describe, expect, it } from "vitest";
import { createStoreGeneralTools, storeGeneralToolDefinitions, type CatalogReadRepository } from "../src/modules/catalog/store-general-tools.js";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const context = {
  hasTaskAuthority: true, lifecycleStatus: "active" as const,
  grants: [{ toolCode: "products.get", accessLevel: "read" as const, revokedAt: null }],
  activeAgentVersionId: "version-1", requestedAgentVersionId: "version-1",
  officeTrustLevel: "autonomous" as const, agentTrustCeiling: "autonomous" as const,
  policyConditionsSatisfied: true, actionLimitsSatisfied: true,
};
class CanonicalRepository implements CatalogReadRepository {
  reads = 0;
  async getBySku(sku: string) { this.reads += 1; return sku === "SKU-017" ? { id: "product-17", sku, name: "Desk Lamp", active: true } : null; }
  async search() { return []; }
  async getCost() { return null; }
  async getListing() { return null; }
}
const createTools = (repository: CatalogReadRepository, trustedContext = context) => {
  const registry = new ToolRegistry(storeGeneralToolDefinitions);
  return createStoreGeneralTools({ repository, registry, authorizationService: new ToolAuthorizationService(registry), contextLoader: { load: async () => trustedContext } });
};
describe("Store General tools", () => {
  it("uses trusted context to deny a missing read grant", async () => {
    const repository = new CanonicalRepository();
    await expect(createTools(repository, { ...context, grants: [] }).invoke({ taskId: "task-1", toolCode: "products.get", input: { sku: "SKU-017" } })).resolves.toEqual({ status: "denied", reason: "tool_grant_missing" });
    expect(repository.reads).toBe(0);
  });
  it("does not accept forged caller authorization facts", async () => {
    const repository = new CanonicalRepository();
    const registry = new ToolRegistry(storeGeneralToolDefinitions);
    const tools = createStoreGeneralTools({ repository, registry, authorizationService: new ToolAuthorizationService(registry), contextLoader: { load: async () => ({ ...context, grants: [] }) } });
    await expect(tools.invoke({ taskId: "task-1", toolCode: "products.get", input: { sku: "SKU-017" }, grants: context.grants } as never)).resolves.toEqual({ status: "denied", reason: "tool_grant_missing" });
    expect(repository.reads).toBe(0);
  });
});