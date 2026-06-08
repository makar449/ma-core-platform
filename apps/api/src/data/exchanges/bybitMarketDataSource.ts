import WebSocket, { type RawData } from "ws";
import type { AdapterStatus, Exchange, MarketSnapshot, Timeframe } from "@ma-core/shared";
import type { AppConfig } from "../../config.js";
import { logger } from "../../infrastructure/logger.js";
import { buildSnapshotFromState, emptyCloses, fetchJsonWithTimeout, normalizePairForSymbol, pushClose, round, statusFromState, toNumber, TokenBucketRateLimiter, type PairStreamState } from "../marketDataSource.js";
import { calculateOrderbook } from "./binanceMarketDataSource.js";

interface BybitSocketMessage { topic?: string; type?: "snapshot" | "delta"; data?: unknown }
interface BybitTickerData { lastPrice?: string; turnover24h?: string; volume24h?: string; fundingRate?: string; openInterest?: string }
interface BybitOrderbookData { b?: readonly [string, string][]; a?: readonly [string, string][] }
interface BybitKlineData { interval?: string; close?: string }
interface BybitLiquidationData { price?: string; size?: string; updatedTime?: string }
interface BybitRestResponse<T> { retCode?: number; retMsg?: string; result?: T }
interface BybitListResult<T> { list?: T[] }
interface BybitTickerRestItem extends BybitTickerData {}
interface BybitOrderbookRestResult extends BybitOrderbookData {}
interface BybitKlineRestRow extends Array<string> { 4: string }
interface LiquidationPoint { ts: number; notional: number }

type StateUpdate = Partial<Omit<PairStreamState, "exchange" | "pair">>;

export class BybitRealtimeMarketDataSource {
  private readonly states = new Map<string, PairStreamState>();
  private readonly sockets = new Map<string, WebSocket>();
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly restRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly orderbooks = new Map<string, { bids: Map<string, string>; asks: Map<string, string> }>();
  private readonly liquidations = new Map<string, LiquidationPoint[]>();
  private readonly limiter: TokenBucketRateLimiter;

  public constructor(private readonly config: AppConfig) {
    this.limiter = new TokenBucketRateLimiter(config.EXCHANGE_REST_RATE_LIMIT_PER_MINUTE, config.EXCHANGE_REST_RATE_LIMIT_PER_MINUTE);
  }

  public async getSnapshot(exchange: Exchange, pair: string): Promise<MarketSnapshot> {
    if (exchange !== "BYBIT") throw new Error(`Bybit source cannot serve ${exchange}`);
    this.ensureStreaming(pair);
    await this.refreshRestBackfill(pair, normalizePairForSymbol(pair));
    const state = this.states.get(pair);
    if (!state) throw new Error(`Bybit ${pair} snapshot is not initialized`);
    return buildSnapshotFromState(state, state.missing.length > 0 ? "MIXED" : "WEBSOCKET");
  }

  public getStatuses(): AdapterStatus[] {
    return [...this.states.values()].map(statusFromState);
  }

  public async close(): Promise<void> {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    for (const timer of this.restRefreshTimers.values()) clearInterval(timer);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    for (const socket of this.sockets.values()) socket.close(1000, "shutdown");
    this.heartbeatTimers.clear();
    this.restRefreshTimers.clear();
    this.reconnectTimers.clear();
    this.sockets.clear();
  }

  private ensureStreaming(pair: string): void {
    if (this.sockets.has(pair)) return;
    const symbol = normalizePairForSymbol(pair);
    const socket = new WebSocket(this.config.BYBIT_LINEAR_WS_URL);
    this.sockets.set(pair, socket);
    this.mergeState(pair, { connected: false, reconnecting: false, errorReason: undefined });
    socket.on("open", () => {
      this.mergeState(pair, { connected: true, reconnecting: false, reconnectAttempts: 0, errorReason: undefined });
      socket.send(JSON.stringify({ op: "subscribe", args: [`tickers.${symbol}`, `orderbook.50.${symbol}`, `kline.1.${symbol}`, `kline.5.${symbol}`, `kline.15.${symbol}`, `kline.60.${symbol}`, `allLiquidation.${symbol}`] }));
      const timer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: "ping" })); }, 20_000);
      this.heartbeatTimers.set(pair, timer);
    });
    socket.on("message", (message) => this.handleSocketMessage(pair, message));
    socket.on("error", (error) => {
      this.mergeState(pair, { errorReason: error.message });
      logger.warn({ err: error, pair }, "Bybit market websocket error");
    });
    socket.on("close", () => {
      this.sockets.delete(pair);
      const heartbeat = this.heartbeatTimers.get(pair);
      if (heartbeat) clearInterval(heartbeat);
      this.heartbeatTimers.delete(pair);
      this.mergeState(pair, { connected: false, reconnecting: true });
      this.scheduleReconnect(pair);
    });
    if (!this.restRefreshTimers.has(pair)) {
      const timer = setInterval(() => {
        this.refreshRestBackfill(pair, normalizePairForSymbol(pair)).catch((error: unknown) => {
          this.mergeState(pair, { errorReason: error instanceof Error ? error.message : "Bybit REST refresh failed" });
          logger.warn({ err: error, pair }, "Bybit REST market refresh failed");
        });
      }, 30_000);
      this.restRefreshTimers.set(pair, timer);
    }
  }

  private scheduleReconnect(pair: string): void {
    const current = this.ensureState(pair);
    const attempts = current.reconnectAttempts + 1;
    this.mergeState(pair, { reconnectAttempts: attempts, reconnecting: true });
    const existing = this.reconnectTimers.get(pair);
    if (existing) clearTimeout(existing);
    const delayMs = Math.min(30_000, 500 * 2 ** Math.min(attempts, 6));
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(pair);
      if (!this.sockets.has(pair)) this.ensureStreaming(pair);
    }, delayMs);
    this.reconnectTimers.set(pair, timer);
  }

  private handleSocketMessage(pair: string, message: RawData): void {
    try {
      const parsed = JSON.parse(message.toString("utf8")) as BybitSocketMessage;
      if (!parsed.topic || !parsed.data) return;
      if (parsed.topic.startsWith("tickers.")) this.applyTicker(pair, parsed.data as BybitTickerData);
      if (parsed.topic.startsWith("orderbook.")) this.applyOrderbook(pair, parsed.data as BybitOrderbookData, parsed.type ?? "delta");
      if (parsed.topic.startsWith("kline.")) for (const row of toArray(parsed.data)) this.applyKline(pair, row as BybitKlineData);
      if (parsed.topic.startsWith("liquidation.") || parsed.topic.startsWith("allLiquidation.")) for (const row of toArray(parsed.data)) this.applyLiquidation(pair, row as BybitLiquidationData);
      this.mergeState(pair, { lastMessageAt: Date.now(), updatedAt: Date.now(), connected: true, reconnecting: false, reconnectAttempts: 0, errorReason: undefined });
    } catch (error) {
      this.mergeState(pair, { errorReason: error instanceof Error ? error.message : "Bybit message parse failed" });
      logger.warn({ err: error, pair }, "Failed to parse Bybit websocket message");
    }
  }

  public applyTicker(pair: string, data: BybitTickerData): void {
    this.mergeState(pair, { price: toNumber(data.lastPrice), volume24h: toNumber(data.turnover24h) ?? toNumber(data.volume24h), fundingRate: toNumber(data.fundingRate), openInterest: toNumber(data.openInterest), missing: [] });
  }

  public applyOrderbook(pair: string, data: BybitOrderbookData, type: "snapshot" | "delta" = "delta"): void {
    const book = this.orderbooks.get(pair) ?? { bids: new Map<string, string>(), asks: new Map<string, string>() };
    if (type === "snapshot") {
      book.bids.clear();
      book.asks.clear();
    }
    applyLevels(book.bids, data.b ?? []);
    applyLevels(book.asks, data.a ?? []);
    this.orderbooks.set(pair, book);
    const bids = topLevels(book.bids, true, 50);
    const asks = topLevels(book.asks, false, 50);
    const { spreadBps, orderbookImbalance } = calculateOrderbook(bids, asks);
    this.mergeState(pair, { spreadBps, orderbookImbalance, missing: [] });
  }

  public applyKline(pair: string, data: BybitKlineData): void {
    const timeframe = this.mapInterval(data.interval);
    const close = toNumber(data.close);
    if (!timeframe || close === undefined) return;
    const current = this.ensureState(pair);
    this.mergeState(pair, { closes: { ...current.closes, [timeframe]: pushClose(current.closes[timeframe] ?? [], close) }, price: close, missing: [] });
  }

  public applyLiquidation(pair: string, data: BybitLiquidationData): void {
    const price = toNumber(data.price) ?? 0;
    const size = toNumber(data.size) ?? 0;
    const ts = toNumber(data.updatedTime) ?? Date.now();
    const queue = [...(this.liquidations.get(pair) ?? []), { ts, notional: price * size }].filter((item) => Date.now() - item.ts <= 3_600_000);
    this.liquidations.set(pair, queue);
    this.mergeState(pair, { liquidations1h: round(queue.reduce((sum, item) => sum + item.notional, 0), 2), missing: [] });
  }

  private async refreshRestBackfill(pair: string, symbol: string): Promise<void> {
    const [ticker, orderbook, klines] = await Promise.allSettled([
      this.fetchBybit<BybitListResult<BybitTickerRestItem>>(`/v5/market/tickers?category=linear&symbol=${symbol}`),
      this.fetchBybit<BybitOrderbookRestResult>(`/v5/market/orderbook?category=linear&symbol=${symbol}&limit=50`),
      this.fetchKlines(symbol)
    ]);
    const missing: string[] = [];
    if (ticker.status === "fulfilled" && ticker.value.list?.[0]) this.applyTicker(pair, ticker.value.list[0]); else missing.push("ticker");
    if (orderbook.status === "fulfilled") this.applyOrderbook(pair, orderbook.value, "snapshot"); else missing.push("orderbook");
    if (klines.status === "fulfilled") this.mergeState(pair, { closes: klines.value, missing: [] }); else missing.push("klines");
    const current = this.ensureState(pair);
    this.mergeState(pair, { missing: [...new Set(missing)], lastRestBackfillAt: Date.now(), updatedAt: current.updatedAt });
  }

  private async fetchKlines(symbol: string): Promise<Partial<Record<Timeframe, number[]>>> {
    const result: Partial<Record<Timeframe, number[]>> = {};
    await Promise.all((["1", "5", "15", "60"] as const).map(async (interval) => {
      const rows = await this.fetchBybit<BybitListResult<BybitKlineRestRow>>(`/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=240`);
      const timeframe = this.mapInterval(interval);
      if (timeframe) result[timeframe] = (rows.list ?? []).map((row) => Number(row[4])).filter((value) => Number.isFinite(value)).reverse();
    }));
    return result;
  }

  private async fetchBybit<T>(pathWithQuery: string): Promise<T> {
    await this.limiter.removeToken();
    const parsed = await fetchJsonWithTimeout<BybitRestResponse<T>>(new URL(pathWithQuery, this.config.BYBIT_BASE_URL), this.config.EXCHANGE_REST_TIMEOUT_MS);
    if (parsed.retCode !== 0 || !parsed.result) throw new Error(`Bybit REST ${pathWithQuery} rejected: ${parsed.retMsg ?? "empty result"}`);
    return parsed.result;
  }

  private mapInterval(interval?: string): Timeframe | null {
    if (interval === "1") return "1m";
    if (interval === "5") return "5m";
    if (interval === "15") return "15m";
    if (interval === "60") return "1h";
    return null;
  }

  private ensureState(pair: string): PairStreamState {
    const current = this.states.get(pair);
    if (current) return current;
    const created: PairStreamState = { exchange: "BYBIT", pair, closes: emptyCloses(), updatedAt: Date.now(), connected: false, reconnecting: false, reconnectAttempts: 0, missing: ["ticker", "orderbook", "klines"] };
    this.states.set(pair, created);
    return created;
  }

  private mergeState(pair: string, update: StateUpdate): void {
    const current = this.ensureState(pair);
    this.states.set(pair, { ...current, ...update, closes: update.closes ?? current.closes, missing: update.missing ?? current.missing, updatedAt: update.updatedAt ?? Date.now() });
  }
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function applyLevels(book: Map<string, string>, levels: readonly [string, string][]): void {
  for (const [price, qty] of levels) {
    if (Number(qty) === 0) book.delete(price);
    else book.set(price, qty);
  }
}

function topLevels(book: Map<string, string>, descending: boolean, limit: number): [string, string][] {
  return [...book.entries()].sort((left, right) => descending ? Number(right[0]) - Number(left[0]) : Number(left[0]) - Number(right[0])).slice(0, limit);
}
