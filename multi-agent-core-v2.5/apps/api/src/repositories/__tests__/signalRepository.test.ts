import { describe, expect, it } from "vitest";
import { SignalRepository } from "../signalRepository.js";
import type { QueryParams } from "../../infrastructure/db.js";

class FakeDb {
  public readonly calls: { sql: string; params: QueryParams }[] = [];
  public async query(sql: string, params: QueryParams = []): Promise<{ rows: Record<string, unknown>[] }> {
    this.calls.push({ sql, params });
    if (sql.includes("SELECT")) {
      return { rows: [{ id: "sig_test_123", transaction_id: "tx_test_123", user_id: params[0], pair: "BTC/USDT", action: "LONG", leverage: 2, strategy_source: "INTERNAL", strategy_id: "str_test_123", confidence_score: 0.7, rationale: "Owned signal returned only for requesting user.", technical_indicators: { rsi5m: 31, fundingRate: 0, orderbookImbalance: 0 }, created_at: new Date().toISOString() }] };
    }
    return { rows: [] };
  }
}

describe("SignalRepository", () => {
  it("writes and reads signals scoped by user id", async () => {
    const db = new FakeDb();
    const repository = new SignalRepository(db as never);
    await repository.insert({ id: "sig_test_123", transactionId: "tx_test_123", userId: "00000000-0000-4000-8000-000000000001", pair: "BTC/USDT", action: "LONG", leverage: 2, strategySource: "INTERNAL", strategyId: "str_test_123", confidenceScore: 0.7, rationale: "Owned signal returned only for requesting user.", technicalIndicators: { rsi5m: 31, fundingRate: 0, orderbookImbalance: 0 }, createdAt: new Date().toISOString() }, "00000000-0000-4000-8000-000000000001");
    const rows = await repository.listRecentForUser("00000000-0000-4000-8000-000000000001", 10);
    expect(db.calls[0]?.params[2]).toBe("00000000-0000-4000-8000-000000000001");
    expect(db.calls[1]?.params[0]).toBe("00000000-0000-4000-8000-000000000001");
    expect(rows[0]?.userId).toBe("00000000-0000-4000-8000-000000000001");
  });
});
