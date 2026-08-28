import { describe, expect, it } from "vitest";
import {
  resolveOfficeVisualScenario,
  type OfficeVisualScenarioId,
} from "../src/office/renderer/office-visual-scenario.js";

const scenarios: readonly OfficeVisualScenarioId[] = [
  "DAILY_MEETING",
  "WAR_ROOM_CRITICAL",
  "REFRESH",
  "OFF_DUTY",
];

describe("Office visual scenarios", () => {
  it("uses local semantic destinations and approved final animation states", () => {
    for (const scenarioId of scenarios) {
      const scenario = resolveOfficeVisualScenario(scenarioId);

      expect(scenario.id).toBe(scenarioId);
      expect(scenario.localPreview).toBe(true);
      expect(scenario.agents).not.toHaveLength(0);
      expect(scenario.agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            destinationId: expect.stringMatching(/^[A-Z0-9_]+$/),
            startDestinationId: "FINANCE_DESK_ARTHUR",
          }),
        ]),
      );
    }
  });

  it("gathers configured participants for the Daily Meeting", () => {
    const scenario = resolveOfficeVisualScenario("DAILY_MEETING");

    expect(scenario.agents).toEqual([
      expect.objectContaining({
        animation: { direction: "se", state: "MEETING" },
        destinationId: "MEETING_MAIN_SEAT_01",
      }),
      expect.objectContaining({
        animation: { direction: "sw", state: "MEETING" },
        destinationId: "MEETING_MAIN_SEAT_02",
      }),
      expect.objectContaining({
        animation: { direction: "ne", state: "MEETING" },
        destinationId: "MEETING_MAIN_SEAT_03",
      }),
    ]);
  });

  it("routes a critical local fixture to War Room and labels its speech", () => {
    const scenario = resolveOfficeVisualScenario("WAR_ROOM_CRITICAL");

    expect(scenario.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          animation: expect.objectContaining({ state: "ALERT" }),
          destinationId: "WAR_ROOM_SEAT_01",
          speech: {
            severity: "CRITICAL",
            text: "Local critical-response fixture.",
          },
        }),
      ]),
    );
  });

  it("uses Refresh and Off-duty as local workforce presentation only", () => {
    expect(resolveOfficeVisualScenario("REFRESH").agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          animation: expect.objectContaining({ state: "REFRESHING" }),
          destinationId: "REFRESH_COFFEE_01",
        }),
      ]),
    );
    expect(resolveOfficeVisualScenario("OFF_DUTY").agents).toEqual([
      expect.objectContaining({
        animation: expect.objectContaining({ state: "IDLE" }),
        destinationId: "OFF_DUTY_EXIT_01",
      }),
    ]);
  });
});
