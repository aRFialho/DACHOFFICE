import { OfficeCanvas } from "../components/OfficeCanvas.js";
import type { OfficeControlModel } from "./office-control-model.js";
import { OfficeControlPanel } from "./OfficeControlPanel.js";
import {
  useOfficeRuntimeProjection,
  type OfficeRuntimeConnectionOptions,
} from "./use-office-runtime-projection.js";

export interface OfficeControlShellProps {
  readonly model?: OfficeControlModel;
  readonly runtime?: OfficeRuntimeConnectionOptions;
}

export const OfficeControlShell = ({
  model,
  runtime,
}: OfficeControlShellProps) => {
  const runtimeState = useOfficeRuntimeProjection(runtime);
  const activeModel = model ?? runtimeState.model;
  const projection = model === undefined ? runtimeState.projection : undefined;

  return (
    <section className="office-control-shell" aria-label="Office control plane">
      <header className="office-control-shell__header">
        <div>
          <p className="office-control-shell__eyebrow">
            DACHBYTE OFFICE / CONTROL PLANE
          </p>
          <h1>Office control plane</h1>
          <p className="office-control-shell__lede">
            React keeps the operational surface readable while the isometric
            scene remains a supplementary semantic projection.
          </p>
        </div>
        <aside className="office-control-connection" aria-live="polite">
          <span
            className="office-control-connection__marker"
            aria-hidden="true"
          />
          <div>
            <p>Projection state</p>
            <strong>{activeModel.connection.state}</strong>
            <small>{activeModel.connection.detail}</small>
          </div>
        </aside>
      </header>

      <div className="office-control-shell__grid">
        <div className="office-control-scene">
          <OfficeCanvas
            {...(projection === undefined
              ? {}
              : { runtimeProjection: projection })}
          />
          <p className="office-control-scene__notice">
            {projection === undefined
              ? "The Office scene is not a backend source of truth. Configure the runtime connection to hydrate it from an authoritative snapshot."
              : "The Office scene is a supplementary projection of authoritative backend state. Scene animation cannot trigger business or external actions."}
          </p>
        </div>

        <aside
          className="office-control-shell__rail"
          aria-label="Operational panels"
        >
          <OfficeControlPanel
            eyebrow="TASKS / AUTHORITATIVE"
            emptyMessage="No authoritative task data is currently loaded."
            id="office-tasks-title"
            title="Tasks"
          />
          <OfficeControlPanel
            eyebrow="APPROVALS / SERVER POLICY"
            emptyMessage={
              activeModel.approvals.length === 0
                ? "No approval data is currently loaded."
                : `${activeModel.approvals.length} authoritative approval request(s) loaded.`
            }
            id="office-approvals-title"
            title="Approvals"
          />
          <OfficeControlPanel
            eyebrow="CHAT / REACT HISTORY"
            emptyMessage="No conversation history is currently loaded."
            id="office-chat-title"
            title="Chat"
          />
        </aside>
      </div>
    </section>
  );
};
