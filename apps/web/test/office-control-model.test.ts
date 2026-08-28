import { describe, expect, it } from "vitest";
import { disconnectedOfficeControlModel } from "../src/office/control/office-control-model.js";

describe("disconnectedOfficeControlModel", () => {
  it("starts with no authoritative operational records before snapshot hydration", () => {
    expect(disconnectedOfficeControlModel.connection.state).toBe(
      "DISCONNECTED",
    );
    expect(disconnectedOfficeControlModel.connection.detail).toContain(
      "Snapshot + SSE",
    );
    expect(disconnectedOfficeControlModel.tasks).toEqual([]);
    expect(disconnectedOfficeControlModel.approvals).toEqual([]);
    expect(disconnectedOfficeControlModel.conversations).toEqual([]);
  });
});
