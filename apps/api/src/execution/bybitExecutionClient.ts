import { createHmac } from "node:crypto";
import { CalculatedOrderParametersSchema, SymbolTradingRuleSchema, type CalculatedOrderParameters, type Position, type SymbolTradingRule, type TradeDirection } from "@ma-core/shared";
import type { ExchangeSecretPayload } from "../security/vault.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import { fingerprintApiKey } from "../repositories/privateStreamRepository.js";
import type { AccountBalanceSnapshot, ExchangeCloseResult, ExchangeExecutionClient, ExchangeOpenOrderSnapshot, ExchangeOrderPlacementResult, ExchangePositionSnapshot, ProtectiveOrderStatus, TopOfBook } from "./types.js";
import { normalizeSymbol } from "./binanceExecutionClient.js";

interface BybitResponse<T> {
  retCode?: number;
  retMsg?: string;
  result?: T;
}

interface BybitWalletCoin {
  coin?: string;
  availableToWithdraw?: string;
  walletBalance?: string;
  equity?: string;
  unrealisedPnl?: string;
}

interface BybitWalletAccount {
  totalEquity?: string;
  totalAvailableBalance?: string;
  coin?: BybitWalletCoin[];
}

interface BybitWalletResult {
  list?: BybitWalletAccount[];
}

interface BybitOrderbookResult {
  b?: readonly [string, string][];
  a?: readonly [string, string][];
  ts?: number;
}

interface BybitOrderResult {
  orderId?: string;
  orderLinkId?: string;
}

interface BybitExecutionItem {
  orderId?: string;
  execPrice?: string;
  execQty?: string;
  execTime?: string;
  execPnl?: string;
}

interface BybitExecutionResult {
  list?: BybitExecutionItem[];
}

interface BybitInstrumentResult {
  list?: Array<{
    symbol?: string;
    status?: string;
    lotSizeFilter?: { minOrderQty?: string; maxOrderQty?: string; qtyStep?: string; minNotionalValue?: string };
    priceFilter?: { tickSize?: string };
    leverageFilter?: { maxLeverage?: string };
  }>;
}

interface BybitPositionItem {
  symbol?: string;
  side?: string;
  size?: string;
  unrealisedPnl?: string;
}

interface BybitPositionResult {
  list?: BybitPositionItem[];
}

export class BybitExecutionClient implements ExchangeExecutionClient {
  public readonly exchange = "BYBIT" as const;

  public constructor(private readonly baseUrl: string, private readonly timeoutMs: number, private readonly privateStreams?: PrivateStreamRepository, private readonly privateStreamStaleAfterMs: number = 45000) {}

  public async getBalance(credentials: ExchangeSecretPayload): Promise<AccountBalanceSnapshot> {
    const query = new URLSearchParams({ accountType: "UNIFIED", coin: "USDT" });
    const raw = await this.signedRequest<BybitWalletResult>(credentials, "GET", "/v5/account/wallet-balance", query);
    const account = raw.list?.[0];
    const coin = account?.coin?.find((item) => item.coin === "USDT");
    const available = toFiniteNumber(account?.totalAvailableBalance) ?? toFiniteNumber(coin?.availableToWithdraw) ?? 0;
    const equity = toFiniteNumber(account?.totalEquity) ?? toFiniteNumber(coin?.equity) ?? toFiniteNumber(coin?.walletBalance) ?? available;
    const unrealized = toFiniteNumber(coin?.unrealisedPnl) ?? 0;
    const realized = await this.getRealizedPnlToday(credentials).catch(() => 0);
    return { availableBalanceUsdt: available, totalEquityUsdt: Math.max(0, equity), realizedPnlToday: realized ?? 0, unrealizedPnlToday: unrealized };
  }

  public async getTopOfBook(pair: string): Promise<TopOfBook> {
    const url = new URL("/v5/market/orderbook", this.baseUrl);
    url.searchParams.set("category", "linear");
    url.searchParams.set("symbol", normalizeSymbol(pair));
    url.searchParams.set("limit", "1");
    const envelope = await fetchJson<BybitResponse<BybitOrderbookResult>>(url, this.timeoutMs, undefined);
    if (envelope.retCode !== 0 || !envelope.result) {
      throw new Error(`Bybit orderbook rejected: ${envelope.retMsg ?? "missing result"}`);
    }
    const bid = toFiniteNumber(envelope.result.b?.[0]?.[0]);
    const ask = toFiniteNumber(envelope.result.a?.[0]?.[0]);
    if (!bid || !ask) {
      throw new Error(`Bybit orderbook for ${pair} did not include valid bid/ask`);
    }
    return { bid, ask, observedAt: envelope.result.ts ? new Date(envelope.result.ts).toISOString() : new Date().toISOString() };
  }

  public async getRealizedPnlToday(credentials: ExchangeSecretPayload): Promise<number | null> {
    const start = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const query = new URLSearchParams({ category: "linear", startTime: String(start), limit: "100" });
    const raw = await this.signedRequest<BybitExecutionResult>(credentials, "GET", "/v5/execution/list", query);
    return (raw.list ?? []).reduce((sum, item) => sum + (toFiniteNumber(item.execPnl) ?? 0), 0);
  }

  public async getSymbolRules(_credentials: ExchangeSecretPayload, pair: string): Promise<SymbolTradingRule> {
    const symbol = normalizeSymbol(pair);
    const query = new URLSearchParams({ category: "linear", symbol });
    const raw = await this.signedRequest<BybitInstrumentResult>({ apiKey: "", apiSecret: "" }, "GET_PUBLIC", "/v5/market/instruments-info", query);
    const item = raw.list?.[0];
    if (!item) throw new Error(`Bybit symbol rules missing for ${symbol}`);
    return SymbolTradingRuleSchema.parse({
      id: `bybit_${symbol}`,
      exchange: "BYBIT",
      pair,
      symbol,
      minQty: toFiniteNumber(item.lotSizeFilter?.minOrderQty) ?? 0.001,
      maxQty: toFiniteNumber(item.lotSizeFilter?.maxOrderQty) ?? 100000,
      qtyStep: toFiniteNumber(item.lotSizeFilter?.qtyStep) ?? 0.001,
      tickSize: toFiniteNumber(item.priceFilter?.tickSize) ?? 0.01,
      minNotional: toFiniteNumber(item.lotSizeFilter?.minNotionalValue) ?? 5,
      maxNotional: null,
      maxLeverage: Math.floor(toFiniteNumber(item.leverageFilter?.maxLeverage) ?? 20),
      contractSize: 1,
      marginAsset: "USDT",
      status: item.status === "Trading" ? "TRADING" : "DISABLED",
      reduceOnlySupported: true,
      updatedAt: new Date().toISOString()
    });
  }

  public async hasHealthyPrivateStream(credentials: ExchangeSecretPayload): Promise<boolean> {
    if (!this.privateStreams) return Boolean(this.privateStreams);
    const status = await this.privateStreams.getHealth(this.exchange, fingerprintApiKey(credentials.apiKey), this.privateStreamStaleAfterMs);
    return status?.status === "HEALTHY";
  }

  public async setLeverage(credentials: ExchangeSecretPayload, pair: string, leverage: number, direction: TradeDirection): Promise<void> {
    const leverageValue = String(leverage);
    const body = { category: "linear", symbol: normalizeSymbol(pair), buyLeverage: leverageValue, sellLeverage: leverageValue };
    if (direction === "LONG" || direction === "SHORT") {
      await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/v5/position/set-leverage", new URLSearchParams(), body);
    }
  }

  public async placeBracketOrder(credentials: ExchangeSecretPayload, order: CalculatedOrderParameters): Promise<ExchangeOrderPlacementResult> {
    const parsed = CalculatedOrderParametersSchema.parse(order);
    const body = {
      category: "linear",
      symbol: normalizeSymbol(parsed.pair),
      side: parsed.side,
      orderType: parsed.orderType === "MARKET" ? "Market" : "Limit",
      qty: String(parsed.qty),
      ...(parsed.price ? { price: String(parsed.price) } : {}),
      timeInForce: parsed.orderType === "MARKET" ? "IOC" : "GTC",
      reduceOnly: false,
      takeProfit: String(parsed.takeProfit),
      stopLoss: String(parsed.stopLoss),
      tpOrderType: "Limit",
      slOrderType: "Market",
      tpLimitPrice: String(parsed.takeProfit)
    };
    const raw = await this.signedRequest<BybitOrderResult>(credentials, "POST", "/v5/order/create", new URLSearchParams(), body);
    const orderId = raw.orderId ?? raw.orderLinkId ?? `bybit_${Date.now()}`;
    const execution = await this.fetchLatestExecution(credentials, normalizeSymbol(parsed.pair), orderId);
    if (!execution) {
      throw new Error(`Bybit entry order ${orderId} was submitted but fill was not confirmed`);
    }
    return { exchangeOrderId: orderId, exchangePositionId: `${normalizeSymbol(parsed.pair)}:${orderId}`, filledPrice: execution.price, filledQty: execution.qty, protectionAttached: true, raw: raw as Record<string, unknown> };
  }

  public async cancelAllOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<Record<string, unknown>> {
    const body = { category: "linear", ...(pair ? { symbol: normalizeSymbol(pair) } : {}) };
    return this.signedRequest<Record<string, unknown>>(credentials, "POST", "/v5/order/cancel-all", new URLSearchParams(), body);
  }

  public async closeAllPositions(credentials: ExchangeSecretPayload): Promise<ExchangeCloseResult[]> {
    const raw = await this.signedRequest<BybitPositionResult>(credentials, "GET", "/v5/position/list", new URLSearchParams({ category: "linear", settleCoin: "USDT" }));
    const positions = raw.list ?? [];
    const results: ExchangeCloseResult[] = [];
    for (const position of positions) {
      const size = toFiniteNumber(position.size);
      const symbol = position.symbol;
      const side = position.side;
      if (!symbol || !side || !size || size <= 0) {
        continue;
      }
      const closeSide = side === "Buy" ? "Sell" : "Buy";
      const response = await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/v5/order/create", new URLSearchParams(), { category: "linear", symbol, side: closeSide, orderType: "Market", qty: String(size), reduceOnly: true, timeInForce: "IOC" });
      results.push({ exchangePositionId: symbol, realizedPnl: toFiniteNumber(position.unrealisedPnl) ?? null, raw: response });
    }
    return results;
  }

  public async closePosition(credentials: ExchangeSecretPayload, position: Position): Promise<ExchangeCloseResult> {
    const response = await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/v5/order/create", new URLSearchParams(), {
      category: "linear",
      symbol: normalizeSymbol(position.pair),
      side: position.direction === "LONG" ? "Sell" : "Buy",
      orderType: "Market",
      qty: String(position.volume),
      reduceOnly: true,
      timeInForce: "IOC"
    });
    return { exchangePositionId: position.exchangePositionId, realizedPnl: null, raw: response };
  }


  public async listExchangePositions(credentials: ExchangeSecretPayload): Promise<ExchangePositionSnapshot[]> {
    const raw = await this.signedRequest<BybitPositionResult>(credentials, "GET", "/v5/position/list", new URLSearchParams({ category: "linear", settleCoin: "USDT" }));
    return (raw.list ?? []).flatMap((row) => {
      const size = toFiniteNumber(row.size);
      const symbol = row.symbol;
      const side = row.side;
      if (!symbol || !side || !size || size <= 0) return [];
      return [{
        exchangePositionId: symbol,
        pair: symbolToPair(symbol),
        direction: side === "Buy" ? "LONG" as const : "SHORT" as const,
        volume: size,
        averageEntryPrice: toFiniteNumber((row as Record<string, string | undefined>).avgPrice) ?? 0,
        markPrice: toFiniteNumber((row as Record<string, string | undefined>).markPrice) ?? null,
        liquidationPrice: toFiniteNumber((row as Record<string, string | undefined>).liqPrice) ?? null,
        unrealizedPnl: toFiniteNumber(row.unrealisedPnl) ?? null,
        raw: row as unknown as Record<string, unknown>
      }];
    });
  }

  public async listOpenOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<ExchangeOpenOrderSnapshot[]> {
    const query = new URLSearchParams({ category: "linear", openOnly: "0", limit: "50", ...(pair ? { symbol: normalizeSymbol(pair) } : {}) });
    const raw = await this.signedRequest<{ list?: Array<Record<string, unknown>> }>(credentials, "GET", "/v5/order/realtime", query);
    return (raw.list ?? []).map((row) => {
      const orderType = String(row.orderType ?? "UNKNOWN");
      const triggerPrice = toFiniteNumber(row.triggerPrice as string | number | undefined) ?? null;
      const stopOrderType = String(row.stopOrderType ?? "");
      return {
        exchangeOrderId: String(row.orderId ?? row.orderLinkId ?? "unknown"),
        pair: symbolToPair(String(row.symbol ?? "")),
        side: String(row.side ?? "UNKNOWN"),
        orderType,
        orderRole: stopOrderType.includes("StopLoss") || orderType.includes("Stop") ? "STOP_LOSS" : stopOrderType.includes("TakeProfit") ? "TAKE_PROFIT" : "UNKNOWN",
        qty: toFiniteNumber(row.qty as string | number | undefined) ?? 0,
        price: toFiniteNumber(row.price as string | number | undefined) ?? null,
        triggerPrice,
        reduceOnly: Boolean(row.reduceOnly),
        status: String(row.orderStatus ?? "UNKNOWN"),
        raw: row
      };
    });
  }

  public async getProtectiveOrderStatus(credentials: ExchangeSecretPayload, position: Position): Promise<ProtectiveOrderStatus> {
    const orders = await this.listOpenOrders(credentials, position.pair);
    const protectiveSide = position.direction === "LONG" ? "Sell" : "Buy";
    const stop = orders.find((order) => order.orderRole === "STOP_LOSS" && order.side === protectiveSide);
    const take = orders.find((order) => order.orderRole === "TAKE_PROFIT" && order.side === protectiveSide);
    const qtyMatches = [stop, take].filter(Boolean).every((order) => order ? Math.abs(order.qty - position.volume) <= Math.max(0.0000001, position.volume * 0.001) : false);
    return { hasStopLoss: Boolean(stop), hasTakeProfit: Boolean(take), qtyMatches, sideMatches: Boolean(stop && take), triggerPriceMatches: Boolean(stop?.triggerPrice && take?.triggerPrice), raw: { orderCount: orders.length, stop, take } };
  }

  private async fetchLatestExecution(credentials: ExchangeSecretPayload, symbol: string, orderId: string): Promise<{ price: number; qty: number } | null> {
    const raw = await this.signedRequest<BybitExecutionResult>(credentials, "GET", "/v5/execution/list", new URLSearchParams({ category: "linear", symbol, orderId, limit: "5" }));
    const execution = raw.list?.find((item) => item.orderId === orderId) ?? raw.list?.[0];
    const price = toFiniteNumber(execution?.execPrice);
    const qty = toFiniteNumber(execution?.execQty);
    return price && qty ? { price, qty } : null;
  }

  private async signedRequest<T>(credentials: ExchangeSecretPayload, method: "GET" | "POST" | "GET_PUBLIC", path: string, query: URLSearchParams, body?: Record<string, unknown>): Promise<T> {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const bodyText = body ? JSON.stringify(body) : "";
    const queryText = query.toString();
    const publicMethod = method === "GET_PUBLIC";
    const httpMethod = publicMethod ? "GET" : method;
    const signaturePayload = `${timestamp}${credentials.apiKey}${recvWindow}${httpMethod === "GET" ? queryText : bodyText}`;
    const signature = createHmac("sha256", credentials.apiSecret).update(signaturePayload).digest("hex");
    const url = new URL(`${path}${queryText ? `?${queryText}` : ""}`, this.baseUrl);
    const headers = publicMethod ? { "Content-Type": "application/json" } : {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": credentials.apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature
    };
    const envelope = await fetchJson<BybitResponse<T>>(url, this.timeoutMs, {
      method: httpMethod,
      headers,
      ...(body ? { body: bodyText } : {})
    });
    if (envelope.retCode !== 0 || envelope.result === undefined) {
      throw new Error(`Bybit ${path} rejected: ${envelope.retMsg ?? "Unknown API response"}`);
    }
    return envelope.result;
  }
}

async function fetchJson<T>(url: URL, timeoutMs: number, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${url.pathname} failed with ${response.status}: ${body.slice(0, 500)}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function symbolToPair(symbol: string): string {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function toFiniteNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
