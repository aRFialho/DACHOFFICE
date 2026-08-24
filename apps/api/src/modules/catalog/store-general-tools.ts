import {
  ToolAuthorizationService,
  type PolicyEvaluationContext,
} from "../policy/tool-authorization-service.js";
import {
  defineTool,
  type RuntimeSchema,
  type ToolAuthorizationDecision,
} from "../tools/tool-contracts.js";
import { ToolRegistry } from "../tools/tool-registry.js";

export type CanonicalProduct = {
  id: string;
  sku: string;
  name: string;
  active: boolean;
};
export type CanonicalCost = {
  productId: string;
  cost: string;
  currency: string;
  observedAt: string;
};
export type CanonicalListing = {
  productId: string;
  channel: "tray";
  externalListingId: string;
  status: string;
  price: string;
  currency: string;
};

export interface CatalogReadRepository {
  getBySku(sku: string): Promise<CanonicalProduct | null>;
  search(query: string): Promise<readonly CanonicalProduct[]>;
  getCost(sku: string): Promise<CanonicalCost | null>;
  getListing(
    sku: string,
  ): Promise<CanonicalListing | { status: "unresolved" } | null>;
}

type ToolResult =
  | ToolAuthorizationDecision
  | { status: "found"; product: CanonicalProduct }
  | { status: "found"; products: readonly CanonicalProduct[] }
  | { status: "found"; cost: CanonicalCost }
  | { status: "found"; listing: CanonicalListing }
  | { status: "mapping_not_found" }
  | { status: "mapping_unresolved" };

const textSchema = (
  field: "sku" | "query",
): RuntimeSchema<{ [key: string]: string }> => ({
  parse(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return { ok: false };
    const text = (value as Record<string, unknown>)[field];
    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.trim().length > 160
    )
      return { ok: false };
    return { ok: true, value: { [field]: text.trim() } };
  },
});
const outputSchema: RuntimeSchema<unknown> = {
  parse: (value) => ({ ok: true, value }),
};
const skuSchema = textSchema("sku");
const searchSchema = textSchema("query");

export const storeGeneralToolDefinitions = [
  defineTool({
    code: "products.get",
    integration: "store-general",
    description: "Get a canonical product by SKU.",
    inputSchema: skuSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
  defineTool({
    code: "products.search",
    integration: "store-general",
    description: "Search canonical products.",
    inputSchema: searchSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
  defineTool({
    code: "products.getCost",
    integration: "store-general",
    description: "Get latest canonical cost by SKU.",
    inputSchema: skuSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
  defineTool({
    code: "products.getListing",
    integration: "store-general",
    description: "Get canonical Tray listing by SKU.",
    inputSchema: skuSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
];
export interface PolicyEvaluationContextLoader {
  load(taskId: string): Promise<PolicyEvaluationContext | null>;
}
export const createStoreGeneralTools = (options: {
  repository: CatalogReadRepository;
  registry: ToolRegistry;
  authorizationService: ToolAuthorizationService;
  contextLoader: PolicyEvaluationContextLoader;
}) => {
  const { repository, registry, authorizationService, contextLoader } = options;
  const invoke = async (request: {
    taskId: string;
    toolCode: string;
    input: unknown;
  }): Promise<ToolResult> => {
    const context = await contextLoader.load(request.taskId);
    if (!context) return { status: "denied", reason: "task_authority_missing" };
    const { toolCode, input } = request;
    const decision = authorizationService.authorize({
      toolCode,
      input,
      context,
    });
    if (decision.status !== "allowed") return decision;
    const value = registry.validateInput(toolCode, input);
    if (!value.ok) return { status: "denied", reason: value.reason };
    const text = value.input as { sku?: string; query?: string };
    if (toolCode === "products.get") {
      const product = await repository.getBySku(text.sku!);
      return product
        ? { status: "found", product }
        : { status: "mapping_not_found" };
    }
    if (toolCode === "products.search")
      return {
        status: "found",
        products: await repository.search(text.query!),
      };
    if (toolCode === "products.getCost") {
      const cost = await repository.getCost(text.sku!);
      return cost ? { status: "found", cost } : { status: "mapping_not_found" };
    }
    const listing = await repository.getListing(text.sku!);
    if (listing && !("productId" in listing))
      return { status: "mapping_unresolved" };
    return listing
      ? { status: "found", listing }
      : { status: "mapping_not_found" };
  };
  return {
    definitions: storeGeneralToolDefinitions,
    registry,
    authorizationService,
    invoke,
  };
};

export type StoreGeneralTools = ReturnType<typeof createStoreGeneralTools>;
