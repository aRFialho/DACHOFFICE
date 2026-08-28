import {
  assertMarginPeriodRequest,
  type CanonicalCostLookup,
  type MarginPeriodFilters,
  type MarginPeriodReport,
  type PersistedOrderMargin,
} from "@dachbyte-office/margin-agent";
import { analyzeMarginPeriod } from "@dachbyte-office/margin-agent/period-analysis";
import type { TaskOutboxJob } from "../task-worker.js";

const requiredReadGrants = [
  "finance.getRules",
  "finance.getMargin",
  "products.getCost",
] as const;

export type MarginAnalysisTask = {
  officeId: string;
  agentId: string;
  status: string;
};
export type MarginAnalysisTaskContextItem = { key: string; value: string };
export type PersistMarginTaskReportInput = {
  idempotencyKey: string;
  calculatedAt: string;
  report: MarginPeriodReport;
};

export interface MarginAnalysisFactsRepository {
  loadLatestSnapshots(input: {
    officeId: string;
    periodStart: string;
    periodEnd: string;
    filters?: MarginPeriodFilters;
  }): Promise<PersistedOrderMargin[]>;
  loadCanonicalCosts(input: {
    officeId: string;
    orders: ReadonlyArray<Pick<PersistedOrderMargin, "orderId" | "skus">>;
  }): Promise<CanonicalCostLookup[]>;
}

export interface MarginAnalysisTaskTransaction {
  loadTask(taskId: string): Promise<MarginAnalysisTask | null>;
  loadContext(
    taskId: string,
  ): Promise<readonly MarginAnalysisTaskContextItem[]>;
  authorizeReadAccess(input: {
    officeId: string;
    agentId: string;
    requestedAgentVersionId: string;
    requiredGrants: readonly string[];
  }): Promise<boolean>;
  claimDelivery(idempotencyKey: string): Promise<boolean>;
  persistReport(input: PersistMarginTaskReportInput): Promise<{
    status: "created" | "unchanged" | "conflict";
    reportId: string;
  }>;
  completeTask(taskId: string): Promise<void>;
}

export interface MarginAnalysisTaskRepository {
  isMarginAnalysisTask(taskId: string): Promise<boolean>;
  inTransaction<T>(
    action: (transaction: MarginAnalysisTaskTransaction) => Promise<T>,
  ): Promise<T>;
}

export class MarginAnalysisTaskHandler {
  constructor(
    private readonly options: {
      repository: MarginAnalysisTaskRepository;
      facts: MarginAnalysisFactsRepository;
      now?: () => string;
    },
  ) {}

  async canHandle(job: TaskOutboxJob): Promise<boolean> {
    return this.options.repository.isMarginAnalysisTask(job.taskId);
  }

  async run(job: TaskOutboxJob): Promise<boolean> {
    return this.options.repository.inTransaction(async (transaction) => {
      if (!(await transaction.claimDelivery(job.idempotencyKey))) return true;

      const task = await transaction.loadTask(job.taskId);
      if (!task) throw taskFailure("margin_analysis_task_unauthorized");

      const request = parseMarginAnalysisTaskContext(
        await transaction.loadContext(job.taskId),
        task,
        job.taskId,
      );
      const authorized = await transaction.authorizeReadAccess({
        officeId: task.officeId,
        agentId: task.agentId,
        requestedAgentVersionId: request.agentVersionId,
        requiredGrants: requiredReadGrants,
      });
      if (!authorized) throw taskFailure("margin_analysis_task_unauthorized");

      if (task.status !== "queued")
        throw taskFailure("margin_analysis_task_not_queued");

      const orders = await this.options.facts.loadLatestSnapshots({
        officeId: request.officeId,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        ...(request.filters === undefined ? {} : { filters: request.filters }),
      });
      const costs = await this.options.facts.loadCanonicalCosts({
        officeId: request.officeId,
        orders: orders.map(({ orderId, skus }) => ({ orderId, skus })),
      });
      const report = analyzeMarginPeriod({ request, orders, costs });
      const persisted = await transaction.persistReport({
        idempotencyKey: job.idempotencyKey,
        calculatedAt: (this.options.now ?? (() => new Date().toISOString()))(),
        report,
      });
      if (persisted.status === "conflict")
        throw taskFailure("margin_analysis_report_conflict");
      await transaction.completeTask(job.taskId);
      return true;
    });
  }
}

export function parseMarginAnalysisTaskContext(
  items: readonly MarginAnalysisTaskContextItem[],
  task: MarginAnalysisTask,
  taskId: string,
) {
  const values = new Map<string, string>();
  for (const item of items) {
    if (
      ![
        "periodStart",
        "periodEnd",
        "agentVersionId",
        "channels",
        "skus",
      ].includes(item.key) ||
      values.has(item.key)
    ) {
      throw taskFailure("margin_analysis_task_context_invalid");
    }
    values.set(item.key, item.value);
  }
  const periodStart = values.get("periodStart");
  const periodEnd = values.get("periodEnd");
  const agentVersionId = values.get("agentVersionId");
  if (!periodStart || !periodEnd || !agentVersionId)
    throw taskFailure("margin_analysis_task_context_invalid");

  const channels = parseFilter(values.get("channels"), "channel");
  const skus = parseFilter(values.get("skus"), "sku");
  try {
    return assertMarginPeriodRequest({
      officeId: task.officeId,
      taskId,
      periodStart,
      periodEnd,
      agentId: task.agentId,
      agentVersionId,
      ...(channels === undefined && skus === undefined
        ? {}
        : {
            filters: {
              ...(channels === undefined ? {} : { channels }),
              ...(skus === undefined ? {} : { skus }),
            },
          }),
    });
  } catch {
    throw taskFailure("margin_analysis_task_context_invalid");
  }
}

function parseFilter(
  serialized: string | undefined,
  kind: "channel" | "sku",
): string[] | undefined {
  if (serialized === undefined) return undefined;
  try {
    const values: unknown = JSON.parse(serialized);
    if (!Array.isArray(values) || values.length === 0)
      throw new Error("invalid filter");
    const expression =
      kind === "channel" ? /^[a-z0-9][a-z0-9_-]*$/ : /^[A-Z0-9][A-Z0-9._-]*$/;
    if (
      !values.every(
        (value) => typeof value === "string" && expression.test(value),
      ) ||
      new Set(values).size !== values.length
    ) {
      throw new Error("invalid filter");
    }
    return values as string[];
  } catch {
    throw taskFailure("margin_analysis_task_context_invalid");
  }
}

function taskFailure(message: string): Error {
  return new Error(message);
}
