import { describe, expect, it } from "vitest";
import {
  applyOfficeRuntimeEvent,
  createOfficeRuntimeProjection,
  type OfficeRuntimeSnapshot,
} from "../src/office/runtime/office-runtime-projection.js";

const snapshot: OfficeRuntimeSnapshot = {
  agents: [
    {
      activitySummary: "Reviewing financial margin.",
      destinationId: "FINANCE_DESK_ARTHUR",
      id: "agent-finance",
      lifecycleStatus: "active",
      state: "IDLE",
    },
  ],
  alerts: [],
  approvals: [],
  eventSequence: 8,
  meetings: [],
  schedulePhase: "WORKDAY",
  trustLevel: "supervised",
};

describe("Office runtime projection", () => {
  it("maps authoritative agent and location events into semantic visual state", () => {
    const hydrated = createOfficeRuntimeProjection(snapshot);
    const stateChanged = applyOfficeRuntimeEvent(hydrated, {
      eventId: "evt-9",
      occurredAt: "2026-08-27T12:00:00.000Z",
      payload: {
        activitySummary: "Reconciling an authoritative report.",
        agentId: "agent-finance",
        from: "IDLE",
        taskId: "task-1",
        to: "ANALYZING",
      },
      sequence: 9,
      type: "agent.state.changed",
    });
    const moved = applyOfficeRuntimeEvent(stateChanged, {
      eventId: "evt-10",
      occurredAt: "2026-08-27T12:01:00.000Z",
      payload: {
        agentId: "agent-finance",
        destinationId: "MEETING_MAIN_SEAT_01",
        priority: "P2",
        reason: "TASK_ASSIGNED",
      },
      sequence: 10,
      type: "agent.location.requested",
    });

    expect(moved.eventSequence).toBe(10);
    expect(moved.agents).toEqual([
      expect.objectContaining({
        activitySummary: "Reconciling an authoritative report.",
        destinationId: "MEETING_MAIN_SEAT_01",
        id: "agent-finance",
        state: "ANALYZING",
      }),
    ]);
  });

  it("ignores stale events and prevents suspended agents from showing work", () => {
    const hydrated = createOfficeRuntimeProjection({
      ...snapshot,
      agents: [
        {
          activitySummary: "No active work.",
          destinationId: "FINANCE_DESK_ARTHUR",
          id: "agent-finance",
          lifecycleStatus: "suspended",
          state: "ANALYZING",
        },
      ],
    });
    const stale = applyOfficeRuntimeEvent(hydrated, {
      eventId: "evt-8",
      occurredAt: "2026-08-27T11:00:00.000Z",
      payload: {
        agentId: "agent-finance",
        destinationId: "WAR_ROOM_SEAT_01",
        priority: "P1",
        reason: "INCIDENT",
      },
      sequence: 8,
      type: "agent.location.requested",
    });

    expect(stale).toBe(hydrated);
    expect(hydrated.agents[0]).toEqual(
      expect.objectContaining({ state: "IDLE" }),
    );
  });
});
