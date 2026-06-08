import { describe, expect, it } from "vitest";
import { computeIndicators } from "../indicators.js";

describe("computeIndicators", () => {
  it("produces bounded RSI and ordered Bollinger values", () => {
    const closes = Array.from({ length: 240 }, (_, index) => 100 + Math.sin(index / 7) * 3 + index * 0.02);
    const indicators = computeIndicators(closes);
    expect(indicators.rsi).toBeGreaterThanOrEqual(0);
    expect(indicators.rsi).toBeLessThanOrEqual(100);
    expect(indicators.bollingerUpper).toBeGreaterThan(indicators.bollingerMiddle);
    expect(indicators.bollingerMiddle).toBeGreaterThan(indicators.bollingerLower);
  });
});
