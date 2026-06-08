"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type Tone = "green" | "red" | "purple" | "blue" | "amber" | "neutral";

const toneClass: Record<Tone, string> = {
  green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200 shadow-[0_0_34px_rgba(16,185,129,0.10)]",
  red: "border-rose-400/20 bg-rose-400/10 text-rose-200 shadow-[0_0_34px_rgba(244,63,94,0.10)]",
  purple: "border-violet-400/20 bg-violet-400/10 text-violet-200 shadow-[0_0_34px_rgba(139,92,246,0.12)]",
  blue: "border-sky-400/20 bg-sky-400/10 text-sky-200 shadow-[0_0_34px_rgba(14,165,233,0.10)]",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-200 shadow-[0_0_34px_rgba(245,158,11,0.10)]",
  neutral: "border-white/10 bg-white/[0.045] text-white/70 shadow-[0_0_34px_rgba(255,255,255,0.035)]"
};

export function Panel({ children, className = "", hover = false }: Readonly<{ children: ReactNode; className?: string; hover?: boolean }>) {
  return (
    <motion.section
      layout
      whileHover={hover ? { y: -2, scale: 1.002 } : undefined}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-[18px] border border-white/10 bg-[#0c121d]/82 shadow-[0_18px_70px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {children}
    </motion.section>
  );
}

export function KpiCard({ label, value, change, tone, points, onClick }: Readonly<{ label: string; value: string; change: string; tone: Tone; points: readonly number[]; onClick(): void }>) {
  return (
    <button onClick={onClick} className="group text-left">
      <Panel hover className="h-full p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-slate-400">{label}</p>
            <p className="mt-2 text-[24px] font-semibold tracking-tight text-white">{value}</p>
            <p className={`mt-1 text-xs ${tone === "red" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-emerald-300"}`}>{change}</p>
          </div>
          <Sparkline points={points} tone={tone} className="mt-2 h-12 w-28 opacity-90 transition group-hover:opacity-100" />
        </div>
      </Panel>
    </button>
  );
}

export function PremiumButton({ children, onClick, tone = "neutral", disabled = false, className = "", type = "button" }: Readonly<{ children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; className?: string; type?: "button" | "submit" }>) {
  return (
    <motion.button
      type={type}
      whileHover={disabled ? undefined : { scale: 1.015, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass[tone]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function IconBadge({ icon: Icon, tone = "neutral", label }: Readonly<{ icon: LucideIcon; tone?: Tone; label?: string }>) {
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClass[tone]}`} aria-label={label}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function StatusDot({ tone = "green", label }: Readonly<{ tone?: Tone; label: string }>) {
  const color = tone === "red" ? "bg-rose-400" : tone === "amber" ? "bg-amber-400" : tone === "purple" ? "bg-violet-400" : tone === "blue" ? "bg-sky-400" : "bg-emerald-400";
  return <span className="inline-flex items-center gap-2 text-xs text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${color} shadow-[0_0_18px_currentColor]`} />{label}</span>;
}

export function SectionHeader({ eyebrow, title, action }: Readonly<{ eyebrow: string; title: string; action?: ReactNode }>) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/70">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-semibold tracking-wide text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Sparkline({ points, tone = "green", className = "h-10 w-24" }: Readonly<{ points: readonly number[]; tone?: Tone; className?: string }>) {
  const safe = points.length >= 2 ? points : [0, 1];
  const max = Math.max(...safe);
  const min = Math.min(...safe);
  const range = Math.max(max - min, 1);
  const path = safe.map((point, index) => {
    const x = (index / (safe.length - 1)) * 100;
    const y = 36 - ((point - min) / range) * 32;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const stroke = tone === "red" ? "#fb7185" : tone === "purple" ? "#a78bfa" : tone === "blue" ? "#38bdf8" : tone === "amber" ? "#fbbf24" : "#34d399";
  return (
    <svg viewBox="0 0 100 40" className={className} role="img" aria-label="sparkline">
      <defs>
        <linearGradient id={`sparkline-${tone}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L100,40 L0,40 Z`} fill={`url(#sparkline-${tone})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressRing({ value, tone = "green", size = 48 }: Readonly<{ value: number; tone?: Tone; size?: number }>) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, value));
  const dash = circumference - (normalized / 100) * circumference;
  const stroke = tone === "red" ? "#fb7185" : tone === "purple" ? "#a78bfa" : tone === "blue" ? "#38bdf8" : tone === "amber" ? "#fbbf24" : "#34d399";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`${normalized}%`}>
      <circle cx="24" cy="24" r={radius} stroke="rgba(255,255,255,0.09)" strokeWidth="4" fill="transparent" />
      <circle cx="24" cy="24" r={radius} stroke={stroke} strokeWidth="4" fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dash} transform="rotate(-90 24 24)" />
      <text x="24" y="27" textAnchor="middle" className="fill-white text-[10px] font-semibold">{normalized}</text>
    </svg>
  );
}
