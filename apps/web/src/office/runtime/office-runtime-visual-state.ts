import type { OfficeRuntimeProjection } from "./office-runtime-projection.js";

export const officeRuntimeAnimationStates = [
  "IDLE",
  "WORKING",
  "ANALYZING",
  "TALKING",
  "MEETING",
  "ALERT",
  "REFRESHING",
] as const;

export type OfficeRuntimeAnimationState =
  (typeof officeRuntimeAnimationStates)[number];

export interface OfficeRuntimeSceneAgent {
  readonly activitySummary: string | null;
  readonly destinationId: string;
  readonly id: string;
  readonly state: OfficeRuntimeAnimationState;
  readonly speech?: {
    readonly severity: "NORMAL" | "CRITICAL";
    readonly text: string;
  };
}

export interface OfficeRuntimeSceneState {
  readonly agents: readonly OfficeRuntimeSceneAgent[];
  readonly eventSequence: number;
  readonly unknownDestinationAgentIds: readonly string[];
}

const animationStateFor = (value: string): OfficeRuntimeAnimationState =>
  officeRuntimeAnimationStates.includes(value as OfficeRuntimeAnimationState)
    ? (value as OfficeRuntimeAnimationState)
    : "IDLE";

export const createOfficeRuntimeSceneState = (
  projection: OfficeRuntimeProjection,
  knownDestinationIds: ReadonlySet<string>,
  fallbackDestinationId: string,
): OfficeRuntimeSceneState => {
  const unknownDestinationAgentIds: string[] = [];

  return {
    agents: projection.agents.map((agent) => {
      const requestedDestination = agent.destinationId;
      const destinationId =
        requestedDestination !== null &&
        knownDestinationIds.has(requestedDestination)
          ? requestedDestination
          : fallbackDestinationId;
      if (
        requestedDestination !== null &&
        requestedDestination !== fallbackDestinationId &&
        destinationId === fallbackDestinationId
      ) {
        unknownDestinationAgentIds.push(agent.id);
      }
      const speech = projection.speeches.find(
        (candidate) => candidate.speakerAgentId === agent.id,
      );
      return {
        activitySummary: agent.activitySummary,
        destinationId,
        id: agent.id,
        state: animationStateFor(agent.state),
        ...(speech === undefined
          ? {}
          : { speech: { severity: speech.severity, text: speech.text } }),
      };
    }),
    eventSequence: projection.eventSequence,
    unknownDestinationAgentIds,
  };
};
