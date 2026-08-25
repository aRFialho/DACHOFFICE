import { assertMoney, type Money } from "@dachbyte-office/finance";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channel = /^[a-z0-9][a-z0-9_-]*$/;
const sku = /^[A-Z0-9][A-Z0-9._-]*$/;
export const requiredPricingGrants = [
  "products.get",
  "products.getCost",
  "products.getListing",
  "finance.getRules",
  "pricing.prepareAction",
] as const;
type ContextItem = { key: string; value: string };
type Eligibility = {
  officeId: string;
  agentId: string;
  lifecycleStatus: string;
  activeAgentVersionId: string;
  grants: readonly string[];
};
export type CreatePricingSimulationInput = {
  officeId: string;
  agentId: string;
  requestedByUserId: string;
  skus: string[];
  channel: string;
  discountPercent: Money;
  periodStart: string;
  periodEnd: string;
};
export interface PricingSimulationRepository {
  getAgentEligibility(input: {
    officeId: string;
    agentId: string;
  }): Promise<Eligibility | null>;
  queuePricingSimulation(input: {
    officeId: string;
    agentId: string;
    agentVersionId: string;
    requestedByUserId: string;
    context: readonly ContextItem[];
  }): Promise<
    | { status: "queued"; task: { id: string; status: "queued" } }
    | { status: "agent_invalid" }
  >;
  getReportForTask(
    taskId: string,
  ): Promise<{ status: "found"; report: unknown } | { status: "not_found" }>;
}

export class PricingSimulationService {
  constructor(private readonly repository: PricingSimulationRepository) {}
  async create(
    input: CreatePricingSimulationInput,
  ): Promise<{ id: string; status: "queued" }> {
    validate(input);
    const eligible = await this.repository.getAgentEligibility({
      officeId: input.officeId,
      agentId: input.agentId,
    });
    if (
      !eligible ||
      eligible.officeId !== input.officeId ||
      eligible.agentId !== input.agentId ||
      eligible.lifecycleStatus !== "active" ||
      !uuid.test(eligible.activeAgentVersionId) ||
      !requiredPricingGrants.every((grant) => eligible.grants.includes(grant))
    )
      throw new Error("pricing agent is not eligible");

    const result = await this.repository.queuePricingSimulation({
      officeId: input.officeId,
      agentId: input.agentId,
      agentVersionId: eligible.activeAgentVersionId,
      requestedByUserId: input.requestedByUserId,
      context: context(input, eligible.activeAgentVersionId),
    });
    if (result.status !== "queued")
      throw new Error("pricing agent is not eligible");
    return result.task;
  }
  getReport(taskId: string) {
    if (!uuid.test(taskId)) throw new Error("task id is invalid");
    return this.repository.getReportForTask(taskId);
  }
}
function validate(input: CreatePricingSimulationInput): void {
  if (
    !uuid.test(input.officeId) ||
    !uuid.test(input.agentId) ||
    !uuid.test(input.requestedByUserId)
  )
    throw new Error("pricing simulation identity is invalid");
  if (
    !channel.test(input.channel) ||
    input.skus.length === 0 ||
    !input.skus.every((value) => sku.test(value)) ||
    new Set(input.skus).size !== input.skus.length
  )
    throw new Error("pricing simulation scope is invalid");
  const discount = assertMoney(input.discountPercent, "discountPercent");
  if (scaled(discount) < 0n || scaled(discount) >= 1_000_000n)
    throw new Error("pricing simulation discount is invalid");
  if (
    !utc(input.periodStart) ||
    !utc(input.periodEnd) ||
    Date.parse(input.periodEnd) < Date.parse(input.periodStart)
  )
    throw new Error("pricing simulation period is invalid");
}

function context(
  input: CreatePricingSimulationInput,
  agentVersionId: string,
): ContextItem[] {
  return [
    { key: "agentVersionId", value: agentVersionId },
    { key: "skus", value: JSON.stringify(input.skus) },
    { key: "channel", value: input.channel },
    { key: "discountPercent", value: input.discountPercent },
    { key: "periodStart", value: input.periodStart },
    { key: "periodEnd", value: input.periodEnd },
  ];
}

const strictUtc =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;
function utc(value: string): boolean {
  const match = strictUtc.exec(value);
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
}
function scaled(value: Money): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const result = BigInt(`${whole}${fraction.padEnd(4, "0")}`);
  return negative ? -result : result;
}
