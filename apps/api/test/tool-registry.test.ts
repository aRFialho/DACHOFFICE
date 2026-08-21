import { describe, expect, it } from "vitest";
import { defineTool } from "../src/modules/tools/tool-contracts.js";
import { ToolRegistry } from "../src/modules/tools/tool-registry.js";

const skuSchema = {
  parse: (value: unknown) => {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).sku === "string"
    ) {
      return {
        ok: true as const,
        value: { sku: (value as { sku: string }).sku },
      };
    }
    return { ok: false as const };
  },
};

const productsGet = defineTool({
  code: "products.get",
  integration: "erp-hub",
  description: "Get a canonical product by SKU.",
  inputSchema: skuSchema,
  outputSchema: skuSchema,
  actionClass: "READ",
  idempotency: "not_required",
  retryPolicy: "safe_read",
  requiredGrant: "read",
  rateLimit: { requestsPerMinute: 60, costUnits: 1 },
});

describe("ToolRegistry", () => {
  it("returns the registered semantic tool and its parsed input", () => {
    const result = new ToolRegistry([productsGet]).validateInput(
      "products.get",
      { sku: "ABC-1" },
    );

    expect(result).toMatchObject({
      ok: true,
      input: { sku: "ABC-1" },
      tool: { code: "products.get", actionClass: "READ" },
    });
  });

  it("rejects an unregistered semantic tool before it can be invoked", () => {
    expect(new ToolRegistry([]).validateInput("raw.http.post", {})).toEqual({
      ok: false,
      reason: "tool_unregistered",
    });
  });

  it("rejects malformed input and duplicate semantic codes", () => {
    expect(
      new ToolRegistry([productsGet]).validateInput("products.get", {}),
    ).toEqual({
      ok: false,
      reason: "tool_input_invalid",
    });
    expect(() => new ToolRegistry([productsGet, productsGet])).toThrow(
      "tool code must be unique",
    );
  });
});

it("denies safely when a registered schema rejects by throwing", () => {
  const throwingSchema = {
    parse: () => {
      throw new Error("invalid input");
    },
  };
  const throwingTool = defineTool({
    ...productsGet,
    code: "products.getThrowing",
    inputSchema: throwingSchema,
    outputSchema: throwingSchema,
  });

  expect(
    new ToolRegistry([throwingTool]).validateInput("products.getThrowing", {
      sku: "ABC-1",
    }),
  ).toEqual({
    ok: false,
    reason: "tool_input_invalid",
  });
});
