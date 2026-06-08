export function StatusPill({ active, label }: Readonly<{ active: boolean; label: string }>) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
      <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]" : "bg-rose-400"}`} />
      {label}
    </div>
  );
}
