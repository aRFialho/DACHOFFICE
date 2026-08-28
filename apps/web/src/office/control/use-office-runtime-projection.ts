import { useEffect, useState } from "react";
import { OfficeRuntimeClient } from "../runtime/office-runtime-client.js";
import { createOfficeRuntimeBrowserTransport } from "../runtime/office-runtime-browser-transport.js";
import type { OfficeRuntimeProjection } from "../runtime/office-runtime-projection.js";
import {
  disconnectedOfficeControlModel,
  type OfficeControlConnection,
  type OfficeControlModel,
} from "./office-control-model.js";

export interface OfficeRuntimeConnectionOptions {
  readonly apiBaseUrl?: string;
  readonly officeId: string;
}

export interface OfficeRuntimeProjectionState {
  readonly model: OfficeControlModel;
  readonly projection: OfficeRuntimeProjection | undefined;
}

const modelFor = (
  connection: OfficeControlConnection,
  projection: OfficeRuntimeProjection | undefined,
): OfficeControlModel => ({
  approvals:
    projection?.approvals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      title: approval.summary,
    })) ?? [],
  connection,
  conversations: [],
  tasks: [],
});

export const useOfficeRuntimeProjection = (
  options: OfficeRuntimeConnectionOptions | undefined,
): OfficeRuntimeProjectionState => {
  const [state, setState] = useState<OfficeRuntimeProjectionState>({
    model: disconnectedOfficeControlModel,
    projection: undefined,
  });

  useEffect(() => {
    if (options === undefined) {
      setState({
        model: disconnectedOfficeControlModel,
        projection: undefined,
      });
      return;
    }

    let active = true;
    let latestProjection: OfficeRuntimeProjection | undefined;
    const updateConnection = (connection: OfficeControlConnection): void => {
      if (!active) return;
      setState({
        model: modelFor(connection, latestProjection),
        projection: latestProjection,
      });
    };
    const client = new OfficeRuntimeClient(
      createOfficeRuntimeBrowserTransport(options),
      {
        onConnection: updateConnection,
        onProjection: (projection) => {
          if (!active) return;
          latestProjection = projection;
          setState((current) => ({
            model: modelFor(current.model.connection, projection),
            projection,
          }));
        },
      },
    );
    void client.start();

    return () => {
      active = false;
      client.stop();
    };
  }, [options?.apiBaseUrl, options?.officeId]);

  return state;
};
