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

type RuleInput = { officeId: string };
type MarginInput = { officeId: string; orderHeaderId: string };

export type FinanceReadRepository = Pick<
  FinanceService,
  "getLatestRuleVersion" | "getLatestMarginSnapshot"
>;

export interface FinancePolicyEvaluationContextLoader {
  load(taskId: string): Promise<PolicyEvaluationContext | null>;
}

const uuidSchema = <T extends RuleInput | MarginInput>(
  fields: readonly string[],
): RuntimeSchema<T> => ({
  parse(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return { ok: false };
    const input = value as Record<string, unknown>;
    const parsed: Record<string, string> = {};
    for (const field of fields) {
      const fieldValue = input[field];
      if (typeof fieldValue !== "string" || !uuidPattern.test(fieldValue))
        return { ok: false };
      parsed[field] = fieldValue;
    }
    return { ok: true, value: parsed as T };
  },
});

const outputSchema: RuntimeSchema<unknown> = {
  parse: (value) => ({ ok: true, value }),
};

export const financeToolDefinitions = [
  defineTool({
    code: "finance.getRules",
    integration: "finance",
    description:
      "Get the latest configured finance rule version for an office.",
    inputSchema: uuidSchema<RuleInput>(["officeId"]),
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
    description: "Get the latest immutable contribution-margin snapshot.",
    inputSchema: uuidSchema<MarginInput>(["officeId", "orderHeaderId"]),
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

    if (request.toolCode === "finance.getRules") {
      const input = validated.input as RuleInput;
      return repository.getLatestRuleVersion(input.officeId);
    }
    if (request.toolCode === "finance.getMargin") {
      const input = validated.input as MarginInput;
      return repository.getLatestMarginSnapshot(
        input.officeId,
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
