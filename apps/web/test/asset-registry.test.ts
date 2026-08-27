import { describe, expect, it } from "vitest";
import { createOfficeAssetRegistry } from "../src/office/renderer/asset-registry.js";

describe("createOfficeAssetRegistry", () => {
  it("exposes only explicit representative asset ids to the renderer", () => {
    const registry = createOfficeAssetRegistry();

    expect(registry.get("furniture.analyst_desk")).toEqual(
      expect.objectContaining({ kind: "furniture" }),
    );
    expect(registry.get("agent.finance_analyst")).toEqual(
      expect.objectContaining({ kind: "atlas_source" }),
    );
    expect(registry.get("room.war_room_console")).toBeUndefined();
  });
});
