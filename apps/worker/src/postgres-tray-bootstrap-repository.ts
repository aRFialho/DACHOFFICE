import type { Pool } from "pg";
import type { TrayBootstrapPersistence } from "./tray-bootstrap.js";

export class PostgresTrayBootstrapRepository implements TrayBootstrapPersistence {
  constructor(private readonly pool: Pool) {}

  async hasConnection(): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM tray_store_connection
       WHERE integration_id = (
         SELECT id FROM integration
         WHERE type = 'tray' AND status = 'active'
         ORDER BY created_at ASC, id ASC
         LIMIT 1
       )
       )`,
    );
    return (result.rowCount ?? 0) > 0;
  }

  async persist(input: Parameters<TrayBootstrapPersistence["persist"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const integration = await client.query<{ id: string }>(
        `SELECT id FROM integration
         WHERE type = 'tray' AND status = 'active'
         ORDER BY created_at ASC, id ASC
         LIMIT 1 FOR UPDATE`,
      );
      const integrationId = integration.rows[0]?.id;
      if (!integrationId) {
        throw new Error("tray_bootstrap_connection_unavailable");
      }
      const existing = await client.query(
        `SELECT 1 FROM tray_store_connection WHERE integration_id = $1`,
        [integrationId],
      );
      if ((existing.rowCount ?? 0) > 0) {
        await client.query("COMMIT");
        return { outcome: "unchanged" as const };
      }
      await client.query(
        `INSERT INTO tray_store_connection (
          integration_id, store_id, api_address,
          access_token_ciphertext, access_token_iv, access_token_auth_tag,
          access_token_expires_at,
          refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          integrationId,
          input.storeId,
          input.apiAddress,
          Buffer.from(input.accessToken.ciphertext, "base64"),
          Buffer.from(input.accessToken.iv, "base64"),
          Buffer.from(input.accessToken.authTag, "base64"),
          input.accessTokenExpiresAt,
          Buffer.from(input.refreshToken.ciphertext, "base64"),
          Buffer.from(input.refreshToken.iv, "base64"),
          Buffer.from(input.refreshToken.authTag, "base64"),
        ],
      );
      await client.query("COMMIT");
      return { outcome: "created" as const };
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof Error &&
        error.message === "tray_bootstrap_connection_unavailable"
      ) {
        throw error;
      }
      throw new Error("tray_bootstrap_persistence_failed");
    } finally {
      client.release();
    }
  }
}
