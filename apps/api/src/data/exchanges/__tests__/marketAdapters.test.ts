import { describe, expect, it } from "vitest";
import { calculateOrderbook } from "../binanceMarketDataSource.js";
import { reviewTradingText } from "../../../osint/qualityFilters.js";

describe("exchange market parsers", () => {
  it("calculates spread and imbalance from orderbook levels", () => {
    const result = calculateOrderbook([["100", "3"], ["99", "1"]], [["101", "1"], ["102", "1"]]);
    expect(result.spreadBps).toBeGreaterThan(99);
    expect(result.orderbookImbalance).toBeGreaterThan(0);
  });

  it("quarantines low-evidence pump text", () => {
    const review = reviewTradingText("guaranteed 100x moon send it now");
    expect(review.status).toBe("REJECTED");
    expect(review.penalty).toBeGreaterThan(0.2);
  });
});
