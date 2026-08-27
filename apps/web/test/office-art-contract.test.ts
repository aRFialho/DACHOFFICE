import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  officeAssetCatalog,
  officeDestinations,
  officeSceneLayers,
  officeZones,
  requiredAgentAtlasFrames,
} from "../src/office/art/index.js";

describe("Office art contracts", () => {
  it("defines the deterministic independent scene layer order", () => {
    expect(officeSceneLayers.map((layer) => layer.id)).toEqual([
      "floor",
      "floor_decals",
      "walls_back",
      "furniture_back",
      "dynamic",
      "furniture_front",
      "walls_front",
      "effects",
      "overlays",
      "debug",
    ]);
  });

  it("catalogues independent modular assets with unique identifiers", () => {
    const ids = officeAssetCatalog.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(officeAssetCatalog.map((asset) => asset.category))).toEqual(
      new Set([
        "floor",
        "wall",
        "furniture",
        "room",
        "agent",
        "effect",
        "branding",
        "scene_ui",
      ]),
    );
  });

  it("requires the complete MVP agent animation vocabulary", () => {
    expect(requiredAgentAtlasFrames).toEqual(
      expect.arrayContaining([
        "idle_ne",
        "idle_nw",
        "idle_se",
        "idle_sw",
        "walk_ne_01",
        "walk_nw_01",
        "walk_se_01",
        "walk_sw_01",
        "work_computer",
        "analyze",
        "talk",
        "meeting",
        "alert",
        "refresh",
      ]),
    );
  });

  it("uses semantic destinations instead of scene coordinates", () => {
    const zoneIds = new Set(officeZones.map((zone) => zone.id));
    expect(officeDestinations.length).toBeGreaterThanOrEqual(9);
    for (const destination of officeDestinations) {
      expect(zoneIds.has(destination.zoneId)).toBe(true);
      expect(destination).not.toHaveProperty("x");
      expect(destination).not.toHaveProperty("y");
      expect(destination).not.toHaveProperty("coordinates");
    }
  });

  it("does not turn the target reference into a runtime background", () => {
    const appSource = readFileSync(
      resolve(import.meta.dirname, "../src/App.tsx"),
      "utf8",
    );
    expect(appSource).not.toContain("dachbyte-office-target-reference");
  });
});
