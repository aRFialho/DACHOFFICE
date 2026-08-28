import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import {
  createAuthService,
  hashPassword,
  InMemoryAuthRepository,
} from "../src/modules/auth/index.js";

const config = {
  audience: "dachbyte-office-web",
  issuer: "dachbyte-office-api",
  accessTokenSecret: "test-secret-with-at-least-thirty-two-bytes!",
  accessTokenTtlSeconds: 600,
  refreshTokenTtlSeconds: 604800,
  secureCookies: false,
};
describe("supplier price table routes", () => {
  let repository: InMemoryAuthRepository;
  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Admin",
      email: "admin@example.com",
      role: "admin_master",
      active: true,
      passwordHash: await hashPassword("Correct-Horse-Battery-Staple-2026"),
      sessionVersion: 1,
    });
  });
  it("accepts only structured supplier rows for the authenticated admin", async () => {
    const calls: unknown[] = [];
    const server = buildServer({
      authService: createAuthService({ repository, tokenConfig: config }),
      authTokenConfig: config,
      supplierPriceTableImportService: {
        importTable: async (input: unknown) => {
          calls.push(input);
          return {
            status: "created",
            tableId: "44444444-4444-4444-8444-444444444444",
            mappedRows: 1,
            unresolvedRows: 0,
          };
        },
      },
    });
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "admin@example.com",
        password: "Correct-Horse-Battery-Staple-2026",
      },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/pricing/supplier-price-tables",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: {
        officeId: "11111111-1111-4111-8111-111111111111",
        supplierId: "22222222-2222-4222-8222-222222222222",
        sourceName: "ACME",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        observedAt: "2026-08-02T00:00:00.000Z",
        rows: [
          {
            sourceRowNumber: 1,
            sku: "SKU-1",
            cost: "20.0000",
            currency: "BRL",
            sourceFields: {},
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(calls).toEqual([
      expect.objectContaining({
        importedByUserId: "33333333-3333-4333-8333-333333333333",
      }),
    ]);
    await server.close();
  });
});
