export type OfficeControlConnectionState =
  | "DISCONNECTED"
  | "HYDRATING"
  | "LIVE"
  | "RECONNECTING"
  | "ERROR";

export interface OfficeControlConnection {
  readonly state: OfficeControlConnectionState;
  readonly detail: string;
}

export interface OfficeTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface OfficeApprovalSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface OfficeConversationSummary {
  readonly id: string;
  readonly summary: string;
}

export interface OfficeControlModel {
  readonly connection: OfficeControlConnection;
  readonly tasks: readonly OfficeTaskSummary[];
  readonly approvals: readonly OfficeApprovalSummary[];
  readonly conversations: readonly OfficeConversationSummary[];
}

export const disconnectedOfficeControlModel: OfficeControlModel = {
  connection: {
    state: "DISCONNECTED",
    detail: "Snapshot + SSE projection is not connected.",
  },
  tasks: [],
  approvals: [],
  conversations: [],
};
