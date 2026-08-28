import pg from "pg";
import { PostgresTrayBootstrapRepository } from "../postgres-tray-bootstrap-repository.js";
import {
  TrayBootstrapError,
  TrayConnectionBootstrap,
} from "../tray-bootstrap.js";

const databaseUrl = process.env.OFFICE_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const result = await new TrayConnectionBootstrap({
    environment: process.env,
    fetch: globalThis.fetch,
    repository: new PostgresTrayBootstrapRepository(pool),
  }).run();
  // This is deliberately the entire command surface: no provider URL, body, or
  // credential is written to stdout/stderr.
  console.log(
    result.outcome === "created"
      ? "Tray connection bootstrap completed."
      : "Tray connection bootstrap already completed.",
  );
} finally {
  await pool.end();
}
