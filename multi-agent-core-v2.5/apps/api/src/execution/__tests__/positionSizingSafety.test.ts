import { describe, expect, it } from "vitest";
import { calculateOrderParametersWithPreview, isPriceInsideEntryRange, orderbookAgeMs, spreadBps } from "../positionSizing.js";
import type { IncomingSignalPayload, SymbolTradingRule } from "@ma-core/shared";

const signal: IncomingSignalPayload = {
  transactionId: "tx_position_sizing_2026",
  timestamp: "2026-06-08T00:00:00.000Z",
  pair: "BTC/USDT",
  direction: "LONG",
  leverage: 3,
  entryPriceRange: { min: 99000, max: 101000 },
  suggestedStopLoss: 98000,
  suggestedTakeProfit: 104000,
  confidenceScore: 0.9,
  strategySource: "unit-test"
};

const rule: SymbolTradingRule = {
  id: "rule_btc_usdt",
  exchange: "BINANCE",
  pair: "BTC/USDT",
  symbol: "BTCUSDT",
  minQty: 0.001,
  maxQty: 100,
  qtyStep: 0.001,
  tickSize: 0.1,
  minNotional: 10,
  maxNotional: null,
  maxLeverage: 20,
  contractSize: 1,
  marginAsset: "USDT",
  status: "TRADING",
  reduceOnlySupported: true,
  updatedAt: "2026-06-08T00:00:00.000Z"
};

describe("position sizing safety", () => {
  it("keeps net risk below the configured one percent budget after reserves", () => {
    const result = calculateOrderParametersWithPreview({ signal, totalEquityUsdt: 250000, marketPrice: 100000, riskFraction: 0.01, minNotionalUsdt: 10, quantityStep: 0.001, symbolRule: rule });
    expect(result.preview.grossRiskUsdt).toBe(2500);
    expect(result.preview.netRiskUsdt).toBeLessThan(result.preview.grossRiskUsdt);
    expect(result.order.qty).toBeGreaterThan(0);
    expect(result.preview.marginRequiredUsdt).toBeGreaterThan(0);
  });

  it("rejects disabled symbols before order placement", () => {
    expect(() => calculateOrderParametersWithPreview({ signal, totalEquityUsdt: 100000, marketPrice: 100000, riskFraction: 0.01, minNotionalUsdt: 10, quantityStep: 0.001, symbolRule: { ...rule, status: "DISABLED" } })).toThrow(/not in TRADING/iu);
  });

  it("calculates spread and stale orderbook guards deterministically", () => {
    expect(spreadBps(99, 101)).toBeCloseTo(200, 0);
    expect(orderbookAgeMs("2026-06-08T00:00:00.000Z", new Date("2026-06-08T00:00:03.000Z"))).toBe(3000);
    expect(isPriceInsideEntryRange(signal, 100000)).toBe(true);
    expect(isPriceInsideEntryRange(signal, 101500)).toBe(false);
  });
});
