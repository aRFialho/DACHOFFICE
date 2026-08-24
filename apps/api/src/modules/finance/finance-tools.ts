import type { PolicyEvaluationContext } from "../policy/tool-authorization-service.js";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import {
  defineTool,
  type RuntimeSchema,
  type ToolAuthorizationDecision,
} from "../tools/tool-contracts.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import type { FinanceService } from "./finance-service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RuleInput = Record<string, never>;
type MarginInput = { orderHeaderId: string };

export type FinanceReadRepository = Pick<
  FinanceService,
  "getLatestRuleVersion" | "getLatestMarginSnapshot"
>;

export interface FinancePolicyEvaluationContextLoader {
  load(taskId: string): Promise<PolicyEvaluationContext | null>;
}

const emptyObjectSchema: RuntimeSchema<RuleInput> = {
  parse(value) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 0
    )
      return { ok: false };
    return { ok: true, value: {} };
  },
};

const marginSchema: RuntimeSchema<MarginInput> = {
  parse(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return { ok: false };
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).length !== 1 ||
      typeof input.orderHeaderId !== "string" ||
      !uuidPattern.test(input.orderHeaderId)
    )
      return { ok: false };
    return { ok: true, value: { orderHeaderId: input.orderHeaderId } };
  },
};

const outputSchema: RuntimeSchema<unknown> = {
  parse: (value) => ({ ok: true, value }),
};

export const financeToolDefinitions = [
  defineTool({
    code: "finance.getRules",
    integration: "finance",
    description:
      "Get the latest configured finance rule version for the authorized task office.",
    inputSchema: emptyObjectSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
  defineTool({
    code: "finance.getMargin",
    integration: "finance",
    description:
      "Get the latest immutable contribution-margin snapshot for the authorized task office.",
    inputSchema: marginSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
];

type FinanceToolResult =
  | ToolAuthorizationDecision
  | { status: "found"; ruleVersion: unknown }
  | { status: "found"; snapshot: unknown }
  | { status: "not_found" };

export const createFinanceTools = (options: {
  repository: FinanceReadRepository;
  registry: ToolRegistry;
  authorizationService: ToolAuthorizationService;
  contextLoader: FinancePolicyEvaluationContextLoader;
}) => {
  const { repository, registry, authorizationService, contextLoader } = options;
  const invoke = async (request: {
    taskId: string;
    toolCode: string;
    input: unknown;
  }): Promise<FinanceToolResult> => {
    const context = await contextLoader.load(request.taskId);
    if (!context) return { status: "denied", reason: "task_authority_missing" };
    const decision = authorizationService.authorize({
      toolCode: request.toolCode,
      input: request.input,
      context,
    });
    if (decision.status !== "allowed") return decision;
    const validated = registry.validateInput(request.toolCode, request.input);
    if (!validated.ok) return { status: "denied", reason: validated.reason };

    if (request.toolCode === "finance.getRules")
      return repository.getLatestRuleVersion(context.officeId);
    if (request.toolCode === "finance.getMargin") {
      const input = validated.input as MarginInput;
      return repository.getLatestMarginSnapshot(
        context.officeId,
        input.orderHeaderId,
      );
    }
    return { status: "denied", reason: "tool_unregistered" };
  };
  return {
    definitions: financeToolDefinitions,
    registry,
    authorizationService,
    invoke,
  };
};

export type FinanceTools = ReturnType<typeof createFinanceTools>;
