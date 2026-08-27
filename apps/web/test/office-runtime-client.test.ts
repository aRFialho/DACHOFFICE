import { describe, expect, it } from "vitest";
import {
  OfficeRuntimeClient,
  type OfficeRuntimeTransport,
} from "../src/office/runtime/office-runtime-client.js";
import type {
  OfficeRuntimeEvent,
  OfficeRuntimeSnapshot,
} from "../src/office/runtime/office-runtime-projection.js";

const snapshot = (eventSequence: number): OfficeRuntimeSnapshot => ({
  agents: [],
  alerts: [],
  approvals: [],
  eventSequence,
  meetings: [],
  schedulePhase: "WORKDAY",
  trustLevel: "supervised",
});

describe("OfficeRuntimeClient", () => {
  it("rehydrates after an event gap and does not apply duplicate logical events", async () => {
    const snapshots = [snapshot(4), snapshot(6)];
    const received: OfficeRuntimeEvent[] = [];
    let listener: ((event: OfficeRuntimeEvent) => void) | undefined;
    const transport: OfficeRuntimeTransport = {
      fetchSnapshot: async () => snapshots.shift()!,
      subscribe: (onEvent) => {
        listener = onEvent;
        return () => undefined;
      },
    };
    const client = new OfficeRuntimeClient(transport, {
      onProjection: () => undefined,
      onTelemetry: (entry) => received.push(entry.event),
    });

    await client.start();
    listener?.({
      eventId: "evt-6",
      occurredAt: "2026-08-27T12:00:00.000Z",
      payload: {
        agentId: "agent-finance",
        destinationId: "FINANCE_DESK_ARTHUR",
        priority: "P2",
        reason: "TASK_ASSIGNED",
      },
      sequence: 6,
      type: "agent.location.requested",
    });
    await client.whenIdle();
    listener?.({
      eventId: "evt-6-duplicate",
      occurredAt: "2026-08-27T12:00:01.000Z",
      payload: {
        agentId: "agent-finance",
        destinationId: "FINANCE_DESK_ARTHUR",
        priority: "P2",
        reason: "TASK_ASSIGNED",
      },
      sequence: 6,
      type: "agent.location.requested",
    });

    expect(client.projection?.eventSequence).toBe(6);
    expect(received.map((event) => event.eventId)).toEqual(["evt-6"]);
  });
});
