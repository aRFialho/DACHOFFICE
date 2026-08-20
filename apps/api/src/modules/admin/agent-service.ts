import type { OfficeTrustLevel } from "./office-service.js";

export interface AgentScheduleInput {
  weekday: number;
  workStart: string;
  workEnd: string;
  timezone: string;
  onCall: boolean;
}

export interface AgentGrantInput {
  toolCode: string;
  accessLevel: "read" | "write";
}

export interface CreateAgentInput {
  officeId: string;
  departmentId: string;
  name: string;
  title: string;
  primaryRole: string;
  basePrompt: string;
  mission: string;
  communicationStyle: string;
  responsibilities: readonly string[];
  restrictions: readonly string[];
  modelProfile: string;
  trustCeiling: OfficeTrustLevel;
  createdByUserId: string;
  schedules: readonly AgentScheduleInput[];
  grants: readonly AgentGrantInput[];
}

export interface AgentRecord extends CreateAgentInput {
  id: string;
  lifecycleStatus: "draft";
  versionNumber: 1;
}

export interface AgentRepository {
  createAgent(input: CreateAgentInput): Promise<AgentRecord>;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const required = (value: string, name: string, max: number): void => {
  if (!value.trim() || value.trim().length > max)
    throw new Error(`${name} is invalid`);
};

const validateSchedule = (schedules: readonly AgentScheduleInput[]): void => {
  const weekdays = new Set<number>();
  for (const schedule of schedules) {
    if (
      !Number.isInteger(schedule.weekday) ||
      schedule.weekday < 0 ||
      schedule.weekday > 6
    ) {
      throw new Error("schedule weekday is invalid");
    }
    if (weekdays.has(schedule.weekday))
      throw new Error("schedule weekdays must be unique");
    weekdays.add(schedule.weekday);
    if (
      !timePattern.test(schedule.workStart) ||
      !timePattern.test(schedule.workEnd) ||
      schedule.workStart >= schedule.workEnd
    ) {
      throw new Error("schedule work hours are invalid");
    }
    required(schedule.timezone, "schedule timezone", 80);
  }
};

const validateGrants = (grants: readonly AgentGrantInput[]): void => {
  const tools = new Set<string>();
  for (const grant of grants) {
    required(grant.toolCode, "toolCode", 160);
    if (tools.has(grant.toolCode))
      throw new Error("tool grants must be unique");
    tools.add(grant.toolCode);
  }
};

export class AgentService {
  constructor(private readonly repository: AgentRepository) {}

  async createAgent(input: CreateAgentInput): Promise<AgentRecord> {
    required(input.name, "name", 160);
    required(input.title, "title", 160);
    required(input.primaryRole, "primaryRole", 160);
    required(input.basePrompt, "basePrompt", 20000);
    required(input.mission, "mission", 4000);
    required(input.communicationStyle, "communicationStyle", 400);
    required(input.modelProfile, "modelProfile", 160);
    validateSchedule(input.schedules);
    validateGrants(input.grants);
    return this.repository.createAgent(input);
  }
}

export const createAgentService = (repository: AgentRepository): AgentService =>
  new AgentService(repository);
