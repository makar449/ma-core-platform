"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { TradeSignal } from "@ma-core/shared";
import { fetchSignals, triggerMarketAnalysis } from "../lib/api";
import { GlassCard } from "./GlassCard";

export function SignalTerminal({ csrfToken }: Readonly<{ csrfToken: string | null }>) {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const result = await fetchSignals();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSignals(result.data ?? []);
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 12_000);
    return () => { clearInterval(interval); };
  }, []);

  const runAnalysis = async (): Promise<void> => {
    setMutating(true);
    const optimistic: TradeSignal = {
      id: `optimistic_${Date.now()}`,
      transactionId: "pending_tx",
      pair: "BTC/USDT",
      action: "NO_TRADE",
      leverage: 1,
      strategySource: "Local optimistic UI",
      strategyId: "pending_strategy",
      confidenceScore: 0,
      rationale: "Анализ запущен. Терминал обновится после прохождения Agent 1 → Agent 2.",
      technicalIndicators: { rsi5m: 0, fundingRate: 0, orderbookImbalance: 0 },
      createdAt: new Date().toISOString()
    };
    setSignals((current) => [optimistic, ...current]);
    const result = await triggerMarketAnalysis(csrfToken);
    setMutating(false);
    if (result.error) {
      setSignals((current) => current.filter((signal) => signal.id !== optimistic.id));
      setError(result.error);
      return;
    }
    setError(null);
    setTimeout(() => { void refresh(); }, 1500);
  };

  return (
    <GlassCard className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-fuchsia-200/60">Signal Terminal</p>
          <h2 className="mt-1 text-xl font-semibold">Сигналы до риск-валидации</h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { void runAnalysis(); }}
          disabled={mutating}
          className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50 transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutating ? "Запуск" : "Run cycle"}
        </motion.button>
      </div>
      {error && <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      {loading ? <p className="text-sm text-white/55">Загрузка сигналов</p> : null}
      <div className="space-y-3">
        {signals.map((signal) => (
          <motion.div
            key={signal.id}
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/10 bg-black/25 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{signal.pair}</div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">{signal.action} · {signal.leverage}x</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/70">{signal.rationale}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/55">
              <span>RSI 5m: {signal.technicalIndicators.rsi5m}</span>
              <span>Funding: {signal.technicalIndicators.fundingRate}</span>
              <span>Confidence: {Math.round(signal.confidenceScore * 100)}%</span>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}
