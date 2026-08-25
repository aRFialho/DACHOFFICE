import type { FastifyInstance } from "fastify";
import { authenticateAdminMaster } from "../admin/admin-auth.js";
import type { AuthService } from "../auth/service.js";
import type { SupplierPriceTableImportInput } from "./supplier-price-table-import-service.js";

export type SupplierPriceTableImportEndpoint = {
  importTable(input: SupplierPriceTableImportInput): Promise<unknown>;
};
const allowed = new Set([
  "officeId",
  "supplierId",
  "sourceName",
  "effectiveAt",
  "observedAt",
  "rows",
]);
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const parse = (
  body: unknown,
  importedByUserId: string,
): SupplierPriceTableImportInput | null => {
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return null;
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    !Array.isArray(value.rows)
  )
    return null;
  const rows = value.rows.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row))
      return null;
    const entry = row as Record<string, unknown>;
    if (
      entry.sourceFields === null ||
      typeof entry.sourceFields !== "object" ||
      Array.isArray(entry.sourceFields)
    )
      return null;
    return {
      sourceRowNumber: entry.sourceRowNumber,
      sku: text(entry.sku),
      cost: text(entry.cost),
      currency: text(entry.currency),
      sourceFields: entry.sourceFields as Record<string, unknown>,
    };
  });
  const officeId = text(value.officeId),
    supplierId = text(value.supplierId),
    sourceName = text(value.sourceName),
    effectiveAt = text(value.effectiveAt),
    observedAt = text(value.observedAt);
  if (
    !officeId ||
    !supplierId ||
    !sourceName ||
    !effectiveAt ||
    !observedAt ||
    rows.some(
      (row) =>
        row === null ||
        typeof row.sourceRowNumber !== "number" ||
        !row.sku ||
        !row.cost ||
        !row.currency,
    )
  )
    return null;
  return {
    officeId,
    supplierId,
    importedByUserId,
    sourceName,
    effectiveAt,
    observedAt,
    rows: rows as SupplierPriceTableImportInput["rows"],
  };
};

export const registerSupplierPriceTableRoutes = (
  server: FastifyInstance,
  options: {
    authService: AuthService;
    supplierPriceTableImportService: SupplierPriceTableImportEndpoint;
  },
): void => {
  server.post("/v1/pricing/supplier-price-tables", async (request, reply) => {
    const actor = await authenticateAdminMaster(request, options.authService);
    if (!actor) return reply.code(401).send({ error: "unauthorized" });
    const input = parse(request.body, actor.user.id);
    if (!input)
      return reply
        .code(400)
        .send({ error: "invalid_supplier_price_table_input" });
    try {
      return reply.code(201).send({
        supplierPriceTable:
          await options.supplierPriceTableImportService.importTable(input),
      });
    } catch {
      return reply
        .code(400)
        .send({ error: "supplier_price_table_import_failed" });
    }
  });
};
