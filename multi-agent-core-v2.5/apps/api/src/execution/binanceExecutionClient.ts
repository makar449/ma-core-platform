import { createHmac } from "node:crypto";
import { CalculatedOrderParametersSchema, SymbolTradingRuleSchema, type CalculatedOrderParameters, type Position, type SymbolTradingRule, type TradeDirection } from "@ma-core/shared";
import type { ExchangeSecretPayload } from "../security/vault.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import { fingerprintApiKey } from "../repositories/privateStreamRepository.js";
import type { AccountBalanceSnapshot, ExchangeCloseResult, ExchangeExecutionClient, ExchangeOpenOrderSnapshot, ExchangeOrderPlacementResult, ExchangePositionSnapshot, ProtectiveOrderStatus, TopOfBook } from "./types.js";

interface BinanceAccountAsset {
  asset?: string;
  availableBalance?: string;
  walletBalance?: string;
  unrealizedProfit?: string;
}

interface BinanceAccountResponse {
  assets?: BinanceAccountAsset[];
  totalWalletBalance?: string;
  totalUnrealizedProfit?: string;
  availableBalance?: string;
}

interface BinanceTickerBookResponse {
  bidPrice?: string;
  askPrice?: string;
}

interface BinanceOrderResponse {
  orderId?: number | string;
  avgPrice?: string;
  price?: string;
  executedQty?: string;
  cumQuote?: string;
  clientOrderId?: string;
  status?: string;
}

interface BinanceExchangeInfoResponse {
  symbols?: Array<{
    symbol?: string;
    status?: string;
    quantityPrecision?: number;
    pricePrecision?: number;
    filters?: Array<{ filterType?: string; minQty?: string; maxQty?: string; stepSize?: string; tickSize?: string; notional?: string; minNotional?: string }>;
  }>;
}

interface BinanceIncomeItem {
  incomeType?: string;
  income?: string;
  time?: number;
}

interface BinancePositionResponse {
  symbol?: string;
  positionAmt?: string;
  entryPrice?: string;
  unrealizedProfit?: string;
}

export class BinanceExecutionClient implements ExchangeExecutionClient {
  public readonly exchange = "BINANCE" as const;

  public constructor(private readonly futuresBaseUrl: string, private readonly timeoutMs: number, private readonly privateStreams?: PrivateStreamRepository, private readonly privateStreamStaleAfterMs: number = 45000) {}

  public async getBalance(credentials: ExchangeSecretPayload): Promise<AccountBalanceSnapshot> {
    const raw = await this.signedRequest<BinanceAccountResponse>(credentials, "GET", "/fapi/v2/account", new URLSearchParams());
    const usdt = raw.assets?.find((asset) => asset.asset === "USDT");
    const available = toFiniteNumber(usdt?.availableBalance) ?? toFiniteNumber(raw.availableBalance) ?? 0;
    const wallet = toFiniteNumber(usdt?.walletBalance) ?? toFiniteNumber(raw.totalWalletBalance) ?? available;
    const unrealized = toFiniteNumber(usdt?.unrealizedProfit) ?? toFiniteNumber(raw.totalUnrealizedProfit) ?? 0;
    const realized = await this.getRealizedPnlToday(credentials).catch(() => 0);
    return { availableBalanceUsdt: available, totalEquityUsdt: Math.max(0, wallet + unrealized), realizedPnlToday: realized ?? 0, unrealizedPnlToday: unrealized };
  }

  public async getTopOfBook(pair: string): Promise<TopOfBook> {
    const symbol = normalizeSymbol(pair);
    const url = new URL("/fapi/v1/ticker/bookTicker", this.futuresBaseUrl);
    url.searchParams.set("symbol", symbol);
    const raw = await fetchJson<BinanceTickerBookResponse>(url, this.timeoutMs, undefined);
    const bid = toFiniteNumber(raw.bidPrice);
    const ask = toFiniteNumber(raw.askPrice);
    if (!bid || !ask) {
      throw new Error(`Binance bookTicker for ${symbol} did not include valid bid/ask`);
    }
    return { bid, ask, observedAt: new Date().toISOString() };
  }

  public async getRealizedPnlToday(credentials: ExchangeSecretPayload): Promise<number | null> {
    const start = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const items = await this.signedRequest<BinanceIncomeItem[]>(credentials, "GET", "/fapi/v1/income", new URLSearchParams({ incomeType: "REALIZED_PNL", startTime: String(start), limit: "1000" }));
    return items.reduce((sum, item) => sum + (toFiniteNumber(item.income) ?? 0), 0);
  }

  public async getSymbolRules(_credentials: ExchangeSecretPayload, pair: string): Promise<SymbolTradingRule> {
    const symbol = normalizeSymbol(pair);
    const url = new URL("/fapi/v1/exchangeInfo", this.futuresBaseUrl);
    const raw = await fetchJson<BinanceExchangeInfoResponse>(url, this.timeoutMs, undefined);
    const item = raw.symbols?.find((candidate) => candidate.symbol === symbol);
    if (!item) throw new Error(`Binance symbol rules missing for ${symbol}`);
    const lot = item.filters?.find((filter) => filter.filterType === "LOT_SIZE");
    const price = item.filters?.find((filter) => filter.filterType === "PRICE_FILTER");
    const notional = item.filters?.find((filter) => filter.filterType === "MIN_NOTIONAL" || filter.filterType === "NOTIONAL");
    return SymbolTradingRuleSchema.parse({
      id: `binance_${symbol}`,
      exchange: "BINANCE",
      pair,
      symbol,
      minQty: toFiniteNumber(lot?.minQty) ?? 0.001,
      maxQty: toFiniteNumber(lot?.maxQty) ?? 100000,
      qtyStep: toFiniteNumber(lot?.stepSize) ?? 0.001,
      tickSize: toFiniteNumber(price?.tickSize) ?? 0.01,
      minNotional: toFiniteNumber(notional?.notional) ?? toFiniteNumber(notional?.minNotional) ?? 5,
      maxNotional: null,
      maxLeverage: 20,
      contractSize: 1,
      marginAsset: "USDT",
      status: item.status === "TRADING" ? "TRADING" : "DISABLED",
      reduceOnlySupported: true,
      updatedAt: new Date().toISOString()
    });
  }

  public async hasHealthyPrivateStream(credentials: ExchangeSecretPayload): Promise<boolean> {
    if (!this.privateStreams) return Boolean(this.privateStreams);
    const status = await this.privateStreams.getHealth(this.exchange, fingerprintApiKey(credentials.apiKey), this.privateStreamStaleAfterMs);
    return status?.status === "HEALTHY";
  }

  public async setLeverage(credentials: ExchangeSecretPayload, pair: string, leverage: number, _direction: TradeDirection): Promise<void> {
    const query = new URLSearchParams({ symbol: normalizeSymbol(pair), leverage: String(leverage) });
    await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/leverage", query);
  }

  public async placeBracketOrder(credentials: ExchangeSecretPayload, order: CalculatedOrderParameters): Promise<ExchangeOrderPlacementResult> {
    const parsed = CalculatedOrderParametersSchema.parse(order);
    const symbol = normalizeSymbol(parsed.pair);
    const entrySide = parsed.side === "Buy" ? "BUY" : "SELL";
    const protectiveSide = parsed.side === "Buy" ? "SELL" : "BUY";
    let mainOrder: BinanceOrderResponse | null = null;
    try {
      mainOrder = await this.signedRequest<BinanceOrderResponse>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({
        symbol,
        side: entrySide,
        type: parsed.orderType,
        quantity: String(parsed.qty),
        newOrderRespType: "RESULT"
      }));
      await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({
        symbol,
        side: protectiveSide,
        type: "STOP_MARKET",
        stopPrice: String(parsed.stopLoss),
        closePosition: "true",
        workingType: "MARK_PRICE"
      }));
      await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({
        symbol,
        side: protectiveSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: String(parsed.takeProfit),
        closePosition: "true",
        workingType: "MARK_PRICE"
      }));
      const orderId = String(mainOrder.orderId ?? mainOrder.clientOrderId ?? `binance_${Date.now()}`);
      const executedQty = toFiniteNumber(mainOrder.executedQty) ?? parsed.qty;
      const avgFromQuote = toFiniteNumber(mainOrder.cumQuote) && executedQty > 0 ? Number(mainOrder.cumQuote) / executedQty : undefined;
      const filledPrice = toFiniteNumber(mainOrder.avgPrice) ?? avgFromQuote ?? toFiniteNumber(mainOrder.price);
      if (!filledPrice || filledPrice <= 0) {
        throw new Error(`Binance entry order ${orderId} was submitted but fill price was not confirmed`);
      }
      return { exchangeOrderId: orderId, exchangePositionId: `${symbol}:${orderId}`, filledPrice, filledQty: executedQty, protectionAttached: true, raw: mainOrder as Record<string, unknown> };
    } catch (error) {
      if (mainOrder) {
        await this.rollbackUnprotectedEntry(credentials, symbol, protectiveSide, parsed.qty, error);
      }
      throw error;
    }
  }


  private async rollbackUnprotectedEntry(credentials: ExchangeSecretPayload, symbol: string, protectiveSide: "BUY" | "SELL", quantity: number, originalError: unknown): Promise<void> {
    const cleanupErrors: string[] = [];
    try {
      await this.cancelAllOrders(credentials, symbol);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "failed to cancel open protective orders");
    }
    try {
      await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({
        symbol,
        side: protectiveSide,
        type: "MARKET",
        quantity: String(quantity),
        reduceOnly: "true"
      }));
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "failed to reduce unprotected position");
    }
    if (cleanupErrors.length > 0) {
      const originalMessage = originalError instanceof Error ? originalError.message : "protective order placement failed";
      throw new Error(`Binance protective order placement failed after entry. Original error: ${originalMessage}. Cleanup errors: ${cleanupErrors.join(" | ")}`);
    }
  }

  public async cancelAllOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<Record<string, unknown>> {
    const query = pair ? new URLSearchParams({ symbol: normalizeSymbol(pair) }) : new URLSearchParams();
    return this.signedRequest<Record<string, unknown>>(credentials, "DELETE", "/fapi/v1/allOpenOrders", query);
  }

  public async closeAllPositions(credentials: ExchangeSecretPayload): Promise<ExchangeCloseResult[]> {
    const positions = await this.signedRequest<BinancePositionResponse[]>(credentials, "GET", "/fapi/v2/positionRisk", new URLSearchParams());
    const active = positions.filter((position) => Math.abs(toFiniteNumber(position.positionAmt) ?? 0) > 0);
    const results: ExchangeCloseResult[] = [];
    for (const position of active) {
      const symbol = position.symbol;
      const amount = toFiniteNumber(position.positionAmt);
      if (!symbol || !amount) {
        continue;
      }
      const side = amount > 0 ? "SELL" : "BUY";
      const response = await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({ symbol, side, type: "MARKET", quantity: String(Math.abs(amount)), reduceOnly: "true" }));
      results.push({ exchangePositionId: symbol, realizedPnl: toFiniteNumber(position.unrealizedProfit) ?? null, raw: response });
    }
    return results;
  }

  public async closePosition(credentials: ExchangeSecretPayload, position: Position): Promise<ExchangeCloseResult> {
    const side = position.direction === "LONG" ? "SELL" : "BUY";
    const response = await this.signedRequest<Record<string, unknown>>(credentials, "POST", "/fapi/v1/order", new URLSearchParams({
      symbol: normalizeSymbol(position.pair),
      side,
      type: "MARKET",
      quantity: String(position.volume),
      reduceOnly: "true"
    }));
    return { exchangePositionId: position.exchangePositionId, realizedPnl: null, raw: response };
  }


  public async listExchangePositions(credentials: ExchangeSecretPayload): Promise<ExchangePositionSnapshot[]> {
    const rows = await this.signedRequest<Array<Record<string, unknown>>>(credentials, "GET", "/fapi/v2/positionRisk", new URLSearchParams());
    return rows.flatMap((row) => {
      const amount = toFiniteNumber(row.positionAmt as string | number | undefined) ?? 0;
      if (Math.abs(amount) <= 0) return [];
      const symbol = String(row.symbol ?? "");
      const entry = toFiniteNumber(row.entryPrice as string | number | undefined) ?? 0;
      if (!symbol || entry <= 0) return [];
      return [{
        exchangePositionId: symbol,
        pair: symbolToPair(symbol),
        direction: amount >= 0 ? "LONG" as const : "SHORT" as const,
        volume: Math.abs(amount),
        averageEntryPrice: entry,
        markPrice: toFiniteNumber(row.markPrice as string | number | undefined) ?? null,
        liquidationPrice: toFiniteNumber(row.liquidationPrice as string | number | undefined) ?? null,
        unrealizedPnl: toFiniteNumber(row.unRealizedProfit as string | number | undefined) ?? null,
        raw: row
      }];
    });
  }

  public async listOpenOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<ExchangeOpenOrderSnapshot[]> {
    const query = new URLSearchParams();
    if (pair) query.set("symbol", normalizeSymbol(pair));
    const rows = await this.signedRequest<Array<Record<string, unknown>>>(credentials, "GET", "/fapi/v1/openOrders", query);
    return rows.map((row) => {
      const symbol = String(row.symbol ?? "");
      const type = String(row.type ?? "UNKNOWN");
      const stopPrice = toFiniteNumber(row.stopPrice as string | number | undefined) ?? null;
      return {
        exchangeOrderId: String(row.orderId ?? row.clientOrderId ?? "unknown"),
        pair: symbolToPair(symbol),
        side: String(row.side ?? "UNKNOWN"),
        orderType: type,
        orderRole: type.includes("STOP") ? "STOP_LOSS" : type.includes("TAKE_PROFIT") ? "TAKE_PROFIT" : "UNKNOWN",
        qty: toFiniteNumber(row.origQty as string | number | undefined) ?? 0,
        price: toFiniteNumber(row.price as string | number | undefined) ?? null,
        triggerPrice: stopPrice,
        reduceOnly: String(row.reduceOnly ?? "false") === "true",
        status: String(row.status ?? "UNKNOWN"),
        raw: row
      };
    });
  }

  public async getProtectiveOrderStatus(credentials: ExchangeSecretPayload, position: Position): Promise<ProtectiveOrderStatus> {
    const orders = await this.listOpenOrders(credentials, position.pair);
    const protectiveSide = position.direction === "LONG" ? "SELL" : "BUY";
    const stop = orders.find((order) => order.orderRole === "STOP_LOSS" && order.side === protectiveSide);
    const take = orders.find((order) => order.orderRole === "TAKE_PROFIT" && order.side === protectiveSide);
    const qtyMatches = [stop, take].filter(Boolean).every((order) => order ? Math.abs(order.qty - position.volume) <= Math.max(0.0000001, position.volume * 0.001) : false);
    const triggerPriceMatches = Boolean(stop && take && stop.triggerPrice !== null && take.triggerPrice !== null);
    return { hasStopLoss: Boolean(stop), hasTakeProfit: Boolean(take), qtyMatches, sideMatches: Boolean(stop && take), triggerPriceMatches, raw: { orderCount: orders.length, stop, take } };
  }

  private async signedRequest<T>(credentials: ExchangeSecretPayload, method: "GET" | "POST" | "DELETE", path: string, query: URLSearchParams): Promise<T> {
    query.set("timestamp", Date.now().toString());
    query.set("recvWindow", "5000");
    const signature = createHmac("sha256", credentials.apiSecret).update(query.toString()).digest("hex");
    query.set("signature", signature);
    const url = new URL(`${path}?${query.toString()}`, this.futuresBaseUrl);
    return fetchJson<T>(url, this.timeoutMs, { method, headers: { "X-MBX-APIKEY": credentials.apiKey } });
  }
}

export function normalizeSymbol(pair: string): string {
  return pair.replace("/", "").replace("-", "").toUpperCase();
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
