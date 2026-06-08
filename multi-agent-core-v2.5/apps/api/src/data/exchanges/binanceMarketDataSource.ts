import WebSocket, { type RawData } from "ws";
import type { AdapterStatus, Exchange, MarketSnapshot, Timeframe } from "@ma-core/shared";
import type { AppConfig } from "../../config.js";
import { logger } from "../../infrastructure/logger.js";
import { buildSnapshotFromState, emptyCloses, fetchJsonWithTimeout, normalizePairForSymbol, pushClose, round, statusFromState, toNumber, TokenBucketRateLimiter, type PairStreamState } from "../marketDataSource.js";

export interface BinanceCombinedMessage { stream?: string; data?: unknown }
export interface BinanceTickerMessage { e?: string; c?: string; v?: string; q?: string }
export interface BinanceDepthMessage { e?: string; bids?: readonly [string, string][]; asks?: readonly [string, string][]; b?: readonly [string, string][]; a?: readonly [string, string][] }
export interface BinanceKlineMessage { e?: string; k?: { i?: string; c?: string; x?: boolean } }
export interface BinanceForceOrderMessage { e?: string; o?: { S?: string; p?: string; q?: string; T?: number } }
interface BinancePremiumIndexResponse { lastFundingRate?: string }
interface BinanceOpenInterestResponse { openInterest?: string }
interface BinanceTickerRestResponse { lastPrice?: string; volume?: string; quoteVolume?: string }
interface BinanceDepthRestResponse { bids?: readonly [string, string][]; asks?: readonly [string, string][] }
interface BinanceKlineRow extends Array<string | number> { 4: string }
interface LiquidationPoint { ts: number; notional: number }

type StateUpdate = Partial<Omit<PairStreamState, "exchange" | "pair">>;

export class BinanceRealtimeMarketDataSource {
  private readonly states = new Map<string, PairStreamState>();
  private readonly sockets = new Map<string, WebSocket>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly restRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly liquidations = new Map<string, LiquidationPoint[]>();
  private readonly limiter: TokenBucketRateLimiter;

  public constructor(private readonly config: AppConfig) {
    this.limiter = new TokenBucketRateLimiter(config.EXCHANGE_REST_RATE_LIMIT_PER_MINUTE, config.EXCHANGE_REST_RATE_LIMIT_PER_MINUTE);
  }

  public async getSnapshot(exchange: Exchange, pair: string): Promise<MarketSnapshot> {
    if (exchange !== "BINANCE") {
      throw new Error(`Binance source cannot serve ${exchange}`);
    }
    this.ensureStreaming(pair);
    const symbol = normalizePairForSymbol(pair);
    await this.refreshRestBackfill(pair, symbol);
    const state = this.states.get(pair);
    if (!state) {
      throw new Error(`Binance ${pair} snapshot is not initialized`);
    }
    return buildSnapshotFromState(state, state.missing.length > 0 ? "MIXED" : "WEBSOCKET");
  }

  public getStatuses(): AdapterStatus[] {
    return [...this.states.values()].map(statusFromState);
  }

  public async close(): Promise<void> {
    for (const timer of this.restRefreshTimers.values()) clearInterval(timer);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    for (const socket of this.sockets.values()) socket.close(1000, "shutdown");
    this.restRefreshTimers.clear();
    this.reconnectTimers.clear();
    this.sockets.clear();
  }

  private ensureStreaming(pair: string): void {
    if (this.sockets.has(pair)) return;
    const symbol = normalizePairForSymbol(pair).toLowerCase();
    const streams = [`${symbol}@ticker`, `${symbol}@depth20@100ms`, `${symbol}@kline_1m`, `${symbol}@kline_5m`, `${symbol}@kline_15m`, `${symbol}@kline_1h`, `${symbol}@forceOrder`].join("/");
    const url = new URL(this.config.BINANCE_FUTURES_WS_URL);
    url.searchParams.set("streams", streams);
    const socket = new WebSocket(url.toString());
    this.sockets.set(pair, socket);
    this.mergeState(pair, { reconnecting: false, connected: false, errorReason: undefined });
    socket.on("open", () => this.mergeState(pair, { connected: true, reconnecting: false, errorReason: undefined, reconnectAttempts: 0 }));
    socket.on("message", (message) => this.handleSocketMessage(pair, message));
    socket.on("error", (error) => {
      this.mergeState(pair, { errorReason: error.message });
      logger.warn({ err: error, pair }, "Binance market websocket error");
    });
    socket.on("close", () => {
      this.sockets.delete(pair);
      this.mergeState(pair, { connected: false, reconnecting: true });
      this.scheduleReconnect(pair);
    });
    if (!this.restRefreshTimers.has(pair)) {
      const timer = setInterval(() => {
        this.refreshRestBackfill(pair, normalizePairForSymbol(pair)).catch((error: unknown) => {
          this.mergeState(pair, { errorReason: error instanceof Error ? error.message : "Binance REST refresh failed" });
          logger.warn({ err: error, pair }, "Binance REST market refresh failed");
        });
      }, 30_000);
      this.restRefreshTimers.set(pair, timer);
    }
  }

  private scheduleReconnect(pair: string): void {
    const current = this.ensureState(pair);
    const attempts = current.reconnectAttempts + 1;
    this.mergeState(pair, { reconnectAttempts: attempts, reconnecting: true });
    const delayMs = Math.min(30_000, 500 * 2 ** Math.min(attempts, 6));
    const existing = this.reconnectTimers.get(pair);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(pair);
      if (!this.sockets.has(pair)) this.ensureStreaming(pair);
    }, delayMs);
    this.reconnectTimers.set(pair, timer);
  }

  private handleSocketMessage(pair: string, message: RawData): void {
    try {
      const parsed = JSON.parse(message.toString("utf8")) as BinanceCombinedMessage;
      const data = parsed.data;
      if (!data || typeof data !== "object") return;
      const eventType = (data as { e?: unknown }).e;
      if (eventType === "24hrTicker") this.applyTicker(pair, data as BinanceTickerMessage);
      if (eventType === "depthUpdate") this.applyDepth(pair, data as BinanceDepthMessage);
      if (eventType === "kline") this.applyKline(pair, data as BinanceKlineMessage);
      if (eventType === "forceOrder") this.applyForceOrder(pair, data as BinanceForceOrderMessage);
      this.mergeState(pair, { lastMessageAt: Date.now(), updatedAt: Date.now(), connected: true, reconnecting: false, reconnectAttempts: 0, errorReason: undefined });
    } catch (error) {
      this.mergeState(pair, { errorReason: error instanceof Error ? error.message : "Binance message parse failed" });
      logger.warn({ err: error, pair }, "Failed to parse Binance websocket message");
    }
  }

  public applyTicker(pair: string, message: BinanceTickerMessage): void {
    this.mergeState(pair, { price: toNumber(message.c), volume24h: toNumber(message.q) ?? toNumber(message.v), missing: [] });
  }

  public applyDepth(pair: string, message: BinanceDepthMessage): void {
    const bids = message.bids ?? message.b ?? [];
    const asks = message.asks ?? message.a ?? [];
    const { spreadBps, orderbookImbalance } = calculateOrderbook(bids, asks);
    this.mergeState(pair, { spreadBps, orderbookImbalance, missing: [] });
  }

  public applyKline(pair: string, message: BinanceKlineMessage): void {
    const interval = this.mapInterval(message.k?.i);
    const close = toNumber(message.k?.c);
    if (!interval || close === undefined) return;
    const current = this.ensureState(pair);
    this.mergeState(pair, { closes: { ...current.closes, [interval]: pushClose(current.closes[interval] ?? [], close) }, price: close, missing: [] });
  }

  public applyForceOrder(pair: string, message: BinanceForceOrderMessage): void {
    const price = toNumber(message.o?.p) ?? 0;
    const quantity = toNumber(message.o?.q) ?? 0;
    const ts = message.o?.T ?? Date.now();
    const queue = [...(this.liquidations.get(pair) ?? []), { ts, notional: price * quantity }].filter((item) => Date.now() - item.ts <= 3_600_000);
    this.liquidations.set(pair, queue);
    this.mergeState(pair, { liquidations1h: round(queue.reduce((sum, item) => sum + item.notional, 0), 2), missing: [] });
  }

  private async refreshRestBackfill(pair: string, symbol: string): Promise<void> {
    const [ticker, depth, premium, openInterest, klines] = await Promise.allSettled([
      this.fetchJson<BinanceTickerRestResponse>(this.config.BINANCE_FUTURES_BASE_URL, `/fapi/v1/ticker/24hr?symbol=${symbol}`),
      this.fetchJson<BinanceDepthRestResponse>(this.config.BINANCE_FUTURES_BASE_URL, `/fapi/v1/depth?symbol=${symbol}&limit=100`),
      this.fetchJson<BinancePremiumIndexResponse>(this.config.BINANCE_FUTURES_BASE_URL, `/fapi/v1/premiumIndex?symbol=${symbol}`),
      this.fetchJson<BinanceOpenInterestResponse>(this.config.BINANCE_FUTURES_BASE_URL, `/fapi/v1/openInterest?symbol=${symbol}`),
      this.fetchKlines(symbol)
    ]);
    const missing: string[] = [];
    if (ticker.status === "fulfilled") this.mergeState(pair, { price: toNumber(ticker.value.lastPrice), volume24h: toNumber(ticker.value.quoteVolume) ?? toNumber(ticker.value.volume), missing: [] }); else missing.push("ticker");
    if (depth.status === "fulfilled") this.applyDepth(pair, { e: "depthUpdate", bids: depth.value.bids ?? [], asks: depth.value.asks ?? [] }); else missing.push("orderbook");
    if (premium.status === "fulfilled") this.mergeState(pair, { fundingRate: toNumber(premium.value.lastFundingRate), missing: [] }); else missing.push("fundingRate");
    if (openInterest.status === "fulfilled") this.mergeState(pair, { openInterest: toNumber(openInterest.value.openInterest), missing: [] }); else missing.push("openInterest");
    if (klines.status === "fulfilled") this.mergeState(pair, { closes: klines.value, missing: [] }); else missing.push("klines");
    const current = this.ensureState(pair);
    this.mergeState(pair, { missing: [...new Set(missing)], lastRestBackfillAt: Date.now(), updatedAt: current.updatedAt });
  }

  private async fetchKlines(symbol: string): Promise<Partial<Record<Timeframe, number[]>>> {
    const result: Partial<Record<Timeframe, number[]>> = {};
    await Promise.all(["1m", "5m", "15m", "1h"].map(async (interval) => {
      const rows = await this.fetchJson<BinanceKlineRow[]>(this.config.BINANCE_FUTURES_BASE_URL, `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=240`);
      result[interval as Timeframe] = rows.map((row) => Number(row[4])).filter((value) => Number.isFinite(value));
    }));
    return result;
  }

  private async fetchJson<T>(baseUrl: string, pathWithQuery: string): Promise<T> {
    await this.limiter.removeToken();
    return fetchJsonWithTimeout<T>(new URL(pathWithQuery, baseUrl), this.config.EXCHANGE_REST_TIMEOUT_MS);
  }

  private mapInterval(interval?: string): Timeframe | null {
    return interval === "1m" || interval === "5m" || interval === "15m" || interval === "1h" ? interval : null;
  }

  private ensureState(pair: string): PairStreamState {
    const current = this.states.get(pair);
    if (current) return current;
    const created: PairStreamState = { exchange: "BINANCE", pair, closes: emptyCloses(), updatedAt: Date.now(), connected: false, reconnecting: false, reconnectAttempts: 0, missing: ["ticker", "orderbook", "fundingRate", "openInterest", "klines"] };
    this.states.set(pair, created);
    return created;
  }

  private mergeState(pair: string, update: StateUpdate): void {
    const current = this.ensureState(pair);
    this.states.set(pair, { ...current, ...update, closes: update.closes ?? current.closes, missing: update.missing ?? current.missing, updatedAt: update.updatedAt ?? Date.now() });
  }
}

export function calculateOrderbook(bids: readonly [string, string][], asks: readonly [string, string][]): { spreadBps?: number | undefined; orderbookImbalance?: number | undefined } {
  const bestBid = toNumber(bids[0]?.[0]);
  const bestAsk = toNumber(asks[0]?.[0]);
  const bidQty = bids.reduce((sum, level) => sum + (toNumber(level[1]) ?? 0), 0);
  const askQty = asks.reduce((sum, level) => sum + (toNumber(level[1]) ?? 0), 0);
  const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
  const spreadBps = bestBid && bestAsk && midpoint ? ((bestAsk - bestBid) / midpoint) * 10_000 : undefined;
  const denominator = bidQty + askQty;
  const orderbookImbalance = denominator > 0 ? (bidQty - askQty) / denominator : undefined;
  return { spreadBps, orderbookImbalance };
}
