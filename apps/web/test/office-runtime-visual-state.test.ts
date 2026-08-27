import { describe, expect, it } from "vitest";
import { createOfficeRuntimeSceneState } from "../src/office/runtime/office-runtime-visual-state.js";
import { createOfficeRuntimeProjection } from "../src/office/runtime/office-runtime-projection.js";

describe("Office runtime visual state", () => {
  it("maps semantic state without scene coordinates and falls back from an unknown destination", () => {
    const scene = createOfficeRuntimeSceneState(
      createOfficeRuntimeProjection({
        agents: [
          {
            activitySummary: "Checking the authoritative queue.",
            destinationId: "UNKNOWN_DESTINATION",
            id: "agent-finance",
            lifecycleStatus: "active",
            state: "ANALYZING",
          },
        ],
        alerts: [],
        approvals: [],
        eventSequence: 14,
        meetings: [],
        schedulePhase: "WORKDAY",
        trustLevel: "supervised",
      }),
      new Set(["FINANCE_DESK_ARTHUR"]),
      "FINANCE_DESK_ARTHUR",
    );

    expect(scene).toEqual({
      agents: [
        expect.objectContaining({
          destinationId: "FINANCE_DESK_ARTHUR",
          id: "agent-finance",
          state: "ANALYZING",
        }),
      ],
      eventSequence: 14,
      unknownDestinationAgentIds: ["agent-finance"],
    });
  });
});
