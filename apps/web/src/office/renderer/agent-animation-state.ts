import type { OfficeAgentAtlasFrame } from "../art/asset-contract.js";

export type AgentAnimationDirection = "ne" | "nw" | "se" | "sw";

export type AgentAnimationState =
  | "IDLE"
  | "WALKING"
  | "WORKING"
  | "ANALYZING"
  | "TALKING"
  | "MEETING"
  | "ALERT"
  | "REFRESHING";

export interface AgentAnimationSelection {
  readonly direction: AgentAnimationDirection;
  readonly state: AgentAnimationState;
}

export const frameForAgentAnimation = ({
  direction,
  state,
}: AgentAnimationSelection): OfficeAgentAtlasFrame => {
  if (state === "IDLE") {
    return `idle_${direction}` as OfficeAgentAtlasFrame;
  }

  if (state === "WALKING") {
    return `walk_${direction}_01` as OfficeAgentAtlasFrame;
  }

  const activityFrames: Record<
    Exclude<AgentAnimationState, "IDLE" | "WALKING">,
    OfficeAgentAtlasFrame
  > = {
    ALERT: "alert",
    ANALYZING: "analyze",
    MEETING: "meeting",
    REFRESHING: "refresh",
    TALKING: "talk",
    WORKING: "work_computer",
  };

  return activityFrames[state];
};
