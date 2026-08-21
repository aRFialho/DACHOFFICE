import { describe, expect, it } from "vitest";
import {
  TrayCatalogAdapter,
  TraySafeError,
  type TrayCredentialProvider,
  type TrayRateBudget,
} from "../src/tray-catalog-adapter.js";

const productFixture = {
  id: "product-17",
  reference: "SKU-017",
  ean: "7891234567890",
  price: "19.90",
  cost_price: "10.0000",
  promotional_price: "18.5000",
  stock: 8,
  status: "active",
  variations: [],
};

const variationFixture = {
  id: "variation-1",
  reference: "SKU-017-BLUE",
  ean: "7891234567891",
  price: "19.90",
  cost_price: "10.0000",
  stock: 3,
  status: "active",
};

function createCredentials(): TrayCredentialProvider {
  return {
    async getAccessToken() {
      return {
        apiAddress: "https://store.example.tray.com.br/web_api",
        accessToken: "access_token_fixture_secret",
      };
    },
    async refreshAccessToken() {
      return {
        apiAddress: "https://store.example.tray.com.br/web_api",
        accessToken: "access_token_refreshed_secret",
      };
    },
  } as TrayCredentialProvider;
}

function createBudget(): TrayRateBudget {
  return { maxRequestsPerMinute: 180, async take() {} };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TrayCatalogAdapter", () => {
  it("parses product and variation GET fixtures through the runtime contract", async () => {
    const calls: Request[] = [];
    const adapter = new TrayCatalogAdapter({
      connectionId: "tray-connection-1",
      credentials: createCredentials(),
      fetch: async (input) => {
        calls.push(new Request(input));
        return calls.length === 1
          ? response({ products: [productFixture], paging: { next: "next-page" } })
          : response({ variations: [variationFixture] });
      },
      timeoutMs: 100,
      rateBudget: createBudget(),
    });

    await expect(adapter.listProducts({ cursor: "first page" })).resolves.toEqual({
      products: [
        {
          externalProductId: "product-17",
          reference: "SKU-017",
          ean: "7891234567890",
          price: "19.90",
          costPrice: "10.0000",
          promotionalPrice: "18.5000",
          stock: 8,
          status: "active",
          variations: [],
        },
      ],
      nextCursor: "next-page",
    });
    await expect(adapter.listVariations({})).resolves.toEqual({
      variations: [
        {
          externalVariationId: "variation-1",
          reference: "SKU-017-BLUE",
          ean: "7891234567891",
          price: "19.90",
          costPrice: "10.0000",
          stock: 3,
          status: "active",
        },
      ],
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls[0]?.url).toContain("products?cursor=first+page");
    expect(calls[1]?.url).toContain("products/variants");
  });

  it("denies malformed provider payloads with a safe code-only error", async () => {
    const adapter = new TrayCatalogAdapter({
      connectionId: "tray-connection-1",
      credentials: createCredentials(),
      fetch: async () => response({ products: [{ ...productFixture, price: 19.9 }] }),
      timeoutMs: 100,
      rateBudget: createBudget(),
    });

    await expect(adapter.listProducts({})).rejects.toMatchObject({
      name: "TraySafeError",
      message: "tray_response_invalid",
      code: "tray_response_invalid",
    });
  });

  it("refreshes once after a 401 then treats the second 401 as retryable without leaking tokens", async () => {
    let requests = 0;
    const adapter = new TrayCatalogAdapter({
      connectionId: "tray-connection-1",
      credentials: createCredentials(),
      fetch: async () => {
        requests += 1;
        return response({ access_token: "access_token_fixture_secret" }, 401);
      },
      timeoutMs: 100,
      rateBudget: createBudget(),
    });

    const thrown = await adapter.listProducts({}).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(TraySafeError);
    expect(thrown).toMatchObject({
      message: "tray_auth_retryable",
      code: "tray_auth_retryable",
      retryable: true,
    });
    expect(String(thrown)).not.toContain("access_token_fixture_secret");
    expect(String(thrown)).not.toContain("refresh_token");
    expect(requests).toBe(2);
  });

  it("fails safely when the rate budget rejects or the request times out", async () => {
    const rateLimited = new TrayCatalogAdapter({
      connectionId: "tray-connection-1",
      credentials: createCredentials(),
      fetch: async () => response({ products: [] }),
      timeoutMs: 100,
      rateBudget: {
        maxRequestsPerMinute: 180,
        async take() { throw new Error("access_token_fixture_secret"); },
      },
    });
    await expect(rateLimited.listProducts({})).rejects.toMatchObject({
      message: "tray_rate_limited",
      code: "tray_rate_limited",
    });

    const timedOut = new TrayCatalogAdapter({
      connectionId: "tray-connection-1",
      credentials: createCredentials(),
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("access_token_fixture_secret"))),
        ),
      timeoutMs: 1,
      rateBudget: createBudget(),
    });
    await expect(timedOut.listProducts({})).rejects.toMatchObject({
      message: "tray_timeout",
      code: "tray_timeout",
    });
  });

  it("rejects a budget above the documented 180 requests per minute cap", () => {
    expect(
      () =>
        new TrayCatalogAdapter({
          connectionId: "tray-connection-1",
          credentials: createCredentials(),
          fetch,
          timeoutMs: 100,
          rateBudget: { maxRequestsPerMinute: 181, async take() {} },
        }),
    ).toThrow("tray_rate_budget_invalid");
  });
});
