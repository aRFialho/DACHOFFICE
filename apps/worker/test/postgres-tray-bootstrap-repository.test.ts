import { expect, it } from "vitest";
import { PostgresTrayBootstrapRepository } from "../src/postgres-tray-bootstrap-repository.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";

it("rejects an invalid selected target before invoking the OAuth exchange", async () => {
  let exchanged = false;
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => undefined,
  };
  const repository = new PostgresTrayBootstrapRepository({
    connect: async () => client,
  } as never);

  await expect(
    repository.bootstrap({ officeId, integrationId }, async () => {
      exchanged = true;
      return {} as never;
    }),
  ).rejects.toMatchObject({ code: "tray_bootstrap_connection_unavailable" });
  expect(exchanged).toBe(false);
});
it("persists a bootstrap connection only for the selected office-owned integration", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> =
    [];
  const client = {
    query: async (text: string, values?: readonly unknown[]) => {
      calls.push({ text, values });
      if (text.includes("FROM integration")) {
        return { rows: [{ id: integrationId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const repository = new PostgresTrayBootstrapRepository({
    connect: async () => client,
  } as never);

  await expect(
    repository.bootstrap({ officeId, integrationId }, async () => ({
      officeId,
      integrationId,
      storeId: "store-1",
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: { ciphertext: "YQ==", iv: "Yg==", authTag: "Yw==" },
      refreshToken: { ciphertext: "ZA==", iv: "ZQ==", authTag: "Zg==" },
      accessTokenExpiresAt: new Date("2026-08-24T00:00:00.000Z"),
    })),
  ).resolves.toEqual({ outcome: "created" });

  expect(calls).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining("office_id = $1 AND id = $2"),
      values: [officeId, integrationId],
    }),
  );
});
