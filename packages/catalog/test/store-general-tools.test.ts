import { describe, expect, it } from "vitest";
import {
  createStoreGeneralTools,
  type CatalogReadRepository,
  type CanonicalListing,
} from "../src/store-general-tools.js";

const allowedContext = {
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

class CanonicalCatalogRepository implements CatalogReadRepository {
  async getBySku(sku: string) {
    return sku === "SKU-017"
      ? { id: "product-17", sku, name: "Desk Lamp", active: true }
      : null;
  }

  async search(query: string) {
    return query === "lamp"
      ? [{ id: "product-17", sku: "SKU-017", name: "Desk Lamp", active: true }]
      : [];
  }

  async getCost(sku: string) {
    return sku === "SKU-017"
      ? {
          productId: "product-17",
          cost: "10.0000",
          currency: "BRL",
          observedAt: "2026-08-21T12:00:00.000Z",
        }
      : null;
  }

  async getListing(
    sku: string,
  ): Promise<CanonicalListing | { status: "unresolved" }> {
    return sku === "SKU-017"
      ? {
          productId: "product-17",
          channel: "tray",
          externalListingId: "tray-product-17",
          status: "active",
          price: "19.9000",
          currency: "BRL",
        }
      : { status: "unresolved" as const };
  }
}

describe("Store General semantic read tools", () => {
  it("registers only canonical READ tools", () => {
    const tools = createStoreGeneralTools(new CanonicalCatalogRepository(), {
      authorize: () => ({ status: "allowed" }),
    });

    expect(tools.map((tool) => [tool.code, tool.actionClass, tool.requiredGrant])).toEqual([
      ["products.get", "READ", "read"],
      ["products.search", "READ", "read"],
      ["products.getCost", "READ", "read"],
      ["products.getListing", "READ", "read"],
    ]);
  });

  it("returns canonical product, search, cost, listing, and explicit unresolved data", async () => {
    const tools = createStoreGeneralTools(new CanonicalCatalogRepository(), {
      authorize: () => ({ status: "allowed" }),
    });

    await expect(tools.get("products.get")!.handler({ sku: "SKU-017" }, allowedContext)).resolves.toEqual({
      status: "found",
      product: { id: "product-17", sku: "SKU-017", name: "Desk Lamp", active: true },
    });
    await expect(tools.get("products.search")!.handler({ query: "lamp" }, allowedContext)).resolves.toEqual({
      status: "found",
      products: [{ id: "product-17", sku: "SKU-017", name: "Desk Lamp", active: true }],
    });
    await expect(tools.get("products.getCost")!.handler({ sku: "SKU-017" }, allowedContext)).resolves.toEqual({
      status: "found",
      cost: {
        productId: "product-17",
        cost: "10.0000",
        currency: "BRL",
        observedAt: "2026-08-21T12:00:00.000Z",
      },
    });
    await expect(tools.get("products.getListing")!.handler({ sku: "missing" }, allowedContext)).resolves.toEqual({
      status: "mapping_unresolved",
    });
  });

  it("returns the Sprint 3 denied decision before reading canonical data", async () => {
    const tools = createStoreGeneralTools(new CanonicalCatalogRepository(), {
      authorize: () => ({ status: "denied", reason: "tool_grant_missing" }),
    });

    await expect(tools.get("products.get")!.handler({ sku: "SKU-017" }, allowedContext)).resolves.toEqual({
      status: "denied",
      reason: "tool_grant_missing",
    });
  });
});
