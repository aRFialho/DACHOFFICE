import type { PolicyEvaluationContext } from "../policy/tool-authorization-service.js";
import { ToolAuthorizationService } from "../policy/tool-authorization-service.js";
import {
  defineTool,
  type RuntimeSchema,
  type ToolAuthorizationDecision,
} from "../tools/tool-contracts.js";
import { ToolRegistry } from "../tools/tool-registry.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PricingTaskInput = { taskId: string };

export interface PricingReportReadRepository {
  getReportForOfficeTask(
    officeId: string,
    taskId: string,
  ): Promise<{ status: "found"; report: unknown } | { status: "not_found" }>;
}

export interface PricingPolicyEvaluationContextLoader {
  load(taskId: string): Promise<PolicyEvaluationContext | null>;
}

const inputSchema: RuntimeSchema<PricingTaskInput> = {
  parse(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return { ok: false };
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).length !== 1 ||
      typeof input.taskId !== "string" ||
      !uuidPattern.test(input.taskId)
    )
      return { ok: false };
    return { ok: true, value: { taskId: input.taskId } };
  },
};

const outputSchema: RuntimeSchema<unknown> = {
  parse: (value) => ({ ok: true, value }),
};

export const pricingToolDefinitions = [
  defineTool({
    code: "pricing.getReport",
    integration: "pricing",
    description:
      "Get the immutable pricing simulation report for the authorized task only.",
    inputSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
  defineTool({
    code: "pricing.prepareAction",
    integration: "pricing",
    description:
      "Evaluate a persisted pricing proposal under policy; it never contacts a channel provider.",
    inputSchema,
    outputSchema,
    actionClass: "PREPARE",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "write",
    rateLimit: { requestsPerMinute: 30, costUnits: 1 },
  }),
];

type PricingToolResult =
  | ToolAuthorizationDecision
  | { status: "found"; report: unknown }
  | { status: "not_found" };

export const createPricingTools = (options: {
  repository: PricingReportReadRepository;
  registry: ToolRegistry;
  authorizationService: ToolAuthorizationService;
  contextLoader: PricingPolicyEvaluationContextLoader;
}) => {
  const invoke = async (request: {
    taskId: string;
    toolCode: string;
    input: unknown;
  }): Promise<PricingToolResult> => {
    const validated = options.registry.validateInput(
      request.toolCode,
      request.input,
    );
    if (!validated.ok) return { status: "denied", reason: validated.reason };
    const input = validated.input as PricingTaskInput;
    if (input.taskId !== request.taskId)
      return { status: "denied", reason: "task_authority_missing" };
    const context = await options.contextLoader.load(input.taskId);
    if (!context) return { status: "denied", reason: "task_authority_missing" };
    const decision = options.authorizationService.authorize({
      toolCode: request.toolCode,
      input: request.input,
      context,
    });
    if (decision.status !== "allowed") return decision;
    if (request.toolCode === "pricing.prepareAction") return decision;
    return options.repository.getReportForOfficeTask(
      context.officeId,
      input.taskId,
    );
  };
  return {
    definitions: pricingToolDefinitions,
    registry: options.registry,
    authorizationService: options.authorizationService,
    invoke,
  };
};

export type PricingTools = ReturnType<typeof createPricingTools>;
