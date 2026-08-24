import type { OfficeTrustLevel } from "../admin/office-service.js";
import type { AgentLifecycleStatus } from "../admin/write-gate.js";
import type {
  RegisteredTool,
  ToolAuthorizationDecision,
  ToolGrantLevel,
} from "../tools/tool-contracts.js";

export interface PolicyToolGrant {
  toolCode: string;
  accessLevel: ToolGrantLevel;
  revokedAt: Date | null;
}

export interface PolicyEvaluationInput {
  tool: RegisteredTool;
  hasTaskAuthority: boolean;
  officeId: string;
  lifecycleStatus: AgentLifecycleStatus;
  grants: readonly PolicyToolGrant[];
  activeAgentVersionId: string;
  requestedAgentVersionId: string;
  officeTrustLevel: OfficeTrustLevel;
  agentTrustCeiling: OfficeTrustLevel;
  policyConditionsSatisfied: boolean;
  actionLimitsSatisfied: boolean;
}

const trustRank: Record<OfficeTrustLevel, number> = {
  analytical: 0,
  supervised: 1,
  autonomous: 2,
};

const effectiveTrust = (input: PolicyEvaluationInput): OfficeTrustLevel =>
  trustRank[input.officeTrustLevel] <= trustRank[input.agentTrustCeiling]
    ? input.officeTrustLevel
    : input.agentTrustCeiling;

const hasGrant = (input: PolicyEvaluationInput): boolean => {
  const requiredAccess = input.tool.actionClass === "READ" ? "read" : "write";
  return input.grants.some(
    (grant) =>
      grant.toolCode === input.tool.code &&
      grant.revokedAt === null &&
      (grant.accessLevel === "write" || grant.accessLevel === requiredAccess),
  );
};

export const evaluateToolPolicy = (
  input: PolicyEvaluationInput,
): ToolAuthorizationDecision => {
  if (!input.hasTaskAuthority) {
    return { status: "denied", reason: "task_authority_missing" };
  }
  if (input.lifecycleStatus === "suspended") {
    return { status: "denied", reason: "agent_suspended" };
  }
  if (input.lifecycleStatus !== "active") {
    return { status: "denied", reason: "agent_not_active" };
  }
  if (!hasGrant(input)) {
    return { status: "denied", reason: "tool_grant_missing" };
  }
  if (input.activeAgentVersionId !== input.requestedAgentVersionId) {
    return { status: "denied", reason: "agent_version_mismatch" };
  }
  if (!input.policyConditionsSatisfied) {
    return { status: "denied", reason: "policy_conditions_failed" };
  }
  if (!input.actionLimitsSatisfied) {
    return { status: "denied", reason: "action_limits_exceeded" };
  }
  if (input.tool.actionClass === "DESTRUCTIVE") {
    return { status: "denied", reason: "destructive_action_disabled" };
  }

  const trust = effectiveTrust(input);
  if (input.tool.actionClass === "SENSITIVE") {
    return { status: "approval_required", reason: "trust_requires_approval" };
  }
  if (input.tool.actionClass === "PREPARE" && trust === "analytical") {
    return { status: "approval_required", reason: "trust_requires_approval" };
  }
  if (input.tool.actionClass === "WRITE" && trust !== "autonomous") {
    return { status: "approval_required", reason: "trust_requires_approval" };
  }
  return { status: "allowed" };
};
