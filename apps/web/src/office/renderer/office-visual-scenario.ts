import type {
  AgentAnimationDirection,
  AgentAnimationSelection,
  AgentAnimationState,
} from "./agent-animation-state.js";

export const officeVisualScenarioIds = [
  "DAILY_MEETING",
  "WAR_ROOM_CRITICAL",
  "REFRESH",
  "OFF_DUTY",
] as const;

export type OfficeVisualScenarioId = (typeof officeVisualScenarioIds)[number];

export const defaultOfficeVisualScenarioId = "DAILY_MEETING" as const;

export interface OfficeVisualSpeech {
  readonly severity: "NORMAL" | "CRITICAL";
  readonly text: string;
}

export interface OfficeVisualAgentFixture {
  readonly agentId: string;
  readonly animation: AgentAnimationSelection;
  readonly destinationId: string;
  readonly speech?: OfficeVisualSpeech;
  readonly startDestinationId: "FINANCE_DESK_ARTHUR";
}

export interface OfficeVisualScenario {
  readonly agents: readonly OfficeVisualAgentFixture[];
  readonly id: OfficeVisualScenarioId;
  readonly label: string;
  readonly localPreview: true;
}

const fixtureAgent = (
  agentId: string,
  destinationId: string,
  state: AgentAnimationState,
  direction: AgentAnimationDirection,
  speech?: OfficeVisualSpeech,
): OfficeVisualAgentFixture => {
  const fixture = {
    agentId,
    animation: { direction, state },
    destinationId,
    startDestinationId: "FINANCE_DESK_ARTHUR" as const,
  };

  return speech === undefined ? fixture : { ...fixture, speech };
};

const scenarios: Readonly<
  Record<OfficeVisualScenarioId, OfficeVisualScenario>
> = {
  DAILY_MEETING: {
    agents: [
      fixtureAgent(
        "local-meeting-lead",
        "MEETING_MAIN_SEAT_01",
        "MEETING",
        "se",
      ),
      fixtureAgent(
        "local-meeting-finance",
        "MEETING_MAIN_SEAT_02",
        "MEETING",
        "sw",
      ),
      fixtureAgent(
        "local-meeting-operations",
        "MEETING_MAIN_SEAT_03",
        "MEETING",
        "ne",
      ),
    ],
    id: "DAILY_MEETING",
    label: "Local Daily Meeting fixture",
    localPreview: true,
  },
  WAR_ROOM_CRITICAL: {
    agents: [
      fixtureAgent("local-war-room-lead", "WAR_ROOM_SEAT_01", "ALERT", "se", {
        severity: "CRITICAL",
        text: "Local critical-response fixture.",
      }),
      fixtureAgent("local-war-room-finance", "WAR_ROOM_SEAT_02", "ALERT", "sw"),
      fixtureAgent(
        "local-war-room-operations",
        "WAR_ROOM_SEAT_03",
        "ALERT",
        "ne",
      ),
    ],
    id: "WAR_ROOM_CRITICAL",
    label: "Local critical War Room fixture",
    localPreview: true,
  },
  REFRESH: {
    agents: [
      fixtureAgent(
        "local-refresh-finance",
        "REFRESH_COFFEE_01",
        "REFRESHING",
        "se",
      ),
      fixtureAgent(
        "local-refresh-operations",
        "REFRESH_COFFEE_02",
        "REFRESHING",
        "sw",
      ),
    ],
    id: "REFRESH",
    label: "Local Refresh fixture",
    localPreview: true,
  },
  OFF_DUTY: {
    agents: [
      fixtureAgent("local-off-duty-finance", "OFF_DUTY_EXIT_01", "IDLE", "sw"),
    ],
    id: "OFF_DUTY",
    label: "Local Off-duty fixture",
    localPreview: true,
  },
};

export const resolveOfficeVisualScenario = (
  id: OfficeVisualScenarioId,
): OfficeVisualScenario => scenarios[id];
