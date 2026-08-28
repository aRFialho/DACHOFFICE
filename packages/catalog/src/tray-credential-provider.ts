import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedTrayToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type EncryptedTrayConnection = {
  connectionId: string;
  apiAddress: string;
  accessToken: EncryptedTrayToken;
  refreshToken: EncryptedTrayToken;
  accessTokenExpiresAt: Date;
};

export interface TrayConnectionRepository {
  loadEncrypted(connectionId: string): Promise<EncryptedTrayConnection | null>;
  replaceEncryptedTokens(input: {
    connectionId: string;
    accessToken: EncryptedTrayToken;
    refreshToken: EncryptedTrayToken;
    accessTokenExpiresAt: Date;
  }): Promise<void>;
}

export interface TrayRefreshTransport {
  refresh(input: { apiAddress: string; refreshToken: string }): Promise<{
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt: Date;
  }>;
}

export type TrayAccessToken = { apiAddress: string; accessToken: string };

export class TrayCredentialError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: "tray_credentials_invalid" | "tray_auth_retryable",
  ) {
    super(code);
    this.name = "TrayCredentialError";
    this.retryable = code === "tray_auth_retryable";
  }
}

export class TrayCredentialProvider {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly options: {
      encryptionKeyBase64: string;
      repository: TrayConnectionRepository;
      refreshTransport: TrayRefreshTransport;
      now?: () => Date;
    },
  ) {
    this.encryptionKey = decodeEncryptionKey(options.encryptionKeyBase64);
  }

  async getAccessToken(connectionId: string): Promise<TrayAccessToken> {
    const connection = await this.loadConnection(connectionId);
    if (connection.accessTokenExpiresAt <= this.now()) {
      return this.refreshConnection(connection);
    }
    return {
      apiAddress: connection.apiAddress,
      accessToken: this.decrypt(connection.accessToken),
    };
  }

  async refreshAccessToken(connectionId: string): Promise<TrayAccessToken> {
    return this.refreshConnection(await this.loadConnection(connectionId));
  }

  private async refreshConnection(
    connection: EncryptedTrayConnection,
  ): Promise<TrayAccessToken> {
    try {
      const refreshToken = this.decrypt(connection.refreshToken);
      const refreshed = await this.options.refreshTransport.refresh({
        apiAddress: connection.apiAddress,
        refreshToken,
      });
      if (
        !isNonBlankString(refreshed.accessToken) ||
        !(refreshed.accessTokenExpiresAt instanceof Date) ||
        !Number.isFinite(refreshed.accessTokenExpiresAt.getTime())
      ) {
        throw new Error("invalid refresh response");
      }
      const nextRefreshToken = refreshed.refreshToken ?? refreshToken;
      if (!isNonBlankString(nextRefreshToken))
        throw new Error("invalid refresh response");
      await this.options.repository.replaceEncryptedTokens({
        connectionId: connection.connectionId,
        accessToken: this.encrypt(refreshed.accessToken),
        refreshToken: this.encrypt(nextRefreshToken),
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      });
      return {
        apiAddress: connection.apiAddress,
        accessToken: refreshed.accessToken,
      };
    } catch {
      throw new TrayCredentialError("tray_auth_retryable");
    }
  }

  private async loadConnection(
    connectionId: string,
  ): Promise<EncryptedTrayConnection> {
    try {
      const connection =
        await this.options.repository.loadEncrypted(connectionId);
      if (!connection || !isNonBlankString(connection.apiAddress))
        throw new Error("missing");
      return connection;
    } catch {
      throw new TrayCredentialError("tray_credentials_invalid");
    }
  }

  private decrypt(token: EncryptedTrayToken): string {
    try {
      const iv = decodeBase64(token.iv);
      const authTag = decodeBase64(token.authTag);
      const ciphertext = decodeBase64(token.ciphertext);
      if (
        iv.length !== 12 ||
        authTag.length !== 16 ||
        ciphertext.length === 0
      ) {
        throw new Error("invalid encrypted token");
      }
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new TrayCredentialError("tray_credentials_invalid");
    }
  }

  private encrypt(value: string): EncryptedTrayToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function decodeEncryptionKey(value: string): Buffer {
  try {
    const key = decodeBase64(value);
    if (key.length !== 32) throw new Error("invalid key length");
    return key;
  } catch {
    throw new TrayCredentialError("tray_credentials_invalid");
  }
}

function decodeBase64(value: string): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error("invalid base64");
  }
  return Buffer.from(value, "base64");
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
