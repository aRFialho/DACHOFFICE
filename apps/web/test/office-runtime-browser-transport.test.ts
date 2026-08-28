import { describe, expect, it } from "vitest";
import {
  officeRuntimeEventFromWire,
  officeRuntimeSnapshotFromWire,
} from "../src/office/runtime/office-runtime-browser-transport.js";

describe("Office runtime browser transport", () => {
  it("accepts only a complete semantic snapshot from the untrusted wire", () => {
    expect(
      officeRuntimeSnapshotFromWire({
        agents: [
          {
            activitySummary: null,
            destinationId: "FINANCE_DESK_ARTHUR",
            id: "agent-finance",
            lifecycleStatus: "active",
            state: "IDLE",
          },
        ],
        alerts: [],
        approvals: [],
        eventSequence: 3,
        meetings: [],
        schedulePhase: "WORKDAY",
        trustLevel: "supervised",
      }),
    ).toMatchObject({ eventSequence: 3 });
    expect(officeRuntimeSnapshotFromWire({ eventSequence: 3 })).toBeUndefined();
  });

  it("drops malformed runtime events instead of allowing them into the Office", () => {
    expect(
      officeRuntimeEventFromWire({
        eventId: "evt-4",
        occurredAt: "2026-08-27T12:00:00.000Z",
        payload: {
          agentId: "agent-finance",
          destinationId: "MEETING_MAIN_SEAT_01",
          priority: "P2",
          reason: "TASK_ASSIGNED",
        },
        sequence: 4,
        type: "agent.location.requested",
      }),
    ).toMatchObject({ type: "agent.location.requested" });
    expect(
      officeRuntimeEventFromWire({ type: "agent.location.requested" }),
    ).toBeUndefined();
  });
});
