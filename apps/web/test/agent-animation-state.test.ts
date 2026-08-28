import { describe, expect, it } from "vitest";
import { frameForAgentAnimation } from "../src/office/renderer/agent-animation-state.js";

describe("frameForAgentAnimation", () => {
  it("selects the approved idle frame for a local preview direction", () => {
    expect(frameForAgentAnimation({ direction: "se", state: "IDLE" })).toBe(
      "idle_se",
    );
  });

  it("selects only approved walk and activity frames", () => {
    expect(frameForAgentAnimation({ direction: "nw", state: "WALKING" })).toBe(
      "walk_nw_01",
    );
    expect(
      frameForAgentAnimation({ direction: "se", state: "ANALYZING" }),
    ).toBe("analyze");
  });
});
