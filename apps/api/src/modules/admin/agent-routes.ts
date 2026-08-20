import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../auth/service.js';
import { authenticateAdminMaster } from './admin-auth.js';
import type { AgentService, CreateAgentInput } from './agent-service.js';

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const textArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

const parseSchedules = (value: unknown): CreateAgentInput['schedules'] | null => {
  if (!Array.isArray(value)) return null;
  const schedules = value.map(object);
  if (schedules.some((item) => !item)) return null;
  return schedules.map((item) => {
    const weekday = item?.weekday;
    const workStart = item && text(item.workStart);
    const workEnd = item && text(item.workEnd);
    const timezone = item && text(item.timezone);
    const onCall = item?.onCall;
    return typeof weekday === 'number' && workStart && workEnd && timezone && typeof onCall === 'boolean'
      ? { weekday, workStart, workEnd, timezone, onCall }
      : null;
  }).every((item) => item !== null)
    ? schedules.map((item) => ({ weekday: item?.weekday as number, workStart: text(item?.workStart)!, workEnd: text(item?.workEnd)!, timezone: text(item?.timezone)!, onCall: item?.onCall as boolean }))
    : null;
};

const parseInput = (body: unknown, userId: string): CreateAgentInput | null => {
  const value = object(body);
  if (!value) return null;
  const fields = ['officeId', 'departmentId', 'name', 'title', 'primaryRole', 'basePrompt', 'mission', 'communicationStyle', 'modelProfile'];
  const values = fields.map((field) => text(value[field]));
  const responsibilities = textArray(value.responsibilities);
  const restrictions = textArray(value.restrictions);
  const trustCeiling = text(value.trustCeiling);
  const schedules = parseSchedules(value.schedules);
  const grants = Array.isArray(value.grants) ? value.grants.map(object) : null;
  if (values.some((item) => !item) || !responsibilities || !restrictions || !schedules || !grants || !['analytical', 'supervised', 'autonomous'].includes(trustCeiling ?? '')) return null;
  const parsedGrants = grants.map((grant) => ({ toolCode: text(grant?.toolCode), accessLevel: text(grant?.accessLevel) }));
  if (parsedGrants.some((grant) => !grant.toolCode || !['read', 'write'].includes(grant.accessLevel ?? ''))) return null;
  return {
    officeId: values[0]!, departmentId: values[1]!, name: values[2]!, title: values[3]!, primaryRole: values[4]!, basePrompt: values[5]!, mission: values[6]!, communicationStyle: values[7]!, modelProfile: values[8]!,
    responsibilities, restrictions, trustCeiling: trustCeiling as CreateAgentInput['trustCeiling'], createdByUserId: userId, schedules,
    grants: parsedGrants.map((grant) => ({ toolCode: grant.toolCode!, accessLevel: grant.accessLevel as 'read' | 'write' })),
  };
};

export const registerAgentRoutes = (server: FastifyInstance, options: { authService: AuthService; agentService: AgentService }): void => {
  server.post('/v1/admin/agents', async (request, reply) => {
    try {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: 'unauthorized' });
      const input = parseInput(request.body, actor.user.id);
      if (!input) return reply.code(400).send({ error: 'invalid_agent_input' });
      return reply.code(201).send({ agent: await options.agentService.createAgent(input) });
    } catch {
      return reply.code(400).send({ error: 'agent_creation_failed' });
    }
  });
};
