import { describe, expect, it } from "vitest";
import {
  createStoreGeneralTools,
  type CatalogReadRepository,
} from "../src/modules/catalog/store-general-tools.js";

const context = {
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [{ toolCode: "products.get", accessLevel: "read" as const, revokedAt: null }],
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
  async search() { return []; }
  async getCost() { return null; }
  async getListing() { return null; }
}

describe("Store General tools", () => {
  it("uses the Sprint 3 registry and authorization service to deny a missing read grant", async () => {
    const repository = new CanonicalRepository();
    const tools = createStoreGeneralTools(repository);
    await expect(tools.invoke("products.get", { sku: "SKU-017" }, { ...context, grants: [] })).resolves.toEqual({
      status: "denied", reason: "tool_grant_missing",
    });
    expect(repository.reads).toBe(0);
  });

  it("uses the registered input schema before reading canonical data", async () => {
    const repository = new CanonicalRepository();
    const tools = createStoreGeneralTools(repository);
    await expect(tools.invoke("products.get", { sku: "" }, context)).resolves.toEqual({
      status: "denied", reason: "tool_input_invalid",
    });
    expect(repository.reads).toBe(0);
  });
});
