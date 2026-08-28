import type { OfficeRuntimeTransport } from "./office-runtime-client.js";
import type {
  OfficeRuntimeEvent,
  OfficeRuntimeSnapshot,
} from "./office-runtime-projection.js";

export interface OfficeRuntimeBrowserTransportOptions {
  readonly apiBaseUrl?: string;
  readonly officeId: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const asArray = (value: unknown): readonly unknown[] | undefined =>
  Array.isArray(value) ? value : undefined;

const urlFor = (
  path: string,
  options: OfficeRuntimeBrowserTransportOptions,
): string => {
  const params = new URLSearchParams({ officeId: options.officeId });
  return `${options.apiBaseUrl ?? ""}${path}?${params.toString()}`;
};

const validEnvelope = (
  value: unknown,
): value is {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
  readonly sequence: number;
  readonly type: string;
} => {
  const event = asRecord(value);
  return (
    event !== undefined &&
    asString(event.eventId) !== undefined &&
    asString(event.occurredAt) !== undefined &&
    asRecord(event.payload) !== undefined &&
    asNumber(event.sequence) !== undefined &&
    asString(event.type) !== undefined
  );
};

export const officeRuntimeEventFromWire = (
  value: unknown,
): OfficeRuntimeEvent | undefined => {
  if (!validEnvelope(value)) return undefined;
  const event = value as {
    readonly eventId: string;
    readonly occurredAt: string;
    readonly payload: Record<string, unknown>;
    readonly sequence: number;
    readonly type: string;
  };
  const agentId = asString(event.payload.agentId);

  if (
    event.type === "agent.state.changed" &&
    agentId !== undefined &&
    asString(event.payload.from) !== undefined &&
    asString(event.payload.to) !== undefined
  ) {
    return {
      ...event,
      payload: {
        activitySummary:
          typeof event.payload.activitySummary === "string"
            ? event.payload.activitySummary
            : null,
        agentId,
        from: asString(event.payload.from)!,
        taskId: asString(event.payload.taskId) ?? null,
        to: asString(event.payload.to)!,
      },
      type: "agent.state.changed",
    };
  }

  if (
    event.type === "agent.location.requested" &&
    agentId !== undefined &&
    asString(event.payload.destinationId) !== undefined &&
    asString(event.payload.priority) !== undefined &&
    asString(event.payload.reason) !== undefined
  ) {
    return {
      ...event,
      payload: {
        agentId,
        destinationId: asString(event.payload.destinationId)!,
        priority: asString(event.payload.priority)!,
        reason: asString(event.payload.reason)!,
      },
      type: "agent.location.requested",
    };
  }

  return undefined;
};

export const officeRuntimeSnapshotFromWire = (
  value: unknown,
): OfficeRuntimeSnapshot | undefined => {
  const snapshot = asRecord(value);
  const agents = asArray(snapshot?.agents);
  const alerts = asArray(snapshot?.alerts);
  const approvals = asArray(snapshot?.approvals);
  const meetings = asArray(snapshot?.meetings);
  const eventSequence = asNumber(snapshot?.eventSequence);
  const schedulePhase = asString(snapshot?.schedulePhase);
  const trustLevel = asString(snapshot?.trustLevel);
  if (
    snapshot === undefined ||
    agents === undefined ||
    alerts === undefined ||
    approvals === undefined ||
    meetings === undefined ||
    eventSequence === undefined ||
    !["WORKDAY", "OFF_DUTY"].includes(schedulePhase ?? "") ||
    !["analytical", "supervised", "autonomous"].includes(trustLevel ?? "")
  ) {
    return undefined;
  }
  const normalizedAgents = agents.map(asRecord).map((agent) => ({
    activitySummary:
      typeof agent?.activitySummary === "string" ? agent.activitySummary : null,
    destinationId:
      typeof agent?.destinationId === "string" ? agent.destinationId : null,
    id: asString(agent?.id),
    lifecycleStatus: asString(agent?.lifecycleStatus),
    state: asString(agent?.state),
  }));
  if (
    normalizedAgents.some(
      (agent) => !agent.id || !agent.lifecycleStatus || !agent.state,
    )
  )
    return undefined;
  return {
    agents: normalizedAgents as OfficeRuntimeSnapshot["agents"],
    alerts: alerts as OfficeRuntimeSnapshot["alerts"],
    approvals: approvals as OfficeRuntimeSnapshot["approvals"],
    eventSequence,
    meetings: meetings as OfficeRuntimeSnapshot["meetings"],
    schedulePhase: schedulePhase as OfficeRuntimeSnapshot["schedulePhase"],
    trustLevel: trustLevel as OfficeRuntimeSnapshot["trustLevel"],
  };
};

export const createOfficeRuntimeBrowserTransport = (
  options: OfficeRuntimeBrowserTransportOptions,
): OfficeRuntimeTransport => ({
  async fetchSnapshot(): Promise<OfficeRuntimeSnapshot> {
    const response = await fetch(
      urlFor("/api/office/runtime-snapshot", options),
      { credentials: "include", headers: { accept: "application/json" } },
    );
    const snapshot = response.ok
      ? officeRuntimeSnapshotFromWire(await response.json())
      : undefined;
    if (snapshot === undefined)
      throw new Error("Office runtime snapshot is invalid");
    return snapshot;
  },
  subscribe(onEvent): () => void {
    const source = new EventSource(urlFor("/api/office/events", options), {
      withCredentials: true,
    });
    source.addEventListener("office-runtime", (message) => {
      if (!(message instanceof MessageEvent)) return;
      try {
        const event = officeRuntimeEventFromWire(JSON.parse(message.data));
        if (event !== undefined) onEvent(event);
      } catch {
        // SSE payloads are untrusted; invalid messages are ignored safely.
      }
    });
    return () => source.close();
  },
});
