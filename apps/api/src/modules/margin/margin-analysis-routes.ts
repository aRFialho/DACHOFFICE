import type { FastifyInstance } from "fastify";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { AuthService } from "../auth/service.js";
import type {
  CreateMarginAnalysisInput,
  MarginAnalysisService,
} from "./margin-analysis-service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channelPattern = /^[a-z0-9][a-z0-9_-]*$/;
const skuPattern = /^[A-Z0-9][A-Z0-9._-]*$/;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const validFilter = (
  value: unknown,
  expression: RegExp,
): string[] | undefined =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && expression.test(item)) &&
  new Set(value).size === value.length
    ? (value as string[])
    : undefined;

const createInput = (
  body: unknown,
  requestedByUserId: string,
): CreateMarginAnalysisInput | null => {
  const input = record(body);
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        ![
          "officeId",
          "agentId",
          "periodStart",
          "periodEnd",
          "channels",
          "skus",
        ].includes(key),
    ) ||
    typeof input.officeId !== "string" ||
    typeof input.agentId !== "string" ||
    typeof input.periodStart !== "string" ||
    typeof input.periodEnd !== "string" ||
    !uuidPattern.test(input.officeId) ||
    !uuidPattern.test(input.agentId)
  )
    return null;
  const channels =
    input.channels === undefined
      ? undefined
      : validFilter(input.channels, channelPattern);
  const skus =
    input.skus === undefined ? undefined : validFilter(input.skus, skuPattern);
  if (
    (input.channels !== undefined && !channels) ||
    (input.skus !== undefined && !skus) ||
    (input.channels === undefined && input.skus === undefined
      ? false
      : channels === undefined && skus === undefined)
  )
    return null;
  return {
    officeId: input.officeId,
    agentId: input.agentId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    ...(channels === undefined && skus === undefined
      ? {}
      : {
          filters: {
            ...(channels === undefined ? {} : { channels }),
            ...(skus === undefined ? {} : { skus }),
          },
        }),
    requestedByUserId,
  };
};

const taskId = (params: unknown): string | null => {
  const value = record(params)?.taskId;
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
};

export const registerMarginAnalysisRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    marginAnalysisService: MarginAnalysisService;
  },
): void => {
  server.post("/v1/margin/analyses", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const input = createInput(request.body, actor.user.id);
    if (!input)
      return reply.code(400).send({ error: "invalid_margin_analysis_input" });
    try {
      return reply
        .code(201)
        .send({ task: await options.marginAnalysisService.create(input) });
    } catch {
      return reply.code(400).send({ error: "margin_analysis_creation_failed" });
    }
  });

  server.get("/v1/margin/analyses/:taskId", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const id = taskId(request.params);
    if (!id)
      return reply.code(400).send({ error: "invalid_margin_analysis_task_id" });
    try {
      const result = await options.marginAnalysisService.getReport(id);
      return result.status === "found"
        ? reply.code(200).send({ report: result.report })
        : reply.code(404).send({ error: "margin_analysis_report_not_found" });
    } catch {
      return reply
        .code(404)
        .send({ error: "margin_analysis_report_not_found" });
    }
  });
};
