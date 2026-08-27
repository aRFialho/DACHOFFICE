import { describe, expect, it } from "vitest";
import { financeAnalystAtlasMetadata } from "../src/office/renderer/agent-atlas.js";

describe("financeAnalystAtlasMetadata", () => {
  it("covers every required 14A Finance analyst frame exactly once", () => {
    const frameNames = financeAnalystAtlasMetadata.frames.map(
      (frame) => frame.name,
    );

    expect(frameNames).toContain("idle_se");
    expect(frameNames).toContain("walk_nw_01");
    expect(frameNames).toContain("analyze");
    expect(new Set(frameNames).size).toBe(frameNames.length);
  });
});
