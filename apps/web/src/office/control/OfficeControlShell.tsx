import { OfficeCanvas } from "../components/OfficeCanvas.js";
import {
  disconnectedOfficeControlModel,
  type OfficeControlModel,
} from "./office-control-model.js";
import { OfficeControlPanel } from "./OfficeControlPanel.js";

export interface OfficeControlShellProps {
  readonly model?: OfficeControlModel;
}

export const OfficeControlShell = ({
  model = disconnectedOfficeControlModel,
}: OfficeControlShellProps) => (
  <section className="office-control-shell" aria-label="Office control plane">
    <header className="office-control-shell__header">
      <div>
        <p className="office-control-shell__eyebrow">
          DACHBYTE OFFICE / CONTROL PLANE
        </p>
        <h1>Office control plane</h1>
        <p className="office-control-shell__lede">
          React keeps the operational surface readable while the isometric scene
          remains a supplementary local projection.
        </p>
      </div>
      <aside className="office-control-connection" aria-live="polite">
        <span
          className="office-control-connection__marker"
          aria-hidden="true"
        />
        <div>
          <p>Projection state</p>
          <strong>{model.connection.state}</strong>
          <small>{model.connection.detail}</small>
        </div>
      </aside>
    </header>

    <div className="office-control-shell__grid">
      <div className="office-control-scene">
        <OfficeCanvas />
        <p className="office-control-scene__notice">
          The Office scene is not a backend source of truth. Live projection is
          introduced only with the snapshot + SSE hydration slice.
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
          emptyMessage="No approval data is currently loaded."
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
