import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  officeFixtureScenarioFromSearch,
  OfficeCanvas,
} from "../src/office/components/OfficeCanvas.js";

describe("OfficeCanvas", () => {
  it("provides an accessible non-live description alongside the canvas host", () => {
    const markup = renderToStaticMarkup(<OfficeCanvas />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Local visual Office renderer");
    expect(markup).toContain(
      "No live operational state is shown in this preview.",
    );
    expect(markup).toContain(
      "Local fixture scenarios only; no live meeting, incident, workforce, task, or action data is shown.",
    );
  });

  it("accepts only known local fixture IDs from a development query", () => {
    expect(
      officeFixtureScenarioFromSearch("?officeFixture=WAR_ROOM_CRITICAL"),
    ).toBe("WAR_ROOM_CRITICAL");
    expect(
      officeFixtureScenarioFromSearch("?officeFixture=UNKNOWN"),
    ).toBeUndefined();
  });
});
