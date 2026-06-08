"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { LockKeyhole, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Panel, PremiumButton } from "./console/VisualPrimitives";

const PasswordSchema = z.string().min(12, "Пароль должен содержать минимум 12 символов").regex(/[a-z]/, "Нужна строчная буква").regex(/[A-Z]/, "Нужна заглавная буква").regex(/[0-9]/, "Нужна цифра").regex(/[^a-zA-Z0-9]/, "Нужен спецсимвол");
const LoginSchema = z.object({ email: z.string().email("Email имеет неверный формат"), password: z.string().min(1, "Введите пароль") });
const RegisterSchema = z.object({ email: z.string().email("Email имеет неверный формат"), password: PasswordSchema, registrationToken: z.string().optional() });

export function AuthPanel({ loading, error, onSignIn, onRegister }: Readonly<{ loading: boolean; error: string | null; onSignIn(input: { email: string; password: string }): Promise<void>; onRegister(input: { email: string; password: string; registrationToken?: string }): Promise<void> }>) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationToken, setRegistrationToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setLocalError(null);
    if (mode === "login") {
      const parsed = LoginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setLocalError(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
        return;
      }
      await onSignIn(parsed.data);
      return;
    }
    const parsed = RegisterSchema.safeParse({ email, password, registrationToken: registrationToken || undefined });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
      return;
    }
    await onRegister(parsed.data);
  };

  return (
    <Panel className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/70">Secure Operator Login</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Institutional console access</h2>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"><ShieldCheck className="h-5 w-5" /></div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
        <button data-testid="auth-mode-login" onClick={() => setMode("login")} className={`rounded-xl px-4 py-3 text-sm transition ${mode === "login" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-white"}`}>Sign in</button>
        <button data-testid="auth-mode-register" onClick={() => setMode("register")} className={`rounded-xl px-4 py-3 text-sm transition ${mode === "register" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-white"}`}>Register</button>
      </div>
      <div className="space-y-3">
        <label className="block"><span className="mb-2 flex items-center gap-2 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" />Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/35" data-testid="auth-email" placeholder="operator@fund.com" autoComplete="email" /></label>
        <label className="block"><span className="mb-2 flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/35" data-testid="auth-password" placeholder="Minimum 12 chars" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {mode === "register" ? <label className="block"><span className="mb-2 flex items-center gap-2 text-xs text-slate-500"><UserPlus className="h-3.5 w-3.5" />Registration token</span><input value={registrationToken} onChange={(event) => setRegistrationToken(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/35" data-testid="auth-registration-token" placeholder="Optional invite token" autoComplete="off" /></label> : null}
      </div>
      {(localError || error) ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">{localError ?? error}</div> : null}
      <motion.div className="mt-5" initial={false} animate={{ opacity: loading ? 0.7 : 1 }}>
        <PremiumButton className="w-full py-3" tone="purple" disabled={loading} onClick={() => { void submit(); }}>{loading ? "Authorizing" : mode === "login" ? "Enter Console" : "Create Secure Account"}</PremiumButton>
      </motion.div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">HttpOnly</div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">SameSite</div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">CSRF</div>
      </div>
    </Panel>
  );
}
