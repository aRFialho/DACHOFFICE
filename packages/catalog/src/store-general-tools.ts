export type StoreGeneralPolicyContext = {
  hasTaskAuthority: boolean;
  lifecycleStatus: "draft" | "active" | "suspended" | "retired";
  grants: readonly {
    toolCode: string;
    accessLevel: "read" | "write";
    revokedAt: Date | null;
  }[];
  activeAgentVersionId: string;
  requestedAgentVersionId: string;
  officeTrustLevel: "analytical" | "supervised" | "autonomous";
  agentTrustCeiling: "analytical" | "supervised" | "autonomous";
  policyConditionsSatisfied: boolean;
  actionLimitsSatisfied: boolean;
};

export type StoreGeneralAuthorizationDecision =
  | { status: "allowed" }
  | { status: "approval_required"; reason: "trust_requires_approval" }
  | {
      status: "denied";
      reason:
        | "tool_unregistered"
        | "tool_input_invalid"
        | "task_authority_missing"
        | "agent_suspended"
        | "agent_not_active"
        | "tool_grant_missing"
        | "agent_version_mismatch"
        | "policy_conditions_failed"
        | "action_limits_exceeded"
        | "destructive_action_disabled";
    };

export interface StoreGeneralAuthorizer {
  authorize(input: {
    toolCode: string;
    input: unknown;
    context: StoreGeneralPolicyContext;
  }): StoreGeneralAuthorizationDecision;
}

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

type RuntimeSchema<T> = {
  parse(value: unknown): { ok: true; value: T } | { ok: false };
};

type StoreGeneralTool<TInput> = {
  code: "products.get" | "products.search" | "products.getCost" | "products.getListing";
  integration: "store-general";
  description: string;
  inputSchema: RuntimeSchema<TInput>;
  actionClass: "READ";
  idempotency: "not_required";
  retryPolicy: "safe_read";
  requiredGrant: "read";
  rateLimit: { requestsPerMinute: number; costUnits: number };
  handler(
    input: unknown,
    context: StoreGeneralPolicyContext,
  ): Promise<StoreGeneralToolResult>;
};

export type StoreGeneralToolResult =
  | StoreGeneralAuthorizationDecision
  | { status: "found"; product: CanonicalProduct }
  | { status: "found"; products: readonly CanonicalProduct[] }
  | { status: "found"; cost: CanonicalCost }
  | { status: "found"; listing: CanonicalListing }
  | { status: "mapping_not_found" }
  | { status: "mapping_unresolved" };

export type StoreGeneralTools = readonly StoreGeneralTool<unknown>[] & {
  get(code: StoreGeneralTool<unknown>["code"]): StoreGeneralTool<unknown> | undefined;
};

const skuSchema: RuntimeSchema<{ sku: string }> = {
  parse(value) {
    const sku = stringField(value, "sku", 160);
    return sku === undefined ? { ok: false } : { ok: true, value: { sku } };
  },
};

const searchSchema: RuntimeSchema<{ query: string }> = {
  parse(value) {
    const query = stringField(value, "query", 160);
    return query === undefined ? { ok: false } : { ok: true, value: { query } };
  },
};

export const createStoreGeneralTools = (
  repository: CatalogReadRepository,
  authorizer: StoreGeneralAuthorizer,
): StoreGeneralTools => {
  const withAuthorization = async <TInput>(
    code: StoreGeneralTool<unknown>["code"],
    schema: RuntimeSchema<TInput>,
    input: unknown,
    context: StoreGeneralPolicyContext,
    read: (value: TInput) => Promise<StoreGeneralToolResult>,
  ): Promise<StoreGeneralToolResult> => {
    const parsed = schema.parse(input);
    if (!parsed.ok) return { status: "denied", reason: "tool_input_invalid" };
    const decision = authorizer.authorize({
      toolCode: code,
      input: parsed.value,
      context,
    });
    return decision.status === "allowed" ? read(parsed.value) : decision;
  };
  const tools: StoreGeneralTool<unknown>[] = [
    {
      code: "products.get",
      integration: "store-general",
      description: "Get a canonical product by SKU.",
      inputSchema: skuSchema,
      actionClass: "READ",
      idempotency: "not_required",
      retryPolicy: "safe_read",
      requiredGrant: "read",
      rateLimit: { requestsPerMinute: 60, costUnits: 1 },
      handler: (input, context) =>
        withAuthorization("products.get", skuSchema, input, context, async ({ sku }) => {
          const product = await repository.getBySku(sku);
          return product ? { status: "found", product } : { status: "mapping_not_found" };
        }),
    },
    {
      code: "products.search",
      integration: "store-general",
      description: "Search canonical products by bounded query.",
      inputSchema: searchSchema,
      actionClass: "READ",
      idempotency: "not_required",
      retryPolicy: "safe_read",
      requiredGrant: "read",
      rateLimit: { requestsPerMinute: 60, costUnits: 1 },
      handler: (input, context) =>
        withAuthorization("products.search", searchSchema, input, context, async ({ query }) => ({
          status: "found",
          products: await repository.search(query),
        })),
    },
    {
      code: "products.getCost",
      integration: "store-general",
      description: "Get the latest canonical cost by SKU.",
      inputSchema: skuSchema,
      actionClass: "READ",
      idempotency: "not_required",
      retryPolicy: "safe_read",
      requiredGrant: "read",
      rateLimit: { requestsPerMinute: 60, costUnits: 1 },
      handler: (input, context) =>
        withAuthorization("products.getCost", skuSchema, input, context, async ({ sku }) => {
          const cost = await repository.getCost(sku);
          return cost ? { status: "found", cost } : { status: "mapping_not_found" };
        }),
    },
    {
      code: "products.getListing",
      integration: "store-general",
      description: "Get mapped canonical Tray listing state by SKU.",
      inputSchema: skuSchema,
      actionClass: "READ",
      idempotency: "not_required",
      retryPolicy: "safe_read",
      requiredGrant: "read",
      rateLimit: { requestsPerMinute: 60, costUnits: 1 },
      handler: (input, context) =>
        withAuthorization("products.getListing", skuSchema, input, context, async ({ sku }) => {
          const listing = await repository.getListing(sku);
          if (isUnresolvedListing(listing)) return { status: "mapping_unresolved" };
          return listing ? { status: "found", listing } : { status: "mapping_not_found" };
        }),
    },
  ];
  return Object.assign(tools, {
    get: (code: StoreGeneralTool<unknown>["code"]) => tools.find((tool) => tool.code === code),
  });
};

function isUnresolvedListing(
  value: CanonicalListing | { status: "unresolved" } | null,
): value is { status: "unresolved" } {
  return value !== null && !("productId" in value);
}

function stringField(
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)[field];
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text.length > 0 && text.length <= maximumLength ? text : undefined;
}
