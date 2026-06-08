import type { RawStrategySource } from "./types.js";

export function seedStrategySources(): RawStrategySource[] {
  return [
    {
      sourceType: "INTERNAL_SEED",
      sourceId: "seed_mean_reversion_rsi_5m",
      sourceTitle: "Mean Reversion RSI 5m",
      text: "If market is sideways and RSI on 5m is oversold below 35 near lower Bollinger Band, open a small LONG scalp to the Bollinger middle with tight invalidation under local support."
    },
    {
      sourceType: "INTERNAL_SEED",
      sourceId: "seed_ema200_breakout_15m",
      sourceTitle: "EMA200 15m Breakout",
      text: "If BTC closes a 15m candle above EMA200 while orderbook imbalance is positive and funding is neutral, LONG toward the nearest resistance level."
    },
    {
      sourceType: "INTERNAL_SEED",
      sourceId: "seed_overbought_short_5m",
      sourceTitle: "Overbought 5m Fade",
      text: "When market is sideways, RSI on 5m is overbought above 70 and price rejects the upper Bollinger Band, SHORT back to the mean."
    },
    {
      sourceType: "INTERNAL_SEED",
      sourceId: "seed_no_trade_high_funding",
      sourceTitle: "High Funding Squeeze Filter",
      text: "If funding is extremely positive and liquidations are elevated, avoid fresh leveraged longs even with bullish momentum until volatility compresses."
    }
  ];
}
