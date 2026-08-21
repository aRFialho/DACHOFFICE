import { describe, expect, it } from "vitest";
import {
  evaluateToolPolicy,
  type PolicyEvaluationInput,
} from "../src/modules/policy/policy-engine.js";
import {
  defineTool,
  type RegisteredTool,
  type RuntimeSchema,
} from "../src/modules/tools/tool-contracts.js";

const emptySchema: RuntimeSchema<Record<string, never>> = {
  parse: () => ({ ok: true, value: {} }),
};

const tool = (
  code: string,
  actionClass: RegisteredTool["actionClass"],
  requiredGrant: "read" | "write" = actionClass === "READ" ? "read" : "write",
) =>
  defineTool({
    code,
    integration: "test",
    description: "Policy test tool.",
    inputSchema: emptySchema,
    outputSchema: emptySchema,
    actionClass,
    idempotency: actionClass === "READ" ? "not_required" : "required",
    retryPolicy: actionClass === "READ" ? "safe_read" : "idempotent_write",
    requiredGrant,
    rateLimit: { requestsPerMinute: 10, costUnits: 1 },
  });

const readTool = tool("products.get", "READ");
const prepareTool = tool("products.preparePrice", "PREPARE");
const writeTool = tool("products.updatePrice", "WRITE");
const destructiveTool = tool("products.delete", "DESTRUCTIVE");
const sensitiveTool = tool("customers.export", "SENSITIVE");

const context = (registeredTool: RegisteredTool): PolicyEvaluationInput => ({
  tool: registeredTool,
  hasTaskAuthority: true,
  lifecycleStatus: "active" as const,
  grants: [
    {
      toolCode: registeredTool.code,
      accessLevel:
        registeredTool.actionClass === "READ"
          ? ("read" as const)
          : ("write" as const),
      revokedAt: null,
    },
  ],
  activeAgentVersionId: "version-1",
  requestedAgentVersionId: "version-1",
  officeTrustLevel: "analytical" as const,
  agentTrustCeiling: "analytical" as const,
  policyConditionsSatisfied: true,
  actionLimitsSatisfied: true,
});

describe("evaluateToolPolicy", () => {
  it("allows READ with an active read grant at analytical trust", () => {
    expect(evaluateToolPolicy(context(readTool))).toEqual({
      status: "allowed",
    });
  });

  it("requires approval for PREPARE at analytical trust", () => {
    expect(evaluateToolPolicy(context(prepareTool))).toEqual({
      status: "approval_required",
      reason: "trust_requires_approval",
    });
  });

  it("requires approval for WRITE below autonomous trust", () => {
    const input = context(writeTool);
    input.officeTrustLevel = "supervised";
    input.agentTrustCeiling = "autonomous";

    expect(evaluateToolPolicy(input)).toEqual({
      status: "approval_required",
      reason: "trust_requires_approval",
    });
  });

  it("allows WRITE only when Office and agent version are autonomous", () => {
    const input = context(writeTool);
    input.officeTrustLevel = "autonomous";
    input.agentTrustCeiling = "autonomous";

    expect(evaluateToolPolicy(input)).toEqual({ status: "allowed" });
  });

  it("denies failed authority, lifecycle, grants, version, conditions, limits, and destructive actions", () => {
    const authorityMissing = context(readTool);
    authorityMissing.hasTaskAuthority = false;
    expect(evaluateToolPolicy(authorityMissing)).toEqual({
      status: "denied",
      reason: "task_authority_missing",
    });

    const suspended = context(readTool);
    suspended.lifecycleStatus = "suspended";
    expect(evaluateToolPolicy(suspended)).toEqual({
      status: "denied",
      reason: "agent_suspended",
    });

    const revokedGrant = context(readTool);
    revokedGrant.grants[0]!.revokedAt = new Date("2026-08-21T00:00:00.000Z");
    expect(evaluateToolPolicy(revokedGrant)).toEqual({
      status: "denied",
      reason: "tool_grant_missing",
    });

    const versionMismatch = context(readTool);
    versionMismatch.requestedAgentVersionId = "version-2";
    expect(evaluateToolPolicy(versionMismatch)).toEqual({
      status: "denied",
      reason: "agent_version_mismatch",
    });

    const failedConditions = context(readTool);
    failedConditions.policyConditionsSatisfied = false;
    expect(evaluateToolPolicy(failedConditions)).toEqual({
      status: "denied",
      reason: "policy_conditions_failed",
    });

    const exceededLimits = context(readTool);
    exceededLimits.actionLimitsSatisfied = false;
    expect(evaluateToolPolicy(exceededLimits)).toEqual({
      status: "denied",
      reason: "action_limits_exceeded",
    });

    expect(evaluateToolPolicy(context(destructiveTool))).toEqual({
      status: "denied",
      reason: "destructive_action_disabled",
    });
  });

  it("always requires approval for SENSITIVE after base checks", () => {
    const input = context(sensitiveTool);
    input.officeTrustLevel = "autonomous";
    input.agentTrustCeiling = "autonomous";

    expect(evaluateToolPolicy(input)).toEqual({
      status: "approval_required",
      reason: "trust_requires_approval",
    });
  });
});
