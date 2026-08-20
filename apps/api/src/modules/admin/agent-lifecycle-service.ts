import type { OfficeTrustLevel } from "./office-service.js";
import type { AgentScheduleInput } from "./agent-service.js";
import type { AgentLifecycleStatus } from "./write-gate.js";

export type AgentVersionChangeType = "soft" | "hard";

export interface AppendAgentVersionInput {
  agentId: string;
  basePrompt: string;
  mission: string;
  communicationStyle: string;
  responsibilities: readonly string[];
  restrictions: readonly string[];
  modelProfile: string;
  trustCeiling: OfficeTrustLevel;
  changeType: AgentVersionChangeType;
  createdByUserId: string;
}

export interface AgentVersionRecord extends AppendAgentVersionInput {
  id: string;
  versionNumber: number;
}

export interface AgentLifecycleRepository {
  appendVersion(input: AppendAgentVersionInput): Promise<AgentVersionRecord>;
  transitionLifecycle(
    agentId: string,
    allowedFrom: readonly AgentLifecycleStatus[],
    target: AgentLifecycleStatus,
    changedByUserId: string,
  ): Promise<boolean>;
  replaceSchedule(
    agentId: string,
    schedules: readonly AgentScheduleInput[],
    changedByUserId: string,
  ): Promise<boolean>;
  revokeGrant(
    agentId: string,
    grantId: string,
    revokedByUserId: string,
  ): Promise<boolean>;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const transitions: Record<
  AgentLifecycleStatus,
  readonly AgentLifecycleStatus[]
> = {
  draft: ["active", "archived"],
  active: ["updating", "suspended", "archived"],
  updating: ["active", "suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

const text = (value: string, name: string, maximum: number): void => {
  if (!value.trim() || value.trim().length > maximum)
    throw new Error(`${name} is invalid`);
};

const schedules = (items: readonly AgentScheduleInput[]): void => {
  const weekdays = new Set<number>();
  for (const item of items) {
    if (
      !Number.isInteger(item.weekday) ||
      item.weekday < 0 ||
      item.weekday > 6 ||
      weekdays.has(item.weekday)
    ) {
      throw new Error("schedule weekdays are invalid");
    }
    weekdays.add(item.weekday);
    if (
      !timePattern.test(item.workStart) ||
      !timePattern.test(item.workEnd) ||
      item.workStart >= item.workEnd
    ) {
      throw new Error("schedule work hours are invalid");
    }
    text(item.timezone, "schedule timezone", 80);
  }
};

export class AgentLifecycleService {
  constructor(private readonly repository: AgentLifecycleRepository) {}

  async appendVersion(
    input: AppendAgentVersionInput,
  ): Promise<AgentVersionRecord> {
    text(input.agentId, "agentId", 80);
    text(input.basePrompt, "basePrompt", 20000);
    text(input.mission, "mission", 4000);
    text(input.communicationStyle, "communicationStyle", 400);
    text(input.modelProfile, "modelProfile", 160);
    text(input.createdByUserId, "createdByUserId", 80);
    if (
      !["analytical", "supervised", "autonomous"].includes(input.trustCeiling)
    )
      throw new Error("trust ceiling is invalid");
    if (!["soft", "hard"].includes(input.changeType))
      throw new Error("change type is invalid");
    return this.repository.appendVersion(input);
  }

  async transition(
    agentId: string,
    from: AgentLifecycleStatus,
    target: AgentLifecycleStatus,
    changedByUserId: string,
  ): Promise<void> {
    text(agentId, "agentId", 80);
    text(changedByUserId, "changedByUserId", 80);
    if (!transitions[from].includes(target))
      throw new Error("lifecycle transition is invalid");
    if (
      !(await this.repository.transitionLifecycle(
        agentId,
        [from],
        target,
        changedByUserId,
      ))
    ) {
      throw new Error("lifecycle transition could not be applied");
    }
  }

  async replaceSchedule(
    agentId: string,
    value: readonly AgentScheduleInput[],
    changedByUserId: string,
  ): Promise<void> {
    text(agentId, "agentId", 80);
    text(changedByUserId, "changedByUserId", 80);
    schedules(value);
    if (
      !(await this.repository.replaceSchedule(agentId, value, changedByUserId))
    ) {
      throw new Error("agent was not found");
    }
  }

  async revokeGrant(
    agentId: string,
    grantId: string,
    revokedByUserId: string,
  ): Promise<void> {
    text(agentId, "agentId", 80);
    text(grantId, "grantId", 80);
    text(revokedByUserId, "revokedByUserId", 80);
    if (
      !(await this.repository.revokeGrant(agentId, grantId, revokedByUserId))
    ) {
      throw new Error("active grant was not found");
    }
  }
}

export const createAgentLifecycleService = (
  repository: AgentLifecycleRepository,
): AgentLifecycleService => new AgentLifecycleService(repository);
