import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/service.js";
import { authenticateAdminMaster } from "./admin-auth.js";
import type {
  CreateDepartmentInput,
  CreateOfficeInput,
  OfficeService,
} from "./office-service.js";

const objectBody = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const officeInput = (
  body: unknown,
  userId: string,
): CreateOfficeInput | null => {
  const value = objectBody(body);
  const name = value && stringValue(value.name);
  const timezone = value && stringValue(value.timezone);
  const trustLevel = value && stringValue(value.trustLevel);
  const workdayStart = value && stringValue(value.workdayStart);
  const workdayEnd = value && stringValue(value.workdayEnd);
  if (
    !name ||
    !timezone ||
    !workdayStart ||
    !workdayEnd ||
    !["analytical", "supervised", "autonomous"].includes(trustLevel ?? "")
  )
    return null;
  return {
    name,
    timezone,
    trustLevel: trustLevel as CreateOfficeInput["trustLevel"],
    workdayStart,
    workdayEnd,
    createdByUserId: userId,
  };
};

const departmentInput = (
  body: unknown,
  officeId: string,
): CreateDepartmentInput | null => {
  const value = objectBody(body);
  const name = value && stringValue(value.name);
  const type = value && stringValue(value.type);
  return name && type ? { officeId, name, type } : null;
};

export const registerOfficeRoutes = (
  server: FastifyInstance,
  options: { authService: AuthService; officeService: OfficeService },
): void => {
  server.post("/v1/admin/offices", async (request, reply) => {
    try {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const input = officeInput(request.body, actor.user.id);
      if (!input)
        return reply.code(400).send({ error: "invalid_office_input" });
      return reply
        .code(201)
        .send({ office: await options.officeService.createOffice(input) });
    } catch {
      return reply.code(400).send({ error: "office_creation_failed" });
    }
  });

  server.post(
    "/v1/admin/offices/:officeId/departments",
    async (request, reply) => {
      try {
        const actor = await authenticateAdminMaster(
          request,
          options.authService,
        );
        if (!actor) return reply.code(401).send({ error: "unauthorized" });
        const officeId = stringValue(
          (request.params as Record<string, unknown>).officeId,
        );
        const input = officeId ? departmentInput(request.body, officeId) : null;
        if (!input)
          return reply.code(400).send({ error: "invalid_department_input" });
        return reply.code(201).send({
          department: await options.officeService.createDepartment(input),
        });
      } catch {
        return reply.code(400).send({ error: "department_creation_failed" });
      }
    },
  );
};
