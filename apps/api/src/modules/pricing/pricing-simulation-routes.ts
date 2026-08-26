import type { FastifyInstance } from "fastify";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { AuthService } from "../auth/service.js";

export type PricingSimulationEndpoint = {
  create(input: {
    officeId: string;
    agentId: string;
    requestedByUserId: string;
    skus: string[];
    channel: string;
    discountPercent: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<{ id: string; status: "queued" }>;
  getReport(
    taskId: string,
  ): Promise<{ status: "found"; report: unknown } | { status: "not_found" }>;
  getWorkbook(taskId: string): Promise<
    | {
        status: "found";
        content: Buffer;
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
    | { status: "not_found" }
  >;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const input = (body: unknown, requestedByUserId: string) => {
  const value = record(body);
  if (
    !value ||
    Object.keys(value).some(
      (key) =>
        ![
          "officeId",
          "agentId",
          "skus",
          "channel",
          "discountPercent",
          "periodStart",
          "periodEnd",
        ].includes(key),
    )
  )
    return null;
  const skus = value.skus;
  if (!Array.isArray(skus) || !skus.every((sku) => typeof sku === "string"))
    return null;
  const officeId = text(value.officeId),
    agentId = text(value.agentId),
    channel = text(value.channel),
    discountPercent = text(value.discountPercent),
    periodStart = text(value.periodStart),
    periodEnd = text(value.periodEnd);
  return officeId &&
    agentId &&
    channel &&
    discountPercent &&
    periodStart &&
    periodEnd
    ? {
        officeId,
        agentId,
        requestedByUserId,
        skus,
        channel,
        discountPercent,
        periodStart,
        periodEnd,
      }
    : null;
};

export const registerPricingSimulationRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    pricingSimulationService: PricingSimulationEndpoint;
  },
): void => {
  server.post("/v1/pricing/simulations", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const create = input(request.body, actor.user.id);
    if (!create)
      return reply
        .code(400)
        .send({ error: "invalid_pricing_simulation_input" });
    try {
      return reply
        .code(201)
        .send({ task: await options.pricingSimulationService.create(create) });
    } catch {
      return reply
        .code(400)
        .send({ error: "pricing_simulation_creation_failed" });
    }
  });
  server.get("/v1/pricing/simulations/:taskId", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const taskId = (request.params as { taskId?: unknown }).taskId;
    if (typeof taskId !== "string")
      return reply.code(400).send({ error: "invalid_pricing_task_id" });
    try {
      const result = await options.pricingSimulationService.getReport(taskId);
      return result.status === "found"
        ? reply.code(200).send({ report: result.report })
        : reply.code(404).send({ error: "pricing_report_not_found" });
    } catch {
      return reply.code(400).send({ error: "invalid_pricing_task_id" });
    }
  });
  server.get(
    "/v1/pricing/simulations/:taskId/workbook",
    async (request, reply) => {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const taskId = (request.params as { taskId?: unknown }).taskId;
      if (typeof taskId !== "string")
        return reply.code(400).send({ error: "invalid_pricing_task_id" });
      try {
        const result =
          await options.pricingSimulationService.getWorkbook(taskId);
        if (result.status === "not_found")
          return reply.code(404).send({ error: "pricing_workbook_not_found" });
        return reply
          .code(200)
          .header("content-type", result.mediaType)
          .header(
            "content-disposition",
            `attachment; filename="pricing-${taskId}.xlsx"`,
          )
          .send(result.content);
      } catch {
        return reply.code(400).send({ error: "invalid_pricing_task_id" });
      }
    },
  );
};
