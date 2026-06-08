"use client";

import { useState } from "react";
import { z } from "zod";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { connectExchange } from "../lib/api";
import { Panel, PremiumButton, StatusDot } from "./console/VisualPrimitives";

const FormSchema = z.object({
  exchange: z.enum(["BINANCE", "BYBIT"]),
  apiKey: z.string().min(8, "API key слишком короткий").max(256, "API key слишком длинный"),
  apiSecret: z.string().min(16, "API secret слишком короткий").max(512, "API secret слишком длинный"),
  passphrase: z.string().max(256, "Passphrase слишком длинный").optional()
});

type Exchange = "BINANCE" | "BYBIT";

export function ApiKeyConnectForm({ csrfToken }: Readonly<{ csrfToken: string | null }>) {
  const [exchange, setExchange] = useState<Exchange>("BINANCE");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const parsed = FormSchema.safeParse({ exchange, apiKey, apiSecret, passphrase: passphrase || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте поля формы");
      setMessage(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage("Validating exchange permissions and encrypting credentials");
    const result = await connectExchange(csrfToken, parsed.data);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setMessage(null);
      return;
    }
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setMessage(result.data?.message ?? "Exchange connected");
  };

  return (
    <Panel className="border-white/0 bg-transparent p-0 shadow-none">
      <div className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-200"><LockKeyhole className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold text-white">Zero-withdrawal credential policy</h3><p className="mt-1 text-xs leading-5 text-slate-500">Read and trade permissions are validated server-side. Withdrawal, transfer, subaccount and broker scopes are rejected before encryption.</p></div></div>
        </div>
        <div className="grid gap-3">
          <label><span className="mb-2 block text-xs text-slate-500">Exchange</span><select value={exchange} onChange={(event) => setExchange(event.target.value as Exchange)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-violet-300/35"><option value="BINANCE">Binance</option><option value="BYBIT">Bybit</option></select></label>
          <label><span className="mb-2 flex items-center gap-2 text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" />API Key</span><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-violet-300/35" placeholder="Exchange API key" autoComplete="off" /></label>
          <label><span className="mb-2 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />API Secret</span><input value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} type="password" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-violet-300/35" placeholder="Exchange API secret" autoComplete="new-password" /></label>
          <label><span className="mb-2 block text-xs text-slate-500">Passphrase</span><input value={passphrase} onChange={(event) => setPassphrase(event.target.value)} type="password" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-violet-300/35" placeholder="Only if the exchange requires it" autoComplete="new-password" /></label>
          <PremiumButton tone="green" disabled={loading} onClick={() => { void submit(); }} className="w-full py-3">{loading ? "Validating" : "Validate & Encrypt"}</PremiumButton>
          {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3"><StatusDot tone="green" label={message} /></div> : null}
          {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </div>
    </Panel>
  );
}
