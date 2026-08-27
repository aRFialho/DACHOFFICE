export type OfficeRuntimeTrustLevel =
  | "analytical"
  | "supervised"
  | "autonomous";

export type OfficeRuntimeSchedulePhase = "WORKDAY" | "OFF_DUTY";

export interface OfficeRuntimeAgent {
  readonly activitySummary: string | null;
  readonly destinationId: string | null;
  readonly id: string;
  readonly lifecycleStatus: string;
  readonly state: string;
}

export interface OfficeRuntimeAlert {
  readonly id: string;
  readonly severity: "NORMAL" | "CRITICAL";
  readonly summary: string;
}

export interface OfficeRuntimeMeeting {
  readonly id: string;
  readonly participantAgentIds: readonly string[];
  readonly roomDestinationId: string;
  readonly type: string;
}

export interface OfficeRuntimeApproval {
  readonly id: string;
  readonly status: string;
  readonly summary: string;
}

export interface OfficeRuntimeSnapshot {
  readonly agents: readonly OfficeRuntimeAgent[];
  readonly alerts: readonly OfficeRuntimeAlert[];
  readonly approvals: readonly OfficeRuntimeApproval[];
  readonly eventSequence: number;
  readonly meetings: readonly OfficeRuntimeMeeting[];
  readonly schedulePhase: OfficeRuntimeSchedulePhase;
  readonly trustLevel: OfficeRuntimeTrustLevel;
}

export type OfficeRuntimeEventType =
  | "agent.location.requested"
  | "agent.state.changed"
  | "approval.requested"
  | "incident.war_room_requested"
  | "meeting.started"
  | "speech.created";

export interface OfficeRuntimeEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
  readonly sequence: number;
  readonly type: OfficeRuntimeEventType;
}

export interface OfficeRuntimeService {
  eventsAfter(
    officeId: string,
    sequence: number,
  ): Promise<readonly OfficeRuntimeEvent[]>;
  snapshotForOffice(officeId: string): Promise<OfficeRuntimeSnapshot>;
}
