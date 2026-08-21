import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TrayCredentialProvider,
  type EncryptedTrayToken,
  type TrayConnectionRepository,
} from "../src/tray-credential-provider.js";

const key = Buffer.alloc(32, 7).toString("base64");
const tomorrow = new Date("2030-01-02T00:00:00.000Z");
const yesterday = new Date("2029-12-31T00:00:00.000Z");

function encryptFixture(plaintext: string): EncryptedTrayToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function createRepository(expiresAt = tomorrow): {
  repository: TrayConnectionRepository;
  replacements: unknown[];
} {
  const replacements: unknown[] = [];
  return {
    repository: {
      async loadEncrypted() {
        return {
          connectionId: "tray-connection-1",
          apiAddress: "https://store.example.tray.com.br/web_api",
          accessToken: encryptFixture("access_token_fixture_secret"),
          refreshToken: encryptFixture("refresh_token_fixture_secret"),
          accessTokenExpiresAt: expiresAt,
        };
      },
      async replaceEncryptedTokens(input) {
        replacements.push(input);
      },
    },
    replacements,
  };
}

describe("TrayCredentialProvider", () => {
  it("decrypts a real AES-256-GCM fixed-key token record", async () => {
    const { repository } = createRepository();
    const provider = new TrayCredentialProvider({
      encryptionKeyBase64: key,
      repository,
      refreshTransport: { async refresh() { throw new Error("unused"); } },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    await expect(provider.getAccessToken("tray-connection-1")).resolves.toEqual({
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: "access_token_fixture_secret",
    });
  });

  it("rejects an encryption key that is not exactly 32 decoded bytes", () => {
    const { repository } = createRepository();

    expect(
      () =>
        new TrayCredentialProvider({
          encryptionKeyBase64: Buffer.alloc(31).toString("base64"),
          repository,
          refreshTransport: { async refresh() { throw new Error("unused"); } },
        }),
    ).toThrow("tray_credentials_invalid");
  });

  it("refreshes one expired token and atomically stores only encrypted replacements", async () => {
    const { repository, replacements } = createRepository(yesterday);
    let refreshes = 0;
    const provider = new TrayCredentialProvider({
      encryptionKeyBase64: key,
      repository,
      refreshTransport: {
        async refresh(input) {
          refreshes += 1;
          expect(input.refreshToken).toBe("refresh_token_fixture_secret");
          return {
            accessToken: "access_token_replacement_secret",
            refreshToken: "refresh_token_replacement_secret",
            accessTokenExpiresAt: tomorrow,
          };
        },
      },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    await expect(provider.getAccessToken("tray-connection-1")).resolves.toEqual({
      apiAddress: "https://store.example.tray.com.br/web_api",
      accessToken: "access_token_replacement_secret",
    });
    expect(refreshes).toBe(1);
    expect(replacements).toHaveLength(1);
    expect(JSON.stringify(replacements[0])).not.toContain("access_token_replacement_secret");
    expect(JSON.stringify(replacements[0])).not.toContain("refresh_token_replacement_secret");
  });
});
