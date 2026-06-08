import type { AdapterStatus, Exchange, MarketSnapshot, Timeframe, TechnicalIndicator } from "@ma-core/shared";
import type { AppConfig } from "../config.js";
import { computeIndicators } from "./indicators.js";
import { BinanceRealtimeMarketDataSource } from "./exchanges/binanceMarketDataSource.js";
import { BybitRealtimeMarketDataSource } from "./exchanges/bybitMarketDataSource.js";

export interface MarketDataSource {
  getSnapshot(exchange: Exchange, pair: string): Promise<MarketSnapshot>;
  getStatuses(): AdapterStatus[];
  close(): Promise<void>;
}

export interface PairStreamState {
  exchange: Exchange;
  pair: string;
  price?: number | undefined;
  spreadBps?: number | undefined;
  orderbookImbalance?: number | undefined;
  volume24h?: number | undefined;
  fundingRate?: number | undefined;
  openInterest?: number | undefined;
  liquidations1h?: number | undefined;
  closes: Partial<Record<Timeframe, number[]>>;
  updatedAt: number;
  lastMessageAt?: number | undefined;
  lastRestBackfillAt?: number | undefined;
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  errorReason?: string | undefined;
  missing: readonly string[];
}

export const timeframes: readonly Timeframe[] = ["1m", "5m", "15m", "1h"];

export function normalizePairForSymbol(pair: string): string {
  return pair.replace("/", "").replace("-", "").toUpperCase();
}

export function buildSnapshotFromState(state: PairStreamState, source: MarketSnapshot["dataQuality"]["source"]): MarketSnapshot {
  const now = Date.now();
  const indicators: Partial<Record<Timeframe, TechnicalIndicator>> = {};
  for (const timeframe of timeframes) {
    const closes = state.closes[timeframe];
    if (closes && closes.length >= 40) {
      indicators[timeframe] = computeIndicators(closes.slice(-240));
    }
  }
  const fallbackPrice = state.price ?? inferPriceFromIndicators(indicators);
  if (!fallbackPrice) {
    throw new Error(`${state.exchange} ${state.pair} snapshot is not ready: price is missing`);
  }
  for (const timeframe of timeframes) {
    if (!indicators[timeframe]) {
      indicators[timeframe] = buildFlatIndicator(fallbackPrice);
    }
  }
  const missing = new Set(state.missing);
  if (state.fundingRate === undefined) {
    missing.add("fundingRate");
  }
  if (state.openInterest === undefined) {
    missing.add("openInterest");
  }
  if (state.liquidations1h === undefined) {
    missing.add("liquidations1h");
  }
  const latencyMs = Math.max(0, now - state.updatedAt);
  const stale = latencyMs > 30_000;
  return {
    exchange: state.exchange,
    pair: state.pair,
    price: round(fallbackPrice, 6),
    spreadBps: round(state.spreadBps ?? 0, 4),
    orderbookImbalance: clamp(round(state.orderbookImbalance ?? 0, 6), -1, 1),
    volume24h: Math.max(0, round(state.volume24h ?? 0, 2)),
    fundingRate: round(state.fundingRate ?? 0, 8),
    openInterest: Math.max(0, round(state.openInterest ?? 0, 2)),
    liquidations1h: Math.max(0, round(state.liquidations1h ?? 0, 2)),
    indicators: indicators as Record<Timeframe, TechnicalIndicator>,
    dataQuality: {
      source: stale ? "STALE" : source,
      latencyMs,
      stale,
      missing: [...missing].slice(0, 24)
    },
    observedAt: new Date().toISOString()
  };
}

export class CompositeMarketDataSource implements MarketDataSource {
  private readonly sources: Record<Exchange, MarketDataSource>;

  public constructor(config: AppConfig) {
    this.sources = {
      BINANCE: new BinanceRealtimeMarketDataSource(config),
      BYBIT: new BybitRealtimeMarketDataSource(config)
    };
  }

  public async getSnapshot(exchange: Exchange, pair: string): Promise<MarketSnapshot> {
    const source = this.sources[exchange];
    if (!source) {
      throw new Error(`Unsupported market source ${exchange}`);
    }
    return source.getSnapshot(exchange, pair);
  }

  public getStatuses(): AdapterStatus[] {
    return Object.values(this.sources).flatMap((source) => source.getStatuses());
  }

  public async close(): Promise<void> {
    await Promise.all(Object.values(this.sources).map((source) => source.close()));
  }
}

export function statusFromState(state: PairStreamState): AdapterStatus {
  const now = Date.now();
  const stale = now - state.updatedAt > 30_000;
  return {
    exchange: state.exchange,
    pair: state.pair,
    connected: state.connected,
    reconnecting: state.reconnecting,
    stale,
    lastMessageAt: state.lastMessageAt ? new Date(state.lastMessageAt).toISOString() : null,
    lastRestBackfillAt: state.lastRestBackfillAt ? new Date(state.lastRestBackfillAt).toISOString() : null,
    missingFields: [...new Set(state.missing)].slice(0, 24),
    errorReason: state.errorReason ?? null,
    reconnectAttempts: state.reconnectAttempts
  };
}

export function pushClose(closes: number[], close: number, maxLength = 260): number[] {
  const next = [...closes, close].slice(-maxLength);
  if (next.length < 40) {
    const fill = Array.from({ length: 40 - next.length }, () => close);
    return [...fill, ...next];
  }
  return next;
}

export function emptyCloses(): Partial<Record<Timeframe, number[]>> {
  return { "1m": [], "5m": [], "15m": [], "1h": [] };
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export async function fetchJsonWithTimeout<T>(url: URL, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${url.pathname} failed with ${response.status}: ${body.slice(0, 240)}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private updatedAt = Date.now();

  public constructor(private readonly capacity: number, private readonly refillPerMinute: number) {
    this.tokens = capacity;
  }

  public async removeToken(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMinutes = (now - this.updatedAt) / 60_000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMinutes * this.refillPerMinute);
    this.updatedAt = now;
  }
}

function inferPriceFromIndicators(indicators: Partial<Record<Timeframe, TechnicalIndicator>>): number | undefined {
  for (const timeframe of timeframes) {
    const indicator = indicators[timeframe];
    if (indicator) {
      return indicator.ema20;
    }
  }
  return undefined;
}

function buildFlatIndicator(price: number): TechnicalIndicator {
  return {
    rsi: 50,
    macd: 0,
    macdSignal: 0,
    ema20: price,
    ema50: price,
    ema200: price,
    bollingerUpper: price,
    bollingerMiddle: price,
    bollingerLower: price
  };
}
