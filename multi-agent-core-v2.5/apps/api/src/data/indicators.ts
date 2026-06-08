import type { TechnicalIndicator } from "@ma-core/shared";

export function ema(values: readonly number[], period: number): number {
  if (values.length === 0) {
    throw new Error("EMA requires at least one value");
  }
  const multiplier = 2 / (period + 1);
  return values.slice(1).reduce((previous, value) => (value - previous) * multiplier + previous, values[0] as number);
}

export function rsi(values: readonly number[], period: number): number {
  if (values.length <= period) {
    throw new Error("RSI requires more values than the selected period");
  }
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const current = values[index] as number;
    const previous = values[index - 1] as number;
    const diff = current - previous;
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }
  if (losses === 0) {
    return 100;
  }
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

export function bollinger(values: readonly number[], period: number): { upper: number; middle: number; lower: number } {
  if (values.length < period) {
    throw new Error("Bollinger Bands require at least period values");
  }
  const slice = values.slice(values.length - period);
  const middle = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const variance = slice.reduce((sum, value) => sum + (value - middle) ** 2, 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  return { upper: middle + 2 * stdDev, middle, lower: middle - 2 * stdDev };
}

export function macd(values: readonly number[]): { macd: number; signal: number } {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = fast - slow;
  const syntheticLine = values.slice(-9).map((value) => line * (value / (values.at(-1) ?? value)));
  return { macd: line, signal: ema(syntheticLine, 9) };
}

export function computeIndicators(values: readonly number[]): TechnicalIndicator {
  const bands = bollinger(values, 20);
  const macdResult = macd(values);
  return {
    rsi: Number(rsi(values, 14).toFixed(2)),
    macd: Number(macdResult.macd.toFixed(2)),
    macdSignal: Number(macdResult.signal.toFixed(2)),
    ema20: Number(ema(values, 20).toFixed(2)),
    ema50: Number(ema(values, 50).toFixed(2)),
    ema200: Number(ema(values, 200).toFixed(2)),
    bollingerUpper: Number(bands.upper.toFixed(2)),
    bollingerMiddle: Number(bands.middle.toFixed(2)),
    bollingerLower: Number(bands.lower.toFixed(2))
  };
}
