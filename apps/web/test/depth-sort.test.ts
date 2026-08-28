import { describe, expect, it } from "vitest";
import { sortByOfficeDepth } from "../src/office/renderer/depth-sort.js";

describe("sortByOfficeDepth", () => {
  it("sorts renderer objects by layer, foot baseline and stable input order", () => {
    const sorted = sortByOfficeDepth([
      { id: "agent", layerOrder: 40, footY: 112 },
      { id: "desk", layerOrder: 30, footY: 140 },
      { id: "front-chair", layerOrder: 40, footY: 128 },
      { id: "agent-tie", layerOrder: 40, footY: 112 },
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual([
      "desk",
      "agent",
      "agent-tie",
      "front-chair",
    ]);
  });
});
