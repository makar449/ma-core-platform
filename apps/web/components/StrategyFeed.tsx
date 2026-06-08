"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { StrategyRule } from "@ma-core/shared";
import { fetchStrategies } from "../lib/api";
import { GlassCard } from "./GlassCard";

export function StrategyFeed() {
  const [strategies, setStrategies] = useState<StrategyRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      const result = await fetchStrategies();
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setStrategies(result.data ?? []);
    };
    void load();
    const interval = setInterval(() => { void load(); }, 20_000);
    return () => { clearInterval(interval); };
  }, []);

  return (
    <GlassCard className="p-5">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.32em] text-emerald-200/60">Strategy Feed</p>
        <h2 className="mt-1 text-xl font-semibold">Деконструированные идеи</h2>
      </div>
      {error && <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
      {loading && strategies.length === 0 ? <p className="text-sm text-white/55">Загрузка стратегий</p> : null}
      <div className="space-y-3">
        {strategies.map((strategy) => (
          <motion.div
            key={strategy.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white/90">{strategy.sourceTitle}</h3>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/50">{strategy.sourceType}</span>
            </div>
            <p className="mt-2 text-sm text-white/65">{strategy.trigger}</p>
            {strategy.sourceUrl ? <a href={strategy.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-200/70 hover:text-cyan-100">Открыть источник</a> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/50">
              <span>{strategy.action}</span>
              <span>{strategy.timeframe}</span>
              <span>{Math.round(strategy.confidenceScore * 100)}% confidence</span>
              <span>{Math.round(strategy.sourceTrustScore * 100)}% trust</span>
              <span>{Math.round(strategy.freshnessScore * 100)}% freshness</span>
              <span>{Math.round(strategy.evidenceScore.aggregate * 100)}% evidence</span>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}
