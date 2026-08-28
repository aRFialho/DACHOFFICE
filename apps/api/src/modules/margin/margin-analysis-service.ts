import type { AgentLifecycleStatus } from "../admin/write-gate.js";
import type { PolicyToolGrant } from "../policy/policy-engine.js";

export const requiredMarginReadGrants = [
  "finance.getRules",
  "finance.getMargin",
  "products.getCost",
] as const;

export type MarginAnalysisFilters = {
  channels?: string[];
  skus?: string[];
};

export type CreateMarginAnalysisInput = {
  officeId: string;
  agentId: string;
  periodStart: string;
  periodEnd: string;
  filters?: MarginAnalysisFilters;
  requestedByUserId: string;
};

export type MarginTaskContextItem = { key: string; value: string };

export type QueuedMarginAnalysisTask = {
  id: string;
  officeId: string;
  agentId: string;
  agentVersionId: string;
  status: "queued";
  context: readonly MarginTaskContextItem[];
};

export type MarginAgentEligibility = {
  officeId: string;
  agentId: string;
  lifecycleStatus: AgentLifecycleStatus;
  activeAgentVersionId: string;
  grants: readonly PolicyToolGrant[];
};

export interface MarginAnalysisRepository {
  getAgentEligibility(input: {
    officeId: string;
    agentId: string;
  }): Promise<MarginAgentEligibility | null>;
  queueMarginAnalysis(input: {
    officeId: string;
    agentId: string;
    agentVersionId: string;
    periodStart: string;
    periodEnd: string;
    context: readonly MarginTaskContextItem[];
    requestedByUserId: string;
  }): Promise<
    | { status: "queued"; task: QueuedMarginAnalysisTask }
    | { status: "agent_invalid" }
  >;
  getReportForTask(
    taskId: string,
  ): Promise<{ status: "found"; report: unknown } | { status: "not_found" }>;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channelPattern = /^[a-z0-9][a-z0-9_-]*$/;
const skuPattern = /^[A-Z0-9][A-Z0-9._-]*$/;

export class MarginAnalysisService {
  constructor(private readonly repository: MarginAnalysisRepository) {}

  async create(
    input: CreateMarginAnalysisInput,
  ): Promise<QueuedMarginAnalysisTask> {
    validateCreateInput(input);
    const eligibility = await this.repository.getAgentEligibility({
      officeId: input.officeId,
      agentId: input.agentId,
    });
    if (!isEligible(eligibility, input.officeId, input.agentId))
      throw new Error("margin agent is not eligible");
    const context = marginTaskContext(input, eligibility.activeAgentVersionId);
    const result = await this.repository.queueMarginAnalysis({
      officeId: input.officeId,
      agentId: input.agentId,
      agentVersionId: eligibility.activeAgentVersionId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      context,
      requestedByUserId: input.requestedByUserId,
    });
    if (result.status !== "queued")
      throw new Error("margin agent is not eligible");
    return result.task;
  }

  getReport(taskId: string) {
    if (!uuidPattern.test(taskId)) throw new Error("task id is invalid");
    return this.repository.getReportForTask(taskId);
  }
}

const validateCreateInput = (input: CreateMarginAnalysisInput): void => {
  if (!uuidPattern.test(input.officeId) || !uuidPattern.test(input.agentId))
    throw new Error("margin analysis identity is invalid");
  if (!uuidPattern.test(input.requestedByUserId))
    throw new Error("margin analysis requester is invalid");
  if (!utcTimestamp(input.periodStart) || !utcTimestamp(input.periodEnd))
    throw new Error("margin analysis period is invalid");
  if (Date.parse(input.periodEnd) < Date.parse(input.periodStart))
    throw new Error("margin analysis period is invalid");
  validateFilters(input.filters);
};

const validateFilters = (filters: MarginAnalysisFilters | undefined): void => {
  if (!filters) return;
  const validate = (values: string[] | undefined, pattern: RegExp): void => {
    if (
      values !== undefined &&
      (values.length === 0 ||
        !values.every((value) => pattern.test(value)) ||
        new Set(values).size !== values.length)
    ) {
      throw new Error("margin analysis filters are invalid");
    }
  };
  validate(filters.channels, channelPattern);
  validate(filters.skus, skuPattern);
  if (filters.channels === undefined && filters.skus === undefined)
    throw new Error("margin analysis filters are invalid");
};

const isEligible = (
  value: MarginAgentEligibility | null,
  officeId: string,
  agentId: string,
): value is MarginAgentEligibility =>
  value !== null &&
  value.officeId === officeId &&
  value.agentId === agentId &&
  value.lifecycleStatus === "active" &&
  uuidPattern.test(value.activeAgentVersionId) &&
  requiredMarginReadGrants.every((toolCode) =>
    value.grants.some(
      (grant) =>
        grant.toolCode === toolCode &&
        grant.revokedAt === null &&
        (grant.accessLevel === "read" || grant.accessLevel === "write"),
    ),
  );

const marginTaskContext = (
  input: CreateMarginAnalysisInput,
  agentVersionId: string,
): MarginTaskContextItem[] => [
  { key: "periodStart", value: input.periodStart },
  { key: "periodEnd", value: input.periodEnd },
  { key: "agentVersionId", value: agentVersionId },
  ...(input.filters?.channels === undefined
    ? []
    : [{ key: "channels", value: JSON.stringify(input.filters.channels) }]),
  ...(input.filters?.skus === undefined
    ? []
    : [{ key: "skus", value: JSON.stringify(input.filters.skus) }]),
];

const strictUtcTimestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

const utcTimestamp = (value: string): boolean => {
  const match = strictUtcTimestamp.exec(value);
  if (!match) return false;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return false;
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  );
};
