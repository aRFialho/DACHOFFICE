export const officeSceneLayers = [
  { id: "floor", order: 0, label: "Floor" },
  { id: "floor_decals", order: 10, label: "Floor decals" },
  { id: "walls_back", order: 20, label: "Back walls" },
  { id: "furniture_back", order: 30, label: "Furniture behind agents" },
  { id: "dynamic", order: 40, label: "Agents and dynamic objects" },
  { id: "furniture_front", order: 50, label: "Furniture in front of agents" },
  { id: "walls_front", order: 60, label: "Front walls and details" },
  { id: "effects", order: 70, label: "Scene effects" },
  { id: "overlays", order: 80, label: "Speech and status overlays" },
  { id: "debug", order: 90, label: "Development debug overlay" },
] as const;

export type OfficeSceneLayerId = (typeof officeSceneLayers)[number]["id"];

export const officeArtTokens = {
  projection: { tileWidth: 64, tileHeight: 32, wallHeight: 48 },
  agent: { footBaseline: 24, nearestNeighbor: true },
  motion: { standardMs: 180, reducedMs: 0 },
  focus: { ring: "#94f7e9", offset: 3 },
  palette: {
    canvas: "#07111c",
    surface: "#101f2e",
    elevated: "#183149",
    ink: "#edf7f5",
    muted: "#9eb2c2",
    system: "#67d9e8",
    attention: "#ffc66d",
    critical: "#ff6b7a",
    success: "#7ce4b0",
  },
} as const;

export const officeDepartmentPalette = {
  entrance: "#d7b56a",
  executive: "#8e79d7",
  performance: "#e87588",
  finance: "#45bdb5",
  operations: "#5b95db",
  marketplace: "#d98a4e",
  meeting: "#8377cb",
  war_room: "#df5266",
  refresh: "#7bbd87",
} as const;

export type OfficeArtTokens = typeof officeArtTokens;
