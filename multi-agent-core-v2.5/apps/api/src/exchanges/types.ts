import type { Exchange } from "@ma-core/shared";
import type { ApiKeyPermissionSnapshot } from "../security/apiKeyPermissions.js";

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface ExchangeApiClient {
  readonly exchange: Exchange;
  getApiKeyPermissions(credentials: ExchangeCredentials): Promise<ApiKeyPermissionSnapshot>;
}

export interface SignedRequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}
