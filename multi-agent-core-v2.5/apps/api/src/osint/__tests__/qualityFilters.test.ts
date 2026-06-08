import { describe, expect, it } from "vitest";
import { reviewTradingText } from "../qualityFilters.js";

describe("OSINT quality filters", () => {
  it("accepts evidence-rich strategy text", () => {
    const review = reviewTradingText("BTC 5m RSI oversold near lower Bollinger, enter long only after reclaim VWAP, stop below invalidation, TP at resistance, RR 2:1");
    expect(review.status).toBe("ACCEPTED");
    expect(review.evidence.aggregate).toBeGreaterThan(0.7);
  });
});
