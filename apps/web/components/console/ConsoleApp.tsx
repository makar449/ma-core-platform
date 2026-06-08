"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, Command, ExternalLink, Globe2, LogOut, Search, UserCircle2, X } from "lucide-react";
import { AuthPanel } from "../AuthPanel";
import { useSession } from "../../hooks/useSession";
import { useLiveEvents } from "../../hooks/useLiveEvents";
import { useConsoleData } from "../../hooks/useConsoleData";
import { commandActions, navigationItems, type ConsoleViewId } from "../../lib/consoleData";
import { demoEnvironmentLabel, demoModeEnabled } from "../../lib/deployMode";
import type { DrawerPayload, ToastMessage } from "./types";
import { IconBadge, PremiumButton, StatusDot } from "./VisualPrimitives";
import { OverviewPage, LiveTerminalPage, StrategyIntelligencePage, SignalTerminalPage, MarketAnalysisPage, AgentNetworkPage, VaultPage, RiskManagerPage, PositionsLifecyclePage, IncidentCenterPage, LiveReadinessWizardPage, OperationsCommandCenterPage, PortfolioProtectionPage, ForensicAuditPage, ApprovalControlPage, DisasterRecoveryPage, ComplianceCenterPage, TestEvidencePage, OpsCenterPage, SettingsPage } from "./ConsolePages";

const routeByView: Readonly<Record<ConsoleViewId, string>> = {
  overview: "/",
  terminal: "/terminal",
  strategies: "/strategies",
  signals: "/signals",
  market: "/market",
  agents: "/agents",
  vault: "/vault",
  risk: "/risk",
  positions: "/positions",
  incidents: "/incidents",
  readiness: "/readiness",
  operations: "/operations-command",
  portfolio: "/portfolio",
  forensics: "/forensics",
  approvals: "/approvals",
  disaster: "/disaster-recovery",
  compliance: "/compliance",
  evidence: "/test-evidence",
  ops: "/ops",
  settings: "/settings"
};

const viewByRoute: Readonly<Record<string, ConsoleViewId>> = {
  "/": "overview",
  "/terminal": "terminal",
  "/strategies": "strategies",
  "/signals": "signals",
  "/market": "market",
  "/agents": "agents",
  "/vault": "vault",
  "/risk": "risk",
  "/positions": "positions",
  "/incidents": "incidents",
  "/readiness": "readiness",
  "/operations-command": "operations",
  "/portfolio": "portfolio",
  "/forensics": "forensics",
  "/approvals": "approvals",
  "/disaster-recovery": "disaster",
  "/compliance": "compliance",
  "/test-evidence": "evidence",
  "/ops": "ops",
  "/settings": "settings"
};

export function ConsoleApp({ initialView = "overview" }: Readonly<{ initialView?: ConsoleViewId }>) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const live = useLiveEvents(Boolean(session.user));
  const [view, setView] = useState<ConsoleViewId>(viewByRoute[pathname] ?? initialView);
  const [search, setSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const isAdmin = Boolean(session.user?.roles.includes("admin"));
  const data = useConsoleData(live, session.csrfToken, isAdmin, Boolean(session.user));

  const pushToast = useCallback((message: Omit<ToastMessage, "id">): void => {
    const toast: ToastMessage = { ...message, id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    setToasts((current) => [toast, ...current].slice(0, 5));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 5000);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setDrawer(null);
        setNoticeOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); };
  }, []);

  useEffect(() => {
    const routeView = viewByRoute[pathname] ?? initialView;
    setView(routeView);
  }, [initialView, pathname]);

  const activeNavigation = useMemo(() => navigationItems.find((item) => item.id === view) ?? navigationItems[0], [view]);
  const navigate = useCallback((target: ConsoleViewId): void => {
    setView(target);
    router.push(routeByView[target], { scroll: false });
  }, [router]);

  if (!session.user) {
    return (
      <main className="min-h-screen bg-[#070b12] text-white">
        <BackgroundChrome />
        <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-2xl">
              <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_22px_rgba(52,211,153,0.9)]" />
              <span className="text-xs font-medium uppercase tracking-[0.26em] text-emerald-200">Institutional Access Layer</span>
            </div>
            <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-white md:text-7xl">MA Core Quant Intelligence</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-400">A private multi-agent trading operating system for affluent operators: market intelligence, OSINT strategy parsing, signal control, encrypted vault and institutional observability.</p>
            <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
              {["Cookie Sessions", "AES-256 Vault", "Redis Streams"].map((label) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300 backdrop-blur-xl">{label}</div>)}
            </div>
          </motion.section>
          <AuthPanel loading={session.loading} error={session.error} onSignIn={session.signIn} onRegister={session.register} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b12] text-white">
      <BackgroundChrome />
      <div className="relative grid min-h-screen grid-cols-[240px_1fr] xl:grid-cols-[250px_1fr]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-white/10 bg-[#080d16]/88 backdrop-blur-2xl">
          <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-400/12 shadow-[0_0_34px_rgba(139,92,246,0.20)]">
              <Command className="h-5 w-5 text-violet-200" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">MA CORE</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-violet-300">Quant Intelligence</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navigationItems.map((item) => {
              const active = item.id === view;
              const Icon = item.icon;
              return (
                <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => { navigate(item.id); }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? "border border-white/10 bg-white/[0.085] text-white shadow-[0_0_36px_rgba(124,58,237,0.14)]" : "text-slate-400 hover:bg-white/[0.045] hover:text-white"}`}>
                  <Icon className={`h-4 w-4 ${active ? "text-violet-200" : "text-slate-500 group-hover:text-slate-200"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="m-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between text-xs"><span className="text-slate-400">System Performance</span><span className="text-emerald-300">Live</span></div>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between"><span>CPU</span><span className="text-white">23%</span></div>
              <div className="flex justify-between"><span>Memory</span><span className="text-white">45%</span></div>
              <div className="flex justify-between"><span>Network</span><span className="text-white">12.4 MB/s</span></div>
              <div className="flex justify-between"><span>Uptime</span><span className="text-white">15d 7h</span></div>
            </div>
          </div>
          <div className="px-5 pb-5 text-[11px] text-slate-600">MA Core v2.5 · GitHub Pages Demo Console</div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-white/10 bg-[#070b12]/86 px-6 backdrop-blur-2xl">
            <button data-testid="command-bar-trigger" aria-label="Open command palette" onClick={() => { setCommandOpen(true); }} className="flex h-11 w-[420px] max-w-[38vw] items-center gap-3 rounded-xl border border-white/10 bg-[#0b111c] px-4 text-sm text-slate-500 shadow-inner shadow-black/30 transition hover:border-white/18 hover:text-slate-300">
              <Search className="h-4 w-4" />
              <span className="truncate">Search by pair, agent, strategy</span>
              <span className="ml-auto rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-slate-500">⌘K</span>
            </button>
            <div className="flex items-center gap-5">
              <button aria-label="Open operations status" onClick={() => { navigate("ops"); }}><StatusDot tone={data.connected ? "green" : "amber"} label={data.connected ? "All Systems Operational" : "Reconnecting"} /></button>
              {demoModeEnabled ? <button aria-label="Open demo evidence" onClick={() => { navigate("evidence"); }} className="hidden items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200 transition hover:border-amber-200/35 hover:bg-amber-300/12 md:flex">{demoEnvironmentLabel}</button> : null}
              <button aria-label="Open market data" onClick={() => { navigate("market"); }} className="hidden items-center gap-2 text-xs text-slate-400 transition hover:text-white md:flex"><Globe2 className="h-4 w-4" />Market Data <span className="text-emerald-300">Live</span></button>
              <button data-testid="notification-drawer-trigger" aria-label="Open operator notifications" onClick={() => { setNoticeOpen(true); }} className="relative rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-slate-300 transition hover:bg-white/[0.07]"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-violet-400" /></button>
              <button aria-label="Open workspace settings" onClick={() => { navigate("settings"); }} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:bg-white/[0.07]">
                <UserCircle2 className="h-6 w-6 text-violet-200" />
                <div className="hidden lg:block"><div className="text-xs font-semibold text-white">{session.user.email.split("@")[0]}</div><div className="text-[11px] text-slate-500">Premium</div></div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>
              <button data-testid="logout-button" aria-label="Log out" onClick={() => { void session.signOut(); }} className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-slate-400 transition hover:text-white"><LogOut className="h-4 w-4" /></button>
            </div>
          </header>

          <div className="flex-1 px-6 py-5">
            <ConnectionBanner connected={data.connected} loading={data.isLoading} error={data.error} reload={data.reload} />
            <div className="mb-5 flex items-end justify-between gap-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">{activeNavigation.eyebrow}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-white">{activeNavigation.label}</h1>
                <p className="mt-1 text-sm text-slate-500">{activeNavigation.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <PremiumButton onClick={() => { void data.reload(); pushToast({ title: "Refresh requested", body: "Dashboard data is being synchronized with the backend.", tone: "neutral" }); }} disabled={data.isRefetching}>{data.isRefetching ? "Refreshing" : "Refresh"}</PremiumButton>
                <PremiumButton tone="purple" onClick={() => { setCommandOpen(true); }}><Command className="h-3.5 w-3.5" />Command</PremiumButton>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div data-testid={`view-${view}`} key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                {view === "overview" ? <OverviewPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "terminal" ? <LiveTerminalPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "strategies" ? <StrategyIntelligencePage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "signals" ? <SignalTerminalPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "market" ? <MarketAnalysisPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "agents" ? <AgentNetworkPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "vault" ? <VaultPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "risk" ? <RiskManagerPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "positions" ? <PositionsLifecyclePage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "incidents" ? <IncidentCenterPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "readiness" ? <LiveReadinessWizardPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "operations" ? <OperationsCommandCenterPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "portfolio" ? <PortfolioProtectionPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "forensics" ? <ForensicAuditPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "approvals" ? <ApprovalControlPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "disaster" ? <DisasterRecoveryPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "compliance" ? <ComplianceCenterPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "evidence" ? <TestEvidencePage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "ops" ? <OpsCenterPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} /> : null}
                {view === "settings" ? <SettingsPage user={session.user} csrfToken={session.csrfToken} data={data} search={search} setView={navigate} openDrawer={setDrawer} pushToast={pushToast} onSignOut={session.signOut} /> : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>

      <CommandPalette open={commandOpen} search={search} setSearch={setSearch} close={() => { setCommandOpen(false); }} setView={navigate} />
      <DetailDrawer payload={drawer} close={() => { setDrawer(null); }} setView={navigate} />
      <NoticeDrawer open={noticeOpen} close={() => { setNoticeOpen(false); }} />
      <ToastStack toasts={toasts} close={(id) => { setToasts((current) => current.filter((item) => item.id !== id)); }} />
    </main>
  );
}

function ConnectionBanner({ connected, loading, error, reload }: Readonly<{ connected: boolean; loading: boolean; error: string | null; reload(): Promise<void> }>) {
  if (!loading && !error && connected) {
    return null;
  }
  const title = loading ? "Synchronizing secure workspace" : error ? "Operator console warning" : "Live stream reconnecting";
  const body = loading ? "Market, strategy, signal and ops data are being loaded through validated API calls." : error ?? "SSE is reconnecting. The console keeps the last verified snapshot visible.";
  return (
    <div data-testid="connection-banner" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">{body}</div>
      </div>
      <PremiumButton onClick={() => { void reload(); }} disabled={loading}>{loading ? "Loading" : "Retry sync"}</PremiumButton>
    </div>
  );
}

function BackgroundChrome() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_0%,rgba(76,29,149,0.22),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.14),transparent_25%),linear-gradient(180deg,#070b12_0%,#070b12_48%,#05070b_100%)]" />
      <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:48px_48px]" />
    </div>
  );
}

function CommandPalette({ open, close, search, setSearch, setView }: Readonly<{ open: boolean; close(): void; search: string; setSearch(value: string): void; setView(view: ConsoleViewId): void }>) {
  const filtered = commandActions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-50 grid place-items-start bg-black/55 px-6 pt-[12vh] backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} onMouseDown={(event) => { event.stopPropagation(); }} className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b111c] shadow-[0_40px_120px_rgba(0,0,0,0.60)]">
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4"><Search className="h-4 w-4 text-slate-500" /><input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Search command, page, pair, agent" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" /><button aria-label="Close command palette" onClick={close} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[460px] overflow-auto p-2">
              {filtered.map((action) => {
                const Icon = action.icon;
                return <button key={action.id} data-testid={`command-${action.id}`} onClick={() => { setView(action.targetView); close(); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.06]"><IconBadge icon={Icon} tone="purple" /><span><span className="block text-sm font-medium text-white">{action.label}</span><span className="text-xs text-slate-500">{action.hint}</span></span></button>;
              })}
              {filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No matching command was found.</div> : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DetailDrawer({ payload, close, setView }: Readonly<{ payload: DrawerPayload | null; close(): void; setView(view: ConsoleViewId): void }>) {
  return (
    <AnimatePresence>
      {payload ? (
        <motion.aside initial={{ x: 420, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 420, opacity: 0 }} transition={{ duration: 0.24, ease: "easeOut" }} data-testid="detail-drawer" className="fixed right-0 top-0 z-50 h-screen w-[420px] border-l border-white/10 bg-[#0a0f19]/95 p-6 shadow-[0_0_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/70">{payload.eyebrow}</p><h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{payload.title}</h3></div><button aria-label="Close detail drawer" onClick={close} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
          <p className="mt-5 text-sm leading-7 text-slate-400">{payload.body}</p>
          <div className="mt-6 space-y-3">{payload.rows.map((row) => <div key={row.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm"><span className="text-slate-500">{row.label}</span><span className="font-medium text-white">{row.value}</span></div>)}</div>
          {payload.actionLabel && payload.actionView ? <DrawerActionButton label={payload.actionLabel} view={payload.actionView} setView={setView} close={close} /> : null}
          {payload.actionLabel && payload.actionUrl ? <SafeDrawerExternalActionButton label={payload.actionLabel} url={payload.actionUrl} /> : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function DrawerActionButton({ label, view, setView, close }: Readonly<{ label: string; view: ConsoleViewId; setView: (view: ConsoleViewId) => void; close: () => void }>) {
  return <PremiumButton tone="purple" className="mt-6 w-full" onClick={() => { setView(view); close(); }}>{label}</PremiumButton>;
}

function SafeDrawerExternalActionButton({ label, url }: Readonly<{ label: string; url: string }>) {
  const safeUrl = toSafeExternalUrl(url);
  if (!safeUrl) {
    return <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">External source URL was blocked because it does not use http or https.</div>;
  }
  return <a className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/15 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:border-violet-200/35 hover:bg-violet-400/20" href={safeUrl} target="_blank" rel="noreferrer noopener">{label}<ExternalLink className="h-3.5 w-3.5" /></a>;
}

function toSafeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function NoticeDrawer({ open, close }: Readonly<{ open: boolean; close(): void }>) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }} data-testid="notification-drawer" className="fixed right-0 top-0 z-50 h-screen w-[380px] border-l border-white/10 bg-[#0a0f19]/95 p-6 shadow-[0_0_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Operator Notifications</h3><button aria-label="Close notifications drawer" onClick={close} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
          <div className="mt-6 space-y-3">
            {["Redis stream lag remains within policy", "Strategy quarantine filter rejected 4 low-evidence posts", "Vault rotation dry-run is ready for review", "Market adapters are streaming live snapshots"].map((message, index) => <div key={message} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300"><div className="mb-2 text-[11px] text-slate-500">{index + 1} · System Notice</div>{message}</div>)}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function ToastStack({ toasts, close }: Readonly<{ toasts: readonly ToastMessage[]; close(id: string): void }>) {
  return (
    <div className="fixed bottom-5 right-5 z-50 space-y-3">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div key={toast.id} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="w-[360px] rounded-2xl border border-white/10 bg-[#0b111c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{toast.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{toast.body}</p></div><button aria-label="Dismiss notification" onClick={() => { close(toast.id); }} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button></div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
