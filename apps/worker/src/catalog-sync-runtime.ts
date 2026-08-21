import { CatalogSyncService } from "../../../packages/catalog/src/catalog-sync-service.js";
import { PostgresCatalogRepository } from "../../../packages/catalog/src/postgres-catalog-repository.js";
import { TrayCatalogAdapter } from "../../../packages/catalog/src/tray-catalog-adapter.js";
import { TrayCredentialProvider } from "../../../packages/catalog/src/tray-credential-provider.js";
import { TrayCatalogOutboxWorker, PostgresCatalogSyncQueue } from "./tray-catalog-worker.js";
import type { Pool } from "pg";

class ProcessRateBudget {
  readonly maxRequestsPerMinute = 180;
  private timestamps: number[] = [];
  async take(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((timestamp) => timestamp > now - 60_000);
    if (this.timestamps.length >= this.maxRequestsPerMinute) throw new Error("rate_limited");
    this.timestamps.push(now);
  }
}

class PostgresTrayConnectionRepository {
  constructor(private readonly pool: Pool) {}
  async loadEncrypted(connectionId: string) {
    const result = await this.pool.query<{
      integration_id: string; api_address: string; access_token_ciphertext: Buffer; access_token_iv: Buffer; access_token_auth_tag: Buffer;
      refresh_token_ciphertext: Buffer; refresh_token_iv: Buffer; refresh_token_auth_tag: Buffer; access_token_expires_at: Date;
    }>(`SELECT integration_id, api_address, access_token_ciphertext, access_token_iv, access_token_auth_tag,
      refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag, access_token_expires_at
      FROM tray_store_connection WHERE integration_id = $1`, [connectionId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      connectionId: row.integration_id,
      apiAddress: row.api_address,
      accessToken: { ciphertext: row.access_token_ciphertext.toString("base64"), iv: row.access_token_iv.toString("base64"), authTag: row.access_token_auth_tag.toString("base64") },
      refreshToken: { ciphertext: row.refresh_token_ciphertext.toString("base64"), iv: row.refresh_token_iv.toString("base64"), authTag: row.refresh_token_auth_tag.toString("base64") },
      accessTokenExpiresAt: row.access_token_expires_at,
    };
  }
  async replaceEncryptedTokens(input: { connectionId: string; accessToken: { ciphertext: string; iv: string; authTag: string }; refreshToken: { ciphertext: string; iv: string; authTag: string }; accessTokenExpiresAt: Date }): Promise<void> {
    await this.pool.query(`UPDATE tray_store_connection SET access_token_ciphertext = $2, access_token_iv = $3, access_token_auth_tag = $4,
      refresh_token_ciphertext = $5, refresh_token_iv = $6, refresh_token_auth_tag = $7, access_token_expires_at = $8, updated_at = now()
      WHERE integration_id = $1`, [input.connectionId, Buffer.from(input.accessToken.ciphertext, "base64"), Buffer.from(input.accessToken.iv, "base64"), Buffer.from(input.accessToken.authTag, "base64"), Buffer.from(input.refreshToken.ciphertext, "base64"), Buffer.from(input.refreshToken.iv, "base64"), Buffer.from(input.refreshToken.authTag, "base64"), input.accessTokenExpiresAt]);
  }
}

export const createConcreteCatalogSyncWorker = (input: { pool: Pool; encryptionKeyBase64: string; fetch: typeof fetch }): TrayCatalogOutboxWorker => {
  const credentials = new TrayCredentialProvider({
    encryptionKeyBase64: input.encryptionKeyBase64,
    repository: new PostgresTrayConnectionRepository(input.pool),
    refreshTransport: { refresh: async () => { throw new Error("tray_auth_retryable"); } },
  });
  const repository = new PostgresCatalogRepository({ pool: input.pool, currency: "BRL" });
  const service = new CatalogSyncService({
    repository,
    provider: (run) => new TrayCatalogAdapter({ connectionId: run.integrationId, credentials, fetch: input.fetch, timeoutMs: 10_000, rateBudget: new ProcessRateBudget() }),
  });
  return new TrayCatalogOutboxWorker(new PostgresCatalogSyncQueue(input.pool), service);
};
