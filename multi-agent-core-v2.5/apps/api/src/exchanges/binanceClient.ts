import { createHmac } from "node:crypto";
import type { ExchangeApiClient, ExchangeCredentials } from "./types.js";
import type { ApiKeyPermissionSnapshot } from "../security/apiKeyPermissions.js";

interface BinanceApiRestrictionResponse {
  enableReading?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  permitsUniversalTransfer?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enableFutures?: boolean;
  enablePortfolioMarginTrading?: boolean;
  enableVanillaOptions?: boolean;
}

export class BinanceClient implements ExchangeApiClient {
  public readonly exchange = "BINANCE" as const;

  public constructor(private readonly baseUrl: string) {}

  public async getApiKeyPermissions(credentials: ExchangeCredentials): Promise<ApiKeyPermissionSnapshot> {
    const timestamp = Date.now().toString();
    const query = new URLSearchParams({ timestamp, recvWindow: "5000" });
    const signature = createHmac("sha256", credentials.apiSecret).update(query.toString()).digest("hex");
    query.set("signature", signature);
    const url = new URL(`/sapi/v1/account/apiRestrictions?${query.toString()}`, this.baseUrl);
    const response = await fetch(url, { headers: { "X-MBX-APIKEY": credentials.apiKey } });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Binance permission check failed with status ${response.status}: ${text}`);
    }
    const raw = await response.json() as BinanceApiRestrictionResponse;
    const rawRecord = raw as Record<string, unknown>;
    return {
      exchange: this.exchange,
      canRead: raw.enableReading === true,
      canTradeSpot: raw.enableSpotAndMarginTrading === true,
      canTradeDerivatives: raw.enableFutures === true || raw.enablePortfolioMarginTrading === true || raw.enableVanillaOptions === true,
      canWithdraw: raw.enableWithdrawals === true,
      canTransfer: raw.enableInternalTransfer === true || raw.permitsUniversalTransfer === true,
      canManageSubaccounts: rawRecord.enableSubaccountTransfer === true || rawRecord.enableSubaccount === true,
      canBroker: rawRecord.enableBroker === true || rawRecord.enableApiTradingBroker === true,
      unknownSensitivePermissions: Object.entries(rawRecord)
        .filter(([key, value]) => value === true && /withdraw|transfer|sub|broker|fiat|payment|pay/iu.test(key))
        .map(([key]) => key)
        .filter((key) => !["enableWithdrawals", "enableInternalTransfer", "permitsUniversalTransfer", "enableSubaccountTransfer", "enableSubaccount", "enableBroker", "enableApiTradingBroker"].includes(key)),
      raw: rawRecord
    };
  }
}
