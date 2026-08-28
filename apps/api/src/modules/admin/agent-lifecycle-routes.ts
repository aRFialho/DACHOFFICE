import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/service.js";
import { authenticateAdminMaster } from "./admin-auth.js";
import type { AgentScheduleInput } from "./agent-service.js";
import type {
  AgentLifecycleService,
  AppendAgentVersionInput,
} from "./agent-lifecycle-service.js";
import type { AgentLifecycleStatus } from "./write-gate.js";

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const textArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
const lifecycle = (value: unknown): AgentLifecycleStatus | null =>
  typeof value === "string" &&
  ["draft", "active", "updating", "suspended", "archived"].includes(value)
    ? (value as AgentLifecycleStatus)
    : null;

const agentId = (params: unknown): string | null =>
  text(object(params)?.agentId);

const versionInput = (
  body: unknown,
  id: string,
  userId: string,
): AppendAgentVersionInput | null => {
  const value = object(body);
  const basePrompt = text(value?.basePrompt);
  const mission = text(value?.mission);
  const communicationStyle = text(value?.communicationStyle);
  const responsibilities = textArray(value?.responsibilities);
  const restrictions = textArray(value?.restrictions);
  const modelProfile = text(value?.modelProfile);
  const trustCeiling = text(value?.trustCeiling);
  const changeType = text(value?.changeType);
  if (
    !basePrompt ||
    !mission ||
    !communicationStyle ||
    !responsibilities ||
    !restrictions ||
    !modelProfile ||
    !["analytical", "supervised", "autonomous"].includes(trustCeiling ?? "") ||
    !["soft", "hard"].includes(changeType ?? "")
  )
    return null;
  return {
    agentId: id,
    basePrompt,
    mission,
    communicationStyle,
    responsibilities,
    restrictions,
    modelProfile,
    trustCeiling: trustCeiling as AppendAgentVersionInput["trustCeiling"],
    changeType: changeType as AppendAgentVersionInput["changeType"],
    createdByUserId: userId,
  };
};

const scheduleInput = (body: unknown): AgentScheduleInput[] | null => {
  const items = object(body)?.schedules;
  if (!Array.isArray(items)) return null;
  const parsed = items.map(object).map((item) => ({
    weekday: item?.weekday,
    workStart: text(item?.workStart),
    workEnd: text(item?.workEnd),
    timezone: text(item?.timezone),
    onCall: item?.onCall,
  }));
  return parsed.every(
    (item) =>
      typeof item.weekday === "number" &&
      item.workStart &&
      item.workEnd &&
      item.timezone &&
      typeof item.onCall === "boolean",
  )
    ? parsed.map((item) => ({
        weekday: item.weekday as number,
        workStart: item.workStart!,
        workEnd: item.workEnd!,
        timezone: item.timezone!,
        onCall: item.onCall as boolean,
      }))
    : null;
};

export const registerAgentLifecycleRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    agentLifecycleService: AgentLifecycleService;
  },
): void => {
  server.post("/v1/admin/agents/:agentId/versions", async (request, reply) => {
    try {
      const actor = await authenticateAdminMaster(request, options.authService);
      const id = agentId(request.params);
      const input =
        actor && id ? versionInput(request.body, id, actor.user.id) : null;
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      if (!input)
        return reply.code(400).send({ error: "invalid_agent_version_input" });
      return reply.code(201).send({
        version: await options.agentLifecycleService.appendVersion(input),
      });
    } catch {
      return reply.code(400).send({ error: "agent_version_creation_failed" });
    }
  });

  server.post("/v1/admin/agents/:agentId/lifecycle", async (request, reply) => {
    try {
      const actor = await authenticateAdminMaster(request, options.authService);
      const id = agentId(request.params);
      const body = object(request.body);
      const from = lifecycle(body?.from);
      const target = lifecycle(body?.target);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      if (!id || !from || !target)
        return reply.code(400).send({ error: "invalid_agent_lifecycle_input" });
      await options.agentLifecycleService.transition(
        id,
        from,
        target,
        actor.user.id,
      );
      return reply.code(204).send();
    } catch {
      return reply
        .code(400)
        .send({ error: "agent_lifecycle_transition_failed" });
    }
  });

  server.put("/v1/admin/agents/:agentId/schedule", async (request, reply) => {
    try {
      const actor = await authenticateAdminMaster(request, options.authService);
      const id = agentId(request.params);
      const schedules = scheduleInput(request.body);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      if (!id || !schedules)
        return reply.code(400).send({ error: "invalid_agent_schedule_input" });
      await options.agentLifecycleService.replaceSchedule(
        id,
        schedules,
        actor.user.id,
      );
      return reply.code(204).send();
    } catch {
      return reply.code(400).send({ error: "agent_schedule_update_failed" });
    }
  });

  server.delete(
    "/v1/admin/agents/:agentId/tool-grants/:grantId",
    async (request, reply) => {
      try {
        const actor = await authenticateAdminMaster(
          request,
          options.authService,
        );
        const params = object(request.params);
        const id = text(params?.agentId);
        const grantId = text(params?.grantId);
        if (!actor) return reply.code(401).send({ error: "unauthorized" });
        if (!id || !grantId)
          return reply.code(400).send({ error: "invalid_agent_grant_input" });
        await options.agentLifecycleService.revokeGrant(
          id,
          grantId,
          actor.user.id,
        );
        return reply.code(204).send();
      } catch {
        return reply.code(400).send({ error: "agent_grant_revocation_failed" });
      }
    },
  );
};
