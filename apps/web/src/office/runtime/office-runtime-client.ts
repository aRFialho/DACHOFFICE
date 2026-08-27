import type { OfficeControlConnection } from "../control/office-control-model.js";
import {
  applyOfficeRuntimeEvent,
  createOfficeRuntimeProjection,
  type OfficeRuntimeEvent,
  type OfficeRuntimeProjection,
  type OfficeRuntimeSnapshot,
} from "./office-runtime-projection.js";

export interface OfficeRuntimeTransport {
  fetchSnapshot(): Promise<OfficeRuntimeSnapshot>;
  subscribe(
    onEvent: (event: OfficeRuntimeEvent) => void,
    onReconnect?: () => void,
  ): () => void;
}

export interface OfficeRuntimeClientCallbacks {
  readonly onConnection?: (connection: OfficeControlConnection) => void;
  readonly onProjection: (projection: OfficeRuntimeProjection) => void;
  readonly onTelemetry?: (entry: {
    event: OfficeRuntimeEvent;
    kind: string;
  }) => void;
}

export class OfficeRuntimeClient {
  #dispose: (() => void) | undefined;
  #operation: Promise<void> = Promise.resolve();
  #projection: OfficeRuntimeProjection | undefined;

  constructor(
    private readonly transport: OfficeRuntimeTransport,
    private readonly callbacks: OfficeRuntimeClientCallbacks,
  ) {}

  get projection(): OfficeRuntimeProjection | undefined {
    return this.#projection;
  }

  async start(): Promise<void> {
    this.emitConnection("HYDRATING", "Loading authoritative Office snapshot.");
    try {
      await this.hydrate();
      this.#dispose = this.transport.subscribe((event) => {
        this.#operation = this.#operation.then(() => this.consume(event));
      });
      this.emitConnection("LIVE", "Authoritative Office projection is live.");
    } catch {
      this.emitConnection("ERROR", "Office projection could not be hydrated.");
    }
  }

  stop(): void {
    this.#dispose?.();
    this.#dispose = undefined;
  }

  async whenIdle(): Promise<void> {
    await this.#operation;
  }

  private async consume(event: OfficeRuntimeEvent): Promise<void> {
    const projection = this.#projection;
    if (projection === undefined) return;
    if (event.sequence <= projection.eventSequence) return;

    if (event.sequence > projection.eventSequence + 1) {
      this.emitConnection(
        "RECONNECTING",
        "Event gap detected; rehydrating authoritative Office state.",
      );
      await this.hydrate();
      this.callbacks.onTelemetry?.({ event, kind: "event_gap_rehydrated" });
      if (event.sequence <= (this.#projection?.eventSequence ?? 0)) {
        this.emitConnection("LIVE", "Authoritative Office projection is live.");
        return;
      }
    }

    const current = this.#projection;
    if (current === undefined || event.sequence <= current.eventSequence)
      return;
    this.#projection = applyOfficeRuntimeEvent(current, event);
    this.callbacks.onProjection(this.#projection);
    this.callbacks.onTelemetry?.({ event, kind: "event_applied" });
    this.emitConnection("LIVE", "Authoritative Office projection is live.");
  }

  private async rehydrateAfterReconnect(): Promise<void> {
    this.emitConnection(
      "RECONNECTING",
      "SSE reconnected; rehydrating authoritative Office state.",
    );
    try {
      await this.hydrate();
      this.emitConnection("LIVE", "Authoritative Office projection is live.");
    } catch {
      this.emitConnection(
        "ERROR",
        "Office projection could not be rehydrated.",
      );
    }
  }

  private async hydrate(): Promise<void> {
    const snapshot = await this.transport.fetchSnapshot();
    this.#projection = createOfficeRuntimeProjection(snapshot);
    this.callbacks.onProjection(this.#projection);
  }

  private emitConnection(
    state: OfficeControlConnection["state"],
    detail: string,
  ): void {
    this.callbacks.onConnection?.({ detail, state });
  }
}
