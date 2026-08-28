import {
  assertChannelFeeRule,
  parseFinanceRuleMappings,
} from "@dachbyte-office/finance";
import { assertNoDuplicateEstimatedFeeRules } from "@dachbyte-office/finance/classification";
import type { FastifyInstance } from "fastify";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { AuthService } from "../auth/service.js";
import type {
  ConfiguredChannelFeeRule,
  CreateFinanceRuleVersionInput,
  FinanceService,
} from "./finance-service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const placeholderRuleVersionId = "00000000-0000-4000-8000-000000000001";
const placeholderFeeRuleId = "00000000-0000-4000-8000-000000000002";

const uuidParam = (params: unknown, field: string): string | null => {
  if (params === null || typeof params !== "object") return null;
  const value = (params as Record<string, unknown>)[field];
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const configuredFeeRule = (
  value: unknown,
  officeId: string,
): ConfiguredChannelFeeRule => {
  const input = record(value);
  if (!input) throw new Error("invalid channel fee rule");
  const date = (candidate: unknown): Date | undefined => {
    if (candidate === undefined || candidate === null) return undefined;
    if (typeof candidate !== "string") throw new Error("invalid fee date");
    return new Date(candidate);
  };
  const parsed = assertChannelFeeRule({
    id: placeholderFeeRuleId,
    officeId,
    financeRuleVersionId: placeholderRuleVersionId,
    channel: input.channel,
    componentType: input.componentType,
    payer: input.payer,
    feeMode: input.feeMode,
    value: input.value,
    currency: input.currency,
    source: input.source,
    rawCode: input.rawCode,
    confidence: input.confidence,
    validFrom: date(input.validFrom),
    validTo: date(input.validTo),
  });
  return {
    channel: parsed.channel,
    componentType: parsed.componentType,
    payer: parsed.payer,
    feeMode: parsed.feeMode,
    value: parsed.value,
    ...(parsed.currency === undefined ? {} : { currency: parsed.currency }),
    source: parsed.source,
    ...(parsed.rawCode === undefined ? {} : { rawCode: parsed.rawCode }),
    confidence: parsed.confidence,
    ...(parsed.validFrom === undefined ? {} : { validFrom: parsed.validFrom }),
    ...(parsed.validTo === undefined ? {} : { validTo: parsed.validTo }),
  };
};

const createRuleVersionInput = (
  body: unknown,
  officeId: string,
): CreateFinanceRuleVersionInput | null => {
  const input = record(body);
  if (!input || !uuidParam({ ruleSetId: input.ruleSetId }, "ruleSetId"))
    return null;
  if (
    typeof input.version !== "number" ||
    !Number.isSafeInteger(input.version) ||
    input.version <= 0 ||
    !Array.isArray(input.channelFeeRules)
  )
    return null;
  try {
    const channelFeeRules = input.channelFeeRules.map((feeRule) =>
      configuredFeeRule(feeRule, officeId),
    );
    assertNoDuplicateEstimatedFeeRules(
      channelFeeRules.map((feeRule) => ({
        ...feeRule,
        id: placeholderFeeRuleId,
        officeId,
        financeRuleVersionId: placeholderRuleVersionId,
      })),
    );
    return {
      officeId,
      ruleSetId: input.ruleSetId as string,
      version: input.version,
      rulesJson: { rawCodeMappings: parseFinanceRuleMappings(input.rulesJson) },
      channelFeeRules,
    };
  } catch {
    return null;
  }
};

export const registerFinanceRoutes = (
  server: FastifyInstance,
  options: { authService: AuthService; financeService: FinanceService },
): void => {
  server.get(
    "/v1/admin/offices/:officeId/finance/rules/latest",
    async (request, reply) => {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const officeId = uuidParam(request.params, "officeId");
      if (!officeId)
        return reply.code(400).send({ error: "invalid_finance_read_input" });
      try {
        const result =
          await options.financeService.getLatestRuleVersion(officeId);
        if (result.status === "not_found")
          return reply.code(404).send({ error: "finance_rule_not_found" });
        return reply.code(200).send({ ruleVersion: result.ruleVersion });
      } catch {
        return reply.code(404).send({ error: "finance_rule_not_found" });
      }
    },
  );

  server.get(
    "/v1/admin/offices/:officeId/orders/:orderHeaderId/finance/margin/latest",
    async (request, reply) => {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const officeId = uuidParam(request.params, "officeId");
      const orderHeaderId = uuidParam(request.params, "orderHeaderId");
      if (!officeId || !orderHeaderId)
        return reply.code(400).send({ error: "invalid_finance_read_input" });
      try {
        const result = await options.financeService.getLatestMarginSnapshot(
          officeId,
          orderHeaderId,
        );
        if (result.status === "not_found")
          return reply.code(404).send({ error: "finance_margin_not_found" });
        return reply.code(200).send({ snapshot: result.snapshot });
      } catch {
        return reply.code(404).send({ error: "finance_margin_not_found" });
      }
    },
  );

  server.post(
    "/v1/admin/offices/:officeId/finance/rules",
    async (request, reply) => {
      const actor = await authenticateAdminMaster(request, options.authService);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const officeId = uuidParam(request.params, "officeId");
      const input = officeId && createRuleVersionInput(request.body, officeId);
      if (!input)
        return reply.code(400).send({ error: "invalid_finance_rule_input" });
      try {
        const result = await options.financeService.createRuleVersion(input);
        if (result.status === "created")
          return reply.code(201).send({ ruleVersionId: result.ruleVersionId });
        if (result.status === "unchanged")
          return reply.code(200).send({ status: "unchanged" });
        return reply.code(409).send({ error: "finance_rule_version_conflict" });
      } catch {
        return reply.code(400).send({ error: "finance_rule_creation_failed" });
      }
    },
  );
};
