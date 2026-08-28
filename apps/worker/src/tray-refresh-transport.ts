import type { TrayRefreshTransport } from "../../../packages/catalog/src/tray-credential-provider.js";

const trayTokenEndpoint = "https://api.tray.com.br/auth";
const defaultTrayRefreshTimeoutMs = 10_000;
const maximumTrayRefreshTimeoutMs = 30_000;

type TrayRefreshResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const beforeAbort = <Value>(
  operation: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> =>
  new Promise((resolve, reject) => {
    const removeAbortListener = () =>
      signal.removeEventListener("abort", abort);
    const abort = () => {
      removeAbortListener();
      reject(new Error("tray_refresh_aborted"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (value) => {
        removeAbortListener();
        resolve(value);
      },
      (error: unknown) => {
        removeAbortListener();
        reject(error);
      },
    );
  });

export const createTrayRefreshTransport = (input: {
  clientId: string;
  clientSecret: string;
  fetch: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}): TrayRefreshTransport => {
  if (!nonBlank(input.clientId) || !nonBlank(input.clientSecret)) {
    throw new Error("tray_refresh_configuration_invalid");
  }
  const configuredTimeoutMs = input.timeoutMs ?? defaultTrayRefreshTimeoutMs;
  if (!Number.isSafeInteger(configuredTimeoutMs) || configuredTimeoutMs < 1) {
    throw new Error("tray_refresh_configuration_invalid");
  }
  const timeoutMs = Math.min(configuredTimeoutMs, maximumTrayRefreshTimeoutMs);
  return {
    async refresh({ refreshToken }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await beforeAbort(
          input.fetch(trayTokenEndpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              client_id: input.clientId,
              client_secret: input.clientSecret,
              refresh_token: refreshToken,
            }),
            signal: controller.signal,
          }),
          controller.signal,
        );
        if (!response.ok) throw new Error("refresh failed");
        const body = (await beforeAbort(
          response.json() as Promise<TrayRefreshResponse>,
          controller.signal,
        )) as TrayRefreshResponse;
        if (
          !nonBlank(body.access_token) ||
          typeof body.expires_in !== "number" ||
          !Number.isSafeInteger(body.expires_in) ||
          body.expires_in <= 0
        ) {
          throw new Error("refresh response invalid");
        }
        const now = input.now?.() ?? new Date();
        return {
          accessToken: body.access_token,
          ...(nonBlank(body.refresh_token)
            ? { refreshToken: body.refresh_token }
            : {}),
          accessTokenExpiresAt: new Date(
            now.getTime() + body.expires_in * 1_000,
          ),
        };
      } catch {
        throw new Error("tray_refresh_failed");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
