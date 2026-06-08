"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { AdapterStatus } from "@ma-core/shared";
import { fetchAdapterStatuses } from "../lib/api";
import { GlassCard } from "./GlassCard";

export function MarketAdapterStatus() {
  const [items, setItems] = useState<AdapterStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const result = await fetchAdapterStatuses();
      setLoading(false);
      if (result.error) { setError(result.error); return; }
      setError(null);
      setItems(result.data ?? []);
    };
    void load();
    const interval = setInterval(() => { void load(); }, 10_000);
    return () => { clearInterval(interval); };
  }, []);

  return (
    <GlassCard className="p-5">
      <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/60">Market Adapter Status</p>
      <h2 className="mt-1 text-xl font-semibold">Exchange-grade диагностика</h2>
      {loading ? <div className="mt-4 h-20 animate-pulse rounded-2xl bg-white/5" /> : null}
      {error ? <p className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
      <div className="mt-4 grid gap-3">
        {items.length === 0 && !loading ? <p className="text-sm text-white/50">Адаптеры активируются после первого market cycle.</p> : null}
        {items.map((item) => (
          <motion.div key={`${item.exchange}:${item.pair}`} layout className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">{item.exchange} · {item.pair}</p><p className="text-xs text-white/45">last ws: {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleTimeString("ru-RU") : "—"}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs ${item.connected && !item.stale ? "bg-emerald-400/10 text-emerald-100" : item.reconnecting ? "bg-amber-400/10 text-amber-100" : "bg-rose-400/10 text-rose-100"}`}>{item.connected && !item.stale ? "online" : item.reconnecting ? "reconnecting" : "stale"}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/55">
              <span>reconnects: {item.reconnectAttempts}</span>
              <span>missing: {item.missingFields.length ? item.missingFields.join(", ") : "none"}</span>
            </div>
            {item.errorReason ? <p className="mt-2 text-xs text-rose-100/80">{item.errorReason}</p> : null}
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}
