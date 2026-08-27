import { OfficeControlShell } from "./office/control/OfficeControlShell.js";

export const App = () => (
  <main className="control-page" id="main-content">
    <a className="skip-link" href="#office-control">
      Skip to Office control plane
    </a>
    <div id="office-control">
      <OfficeControlShell />
    </div>
    <footer className="control-page__footer">
      <p>
        Frontend scope: React control surface and local Pixi/Tiled scene. No
        live task, approval or conversation projection is connected yet.
      </p>
    </footer>
  </main>
);
