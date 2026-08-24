import type { TrayRefreshTransport } from "../../../packages/catalog/src/tray-credential-provider.js";

const trayTokenEndpoint = "https://api.tray.com.br/auth";

type TrayRefreshResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const createTrayRefreshTransport = (input: {
  clientId: string;
  clientSecret: string;
  fetch: typeof fetch;
  now?: () => Date;
}): TrayRefreshTransport => {
  if (!nonBlank(input.clientId) || !nonBlank(input.clientSecret)) {
    throw new Error("tray_refresh_configuration_invalid");
  }
  return {
    async refresh({ refreshToken }) {
      try {
        const response = await input.fetch(trayTokenEndpoint, {
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
        });
        if (!response.ok) throw new Error("refresh failed");
        const body = (await response.json()) as TrayRefreshResponse;
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
      }
    },
  };
};
