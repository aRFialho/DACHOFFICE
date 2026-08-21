import { describe, expect, it } from "vitest";
import { ToolAuthorizationService } from "../src/modules/policy/tool-authorization-service.js";
import {
  defineTool,
  type RuntimeSchema,
} from "../src/modules/tools/tool-contracts.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const productSchema: RuntimeSchema<{ sku: string }> = {
  parse: (value: unknown) => {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).sku === "string"
    ) {
      return { ok: true, value: { sku: (value as { sku: string }).sku } };
    }
    return { ok: false };
  },
};

const priceUpdateSchema: RuntimeSchema<{ sku: string; priceMinor: number }> = {
  parse: (value: unknown) => {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).sku === "string" &&
      Number.isSafeInteger((value as Record<string, unknown>).priceMinor)
    ) {
      return {
        ok: true,
        value: {
          sku: (value as { sku: string }).sku,
          priceMinor: (value as { priceMinor: number }).priceMinor,
        },
      };
    }
    return { ok: false };
  },
};

const productsGet = defineTool({
  code: "products.get",
  integration: "erp-hub",
  description: "Get a canonical product by SKU.",
  inputSchema: productSchema,
  outputSchema: productSchema,
  actionClass: "READ",
  idempotency: "not_required",
  retryPolicy: "safe_read",
  requiredGrant: "read",
  rateLimit: { requestsPerMinute: 60, costUnits: 1 },
});

const productsUpdatePrice = defineTool({
  code: "products.updatePrice",
  integration: "erp-hub",
  description: "Update a product price in minor units.",
  inputSchema: priceUpdateSchema,
  outputSchema: productSchema,
  actionClass: "WRITE",
  idempotency: "required",
  retryPolicy: "idempotent_write",
  requiredGrant: "write",
  rateLimit: { requestsPerMinute: 10, costUnits: 2 },
});

const autonomousWriteContext = {
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [
    {
      toolCode: "products.updatePrice",
      accessLevel: "write" as const,
      revokedAt: null,
    },
  ],
  activeAgentVersionId: "version-1",
  requestedAgentVersionId: "version-1",
  officeTrustLevel: "autonomous" as const,
  agentTrustCeiling: "autonomous" as const,
  policyConditionsSatisfied: true,
  actionLimitsSatisfied: true,
};

const supervisedWriteContext = {
  ...autonomousWriteContext,
  officeTrustLevel: "supervised" as const,
};

describe("ToolAuthorizationService", () => {
  it("does not authorize a model-requested unregistered tool", () => {
    const service = new ToolAuthorizationService(
      new ToolRegistry([productsGet, productsUpdatePrice]),
    );

    expect(
      service.authorize({
        toolCode: "raw.http.post",
        input: { url: "https://provider.example" },
        context: autonomousWriteContext,
      }),
    ).toEqual({ status: "denied", reason: "tool_unregistered" });
  });

  it("denies malformed input before an autonomous write can be allowed", () => {
    const service = new ToolAuthorizationService(
      new ToolRegistry([productsGet, productsUpdatePrice]),
    );

    expect(
      service.authorize({
        toolCode: "products.updatePrice",
        input: { sku: 12 },
        context: autonomousWriteContext,
      }),
    ).toEqual({ status: "denied", reason: "tool_input_invalid" });
  });

  it("returns approval_required rather than an executor for a supervised write", () => {
    const service = new ToolAuthorizationService(
      new ToolRegistry([productsGet, productsUpdatePrice]),
    );

    const decision = service.authorize({
      toolCode: "products.updatePrice",
      input: { sku: "ABC-1", priceMinor: 1999 },
      context: supervisedWriteContext,
    });

    expect(decision).toEqual({
      status: "approval_required",
      reason: "trust_requires_approval",
    });
    expect(Object.keys(decision).sort()).toEqual(["reason", "status"]);
  });
});
