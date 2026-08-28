export type AgentLifecycleStatus =
  | "draft"
  | "active"
  | "updating"
  | "suspended"
  | "archived";

export interface AgentWriteGrant {
  toolCode: string;
  revokedAt: Date | null;
}

export type AgentWriteDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "agent_not_active" | "agent_suspended" | "tool_grant_missing";
    };

export const decideAgentWrite = (input: {
  lifecycleStatus: AgentLifecycleStatus;
  toolCode: string;
  grants: readonly AgentWriteGrant[];
}): AgentWriteDecision => {
  if (input.lifecycleStatus === "suspended") {
    return { allowed: false, reason: "agent_suspended" };
  }
  if (input.lifecycleStatus !== "active") {
    return { allowed: false, reason: "agent_not_active" };
  }
  const hasActiveGrant = input.grants.some(
    (grant) => grant.toolCode === input.toolCode && grant.revokedAt === null,
  );
  return hasActiveGrant
    ? { allowed: true }
    : { allowed: false, reason: "tool_grant_missing" };
};
