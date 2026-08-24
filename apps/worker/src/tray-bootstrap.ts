import { createCipheriv, randomBytes } from "node:crypto";
import type { EncryptedTrayToken } from "../../../packages/catalog/src/tray-credential-provider.js";

const trayTokenEndpoint = "https://api.tray.com.br/auth";
const defaultTimeoutMs = 10_000;
const maximumTimeoutMs = 30_000;
const maximumExpirySeconds = 31 * 24 * 60 * 60;

type BootstrapEnvironment = Record<string, string | undefined>;

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  api_address?: unknown;
};

export type TrayBootstrapPersistence = {
  hasConnection?(): Promise<boolean>;
  persist(input: {
    apiAddress: string;
    storeId: string;
    accessToken: EncryptedTrayToken;
    refreshToken: EncryptedTrayToken;
    accessTokenExpiresAt: Date;
  }): Promise<{ outcome: "created" | "unchanged" }>;
};

export class TrayBootstrapError extends Error {
  constructor(
    readonly code:
      | "tray_bootstrap_configuration_invalid"
      | "tray_bootstrap_not_enabled"
      | "tray_bootstrap_response_invalid"
      | "tray_bootstrap_timeout"
      | "tray_bootstrap_upstream_unavailable"
      | "tray_bootstrap_connection_unavailable",
  ) {
    super(code);
    this.name = "TrayBootstrapError";
  }
}

export class TrayConnectionBootstrap {
  constructor(
    private readonly options: {
      environment: BootstrapEnvironment;
      fetch: typeof fetch;
      repository: TrayBootstrapPersistence;
      now?: () => Date;
      timeoutMs?: number;
    },
  ) {}

  async run(): Promise<{ outcome: "created" | "unchanged" }> {
    const configuration = readConfiguration(this.options.environment);
    if (await this.options.repository.hasConnection?.()) {
      return { outcome: "unchanged" };
    }

    const token = await this.exchange(configuration);
    return this.options.repository.persist({
      apiAddress: token.apiAddress,
      // Tray's OAuth response has no stable store ID. api_address is the
      // validated, provider-issued store-scoped identifier used by this schema.
      storeId: token.apiAddress,
      accessToken: encrypt(token.accessToken, configuration.encryptionKey),
      refreshToken: encrypt(token.refreshToken, configuration.encryptionKey),
      accessTokenExpiresAt: token.accessTokenExpiresAt,
    });
  }

  private async exchange(configuration: {
    clientId: string;
    clientSecret: string;
    authorizationCode: string;
    encryptionKey: Buffer;
    expectedApiAddress: string | undefined;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    apiAddress: string;
    accessTokenExpiresAt: Date;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      boundedTimeout(this.options.timeoutMs),
    );
    try {
      const response = await beforeAbort(
        this.options.fetch(trayTokenEndpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            client_id: configuration.clientId,
            client_secret: configuration.clientSecret,
            code: configuration.authorizationCode,
          }),
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (!response.ok) {
        throw new TrayBootstrapError("tray_bootstrap_upstream_unavailable");
      }
      const body = (await beforeAbort(
        response.json() as Promise<TokenResponse>,
        controller.signal,
      )) as TokenResponse;
      const token = parseTokenResponse(
        body,
        this.options.now?.() ?? new Date(),
      );
      if (
        configuration.expectedApiAddress &&
        token.apiAddress !== configuration.expectedApiAddress
      ) {
        throw new TrayBootstrapError("tray_bootstrap_response_invalid");
      }
      return token;
    } catch (error) {
      if (error instanceof TrayBootstrapError) throw error;
      if (controller.signal.aborted) {
        throw new TrayBootstrapError("tray_bootstrap_timeout");
      }
      throw new TrayBootstrapError("tray_bootstrap_upstream_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

const beforeAbort = <Value>(
  operation: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> =>
  new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new Error("tray_bootstrap_aborted"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });

function readConfiguration(environment: BootstrapEnvironment): {
  clientId: string;
  clientSecret: string;
  authorizationCode: string;
  encryptionKey: Buffer;
  expectedApiAddress: string | undefined;
} {
  if (environment.TRAY_BOOTSTRAP_ENABLED !== "true") {
    throw new TrayBootstrapError("tray_bootstrap_not_enabled");
  }
  const clientId = required(environment, "TRAY_BOOTSTRAP_CLIENT_ID");
  const clientSecret = required(environment, "TRAY_BOOTSTRAP_CLIENT_SECRET");
  const authorizationCode = required(
    environment,
    "TRAY_BOOTSTRAP_AUTHORIZATION_CODE",
  );
  const encryptionKey = decodeEncryptionKey(
    required(environment, "TRAY_TOKEN_ENCRYPTION_KEY"),
  );
  const expectedApiAddress = environment.TRAY_BOOTSTRAP_API_ADDRESS?.trim();
  if (expectedApiAddress && !validApiAddress(expectedApiAddress))
    throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
  return {
    clientId,
    clientSecret,
    authorizationCode,
    encryptionKey,
    expectedApiAddress,
  };
}

function required(environment: BootstrapEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value)
    throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
  return value;
}

function decodeEncryptionKey(value: string): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
  }
  return key;
}

function parseTokenResponse(
  value: TokenResponse,
  now: Date,
): {
  accessToken: string;
  refreshToken: string;
  apiAddress: string;
  accessTokenExpiresAt: Date;
} {
  if (
    !nonBlank(value.access_token) ||
    !nonBlank(value.refresh_token) ||
    !validExpiry(value.expires_in) ||
    !validApiAddress(value.api_address)
  ) {
    throw new TrayBootstrapError("tray_bootstrap_response_invalid");
  }
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    apiAddress: value.api_address,
    accessTokenExpiresAt: new Date(now.getTime() + value.expires_in * 1_000),
  };
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validExpiry(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximumExpirySeconds
  );
}

function validApiAddress(value: unknown): value is string {
  if (!nonBlank(value) || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return defaultTimeoutMs;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TrayBootstrapError("tray_bootstrap_configuration_invalid");
  }
  return Math.min(value, maximumTimeoutMs);
}

function encrypt(value: string, key: Buffer): EncryptedTrayToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
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
