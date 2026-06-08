import type { ReactNode } from "react";

export function GlassCard({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.055] shadow-glow backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}
