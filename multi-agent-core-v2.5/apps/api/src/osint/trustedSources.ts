export const defaultCryptoSearchTerms: readonly string[] = [
  "BTC trading setup RSI EMA200 scalp",
  "ETH futures setup open interest funding",
  "crypto mean reversion setup Bollinger RSI",
  "bitcoin liquidity sweep setup",
  "altcoin perpetual futures setup risk management"
];

export function splitCsv(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

export function computeFreshnessScore(publishedAt?: string): number {
  if (!publishedAt) {
    return 0.62;
  }
  const ageMs = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0.7;
  }
  const ageHours = ageMs / 3_600_000;
  if (ageHours <= 6) {
    return 1;
  }
  if (ageHours <= 24) {
    return 0.88;
  }
  if (ageHours <= 72) {
    return 0.72;
  }
  return 0.46;
}
