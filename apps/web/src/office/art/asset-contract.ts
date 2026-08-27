import type { OfficeSceneLayerId } from "./tokens.js";

export const officeAssetCategories = [
  "floor",
  "wall",
  "furniture",
  "room",
  "agent",
  "effect",
  "branding",
  "scene_ui",
] as const;

export type OfficeAssetCategory = (typeof officeAssetCategories)[number];

export interface OfficeAssetDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: OfficeAssetCategory;
  readonly renderLayer: OfficeSceneLayerId;
  readonly footprint: Readonly<{ width: number; depth: number }>;
}

export const requiredAgentAtlasFrames = [
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
] as const;

export type OfficeAgentAtlasFrame = (typeof requiredAgentAtlasFrames)[number];

export interface OfficeAtlasDefinition {
  readonly id: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly OfficeAgentAtlasFrame[];
}

export const officeAssetCatalog: readonly OfficeAssetDefinition[] = [
  {
    id: "floor.office_base",
    label: "Office base floor",
    category: "floor",
    renderLayer: "floor",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "floor.finance_inlay",
    label: "Finance floor inlay",
    category: "floor",
    renderLayer: "floor_decals",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "wall.glass_straight",
    label: "Glass straight wall",
    category: "wall",
    renderLayer: "walls_back",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "wall.front_half",
    label: "Front half wall",
    category: "wall",
    renderLayer: "walls_front",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "furniture.analyst_desk",
    label: "Analyst desk",
    category: "furniture",
    renderLayer: "furniture_back",
    footprint: { width: 2, depth: 1 },
  },
  {
    id: "furniture.meeting_table",
    label: "Meeting table",
    category: "furniture",
    renderLayer: "furniture_front",
    footprint: { width: 3, depth: 2 },
  },
  {
    id: "furniture.coffee_station",
    label: "Coffee station",
    category: "furniture",
    renderLayer: "furniture_front",
    footprint: { width: 2, depth: 1 },
  },
  {
    id: "room.war_room_console",
    label: "War Room console",
    category: "room",
    renderLayer: "furniture_back",
    footprint: { width: 3, depth: 1 },
  },
  {
    id: "agent.finance_analyst",
    label: "Finance analyst avatar",
    category: "agent",
    renderLayer: "dynamic",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "effect.monitor_glow",
    label: "Monitor glow",
    category: "effect",
    renderLayer: "effects",
    footprint: { width: 1, depth: 1 },
  },
  {
    id: "branding.entrance_mark",
    label: "Entrance branding mark",
    category: "branding",
    renderLayer: "floor_decals",
    footprint: { width: 2, depth: 2 },
  },
  {
    id: "scene_ui.agent_status",
    label: "Agent status bubble",
    category: "scene_ui",
    renderLayer: "overlays",
    footprint: { width: 1, depth: 1 },
  },
] as const;

export const officeAgentAtlases: readonly OfficeAtlasDefinition[] = [
  {
    id: "atlas.agent.finance_analyst.v1",
    frameWidth: 64,
    frameHeight: 80,
    frames: requiredAgentAtlasFrames,
  },
] as const;
