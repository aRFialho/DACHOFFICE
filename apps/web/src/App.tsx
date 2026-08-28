import { OfficeControlShell } from "./office/control/OfficeControlShell.js";

const officeId = import.meta.env.VITE_OFFICE_ID?.trim();
const runtime =
  officeId === undefined || officeId.length === 0
    ? undefined
    : {
        ...(import.meta.env.VITE_API_BASE_URL === undefined
          ? {}
          : { apiBaseUrl: import.meta.env.VITE_API_BASE_URL }),
        officeId,
      };

export const App = () => (
  <main className="control-page" id="main-content">
    <a className="skip-link" href="#office-control">
      Skip to Office control plane
    </a>
    <div id="office-control">
      <OfficeControlShell {...(runtime === undefined ? {} : { runtime })} />
    </div>
    <footer className="control-page__footer">
      <p>
        {runtime === undefined
          ? "Set VITE_OFFICE_ID to connect the authoritative runtime projection."
          : "Runtime projection uses an authenticated snapshot plus SSE; the scene remains supplementary."}
      </p>
    </footer>
  </main>
);
