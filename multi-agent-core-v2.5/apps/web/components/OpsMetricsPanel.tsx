"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { fetchOpsMetrics, type MetricSnapshot } from "../lib/api";
import { GlassCard } from "./GlassCard";

export function OpsMetricsPanel({ enabled }: { enabled: boolean }) {
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      const result = await fetchOpsMetrics();
      if (!mounted) return;
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setMetrics(result.data ?? []);
      }
      setIsLoading(false);
      timer = setTimeout(load, 10_000);
    };
    void load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  const highlighted = useMemo(() => metrics.slice(0, 8), [metrics]);
  if (!enabled) return null;

  return (
    <GlassCard className="overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/35">Operator Metrics</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Runtime telemetry</h3>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-cyan-200"><Activity className="h-4 w-4" /></div>
      </div>
      {isLoading && highlighted.length === 0 ? <div className="h-24 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" /> : null}
      {error ? <p className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">{error}</p> : null}
      <div className="grid gap-2">
        {highlighted.map((metric) => (
          <motion.div key={`${metric.name}-${JSON.stringify(metric.labels)}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs text-white/55">{metric.name}</span>
              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white">{metric.value}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-white/35">{Object.entries(metric.labels).map(([key, value]) => `${key}:${value}`).join(" · ") || metric.kind}</p>
          </motion.div>
        ))}
      </div>
      {!isLoading && highlighted.length === 0 && !error ? <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">Метрики появятся после первых API-запросов.</p> : null}
    </GlassCard>
  );
}
