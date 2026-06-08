import { createHmac } from "node:crypto";
import type { ExchangeApiClient, ExchangeCredentials } from "./types.js";
import type { ApiKeyPermissionSnapshot } from "../security/apiKeyPermissions.js";

interface BybitPermissionResult {
  readOnly?: number;
  permissions?: Record<string, readonly string[]>;
}

interface BybitApiKeyResponse {
  retCode?: number;
  retMsg?: string;
  result?: BybitPermissionResult;
}

export class BybitClient implements ExchangeApiClient {
  public readonly exchange = "BYBIT" as const;

  public constructor(private readonly baseUrl: string) {}

  public async getApiKeyPermissions(credentials: ExchangeCredentials): Promise<ApiKeyPermissionSnapshot> {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const queryString = "";
    const signaturePayload = `${timestamp}${credentials.apiKey}${recvWindow}${queryString}`;
    const signature = createHmac("sha256", credentials.apiSecret).update(signaturePayload).digest("hex");
    const url = new URL("/v5/user/query-api", this.baseUrl);
    const response = await fetch(url, {
      headers: {
        "X-BAPI-API-KEY": credentials.apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "X-BAPI-SIGN": signature
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bybit permission check failed with status ${response.status}: ${text}`);
    }
    const raw = await response.json() as BybitApiKeyResponse;
    if (raw.retCode !== 0 || !raw.result) {
      throw new Error(`Bybit permission check rejected: ${raw.retMsg ?? "Unknown API response"}`);
    }
    const permissions = raw.result.permissions ?? {};
    const walletPermissions = new Set(permissions.Wallet ?? []);
    const spotPermissions = new Set(permissions.Spot ?? []);
    const contractPermissions = new Set(permissions.ContractTrade ?? []);
    const derivativesPermissions = new Set(permissions.Derivatives ?? []);
    const optionPermissions = new Set(permissions.Options ?? []);
    const accountPermissions = new Set([...(permissions.Account ?? []), ...(permissions.User ?? []), ...(permissions.SubAccount ?? [])]);
    const brokerPermissions = new Set([...(permissions.FiatBitPay ?? []), ...(permissions.FiatP2P ?? []), ...(permissions.FiatConvertBroker ?? []), ...(permissions.Broker ?? [])]);
    const rawRecord = raw.result as Record<string, unknown>;
    const allPermissionNames = Object.values(permissions).flatMap((items) => [...items]);
    return {
      exchange: this.exchange,
      canRead: true,
      canTradeSpot: spotPermissions.has("SpotTrade"),
      canTradeDerivatives: contractPermissions.has("Order") || derivativesPermissions.has("DerivativesTrade") || optionPermissions.has("OptionsTrade"),
      canWithdraw: walletPermissions.has("Withdraw"),
      canTransfer: walletPermissions.has("AccountTransfer") || walletPermissions.has("SubMemberTransfer") || walletPermissions.has("SubMemberTransferList"),
      canManageSubaccounts: accountPermissions.size > 0 || allPermissionNames.some((permission) => /sub\s*member|subaccount|sub account/iu.test(permission)),
      canBroker: brokerPermissions.size > 0 || allPermissionNames.some((permission) => /broker|fiat|p2p|convert/iu.test(permission)),
      unknownSensitivePermissions: allPermissionNames
        .filter((permission) => /withdraw|transfer|sub|broker|fiat|p2p|convert/iu.test(permission))
        .filter((permission) => !["Withdraw", "AccountTransfer", "SubMemberTransfer", "SubMemberTransferList"].includes(permission)),
      raw: rawRecord
    };
  }
}
