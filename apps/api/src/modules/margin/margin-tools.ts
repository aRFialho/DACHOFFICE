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

type MarginReportInput = { taskId: string };

export interface MarginReportReadRepository {
  getLatestReport(
    officeId: string,
    taskId: string,
  ): Promise<{ status: "found"; report: unknown } | { status: "not_found" }>;
}

export interface MarginPolicyEvaluationContextLoader {
  load(taskId: string): Promise<PolicyEvaluationContext | null>;
}

const inputSchema: RuntimeSchema<MarginReportInput> = {
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

export const marginToolDefinitions = [
  defineTool({
    code: "margin.getReport",
    integration: "margin",
    description:
      "Get the immutable margin analysis report for the authorized task only.",
    inputSchema,
    outputSchema,
    actionClass: "READ",
    idempotency: "not_required",
    retryPolicy: "safe_read",
    requiredGrant: "read",
    rateLimit: { requestsPerMinute: 60, costUnits: 1 },
  }),
];

type MarginToolResult =
  | ToolAuthorizationDecision
  | { status: "found"; report: unknown }
  | { status: "not_found" };

export const createMarginTools = (options: {
  repository: MarginReportReadRepository;
  registry: ToolRegistry;
  authorizationService: ToolAuthorizationService;
  contextLoader: MarginPolicyEvaluationContextLoader;
}) => {
  const invoke = async (request: {
    taskId: string;
    toolCode: string;
    input: unknown;
  }): Promise<MarginToolResult> => {
    const validated = options.registry.validateInput(
      request.toolCode,
      request.input,
    );
    if (!validated.ok) return { status: "denied", reason: validated.reason };
    const input = validated.input as MarginReportInput;
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
    return options.repository.getLatestReport(context.officeId, input.taskId);
  };
  return {
    definitions: marginToolDefinitions,
    registry: options.registry,
    authorizationService: options.authorizationService,
    invoke,
  };
};

export type MarginTools = ReturnType<typeof createMarginTools>;
