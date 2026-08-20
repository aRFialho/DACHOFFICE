import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/service.js";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { CreateHumanTaskInput, TaskService } from "./task-service.js";

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const createInput = (
  body: unknown,
  userId: string,
): CreateHumanTaskInput | null => {
  const value = object(body);
  const officeId = text(value?.officeId);
  const type = text(value?.type);
  const title = text(value?.title);
  const description = text(value?.description);
  const priority = text(value?.priority);
  const rawContext = value?.context;
  if (
    !officeId ||
    !type ||
    !title ||
    !description ||
    !["low", "normal", "high", "critical"].includes(priority ?? "") ||
    !Array.isArray(rawContext)
  ) {
    return null;
  }
  const context = rawContext.map(object).map((item) => ({
    key: text(item?.key),
    value: text(item?.value),
  }));
  if (context.some((item) => !item.key || !item.value)) return null;
  return {
    officeId,
    type,
    title,
    description,
    priority: priority as CreateHumanTaskInput["priority"],
    requestedByUserId: userId,
    context: context.map((item) => ({ key: item.key!, value: item.value! })),
  };
};

export const registerTaskRoutes = (
  server: FastifyInstance,
  options: { authService: AuthService; taskService: TaskService },
): void => {
  server.post("/v1/tasks", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const input = createInput(request.body, actor.user.id);
    if (!input) return reply.code(400).send({ error: "invalid_task_input" });
    try {
      return reply
        .code(201)
        .send({ task: await options.taskService.createHumanTask(input) });
    } catch {
      return reply.code(400).send({ error: "task_creation_failed" });
    }
  });
};
