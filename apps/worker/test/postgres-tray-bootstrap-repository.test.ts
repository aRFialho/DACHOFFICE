import { expect, it } from "vitest";
import { PostgresTrayBootstrapRepository } from "../src/postgres-tray-bootstrap-repository.js";

const officeId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";

it("checks for an existing connection only within the explicitly selected office and integration", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const repository = new PostgresTrayBootstrapRepository({
    query: async (text: string, values?: readonly unknown[]) => {
      calls.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
  } as never) as unknown as {
    hasConnection(input: {
      officeId: string;
      integrationId: string;
    }): Promise<boolean>;
  };

  await expect(repository.hasConnection({ officeId, integrationId })).resolves.toBe(false);

  expect(calls).toEqual([
    expect.objectContaining({
      text: expect.stringContaining("i.office_id = $1 AND i.id = $2"),
      values: [officeId, integrationId],
    }),
  ]);
});

it("persists a bootstrap connection only for the selected office-owned integration", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
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
  } as never) as unknown as {
    persist(input: {
      officeId: string;
      integrationId: string;
      storeId: string;
      apiAddress: string;
      accessToken: { ciphertext: string; iv: string; authTag: string };
      refreshToken: { ciphertext: string; iv: string; authTag: string };
      accessTokenExpiresAt: Date;
    }): Promise<{ outcome: "created" | "unchanged" }>;
  };

  await expect(
    repository.persist({
      officeId,
      integrationId,
      storeId: "store-1",
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: { ciphertext: "YQ==", iv: "Yg==", authTag: "Yw==" },
      refreshToken: { ciphertext: "ZA==", iv: "ZQ==", authTag: "Zg==" },
      accessTokenExpiresAt: new Date("2026-08-24T00:00:00.000Z"),
    }),
  ).resolves.toEqual({ outcome: "created" });

  expect(calls).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining("office_id = $1 AND id = $2"),
      values: [officeId, integrationId],
    }),
  );
});
