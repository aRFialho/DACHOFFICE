import {
  assertPricingSimulationInput,
  type PricingCost,
  type PricingFeeAssumption,
  type PricingListing,
  type PricingProductInput,
  type PricingSimulationReport,
} from "@dachbyte-office/pricing-agent";
import { simulatePricing } from "@dachbyte-office/pricing-agent/pricing-simulation";
import type { TaskOutboxJob } from "../task-worker.js";

const requiredGrants = [
  "products.get",
  "products.getCost",
  "products.getListing",
  "finance.getRules",
  "pricing.prepareAction",
] as const;

export type PricingSimulationTask = {
  officeId: string;
  agentId: string;
  status: string;
};
export type PricingSimulationTaskContextItem = { key: string; value: string };
export type PricingProductFact = Pick<
  PricingProductInput,
  "productId" | "sku" | "name" | "supplierId"
>;
export type PricingCostFact = { sku: string; cost: PricingCost };
export type PricingListingFact = { sku: string; listing: PricingListing };

export interface PricingSimulationFactsRepository {
  loadProducts(input: {
    officeId: string;
    skus: readonly string[];
  }): Promise<readonly PricingProductFact[]>;
  loadCosts(input: {
    officeId: string;
    products: readonly PricingProductFact[];
    periodEnd: string;
  }): Promise<readonly PricingCostFact[]>;
  loadListings(input: {
    officeId: string;
    channel: string;
    skus: readonly string[];
    periodEnd: string;
  }): Promise<readonly PricingListingFact[]>;
  loadFeeAssumptions(input: {
    officeId: string;
    channel: string;
    periodEnd: string;
  }): Promise<readonly PricingFeeAssumption[]>;
}

export interface PricingSimulationTaskTransaction {
  loadTask(taskId: string): Promise<PricingSimulationTask | null>;
  loadContext(
    taskId: string,
  ): Promise<readonly PricingSimulationTaskContextItem[]>;
  authorize(input: {
    officeId: string;
    agentId: string;
    requestedAgentVersionId: string;
    requiredGrants: readonly string[];
  }): Promise<boolean>;
  claimDelivery(idempotencyKey: string): Promise<boolean>;
  persistReport(input: {
    idempotencyKey: string;
    calculatedAt: string;
    report: PricingSimulationReport;
  }): Promise<{
    status: "created" | "unchanged" | "conflict";
    reportId: string;
  }>;
  persistPreparedActions(input: {
    reportId: string;
    actions: readonly {
      productId: string;
      channel: string;
      currency: string;
      proposedPrice: string;
      breakEvenMinimumPrice: string;
      policyDecision: "approval_required";
    }[];
  }): Promise<void>;
  completeTask(taskId: string): Promise<void>;
}

export interface PricingSimulationTaskRepository {
  isPricingSimulationTask(taskId: string): Promise<boolean>;
  inTransaction<T>(
    action: (transaction: PricingSimulationTaskTransaction) => Promise<T>,
  ): Promise<T>;
}

export class PricingSimulationTaskHandler {
  constructor(
    private readonly options: {
      repository: PricingSimulationTaskRepository;
      facts: PricingSimulationFactsRepository;
      now?: () => string;
    },
  ) {}

  async canHandle(job: TaskOutboxJob): Promise<boolean> {
    return this.options.repository.isPricingSimulationTask(job.taskId);
  }

  async run(job: TaskOutboxJob): Promise<boolean> {
    return this.options.repository.inTransaction(async (transaction) => {
      if (!(await transaction.claimDelivery(job.idempotencyKey))) return true;
      const task = await transaction.loadTask(job.taskId);
      if (!task) throw failure("pricing_simulation_task_unauthorized");
      const request = parsePricingSimulationTaskContext(
        await transaction.loadContext(job.taskId),
        task,
        job.taskId,
      );
      const authorized = await transaction.authorize({
        officeId: task.officeId,
        agentId: task.agentId,
        requestedAgentVersionId: request.agentVersionId,
        requiredGrants,
      });
      if (!authorized) throw failure("pricing_simulation_task_unauthorized");
      if (task.status !== "queued")
        throw failure("pricing_simulation_task_not_queued");
      const products = await this.options.facts.loadProducts({
        officeId: request.officeId,
        skus: request.skus,
      });
      const [costFacts, listingFacts, feeAssumptions] = await Promise.all([
        this.options.facts.loadCosts({
          officeId: request.officeId,
          products,
          periodEnd: request.periodEnd,
        }),
        this.options.facts.loadListings({
          officeId: request.officeId,
          channel: request.channel,
          skus: request.skus,
          periodEnd: request.periodEnd,
        }),
        this.options.facts.loadFeeAssumptions({
          officeId: request.officeId,
          channel: request.channel,
          periodEnd: request.periodEnd,
        }),
      ]);
      const report = simulatePricing({
        request,
        products: combineFacts(request.skus, products, costFacts, listingFacts),
        feeAssumptions: [...feeAssumptions],
      });
      const persisted = await transaction.persistReport({
        idempotencyKey: job.idempotencyKey,
        calculatedAt: (this.options.now ?? (() => new Date().toISOString()))(),
        report,
      });
      if (persisted.status === "conflict")
        throw failure("pricing_simulation_report_conflict");
      await transaction.persistPreparedActions({
        reportId: persisted.reportId,
        actions: report.lines.flatMap((line) =>
          line.actionStatus === "prepared" &&
          line.discountedPrice !== undefined &&
          line.breakEvenMinimumPrice !== undefined &&
          line.listing !== undefined
            ? [
                {
                  productId: line.productId,
                  channel: request.channel,
                  currency: line.listing.currency,
                  proposedPrice: line.discountedPrice,
                  breakEvenMinimumPrice: line.breakEvenMinimumPrice,
                  policyDecision: "approval_required" as const,
                },
              ]
            : [],
        ),
      });
      await transaction.completeTask(job.taskId);
      return true;
    });
  }
}

export function parsePricingSimulationTaskContext(
  items: readonly PricingSimulationTaskContextItem[],
  task: PricingSimulationTask,
  taskId: string,
) {
  const expected = new Set([
    "agentVersionId",
    "skus",
    "channel",
    "discountPercent",
    "periodStart",
    "periodEnd",
  ]);
  const values = new Map<string, string>();
  for (const item of items) {
    if (!expected.has(item.key) || values.has(item.key))
      throw failure("pricing_simulation_task_context_invalid");
    values.set(item.key, item.value);
  }
  try {
    const skus = JSON.parse(values.get("skus") ?? "") as unknown;
    return assertPricingSimulationInput({
      request: {
        officeId: task.officeId,
        taskId,
        agentId: task.agentId,
        agentVersionId: values.get("agentVersionId"),
        skus,
        channel: values.get("channel"),
        discountPercent: values.get("discountPercent"),
        periodStart: values.get("periodStart"),
        periodEnd: values.get("periodEnd"),
      },
      products: (skus as unknown[]).map((sku) => ({
        productId: `validation:${String(sku)}`,
        sku,
        name: "validation",
        cost: { status: "missing" },
        listing: { status: "missing" },
      })),
      feeAssumptions: [],
    }).request;
  } catch {
    throw failure("pricing_simulation_task_context_invalid");
  }
}

function combineFacts(
  requestedSkus: readonly string[],
  products: readonly PricingProductFact[],
  costs: readonly PricingCostFact[],
  listings: readonly PricingListingFact[],
): PricingProductInput[] {
  const productBySku = uniqueBySku(
    products,
    "pricing_simulation_products_invalid",
  );
  const costBySku = uniqueBySku(costs, "pricing_simulation_costs_invalid");
  const listingBySku = uniqueBySku(
    listings,
    "pricing_simulation_listings_invalid",
  );
  return requestedSkus.map((sku) => {
    const product = productBySku.get(sku);
    if (!product) throw failure("pricing_simulation_products_invalid");
    return {
      ...product,
      cost: costBySku.get(sku)?.cost ?? { status: "missing" },
      listing: listingBySku.get(sku)?.listing ?? { status: "missing" },
    };
  });
}

function uniqueBySku<T extends { sku: string }>(
  values: readonly T[],
  error: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.sku)) throw failure(error);
    result.set(value.sku, value);
  }
  return result;
}

function failure(message: string): Error {
  return new Error(message);
}
