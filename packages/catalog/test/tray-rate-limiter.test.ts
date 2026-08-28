import { expect, it } from "vitest";
import {
  TrayCatalogAdapter,
  type TrayCredentialProvider,
  type TrayRateBudget,
} from "../src/tray-catalog-adapter.js";

const credentials: TrayCredentialProvider = {
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
};

it("prevents the 181st GET from reaching fetch in one 60-second window", async () => {
  let fetchCalls = 0;
  const rateBudget: TrayRateBudget = {
    maxRequestsPerMinute: 180,
    async take() {},
  };
  const adapter = new TrayCatalogAdapter({
    connectionId: "tray-connection-1",
    credentials,
    fetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    },
    timeoutMs: 100,
    rateBudget,
  });

  for (let request = 0; request < 180; request += 1) {
    await adapter.listProducts({});
  }

  await expect(adapter.listProducts({})).rejects.toMatchObject({
    message: "tray_rate_limited",
    code: "tray_rate_limited",
    retryable: true,
  });
  expect(fetchCalls).toBe(180);
});
