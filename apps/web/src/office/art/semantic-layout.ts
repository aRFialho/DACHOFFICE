import type { OfficeAssetDefinition } from "./asset-contract.js";

export const officeVisualStates = [
  "WORKING",
  "ANALYZING",
  "IN_MEETING",
  "HELPING",
  "WAITING_APPROVAL",
  "CRITICAL",
  "IDLE",
  "REFRESHING",
  "OFF_DUTY",
  "EXECUTING_ACTION",
  "UPDATING",
  "SUSPENDED",
] as const;

export type OfficeVisualState = (typeof officeVisualStates)[number];

export interface OfficeZoneDefinition {
  readonly id: string;
  readonly label: string;
  readonly department: string;
}

export const officeZones: readonly OfficeZoneDefinition[] = [
  { id: "ENTRANCE", label: "Entrance and reception", department: "Office" },
  { id: "EXECUTIVE", label: "Executive area", department: "Executive" },
  { id: "PERFORMANCE", label: "Performance", department: "Ads" },
  { id: "FINANCE", label: "Finance", department: "Finance" },
  { id: "OPERATIONS", label: "Operations", department: "Operations" },
  { id: "MARKETPLACE", label: "Marketplace", department: "Marketplace" },
  { id: "MEETING", label: "Meeting room", department: "Shared" },
  { id: "WAR_ROOM", label: "War Room", department: "Shared" },
  { id: "REFRESH", label: "Refresh area", department: "Shared" },
] as const;

export type OfficeZoneId = (typeof officeZones)[number]["id"];

export interface OfficeDestinationDefinition {
  readonly id: string;
  readonly label: string;
  readonly zoneId: OfficeZoneId;
  readonly occupancy: "single" | "shared";
}

export const officeDestinations: readonly OfficeDestinationDefinition[] = [
  {
    id: "ENTRANCE_MAIN",
    label: "Main entrance",
    zoneId: "ENTRANCE",
    occupancy: "shared",
  },
  {
    id: "EXECUTIVE_DESK_MAIN",
    label: "Executive desk",
    zoneId: "EXECUTIVE",
    occupancy: "single",
  },
  {
    id: "PERFORMANCE_DESK_01",
    label: "Performance desk",
    zoneId: "PERFORMANCE",
    occupancy: "single",
  },
  {
    id: "FINANCE_DESK_ARTHUR",
    label: "Finance desk",
    zoneId: "FINANCE",
    occupancy: "single",
  },
  {
    id: "OPERATIONS_DESK_01",
    label: "Operations desk",
    zoneId: "OPERATIONS",
    occupancy: "single",
  },
  {
    id: "MARKETPLACE_DESK_01",
    label: "Marketplace desk",
    zoneId: "MARKETPLACE",
    occupancy: "single",
  },
  {
    id: "MEETING_MAIN_SEAT_01",
    label: "Meeting main seat 01",
    zoneId: "MEETING",
    occupancy: "single",
  },
  {
    id: "MEETING_MAIN_SEAT_02",
    label: "Meeting main seat 02",
    zoneId: "MEETING",
    occupancy: "single",
  },
  {
    id: "WAR_ROOM_SEAT_01",
    label: "War Room seat",
    zoneId: "WAR_ROOM",
    occupancy: "single",
  },
  {
    id: "REFRESH_COFFEE_01",
    label: "Coffee station",
    zoneId: "REFRESH",
    occupancy: "shared",
  },
] as const;

export type OfficeDestinationId = (typeof officeDestinations)[number]["id"];

export interface OfficeAgentVisualState {
  readonly agentId: string;
  readonly displayName: string;
  readonly visualState: OfficeVisualState;
  readonly destinationId: OfficeDestinationId;
  readonly activitySummary: string;
  readonly severity: "NORMAL" | "ATTENTION" | "CRITICAL";
  readonly avatarAssetId: OfficeAssetDefinition["id"];
}
