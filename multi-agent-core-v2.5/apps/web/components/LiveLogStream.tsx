"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentEnvelope } from "@ma-core/shared";
import { GlassCard } from "./GlassCard";

const channels = ["all", "agent.market.vector", "agent.strategy.signal", "agent.strategy.feed", "agent.live.log", "security.audit"] as const;

export function LiveLogStream({ events }: Readonly<{ events: AgentEnvelope[] }>) {
  const [channel, setChannel] = useState<(typeof channels)[number]>("all");
  const [agent, setAgent] = useState("all");
  const agents = useMemo(() => ["all", ...Array.from(new Set(events.map((event) => event.sender_agent)))], [events]);
  const filtered = useMemo(() => events.filter((event) => (channel === "all" || event.channel === channel) && (agent === "all" || event.sender_agent === agent)), [agent, channel, events]);
  return (
    <GlassCard className="h-[620px] overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/60">Live Log Stream</p>
          <h2 className="mt-1 text-xl font-semibold">Мыслительный процесс агентов</h2>
        </div>
        <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">{filtered.length}/{events.length} events</span>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <select value={channel} onChange={(event) => { setChannel(event.target.value as (typeof channels)[number]); }} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none">
          {channels.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={agent} onChange={(event) => { setAgent(event.target.value); }} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none">
          {agents.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="h-[500px] space-y-3 overflow-auto pr-2">
        {filtered.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Событий по выбранным фильтрам пока нет.</div> : null}
        <AnimatePresence initial={false}>
          {filtered.map((event) => (
            <motion.div key={`${event.idempotency_key}-${event.timestamp}-${event.channel}`} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.22 }} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-4 text-xs text-white/45"><span>{event.sender_agent}</span><span>{new Date(event.timestamp).toLocaleTimeString("ru-RU")}</span></div>
              <p className="mt-2 text-sm leading-6 text-white/80">{event.agent_log}</p>
              <p className="mt-2 text-[11px] text-cyan-200/55">{event.channel} · {event.pipeline_stage} · {event.transaction_id}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
