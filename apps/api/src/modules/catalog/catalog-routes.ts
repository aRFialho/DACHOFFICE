import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { AuthService } from "../auth/service.js";

export interface CatalogSyncRequestService {
  requestSync(input: { integrationId?: string }): Promise<{ runId: string }>;
}

type CatalogSqlClient = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
};

type CatalogSqlPool = Pick<Pool, "connect"> & {
  connect(): Promise<CatalogSqlClient>;
};

type IntegrationRow = { id: string; office_id: string };

export class PostgresCatalogSyncRequestService implements CatalogSyncRequestService {
  constructor(private readonly pool: CatalogSqlPool) {}

  async requestSync(input: {
    integrationId?: string;
  }): Promise<{ runId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const integration = await this.findIntegration(
        client,
        input.integrationId,
      );
      if (!integration) throw new Error("catalog_integration_not_found");

      const runId = randomUUID();
      await client.query(
        "INSERT INTO catalog_sync_run (id, office_id, integration_id) VALUES ($1, $2, $3)",
        [runId, integration.office_id, integration.id],
      );
      await client.query(
        `INSERT INTO outbox_message
          (id, aggregate_type, aggregate_id, topic, payload_json, idempotency_key)
         VALUES ($1, 'catalog_sync_run', $2, 'catalog.sync.requested', $3::jsonb, $4)`,
        [
          randomUUID(),
          runId,
          JSON.stringify({ runId }),
          `catalog.sync.requested:${runId}`,
        ],
      );
      await client.query("COMMIT");
      return { runId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async findIntegration(
    client: CatalogSqlClient,
    integrationId: string | undefined,
  ): Promise<IntegrationRow | undefined> {
    const result = integrationId
      ? await client.query<IntegrationRow>(
          `SELECT id, office_id FROM integration
           WHERE id = $1 AND type = 'tray' AND status = 'active'`,
          [integrationId],
        )
      : await client.query<IntegrationRow>(
          `SELECT id, office_id FROM integration
           WHERE type = 'tray' AND status = 'active'
           ORDER BY created_at ASC LIMIT 1`,
        );
    return result.rows[0];
  }
}

const parseIntegrationId = (body: unknown): string | null | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "object" || Array.isArray(body)) return null;
  const integrationId = (body as Record<string, unknown>).integrationId;
  if (integrationId === undefined) return undefined;
  if (
    typeof integrationId !== "string" ||
    integrationId.trim().length === 0 ||
    integrationId.length > 80
  ) {
    return null;
  }
  return integrationId;
};

export const registerCatalogRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    catalogSyncRequestService: CatalogSyncRequestService;
  },
): void => {
  server.post("/v1/integrations/tray/catalog-sync", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });

    const integrationId = parseIntegrationId(request.body);
    if (integrationId === null) {
      return reply.code(400).send({ error: "invalid_catalog_sync_input" });
    }
    try {
      return reply
        .code(202)
        .send(
          await options.catalogSyncRequestService.requestSync(
            integrationId === undefined ? {} : { integrationId },
          ),
        );
    } catch {
      return reply.code(400).send({ error: "catalog_sync_request_failed" });
    }
  });
};
