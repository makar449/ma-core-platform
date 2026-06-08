import { describe, expect, it } from "vitest";
import { DailyRiskStateSchema, ExecutionDecisionSchema, PositionSchema } from "@ma-core/shared";

describe("part 2 hardened schemas", () => {
  it("keeps profit lock separate from emergency halt", () => {
    const state = DailyRiskStateSchema.parse({
      userId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      equityAtStartOfDay: 100000,
      currentEquity: 94000,
      realizedPnLToday: 15000,
      unrealizedPnLToday: -1000,
      drawdownRatio: 0.06,
      profitRatio: 0.15,
      riskLockActive: false,
      profitLockActive: true,
      riskLockUntil: null,
      profitLockUntil: "2026-06-08T23:59:59.999Z",
      systemHealth: "PROFIT_CAP_LOCK",
      isLocked: true,
      lockReason: "PROFIT_CAP_REACHED",
      lockUntil: "2026-06-08T23:59:59.999Z",
      updatedAt: "2026-06-08T12:00:00.000Z"
    });
    expect(state.profitLockActive).toBe(true);
    expect(state.riskLockActive).toBe(false);
    expect(state.drawdownRatio).toBeGreaterThan(0.05);
  });

  it("accepts idempotent timeout close statuses", () => {
    const position = PositionSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      accountId: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      exchange: "BINANCE",
      exchangePositionId: "BTCUSDT:order",
      pair: "BTC/USDT",
      direction: "LONG",
      leverage: 2,
      volume: 0.2,
      entryPrice: 100000,
      stopLossPrice: 99000,
      takeProfitPrice: 103000,
      status: "FORCE_CLOSE_REQUESTED",
      openedAt: "2026-06-08T00:00:00.000Z",
      closedAt: null,
      realizedPnL: null,
      forceCloseRequestedAt: "2026-06-08T03:00:00.000Z",
      createdAt: "2026-06-08T00:00:00.000Z",
      updatedAt: "2026-06-08T03:00:00.000Z"
    });
    expect(position.status).toBe("FORCE_CLOSE_REQUESTED");
  });

  it("requires execution state machine entries to be explicit", () => {
    const decision = ExecutionDecisionSchema.parse({
      id: "exec_test_state_machine",
      transactionId: "tx_test_state_machine",
      userId: "11111111-1111-4111-8111-111111111111",
      exchange: "BYBIT",
      signal: { transactionId: "tx_test_state_machine", timestamp: "2026-06-08T00:00:00.000Z", pair: "BTC/USDT", direction: "LONG", leverage: 2, entryPriceRange: { min: 99000, max: 101000 }, suggestedStopLoss: 98000, suggestedTakeProfit: 103000, confidenceScore: 0.9, strategySource: "unit" },
      status: "REJECTED_BY_SYMBOL_RULES",
      rejectionReason: "Missing symbol rules",
      stateMachine: [{ name: "REJECTED_BY_SYMBOL_RULES", status: "REJECTED", startedAt: "2026-06-08T00:00:00.000Z", finishedAt: "2026-06-08T00:00:00.000Z", latencyMs: 0, message: "Missing symbol rules", metadata: {} }],
      latencyMs: 2,
      createdAt: "2026-06-08T00:00:00.000Z"
    });
    expect(decision.stateMachine).toHaveLength(1);
  });
});
