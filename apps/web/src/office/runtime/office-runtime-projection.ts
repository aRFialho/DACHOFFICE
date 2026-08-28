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

export interface OfficeRuntimeSpeech {
  readonly severity: "NORMAL" | "CRITICAL";
  readonly speakerAgentId: string;
  readonly text: string;
  readonly ttlMs: number;
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

export type OfficeRuntimeEvent =
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly activitySummary: string | null;
        readonly agentId: string;
        readonly from: string;
        readonly taskId: string | null;
        readonly to: string;
      };
      readonly sequence: number;
      readonly type: "agent.state.changed";
    }
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly agentId: string;
        readonly destinationId: string;
        readonly priority: string;
        readonly reason: string;
      };
      readonly sequence: number;
      readonly type: "agent.location.requested";
    }
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly meetingId: string;
        readonly meetingType: string;
        readonly participants: readonly {
          readonly agentId: string;
          readonly seatDestinationId: string;
        }[];
        readonly roomDestinationId: string;
      };
      readonly sequence: number;
      readonly type: "meeting.started";
    }
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly approvalId: string;
        readonly summary: string;
      };
      readonly sequence: number;
      readonly type: "approval.requested";
    }
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly incidentId: string;
        readonly severity: "NORMAL" | "CRITICAL";
        readonly summary: string;
      };
      readonly sequence: number;
      readonly type: "incident.war_room_requested";
    }
  | {
      readonly eventId: string;
      readonly occurredAt: string;
      readonly payload: {
        readonly severity: "NORMAL" | "CRITICAL";
        readonly speakerAgentId: string;
        readonly text: string;
        readonly ttlMs: number;
      };
      readonly sequence: number;
      readonly type: "speech.created";
    };

export interface OfficeRuntimeProjection extends OfficeRuntimeSnapshot {
  readonly speeches: readonly OfficeRuntimeSpeech[];
}

const visualStateFor = (agent: OfficeRuntimeAgent): string =>
  agent.lifecycleStatus === "suspended" ? "IDLE" : agent.state;

const canonicalAgent = (agent: OfficeRuntimeAgent): OfficeRuntimeAgent => ({
  ...agent,
  state: visualStateFor(agent),
});

export const createOfficeRuntimeProjection = (
  snapshot: OfficeRuntimeSnapshot,
): OfficeRuntimeProjection => ({
  ...snapshot,
  agents: snapshot.agents.map(canonicalAgent),
  speeches: [],
});

const withAgent = (
  projection: OfficeRuntimeProjection,
  agentId: string,
  update: (agent: OfficeRuntimeAgent) => OfficeRuntimeAgent,
): OfficeRuntimeProjection => ({
  ...projection,
  agents: projection.agents.map((agent) =>
    agent.id === agentId ? canonicalAgent(update(agent)) : agent,
  ),
});

const withSequence = (
  projection: OfficeRuntimeProjection,
  sequence: number,
): OfficeRuntimeProjection => ({ ...projection, eventSequence: sequence });

export const applyOfficeRuntimeEvent = (
  projection: OfficeRuntimeProjection,
  event: OfficeRuntimeEvent,
): OfficeRuntimeProjection => {
  if (event.sequence <= projection.eventSequence) return projection;

  switch (event.type) {
    case "agent.state.changed":
      return withSequence(
        withAgent(projection, event.payload.agentId, (agent) => ({
          ...agent,
          activitySummary: event.payload.activitySummary,
          state: event.payload.to,
        })),
        event.sequence,
      );
    case "agent.location.requested":
      return withSequence(
        withAgent(projection, event.payload.agentId, (agent) => ({
          ...agent,
          destinationId: event.payload.destinationId,
        })),
        event.sequence,
      );
    case "meeting.started": {
      let next: OfficeRuntimeProjection = projection;
      for (const participant of event.payload.participants) {
        next = withAgent(next, participant.agentId, (agent) => ({
          ...agent,
          destinationId: participant.seatDestinationId,
          state: "MEETING",
        }));
      }
      return {
        ...withSequence(next, event.sequence),
        meetings: [
          ...next.meetings,
          {
            id: event.payload.meetingId,
            participantAgentIds: event.payload.participants.map(
              (participant) => participant.agentId,
            ),
            roomDestinationId: event.payload.roomDestinationId,
            type: event.payload.meetingType,
          },
        ],
      };
    }
    case "approval.requested":
      return {
        ...withSequence(projection, event.sequence),
        approvals: [
          ...projection.approvals,
          {
            id: event.payload.approvalId,
            status: "PENDING",
            summary: event.payload.summary,
          },
        ],
      };
    case "incident.war_room_requested":
      return {
        ...withSequence(projection, event.sequence),
        alerts: [
          ...projection.alerts,
          {
            id: event.payload.incidentId,
            severity: event.payload.severity,
            summary: event.payload.summary,
          },
        ],
      };
    case "speech.created":
      return {
        ...withSequence(projection, event.sequence),
        speeches: [
          ...projection.speeches,
          {
            severity: event.payload.severity,
            speakerAgentId: event.payload.speakerAgentId,
            text: event.payload.text,
            ttlMs: event.payload.ttlMs,
          },
        ],
      };
  }
};
