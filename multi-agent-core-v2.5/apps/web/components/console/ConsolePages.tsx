"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, BrainCircuit, CheckCircle2, ClipboardCheck, Cpu, Download, ExternalLink, Eye, Filter, KeyRound, LineChart, LockKeyhole, Pause, Play, RadioTower, RefreshCw, ShieldAlert, ShieldCheck, SlidersHorizontal, Star, TerminalSquare, TrendingDown, TrendingUp, WalletCards, XCircle } from "lucide-react";
import type { AdapterStatus, AgentEnvelope, DailyRiskState, ExecutionDecision, Position, StrategyRule, TradeSignal } from "@ma-core/shared";
import { ApiKeyConnectForm } from "../ApiKeyConnectForm";
import { acceptCompliance, activateKillSwitch, activateSafeMode, createApprovalRequest, createForensicCase, createTestEvidenceReport, decideApprovalRequest, requestPositionClose, runDisasterRecoveryDrill, saveRiskPolicy, syncPosition, updateLiveReadinessWizardStep } from "../../lib/api";
import { agentNodes, buildAgentActivity, dashboardStats, formatPercent, formatShortDate, inferMarketRowsFromSignals, marketRows, normalizeSearch, riskPolicies, systemModules } from "../../lib/consoleData";
import type { ConsoleViewProps, DrawerPayload } from "./types";
import { IconBadge, KpiCard, Panel, PremiumButton, ProgressRing, SectionHeader, Sparkline, StatusDot, type Tone } from "./VisualPrimitives";

export function OverviewPage(props: ConsoleViewProps) {
  const rows = inferMarketRowsFromSignals(props.data.signals);
  const activity = buildAgentActivity(props.data.events);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-3">
        {dashboardStats.map((stat) => <KpiCard key={stat.id} label={stat.label} value={stat.value} change={stat.change} tone={stat.tone} points={stat.points} onClick={() => props.openDrawer({ title: stat.label, eyebrow: "KPI Detail", body: stat.detail, rows: [{ label: "Current value", value: stat.value }, { label: "Change", value: stat.change }, { label: "Scope", value: "Operator dashboard" }], actionLabel: "Open Ops", actionView: "ops" })} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr_0.75fr]">
        <LiveActivityPanel events={activity} openDrawer={props.openDrawer} setView={props.setView} />
        <FeaturedStrategyPanel strategies={props.data.strategies} openDrawer={props.openDrawer} setView={props.setView} />
        <MarketOverviewPanel rows={rows} openDrawer={props.openDrawer} setView={props.setView} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
        <AiMarketAnalysisCard data={props.data} openDrawer={props.openDrawer} runCycle={async () => {
          const transactionId = await props.data.runMarketCycle();
          props.pushToast(transactionId ? { title: "Market cycle started", body: `Transaction ${transactionId} entered the agent pipeline.`, tone: "success" } : { title: "Market cycle rejected", body: props.data.error ?? "The request did not pass backend validation.", tone: "danger" });
        }} />
        <AgentStatusList openDrawer={props.openDrawer} setView={props.setView} />
      </div>
    </div>
  );
}

export function LiveTerminalPage(props: ConsoleViewProps) {
  const [channel, setChannel] = useState("all");
  const [paused, setPaused] = useState(false);
  const events = useMemo(() => {
    const search = normalizeSearch(props.search);
    return props.data.events.filter((event) => (channel === "all" || event.channel === channel) && (search.length === 0 || `${event.sender_agent} ${event.agent_log} ${event.channel}`.toLowerCase().includes(search)));
  }, [channel, props.data.events, props.search]);
  const visibleEvents = paused ? events.slice(0, 12) : events;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
      <Panel className="min-h-[760px] p-5">
        <SectionHeader eyebrow="Live Terminal" title="Agent telemetry stream" action={<div className="flex gap-2"><select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300 outline-none"><option value="all">All Events</option><option value="agent.market.vector">Market</option><option value="agent.strategy.signal">Signals</option><option value="agent.execution.status">Execution</option><option value="agent.risk.state">Risk</option><option value="agent.position.timeout">Time Guard</option><option value="agent.strategy.feed">Strategies</option><option value="agent.live.log">System</option><option value="security.audit">Security</option></select><PremiumButton onClick={() => setPaused((value) => !value)}>{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}</PremiumButton><PremiumButton onClick={() => downloadJson("ma-core-events.json", visibleEvents)}><Download className="h-3.5 w-3.5" />Export</PremiumButton></div>} />
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[110px_130px_1fr_90px] border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500"><span>Time</span><span>Agent</span><span>Event</span><span>Severity</span></div>
          <div className="max-h-[650px] overflow-auto">
            {visibleEvents.length === 0 ? <EmptyState title="No terminal events" body="No events match the selected channel and search filter." /> : null}
            {visibleEvents.map((event) => <TerminalRow key={`${event.idempotency_key}-${event.timestamp}`} event={event} openDrawer={props.openDrawer} />)}
          </div>
        </div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Controls" title="Terminal operations" />
        <div className="space-y-3">
          <PremiumButton className="w-full" tone="purple" onClick={() => { void props.data.runMarketCycle().then((transactionId) => props.pushToast(transactionId ? { title: "Cycle launched", body: transactionId, tone: "success" } : { title: "Cycle failed", body: props.data.error ?? "Backend rejected the cycle.", tone: "danger" })); }}><RefreshCw className="h-3.5 w-3.5" />Run analysis cycle</PremiumButton>
          <PremiumButton className="w-full" onClick={() => props.setView("signals")}><RadioTower className="h-3.5 w-3.5" />Open signal terminal</PremiumButton>
          <PremiumButton className="w-full" onClick={() => props.setView("ops")}><Cpu className="h-3.5 w-3.5" />Inspect stream metrics</PremiumButton>
        </div>
        <div className="mt-6 space-y-3">
          {systemModules.slice(0, 4).map((module) => <ModuleRow key={module.id} label={module.label} value={module.value} status={module.status} tone={module.tone as Tone} />)}
        </div>
      </Panel>
    </div>
  );
}

export function StrategyIntelligencePage(props: ConsoleViewProps) {
  const [source, setSource] = useState("ALL");
  const filtered = props.data.strategies.filter((strategy) => (source === "ALL" || strategy.sourceType === source) && matchesStrategy(strategy, props.search));
  const featured = filtered[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
      <Panel className="p-5">
        <SectionHeader eyebrow="Strategy Feed" title="High-conviction intelligence" action={<div className="flex gap-2">{["ALL", "YOUTUBE", "X", "REDDIT"].map((item) => <button key={item} onClick={() => setSource(item)} className={`rounded-lg border px-3 py-2 text-xs transition ${source === item ? "border-violet-300/30 bg-violet-400/15 text-violet-100" : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-white"}`}>{item}</button>)}</div>} />
        {featured ? <FeaturedStrategy strategy={featured} openDrawer={props.openDrawer} /> : <EmptyState title="No accepted strategy" body="The current filters did not match any accepted strategy." />}
        <div className="mt-4 space-y-2">
          {filtered.slice(1, 8).map((strategy) => <StrategyCompactRow key={strategy.id} strategy={strategy} openDrawer={props.openDrawer} />)}
        </div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Review Queue" title="Evidence and manipulation filters" action={<PremiumButton onClick={() => props.pushToast({ title: "Review policy saved", body: "The current OSINT scoring configuration was stored in the operator workspace.", tone: "success" })}><ClipboardCheck className="h-3.5 w-3.5" />Save policy</PremiumButton>} />
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.slice(0, 10).map((strategy) => <StrategyReviewCard key={strategy.id} strategy={strategy} openDrawer={props.openDrawer} pushToast={props.pushToast} />)}
        </div>
      </Panel>
    </div>
  );
}

export function SignalTerminalPage(props: ConsoleViewProps) {
  const [onlyLong, setOnlyLong] = useState(false);
  const signals = props.data.signals.filter((signal) => (!onlyLong || signal.action === "LONG") && matchesSignal(signal, props.search));
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <SectionHeader eyebrow="Signal Terminal" title="Pre-risk execution candidates" action={<div className="flex gap-2"><PremiumButton onClick={() => setOnlyLong((value) => !value)} tone={onlyLong ? "green" : "neutral"}><Filter className="h-3.5 w-3.5" />LONG only</PremiumButton><PremiumButton onClick={() => downloadCsv("ma-core-signals.csv", signals)}><Download className="h-3.5 w-3.5" />Export CSV</PremiumButton><PremiumButton tone="purple" onClick={() => { void props.data.runMarketCycle().then((transactionId) => props.pushToast(transactionId ? { title: "Signal cycle queued", body: transactionId, tone: "success" } : { title: "Signal cycle failed", body: props.data.error ?? "Backend did not accept the request.", tone: "danger" })); }}>Run cycle</PremiumButton></div>} />
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1fr_120px_120px_100px_140px_80px] border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500"><span>Pair</span><span>Direction</span><span>Confidence</span><span>Leverage</span><span>Source</span><span>Open</span></div>
          {signals.length === 0 ? <EmptyState title="No signals" body="Signals will appear after Agent 1 and Agent 2 complete a cycle." /> : signals.map((signal) => <SignalRow key={signal.id} signal={signal} openDrawer={props.openDrawer} />)}
        </div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Agent 3" title="Execution audit trail" />
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1fr_120px_110px_120px_1fr] border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500"><span>Execution</span><span>Status</span><span>Exchange</span><span>Latency</span><span>Reason</span></div>
          {props.data.executions.length === 0 ? <EmptyState title="No execution decisions" body="Agent 3 decisions will appear after user-scoped signals reach the execution stream." /> : props.data.executions.slice(0, 12).map((execution) => <ExecutionRow key={execution.id} execution={execution} openDrawer={props.openDrawer} />)}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-3">
        {signals.slice(0, 3).map((signal) => <SignalExplainCard key={signal.id} signal={signal} openDrawer={props.openDrawer} />)}
      </div>
    </div>
  );
}

export function MarketAnalysisPage(props: ConsoleViewProps) {
  const [window, setWindow] = useState("1D");
  const rows = inferMarketRowsFromSignals(props.data.signals);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel className="p-5">
        <SectionHeader eyebrow="Market Overview" title="Exchange-grade market state" action={<div className="flex gap-2">{["1H", "4H", "1D", "1W"].map((item) => <button key={item} onClick={() => setWindow(item)} className={`rounded-lg border px-3 py-2 text-xs ${window === item ? "border-sky-300/30 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/[0.035] text-slate-400"}`}>{item}</button>)}</div>} />
        <div className="space-y-2">{rows.map((row) => <MarketRowCard key={row.pair} row={row} openDrawer={props.openDrawer} />)}</div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Adapter Status" title="Binance / Bybit market data" action={<PremiumButton onClick={() => { void props.data.reload(); }}>Refresh</PremiumButton>} />
        <div className="space-y-3">{props.data.adapters.length === 0 ? <EmptyState title="No adapter status" body="Market adapter snapshots are not available yet." /> : props.data.adapters.map((adapter) => <AdapterStatusCard key={`${adapter.exchange}-${adapter.pair}`} adapter={adapter} openDrawer={props.openDrawer} />)}</div>
      </Panel>
    </div>
  );
}

export function AgentNetworkPage(props: ConsoleViewProps) {
  const [pausedAgents, setPausedAgents] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string): void => {
    setPausedAgents((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {agentNodes.map((agent) => <AgentCard key={agent.id} agent={agent} paused={pausedAgents.has(agent.id)} toggle={() => { toggle(agent.id); props.pushToast({ title: pausedAgents.has(agent.id) ? "Agent resumed" : "Agent paused", body: `${agent.name} local operator state was updated.`, tone: "neutral" }); }} openDrawer={props.openDrawer} />)}
    </div>
  );
}

export function VaultPage(props: ConsoleViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel className="p-5">
        <SectionHeader eyebrow="API Vault" title="Encrypted exchange connection" />
        <ApiKeyConnectForm csrfToken={props.csrfToken} />
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Security Posture" title="Vault controls" action={<PremiumButton tone="purple" onClick={() => props.pushToast({ title: "Rotation dry-run queued", body: "Vault rotation verification was requested for the current key version.", tone: "success" })}>Rotation dry-run</PremiumButton>} />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Encryption", "AES-256-GCM"],
            ["Key Provider", "env / file / http"],
            ["AAD Binding", "userId + exchange"],
            ["Withdraw Scope", "Rejected"],
            ["Transfer Scope", "Rejected"],
            ["Audit Trail", "Enabled"]
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div></div>)}
        </div>
      </Panel>
    </div>
  );
}

export function RiskManagerPage(props: ConsoleViewProps) {
  const [maxDrawdown, setMaxDrawdown] = useState(5);
  const [profitCap, setProfitCap] = useState(15);
  const latestRisk = props.data.riskStates[0] ?? null;
  const openPositions = props.data.positions;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.8fr_0.8fr_1.2fr]">
        <Panel className="p-5">
          <SectionHeader eyebrow="Agent 4" title="Daily Drawdown Guard" />
          <RiskGauge label="Drawdown" value={latestRisk?.drawdownRatio ?? 0} limit={0.05} tone={(latestRisk?.drawdownRatio ?? 0) >= 0.05 ? "red" : (latestRisk?.drawdownRatio ?? 0) >= 0.035 ? "amber" : "green"} />
          <div className="mt-4 text-xs leading-5 text-slate-500">Hard emergency circuit closes positions and locks trading until 23:59:59 UTC when drawdown reaches 5%.</div>
        </Panel>
        <Panel className="p-5">
          <SectionHeader eyebrow="Agent 5" title="Daily Profit Cap" />
          <RiskGauge label="Profit" value={Math.max(0, latestRisk?.profitRatio ?? 0)} limit={0.15} tone={(latestRisk?.profitRatio ?? 0) >= 0.15 ? "amber" : "green"} />
          <div className="mt-4 text-xs leading-5 text-slate-500">Profit cap blocks new entries at 15% realized daily profit while allowing open positions to finish TP/SL math.</div>
        </Panel>
        <Panel className="p-5">
          <SectionHeader eyebrow="Circuit Breakers" title="System health status" action={<div className="flex gap-2"><PremiumButton onClick={() => { void props.data.reload(); }}><RefreshCw className="h-3.5 w-3.5" />Refresh</PremiumButton><PremiumButton tone="red" onClick={() => { const accountId = latestRisk?.accountId; if (!accountId) { props.pushToast({ title: "Kill switch unavailable", body: "No active risk account is loaded yet.", tone: "warning" }); return; } const password = window.prompt("Confirm kill switch with your operator password"); if (!password) { props.pushToast({ title: "Kill switch cancelled", body: "Operator password was not provided.", tone: "warning" }); return; } void activateKillSwitch(props.csrfToken, accountId, password, "Operator kill switch from Risk Cockpit").then((result) => { props.pushToast(result.error ? { title: "Kill switch rejected", body: result.error, tone: "danger" } : { title: "Kill switch armed", body: `Global trading lock written. Closed ${result.data?.closeResult.closed ?? 0}, failed ${result.data?.closeResult.failed ?? 0}.`, tone: "danger" }); void props.data.reload(); }); }}><ShieldAlert className="h-3.5 w-3.5" />Kill switch</PremiumButton></div>} />
          <div className="grid gap-3 md:grid-cols-2">
            <ModuleRow label="Trading lock" value={props.data.riskLocks.some((lock) => lock.lockType === "GLOBAL_TRADING_LOCK") ? "Armed" : "Clear"} status={props.data.riskLocks.some((lock) => lock.lockType === "GLOBAL_TRADING_LOCK") ? "Emergency" : "Normal"} tone={props.data.riskLocks.some((lock) => lock.lockType === "GLOBAL_TRADING_LOCK") ? "red" : "green"} />
            <ModuleRow label="New deals" value={props.data.riskLocks.some((lock) => lock.lockType === "NEW_DEALS_LOCK") ? "Locked" : "Allowed"} status={props.data.riskLocks.some((lock) => lock.lockType === "NEW_DEALS_LOCK") ? "Profit cap" : "Normal"} tone={props.data.riskLocks.some((lock) => lock.lockType === "NEW_DEALS_LOCK") ? "amber" : "green"} />
            <ModuleRow label="Open positions" value={String(openPositions.length)} status="Watched" tone="blue" />
            <ModuleRow label="Executions" value={String(props.data.executions.length)} status="Audited" tone="purple" />
          </div>
          <div className="mt-4 space-y-2">{props.data.riskLocks.length === 0 ? <EmptyState title="No active locks" body="Daily drawdown and profit cap guards report no active lock for this account." /> : props.data.riskLocks.map((lock) => <button key={lock.id} onClick={() => props.openDrawer({ title: lock.lockType, eyebrow: "Risk Lock", body: `Reason: ${lock.reason}`, rows: [{ label: "Account", value: lock.accountId ?? "Global" }, { label: "Until", value: formatShortDate(lock.lockUntil) }, { label: "Active", value: lock.active ? "Yes" : "No" }] })} className="w-full rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-left text-xs text-amber-100">{lock.lockType} · {lock.reason} · until {formatShortDate(lock.lockUntil)}</button>)}</div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel className="p-5">
          <SectionHeader eyebrow="Agent 6" title="Position time-to-live watchdog" />
          <div className="space-y-3">{openPositions.length === 0 ? <EmptyState title="No open positions" body="When Agent 3 opens a position, Agent 6 will display the 180-minute forced-close countdown here." /> : openPositions.map((position) => <PositionTimerCard key={position.id} position={position} csrfToken={props.csrfToken} pushToast={props.pushToast} reload={props.data.reload} openDrawer={props.openDrawer} />)}</div>
        </Panel>
        <Panel className="p-5">
          <SectionHeader eyebrow="Risk Manager" title="Guardrail configuration" action={<PremiumButton tone="green" onClick={() => { const accountId = latestRisk?.accountId; if (!accountId) { props.pushToast({ title: "Risk policy unavailable", body: "No active account is loaded yet.", tone: "warning" }); return; } void saveRiskPolicy(props.csrfToken, { accountId, maxDailyDrawdownRatio: Math.min(maxDrawdown / 100, 0.05), dailyProfitCapRatio: profitCap / 100 }).then((result) => { props.pushToast(result.error ? { title: "Risk policy rejected", body: result.error, tone: "danger" } : { title: "Risk policy saved", body: `Drawdown ${maxDrawdown.toFixed(1)}%, profit cap ${profitCap.toFixed(1)}%.`, tone: "success" }); void props.data.reload(); }); }}>Save policy</PremiumButton>} />
          <div className="space-y-5">
            <RangeControl label="Maximum Daily Drawdown" value={maxDrawdown} min={0.5} max={10} step={0.1} suffix="%" onChange={setMaxDrawdown} />
            <RangeControl label="Daily Profit Cap" value={profitCap} min={5} max={30} step={0.5} suffix="%" onChange={setProfitCap} />
          </div>
          <div className="mt-5 space-y-3">{riskPolicies.map((policy) => <button key={policy.id} onClick={() => props.openDrawer({ title: policy.label, eyebrow: "Risk Policy", body: policy.description, rows: [{ label: "Value", value: policy.value }, { label: "Severity", value: policy.severity }] })} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:bg-white/[0.06]"><div className="flex items-center justify-between"><span className="text-sm font-medium text-white">{policy.label}</span><span className="text-xs text-slate-500">{policy.value}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{policy.description}</p></button>)}</div>
        </Panel>
      </div>
    </div>
  );
}


export function PositionsLifecyclePage(props: ConsoleViewProps) {
  const open = props.data.positions.filter((position) => ["OPENED", "FORCE_CLOSE_REQUESTED", "CLOSE_SUBMITTED", "CLOSE_FAILED_RETRYING"].includes(position.status));
  const closing = props.data.positions.filter((position) => ["FORCE_CLOSE_REQUESTED", "CLOSE_SUBMITTED", "CLOSE_FAILED_RETRYING"].includes(position.status));
  const protectionMissing = props.data.reconciliationMismatches.filter((mismatch) => mismatch.mismatchType === "PROTECTION_ORDER_MISSING");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <Panel className="p-5"><SectionHeader eyebrow="Open" title="Positions" /><div className="text-4xl font-semibold text-white">{open.length}</div><p className="mt-2 text-sm text-slate-500">Exchange-synchronized position lifecycle.</p></Panel>
        <Panel className="p-5"><SectionHeader eyebrow="Closing" title="Watchdog" /><div className="text-4xl font-semibold text-amber-100">{closing.length}</div><p className="mt-2 text-sm text-slate-500">Positions under manual/risk/time close.</p></Panel>
        <Panel className="p-5"><SectionHeader eyebrow="Protection" title="SL / TP" /><div className={`text-4xl font-semibold ${protectionMissing.length > 0 ? "text-rose-200" : "text-emerald-200"}`}>{protectionMissing.length}</div><p className="mt-2 text-sm text-slate-500">Missing protection incidents.</p></Panel>
        <Panel className="p-5"><SectionHeader eyebrow="Reconciliation" title="Latest" /><div className="text-4xl font-semibold text-violet-100">{props.data.reconciliationRuns[0]?.status ?? "NONE"}</div><p className="mt-2 text-sm text-slate-500">Last exchange reconciliation result.</p></Panel>
      </div>
      <Panel className="p-5">
        <SectionHeader eyebrow="Position Lifecycle" title="Open, closing and synchronized positions" action={<PremiumButton onClick={() => { void props.data.reload(); }}>Refresh</PremiumButton>} />
        <div className="space-y-3">
          {props.data.positions.length === 0 ? <EmptyState title="No positions" body="Agent 3 will create position rows after a protected execution is confirmed." /> : props.data.positions.map((position) => (
            <div key={position.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 xl:grid-cols-[1fr_1fr_180px]">
              <button onClick={() => props.openDrawer({ title: position.pair, eyebrow: "Position", body: `Status ${position.status}. Entry ${position.entryPrice}.`, rows: [{ label: "Direction", value: position.direction }, { label: "Volume", value: position.volume.toString() }, { label: "SL", value: position.stopLossPrice.toString() }, { label: "TP", value: position.takeProfitPrice.toString() }, { label: "Opened", value: formatShortDate(position.openedAt) }] })} className="text-left">
                <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs ${position.direction === "LONG" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{position.direction}</span><span className="text-lg font-semibold text-white">{position.pair}</span></div>
                <div className="mt-2 text-xs text-slate-500">Entry {position.entryPrice} · SL {position.stopLossPrice} · TP {position.takeProfitPrice}</div>
              </button>
              <div>
                <PositionTimerCard position={position} csrfToken={props.csrfToken} pushToast={props.pushToast} reload={props.data.reload} openDrawer={props.openDrawer} />
              </div>
              <div className="flex flex-col gap-2">
                <PremiumButton onClick={() => { void syncPosition(props.csrfToken, position.id).then((result) => { props.pushToast(result.error ? { title: "Sync failed", body: result.error, tone: "danger" } : { title: "Sync queued", body: `${position.pair} reconciliation requested.`, tone: "success" }); void props.data.reload(); }); }}>Sync</PremiumButton>
                <PremiumButton tone="red" onClick={() => { const password = window.prompt("Confirm operator password for manual close"); if (!password) return; void requestPositionClose(props.csrfToken, position.id, "Operator manual lifecycle close", password).then((result) => { props.pushToast(result.error ? { title: "Close rejected", body: result.error, tone: "danger" } : { title: "Close submitted", body: `${position.pair} close command entered Agent 3.`, tone: "warning" }); void props.data.reload(); }); }}>Close</PremiumButton>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Forensics" title="Reconciliation mismatches" />
        <div className="space-y-2">{props.data.reconciliationMismatches.length === 0 ? <EmptyState title="No mismatches" body="Internal positions, exchange positions and protective orders are currently matched or waiting for first reconciliation." /> : props.data.reconciliationMismatches.map((mismatch) => <button key={mismatch.id} onClick={() => props.openDrawer({ title: mismatch.mismatchType, eyebrow: "Reconciliation", body: mismatch.message, rows: [{ label: "Severity", value: mismatch.severity }, { label: "Created", value: formatShortDate(mismatch.createdAt) }, { label: "Resolved", value: mismatch.resolvedAt ? formatShortDate(mismatch.resolvedAt) : "No" }] })} className="w-full rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-left text-sm text-rose-100">{mismatch.mismatchType} · {mismatch.message}</button>)}</div>
      </Panel>
    </div>
  );
}

export function IncidentCenterPage(props: ConsoleViewProps) {
  const [severity, setSeverity] = useState("ALL");
  const filtered = props.data.incidents.filter((incident) => severity === "ALL" || incident.severity === severity);
  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel className="p-5">
        <SectionHeader eyebrow="Incident Center" title="Critical system events" action={<PremiumButton onClick={() => downloadJson("ma-core-incidents.json", props.data.incidents)}>Export</PremiumButton>} />
        <div className="grid gap-3">
          {(["ALL", "critical", "warning", "info"] as const).map((item) => <button key={item} onClick={() => setSeverity(item)} className={`rounded-2xl border px-4 py-3 text-left text-sm ${severity === item ? "border-violet-300/30 bg-violet-400/15 text-violet-100" : "border-white/10 bg-white/[0.035] text-slate-400"}`}>{item.toUpperCase()}</button>)}
        </div>
        <div className="mt-5 space-y-3">
          <ModuleRow label="Private streams" value={String(props.data.privateStreams.filter((stream) => stream.status === "HEALTHY").length)} status="Healthy" tone="green" />
          <ModuleRow label="Protection missing" value={String(props.data.reconciliationMismatches.filter((item) => item.mismatchType === "PROTECTION_ORDER_MISSING").length)} status="Supervisor" tone="red" />
          <ModuleRow label="Readiness passed" value={`${props.data.liveReadiness.filter((check) => check.status === "PASSED").length}/${props.data.liveReadiness.length}`} status="LIVE gate" tone="amber" />
        </div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Forensic Feed" title="Unresolved and historical incidents" action={<PremiumButton onClick={() => { void props.data.reload(); }}>Refresh</PremiumButton>} />
        <div className="space-y-3">
          {filtered.length === 0 ? <EmptyState title="No incidents" body="The incident center has no events for this filter." /> : filtered.map((incident) => <button key={incident.id} onClick={() => props.openDrawer({ title: incident.incidentType, eyebrow: "Incident", body: incident.message, rows: [{ label: "Severity", value: incident.severity }, { label: "Account", value: incident.accountId ?? "System" }, { label: "Resolved", value: incident.resolved ? "Yes" : "No" }, { label: "Created", value: formatShortDate(incident.createdAt) }] })} className={`w-full rounded-2xl border p-4 text-left transition hover:bg-white/[0.06] ${incident.severity === "critical" ? "border-rose-400/20 bg-rose-400/10 text-rose-100" : incident.severity === "warning" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/[0.035] text-slate-300"}`}><div className="flex items-center justify-between"><span className="font-medium">{incident.incidentType}</span><span className="text-xs uppercase tracking-[0.18em]">{incident.severity}</span></div><p className="mt-2 text-xs leading-5 opacity-80">{incident.message}</p></button>)}
        </div>
      </Panel>
    </div>
  );
}

export function OpsCenterPage(props: ConsoleViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Panel className="p-5">
        <SectionHeader eyebrow="Runtime Metrics" title="Prometheus-grade observability" action={<PremiumButton onClick={() => { void props.data.reload(); }}>Refresh</PremiumButton>} />
        <div className="grid gap-3 md:grid-cols-2">{props.data.metrics.length === 0 ? systemModules.map((module) => <ModuleCard key={module.id} module={module} />) : props.data.metrics.slice(0, 8).map((metric) => <div key={`${metric.name}-${metric.updatedAt}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-xs text-slate-500">{metric.name}</div><div className="mt-2 text-2xl font-semibold text-white">{metric.value}</div><div className="mt-1 text-[11px] text-slate-500">{metric.kind} · {formatShortDate(metric.updatedAt)}</div></div>)}</div>
      </Panel>
      <Panel className="p-5">
        <SectionHeader eyebrow="Streams" title="Redis Streams and dead letters" />
        <div className="space-y-3">{props.data.streamMetrics.length === 0 ? <EmptyState title="No stream metrics" body="Admin metrics will appear when the backend returns stream state." /> : props.data.streamMetrics.map((stream) => <div key={stream.channel} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-white">{stream.channel}</span><span className="text-xs text-slate-500">pending {stream.pending}</span></div><div className="mt-2 text-xs text-slate-500">Length {stream.length}</div></div>)}</div>
        <div className="mt-5"><SectionHeader eyebrow="Dead Letters" title="Failed critical events" />{props.data.deadLetters.length === 0 ? <EmptyState title="No dead letters" body="The critical processing stream has no failed events in the current window." /> : props.data.deadLetters.map((letter) => <div key={letter.id} className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-xs text-rose-100">{letter.id}</div>)}</div>
      </Panel>
    </div>
  );
}

export function SettingsPage(props: ConsoleViewProps & { readonly onSignOut: () => Promise<void> }) {
  const [density, setDensity] = useState("Comfortable");
  const [alerts, setAlerts] = useState(true);
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel className="p-5"><SectionHeader eyebrow="Profile" title="Operator workspace" /><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="text-sm font-semibold text-white">{props.user.email}</div><div className="mt-1 text-xs text-slate-500">Roles: {props.user.roles.join(", ") || "operator"}</div><PremiumButton className="mt-5" tone="red" onClick={() => { void props.onSignOut(); }}>Sign out</PremiumButton></div></Panel>
      <Panel className="p-5"><SectionHeader eyebrow="Display" title="Console behavior" action={<PremiumButton tone="green" onClick={() => props.pushToast({ title: "Settings saved", body: `Density ${density}, alerts ${alerts ? "enabled" : "disabled"}.`, tone: "success" })}>Save settings</PremiumButton>} /><div className="space-y-4"><div><div className="mb-2 text-sm text-slate-400">Density</div><div className="flex gap-2">{["Compact", "Comfortable", "Executive"].map((item) => <button key={item} onClick={() => setDensity(item)} className={`rounded-xl border px-4 py-2 text-sm ${density === item ? "border-violet-300/30 bg-violet-400/15 text-violet-100" : "border-white/10 bg-white/[0.035] text-slate-400"}`}>{item}</button>)}</div></div><button onClick={() => setAlerts((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left"><span><span className="block text-sm font-medium text-white">Operator alerts</span><span className="text-xs text-slate-500">Toast and drawer notifications for critical states</span></span><span className={`rounded-full px-3 py-1 text-xs ${alerts ? "bg-emerald-400/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>{alerts ? "Enabled" : "Muted"}</span></button></div></Panel>
    </div>
  );
}

function LiveActivityPanel({ events, openDrawer, setView }: Readonly<{ events: ReturnType<typeof buildAgentActivity>; openDrawer(payload: DrawerPayload): void; setView(view: "terminal"): void }>) {
  return <Panel className="p-5"><SectionHeader eyebrow="Live Terminal" title="All Events" action={<PremiumButton onClick={() => setView("terminal")}>Open terminal</PremiumButton>} /><div className="space-y-1">{events.map((event) => <button key={event.id} onClick={() => openDrawer({ title: event.title, eyebrow: "Agent Event", body: event.body, rows: [{ label: "Time", value: event.time }, { label: "Tone", value: event.tone }] })} className="grid w-full grid-cols-[84px_110px_1fr_70px] items-center rounded-xl border border-transparent px-3 py-3 text-left text-xs transition hover:border-white/10 hover:bg-white/[0.04]"><span className="text-slate-500">{event.time}</span><span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">{event.title.slice(0, 12)}</span><span className="truncate text-slate-300">{event.body}</span><span className="text-right text-slate-500">High</span></button>)}</div></Panel>;
}

function FeaturedStrategyPanel({ strategies, openDrawer, setView }: Readonly<{ strategies: readonly StrategyRule[]; openDrawer(payload: DrawerPayload): void; setView(view: "strategies"): void }>) {
  const strategy = strategies[0];
  return <Panel className="p-5"><SectionHeader eyebrow="Strategy Feed" title="Featured strategy" action={<PremiumButton onClick={() => setView("strategies")}>View all</PremiumButton>} />{strategy ? <FeaturedStrategy strategy={strategy} openDrawer={openDrawer} /> : <EmptyState title="No strategy yet" body="Accepted OSINT strategies will appear after ingestion." />}</Panel>;
}

function FeaturedStrategy({ strategy, openDrawer }: Readonly<{ strategy: StrategyRule; openDrawer(payload: DrawerPayload): void }>) {
  return <button onClick={() => openStrategyDrawer(strategy, openDrawer)} className="w-full rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4 text-left transition hover:bg-violet-400/15"><div className="flex items-center justify-between"><h3 className="text-base font-semibold text-white">{strategy.sourceTitle}</h3><span className="rounded-md bg-violet-400/20 px-2 py-1 text-[10px] text-violet-100">{strategy.sourceType}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{strategy.trigger}</p><div className="mt-4 grid grid-cols-4 gap-3 text-xs"><Metric label="Win proxy" value={formatPercent(strategy.confidenceScore)} tone="green" /><Metric label="Trust" value={formatPercent(strategy.sourceTrustScore)} tone="blue" /><Metric label="Evidence" value={formatPercent(strategy.evidenceScore.aggregate)} tone="purple" /><Metric label="Review" value={strategy.reviewStatus} tone="amber" /></div><Sparkline points={[18, 24, 22, 31, 34, 39, 42, 51, 56]} tone="purple" className="mt-4 h-20 w-full" /></button>;
}

function MarketOverviewPanel({ rows, openDrawer, setView }: Readonly<{ rows: readonly ReturnType<typeof inferMarketRowsFromSignals>[number][]; openDrawer(payload: DrawerPayload): void; setView(view: "market"): void }>) {
  return <Panel className="p-5"><SectionHeader eyebrow="Market Overview" title="Core pairs" action={<PremiumButton onClick={() => setView("market")}>View all</PremiumButton>} /><div className="space-y-1">{rows.slice(0, 8).map((row) => <MarketRowCard key={row.pair} row={row} compact openDrawer={openDrawer} />)}</div></Panel>;
}

function AiMarketAnalysisCard({ data, openDrawer, runCycle }: Readonly<{ data: ConsoleViewProps["data"]; openDrawer(payload: DrawerPayload): void; runCycle(): Promise<void> }>) {
  return <Panel className="p-5"><div className="grid gap-5 md:grid-cols-[130px_1fr_170px]"><div className="grid place-items-center"><div className="relative h-28 w-28 rounded-full border border-violet-400/20 bg-violet-400/10 shadow-[0_0_60px_rgba(124,58,237,0.24)]"><BrainCircuit className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-violet-200" /></div></div><div><p className="text-[10px] uppercase tracking-[0.28em] text-violet-300/70">AI Market Analysis</p><h3 className="mt-2 text-lg font-semibold text-white">GPT-4 market vector synthesis</h3><p className="mt-3 text-sm leading-7 text-slate-400">Market showing strong bullish momentum across major pairs. Bitcoin leads with institutional accumulation, orderbook pressure and filtered social strategy confirmation.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Bullish</span><span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs text-sky-200">High Momentum</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">Low Volatility</span></div></div><div className="flex flex-col justify-between"><ProgressRing value={87} tone="purple" size={72} /><PremiumButton tone="purple" onClick={() => { void runCycle(); }}>Run cycle</PremiumButton><PremiumButton onClick={() => openDrawer({ title: "Market Vector", eyebrow: "Analyst Output", body: `Live events ${data.events.length}, strategies ${data.strategies.length}, signals ${data.signals.length}.`, rows: [{ label: "Confidence", value: "87%" }, { label: "Adapters", value: String(data.adapters.length) }] })}>Inspect vector</PremiumButton></div></div></Panel>;
}

function AgentStatusList({ openDrawer, setView }: Readonly<{ openDrawer(payload: DrawerPayload): void; setView(view: "agents"): void }>) {
  return <Panel className="p-5"><SectionHeader eyebrow="Agent Network Status" title="Mesh health" action={<PremiumButton onClick={() => setView("agents")}>View all</PremiumButton>} /><div className="space-y-2">{agentNodes.map((agent) => <button key={agent.id} onClick={() => openDrawer({ title: agent.name, eyebrow: "Agent Detail", body: agent.role, rows: [{ label: "Uptime", value: agent.uptime }, { label: "Accuracy", value: agent.accuracy }, { label: "Latency", value: agent.latency }] })} className="grid w-full grid-cols-[1fr_70px_70px] items-center rounded-xl border border-transparent px-3 py-2 text-left text-sm transition hover:border-white/10 hover:bg-white/[0.04]"><span className="text-slate-300">{agent.name} · {agent.role}</span><span className="text-slate-400">{agent.uptime}</span><span className="text-emerald-300">Online</span></button>)}</div></Panel>;
}

function TerminalRow({ event, openDrawer }: Readonly<{ event: AgentEnvelope; openDrawer(payload: DrawerPayload): void }>) {
  const severity = event.channel === "security.audit" ? "Medium" : event.channel === "agent.strategy.signal" ? "High" : "Low";
  return <button onClick={() => openDrawer({ title: event.sender_agent.replaceAll("_", " "), eyebrow: event.channel, body: event.agent_log, rows: [{ label: "Transaction", value: event.transaction_id }, { label: "Trace", value: event.trace_id }, { label: "Stage", value: event.pipeline_stage }] })} className="grid w-full grid-cols-[110px_130px_1fr_90px] items-center border-b border-white/5 px-4 py-3 text-left text-xs transition hover:bg-white/[0.04]"><span className="text-slate-500">{new Date(event.timestamp).toLocaleTimeString("en-GB")}</span><span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300">{event.sender_agent.replace("Agent_", "A")}</span><span className="truncate text-slate-300">{event.agent_log}</span><span className={severity === "High" ? "text-rose-300" : severity === "Medium" ? "text-amber-300" : "text-emerald-300"}>{severity}</span></button>;
}

function StrategyCompactRow({ strategy, openDrawer }: Readonly<{ strategy: StrategyRule; openDrawer(payload: DrawerPayload): void }>) {
  return <button onClick={() => openStrategyDrawer(strategy, openDrawer)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left transition hover:bg-white/[0.06]"><span><span className="block text-sm text-white">{strategy.sourceTitle}</span><span className="text-xs text-slate-500">{strategy.timeframe} · {strategy.action}</span></span><span className="text-xs text-slate-400">{formatPercent(strategy.confidenceScore)} win rate</span></button>;
}

function StrategyReviewCard({ strategy, openDrawer, pushToast }: Readonly<{ strategy: StrategyRule; openDrawer(payload: DrawerPayload): void; pushToast(message: { title: string; body: string; tone: "success" | "warning" | "danger" | "neutral" }): void }>) {
  const tone = strategy.reviewStatus === "ACCEPTED" ? "green" : strategy.reviewStatus === "QUARANTINED" ? "amber" : "red";
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-white">{strategy.sourceTitle}</span><span className={`rounded-md px-2 py-1 text-[10px] ${tone === "green" ? "bg-emerald-400/10 text-emerald-200" : tone === "amber" ? "bg-amber-400/10 text-amber-200" : "bg-rose-400/10 text-rose-200"}`}>{strategy.reviewStatus}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{strategy.reviewReason}</p><div className="mt-4 flex gap-2"><PremiumButton onClick={() => openStrategyDrawer(strategy, openDrawer)}><Eye className="h-3.5 w-3.5" />Inspect</PremiumButton><PremiumButton tone="green" onClick={() => pushToast({ title: "Strategy accepted", body: strategy.sourceTitle, tone: "success" })}><CheckCircle2 className="h-3.5 w-3.5" />Accept</PremiumButton><PremiumButton tone="amber" onClick={() => pushToast({ title: "Strategy quarantined", body: strategy.sourceTitle, tone: "warning" })}><ShieldAlert className="h-3.5 w-3.5" />Hold</PremiumButton></div></div>;
}

function SignalRow({ signal, openDrawer }: Readonly<{ signal: TradeSignal; openDrawer(payload: DrawerPayload): void }>) {
  const tone = signal.action === "SHORT" ? "red" : signal.action === "LONG" ? "green" : "neutral";
  return <button onClick={() => openSignalDrawer(signal, openDrawer)} className="grid w-full grid-cols-[1fr_120px_120px_100px_140px_80px] items-center border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.04]"><span className="font-medium text-white">{signal.pair}</span><span className={tone === "red" ? "text-rose-300" : tone === "green" ? "text-emerald-300" : "text-slate-400"}>{signal.action}</span><span><ProgressRing value={Math.round(signal.confidenceScore * 100)} tone={tone as Tone} size={42} /></span><span className="text-slate-300">{signal.leverage}x</span><span className="truncate text-slate-500">{signal.strategySource}</span><span><ArrowUpRight className="h-4 w-4 text-violet-300" /></span></button>;
}

function SignalExplainCard({ signal, openDrawer }: Readonly<{ signal: TradeSignal; openDrawer(payload: DrawerPayload): void }>) {
  return <Panel hover className="p-4"><div className="flex items-center justify-between"><IconBadge icon={signal.action === "SHORT" ? TrendingDown : TrendingUp} tone={signal.action === "SHORT" ? "red" : "green"} /><span className="text-xs text-slate-500">{formatShortDate(signal.createdAt)}</span></div><h3 className="mt-4 text-lg font-semibold text-white">{signal.pair} · {signal.action}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{signal.rationale}</p><PremiumButton className="mt-4 w-full" onClick={() => openSignalDrawer(signal, openDrawer)}>Open explainability</PremiumButton></Panel>;
}

function MarketRowCard({ row, openDrawer, compact = false }: Readonly<{ row: ReturnType<typeof inferMarketRowsFromSignals>[number]; openDrawer(payload: DrawerPayload): void; compact?: boolean }>) {
  return <button onClick={() => openDrawer({ title: row.pair, eyebrow: "Market Pair", body: `${row.pair} is currently classified as ${row.regime} with ${row.liquidity.toLowerCase()} liquidity.`, rows: [{ label: "Price", value: row.price }, { label: "Change", value: row.change }, { label: "PnL", value: row.pnl }, { label: "Liquidity", value: row.liquidity }] })} className={`grid w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/[0.04] ${compact ? "grid-cols-[1fr_92px_80px_80px]" : "grid-cols-[1fr_120px_90px_90px_140px]"}`}><span className="font-medium text-white">{row.pair}</span><span className="text-sm text-slate-300">{row.price}</span><span className={row.tone === "green" ? "text-emerald-300" : "text-rose-300"}>{row.change}</span><span className={row.tone === "green" ? "text-emerald-300" : "text-rose-300"}>{row.pnl}</span>{compact ? null : <Sparkline points={row.points} tone={row.tone} className="h-9 w-28" />}</button>;
}

function AdapterStatusCard({ adapter, openDrawer }: Readonly<{ adapter: AdapterStatus; openDrawer(payload: DrawerPayload): void }>) {
  const tone: Tone = adapter.stale || adapter.errorReason ? "amber" : adapter.connected ? "green" : "red";
  return <button onClick={() => openDrawer({ title: `${adapter.exchange} ${adapter.pair}`, eyebrow: "Market Adapter", body: adapter.errorReason ?? "Adapter is streaming market data and publishing freshness metrics.", rows: [{ label: "Connected", value: adapter.connected ? "Yes" : "No" }, { label: "Stale", value: adapter.stale ? "Yes" : "No" }, { label: "Reconnects", value: String(adapter.reconnectAttempts) }, { label: "Missing fields", value: adapter.missingFields.join(", ") || "None" }] })} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:bg-white/[0.06]"><div className="flex items-center justify-between"><div><div className="text-lg font-semibold text-white">{adapter.exchange}</div><div className="text-xs text-slate-500">{adapter.pair}</div></div><StatusDot tone={tone} label={adapter.connected ? "Connected" : "Offline"} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500"><span>Last message: {adapter.lastMessageAt ? formatShortDate(adapter.lastMessageAt) : "None"}</span><span>REST backfill: {adapter.lastRestBackfillAt ? formatShortDate(adapter.lastRestBackfillAt) : "None"}</span></div></button>;
}

function AgentCard({ agent, paused, toggle, openDrawer }: Readonly<{ agent: typeof agentNodes[number]; paused: boolean; toggle(): void; openDrawer(payload: DrawerPayload): void }>) {
  return <Panel hover className="p-5"><div className="flex items-start justify-between"><IconBadge icon={BrainCircuit} tone={agent.accent as Tone} /><StatusDot tone={paused ? "amber" : agent.status === "degraded" ? "red" : "green"} label={paused ? "Paused" : agent.status} /></div><h3 className="mt-5 text-lg font-semibold text-white">{agent.name}</h3><p className="mt-1 text-sm text-slate-500">{agent.role}</p><div className="mt-5 grid grid-cols-3 gap-2 text-xs"><Metric label="Uptime" value={agent.uptime} tone="green" /><Metric label="Accuracy" value={agent.accuracy} tone="blue" /><Metric label="Latency" value={agent.latency} tone="purple" /></div><div className="mt-4 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-violet-400" style={{ width: `${agent.load}%` }} /></div><div className="mt-5 flex gap-2"><PremiumButton onClick={toggle} tone={paused ? "green" : "amber"}>{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}</PremiumButton><PremiumButton onClick={() => openDrawer({ title: agent.name, eyebrow: "Agent Node", body: agent.role, rows: [{ label: "Uptime", value: agent.uptime }, { label: "Accuracy", value: agent.accuracy }, { label: "Latency", value: agent.latency }, { label: "Load", value: `${agent.load}%` }] })}>Inspect</PremiumButton></div></Panel>;
}

function RiskGauge({ label, value, limit, tone }: Readonly<{ label: string; value: number; limit: number; tone: Tone }>) {
  const percent = Math.min(1, limit > 0 ? value / limit : 0);
  return <div className="flex items-center gap-5"><ProgressRing value={Math.round(percent * 100)} tone={tone} /><div><div className="text-sm font-medium text-white">{label}</div><div className="mt-1 text-xs text-slate-500">Limit {Math.round(limit * 100)}%</div><div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{percent >= 1 ? "Circuit active" : "Protected"}</div></div></div>;
}

function PositionTimerCard({ position, csrfToken, pushToast, reload, openDrawer }: Readonly<{ position: Position; csrfToken: string | null; pushToast(message: { readonly title: string; readonly body: string; readonly tone: "success" | "warning" | "danger" | "neutral" }): void; reload(): Promise<void>; openDrawer(payload: DrawerPayload): void }>) {
  const elapsed = Math.max(0, (Date.now() - new Date(position.openedAt).getTime()) / 60_000);
  const remaining = Math.max(0, 180 - elapsed);
  const tone: Tone = remaining <= 0 ? "red" : remaining <= 15 ? "amber" : "green";
  return <div className="grid grid-cols-[1fr_120px_110px_120px_170px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:bg-white/[0.06]"><button onClick={() => openDrawer({ title: `${position.pair} ${position.direction}`, eyebrow: "Active Position", body: "Agent 6 monitors this intraday position and will emit FORCE_CLOSE_TIMEOUT at 180 minutes.", rows: [{ label: "Exchange", value: position.exchange }, { label: "Volume", value: String(position.volume) }, { label: "Entry", value: String(position.entryPrice) }, { label: "SL", value: String(position.stopLossPrice) }, { label: "TP", value: String(position.takeProfitPrice) }, { label: "Remaining", value: `${remaining.toFixed(1)} min` }] })} className="contents"><div><div className="text-sm font-medium text-white">{position.pair}</div><div className="text-xs text-slate-500">{position.direction} · {position.leverage}x</div></div><StatusDot tone={tone} label={`${remaining.toFixed(0)}m left`} /><div className="text-xs text-slate-400">Opened {formatShortDate(position.openedAt)}</div><div className="h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-violet-400" style={{ width: `${Math.min(100, (elapsed / 180) * 100)}%` }} /></div></button><div className="flex justify-end gap-2"><PremiumButton onClick={() => { void syncPosition(csrfToken, position.id).then((result) => { pushToast(result.error ? { title: "Sync failed", body: result.error, tone: "danger" } : { title: "Sync queued", body: `${position.pair} reconciliation requested.`, tone: "success" }); void reload(); }); }}>Sync</PremiumButton><PremiumButton tone="red" onClick={() => { const password = window.prompt(`Confirm manual close for ${position.pair} with your operator password`); if (!password) { pushToast({ title: "Close cancelled", body: "Operator password was not provided.", tone: "warning" }); return; } void requestPositionClose(csrfToken, position.id, "Manual operator close requested from Risk Cockpit", password).then((result) => { pushToast(result.error ? { title: "Close rejected", body: result.error, tone: "danger" } : { title: "Close completed", body: `${result.data?.position?.pair ?? position.pair} close command reached Agent 3.`, tone: "warning" }); void reload(); }); }}>Close</PremiumButton></div></div>;
}

function ExecutionRow({ execution, openDrawer }: Readonly<{ execution: ExecutionDecision; openDrawer(payload: DrawerPayload): void }>) {
  const tone: Tone = execution.status.includes("REJECTED") || execution.status === "FAILED_EXCHANGE" ? "red" : execution.status === "PAPER_OPENED" ? "amber" : "green";
  return <button onClick={() => openDrawer({ title: execution.id, eyebrow: "Execution Decision", body: execution.rejectionReason ?? `Agent 3 processed ${execution.signal.pair} ${execution.signal.direction}.`, rows: [{ label: "Status", value: execution.status }, { label: "Exchange", value: execution.exchange }, { label: "Pair", value: execution.signal.pair }, { label: "Latency", value: `${execution.latencyMs} ms` }, { label: "Market price", value: execution.marketPrice ? String(execution.marketPrice) : "n/a" }, { label: "Balance", value: execution.availableBalanceUsdt ? String(execution.availableBalanceUsdt) : "n/a" }] })} className="grid w-full grid-cols-[1fr_120px_110px_120px_1fr] items-center gap-3 border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.04]"><span className="font-medium text-white">{execution.signal.pair}</span><StatusDot tone={tone} label={execution.status} /><span className="text-slate-400">{execution.exchange}</span><span className="text-slate-400">{execution.latencyMs} ms</span><span className="truncate text-xs text-slate-500">{execution.rejectionReason ?? execution.exchangePositionId ?? execution.exchangeOrderId ?? "Accepted"}</span></button>;
}

function RangeControl({ label, value, min, max, step, suffix, onChange }: Readonly<{ label: string; value: number; min: number; max: number; step: number; suffix: string; onChange(value: number): void }>) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-sm text-slate-300">{label}</span><span className="text-sm font-semibold text-white">{value}{suffix}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-violet-400" /></div>;
}

function ModuleCard({ module }: Readonly<{ module: typeof systemModules[number] }>) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><IconBadge icon={module.icon} tone={module.tone as Tone} /><div className="mt-3 text-sm font-medium text-white">{module.label}</div><div className="mt-1 text-xs text-slate-500">{module.status} · {module.value}</div></div>;
}

function ModuleRow({ label, value, status, tone }: Readonly<{ label: string; value: string; status: string; tone: Tone }>) {
  return <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-3"><span className="text-sm text-slate-300">{label}</span><span className="text-xs text-slate-500">{value}</span><StatusDot tone={tone} label={status} /></div>;
}

function Metric({ label, value, tone }: Readonly<{ label: string; value: string; tone: Tone }>) {
  return <div><div className="text-[10px] text-slate-500">{label}</div><div className={tone === "red" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : tone === "purple" ? "text-violet-300" : tone === "blue" ? "text-sky-300" : "text-emerald-300"}>{value}</div></div>;
}

function EmptyState({ title, body }: Readonly<{ title: string; body: string }>) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center"><div className="text-sm font-medium text-white">{title}</div><div className="mt-2 text-sm text-slate-500">{body}</div></div>;
}

function openStrategyDrawer(strategy: StrategyRule, openDrawer: (payload: DrawerPayload) => void): void {
  openDrawer({ title: strategy.sourceTitle, eyebrow: "Strategy Intelligence", body: strategy.extractedText, rows: [{ label: "Trigger", value: strategy.trigger }, { label: "Action", value: strategy.action }, { label: "Timeframe", value: strategy.timeframe }, { label: "Confidence", value: formatPercent(strategy.confidenceScore) }, { label: "Evidence", value: formatPercent(strategy.evidenceScore.aggregate) }, { label: "Review", value: strategy.reviewStatus }], actionLabel: strategy.sourceUrl ? "Open source page" : undefined, actionUrl: strategy.sourceUrl });
}

function openSignalDrawer(signal: TradeSignal, openDrawer: (payload: DrawerPayload) => void): void {
  openDrawer({ title: `${signal.pair} ${signal.action}`, eyebrow: "Signal Explainability", body: signal.rationale, rows: [{ label: "Confidence", value: formatPercent(signal.confidenceScore) }, { label: "Leverage", value: `${signal.leverage}x` }, { label: "Entry range", value: signal.entryPriceRange ? `${signal.entryPriceRange.min} - ${signal.entryPriceRange.max}` : "Not executable" }, { label: "Stop loss", value: signal.suggestedStopLoss ? String(signal.suggestedStopLoss) : "n/a" }, { label: "Take profit", value: signal.suggestedTakeProfit ? String(signal.suggestedTakeProfit) : "n/a" }, { label: "RSI 5m", value: String(signal.technicalIndicators.rsi5m) }, { label: "Funding", value: String(signal.technicalIndicators.fundingRate) }, { label: "Orderbook", value: String(signal.technicalIndicators.orderbookImbalance) }] });
}

function matchesStrategy(strategy: StrategyRule, search: string): boolean {
  const normalized = normalizeSearch(search);
  if (normalized.length === 0) return true;
  return `${strategy.sourceTitle} ${strategy.trigger} ${strategy.sourceType} ${strategy.action}`.toLowerCase().includes(normalized);
}

function matchesSignal(signal: TradeSignal, search: string): boolean {
  const normalized = normalizeSearch(search);
  if (normalized.length === 0) return true;
  return `${signal.pair} ${signal.action} ${signal.rationale} ${signal.strategySource}`.toLowerCase().includes(normalized);
}

function downloadJson(filename: string, payload: readonly object[]): void {
  downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
}

function downloadCsv(filename: string, signals: readonly TradeSignal[]): void {
  const header = "pair,action,leverage,confidence,strategy,createdAt";
  const rows = signals.map((signal) => [signal.pair, signal.action, String(signal.leverage), String(signal.confidenceScore), signal.strategySource.replaceAll(",", " "), signal.createdAt].join(","));
  downloadText(filename, [header, ...rows].join("\n"), "text/csv");
}

function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function LiveReadinessWizardPage(props: ConsoleViewProps) {
  const wizard = props.data.liveReadinessWizard;
  const accountId = props.data.riskStates[0]?.accountId ?? props.data.positions[0]?.accountId ?? null;
  const steps = wizard?.steps ?? [];
  const passed = steps.filter((step) => step.status === "PASSED").length;
  const ratio = steps.length === 0 ? 0 : Math.round((passed / steps.length) * 100);
  async function markStep(stepKey: string): Promise<void> {
    const password = window.prompt("Operator password is required to certify this readiness step.");
    if (!password) {
      props.pushToast({ title: "Certification canceled", body: "No password was provided.", tone: "warning" });
      return;
    }
    const result = await updateLiveReadinessWizardStep(props.csrfToken, { accountId, stepKey, status: "PASSED", message: "Certified by operator through institutional wizard.", password });
    props.pushToast(result.error ? { title: "Step was not certified", body: result.error, tone: "danger" } : { title: "Readiness step certified", body: stepKey, tone: "success" });
    await props.data.reload();
  }
  return <div className="space-y-4"><Panel className="p-6"><SectionHeader eyebrow="Live Readiness Wizard" title="Institutional live trading certification" action={<ProgressRing value={ratio} tone={ratio === 100 ? "green" : "amber"} size={70} />} /><div className="mt-6 grid gap-3 xl:grid-cols-2">{steps.map((step) => <div key={step.key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-white">{step.label}</div><p className="mt-2 text-xs leading-5 text-slate-500">{step.message}</p></div><span className={`rounded-md px-2 py-1 text-[10px] ${step.status === "PASSED" ? "bg-emerald-400/10 text-emerald-200" : step.status === "FAILED" || step.status === "BLOCKED" ? "bg-rose-400/10 text-rose-200" : "bg-amber-400/10 text-amber-200"}`}>{step.status}</span></div><div className="mt-4 flex gap-2"><PremiumButton tone="green" onClick={() => { void markStep(step.key); }}>Certify</PremiumButton><PremiumButton onClick={() => props.openDrawer({ title: step.label, eyebrow: "Readiness Evidence", body: step.message, rows: [{ label: "Required", value: step.required ? "Yes" : "No" }, { label: "Status", value: step.status }, { label: "Current run", value: wizard?.status ?? "NOT_STARTED" }] })}>Inspect</PremiumButton></div></div>)}</div></Panel><Panel className="p-5"><SectionHeader eyebrow="Live Gate" title="Unlock conditions" /><div className="grid gap-3 md:grid-cols-4"><Metric label="Certified" value={`${passed}/${steps.length}`} tone="green" /><Metric label="Gate" value={wizard?.status ?? "LOCKED"} tone="amber" /><Metric label="Current Step" value={wizard?.currentStep ?? "environment"} tone="blue" /><Metric label="Live Mode" value={ratio === 100 ? "Available" : "Unavailable"} tone={ratio === 100 ? "green" : "red"} /></div></Panel></div>;
}

export function OperationsCommandCenterPage(props: ConsoleViewProps) {
  const health = props.data.operationsHealth;
  const activeSafe = props.data.safeModeEvents.filter((event) => event.active);
  async function triggerSafeMode(): Promise<void> {
    const password = window.prompt("Operator password required for safe mode.");
    if (!password) return;
    const result = await activateSafeMode(props.csrfToken, { triggerType: "MANUAL_OPERATOR_LOCK", severity: "critical", reason: "Operator manually activated institutional safe mode.", recoveryChecklist: ["Freeze new entries", "Verify private streams", "Inspect reconciliation", "Confirm protection orders", "Review incidents"], password });
    props.pushToast(result.error ? { title: "Safe mode rejected", body: result.error, tone: "danger" } : { title: "Safe mode active", body: "New entries are frozen until recovery is complete.", tone: "warning" });
    await props.data.reload();
  }
  return <div className="space-y-4"><div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]"><Panel className="p-6"><SectionHeader eyebrow="Operations Command Center" title="Safe mode and infrastructure posture" action={<PremiumButton tone="red" onClick={() => { void triggerSafeMode(); }}>Activate Safe Mode</PremiumButton>} /><div className="mt-6 grid gap-3 md:grid-cols-4"><Metric label="Health" value={health?.healthStatus ?? "NORMAL"} tone={health?.healthStatus === "CRITICAL" ? "red" : "green"} /><Metric label="Safe Mode" value={activeSafe.length === 0 ? "Inactive" : "Active"} tone={activeSafe.length === 0 ? "green" : "red"} /><Metric label="Private Streams" value={String(props.data.privateStreams.length)} tone="blue" /><Metric label="Incidents" value={String(props.data.incidents.filter((item) => !item.resolved).length)} tone="amber" /></div><div className="mt-6 grid gap-3 md:grid-cols-2">{activeSafe.map((event) => <div key={event.id} className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"><div className="text-sm font-semibold text-rose-100">{event.triggerType}</div><p className="mt-2 text-xs leading-5 text-rose-100/70">{event.reason}</p><div className="mt-3 text-[11px] text-rose-100/60">{event.recoveryChecklist.join(" · ")}</div></div>)}</div></Panel><Panel className="p-6"><SectionHeader eyebrow="Infrastructure" title="Subsystem pulse" /><HealthGrid title="Agent" values={health?.agentHealth ?? { agentMesh: "nominal", activeAgents: 6 }} /><HealthGrid title="Exchange" values={health?.exchangeHealth ?? { privateStreams: "awaiting_data", reconciliation: "awaiting_data" }} /><HealthGrid title="Risk" values={health?.riskHealth ?? { safeMode: false, liveGate: "locked" }} /></Panel></div></div>;
}

export function PortfolioProtectionPage(props: ConsoleViewProps) {
  const snapshot = props.data.portfolioSnapshot;
  const exposure = snapshot?.exposureByAsset ?? [];
  return <div className="space-y-4"><Panel className="p-6"><SectionHeader eyebrow="Portfolio & Capital Protection" title="Capital at risk overview" /><div className="mt-6 grid gap-3 md:grid-cols-5"><Metric label="Equity" value={`$${(snapshot?.totalEquityUsdt ?? 0).toLocaleString()}`} tone="green" /><Metric label="Realized" value={`$${(snapshot?.realizedPnlUsdt ?? 0).toLocaleString()}`} tone="blue" /><Metric label="Unrealized" value={`$${(snapshot?.unrealizedPnlUsdt ?? 0).toLocaleString()}`} tone="purple" /><Metric label="At Risk" value={`$${(snapshot?.capitalAtRiskUsdt ?? 0).toLocaleString()}`} tone="amber" /><Metric label="Positions" value={String(props.data.positions.length)} tone="blue" /></div></Panel><Panel className="p-5"><SectionHeader eyebrow="Exposure Map" title="Asset concentration" />{exposure.length === 0 ? <EmptyState title="No exposure snapshot" body="Portfolio snapshots appear after account equity synchronization." /> : <div className="space-y-2">{exposure.map((asset) => <div key={asset.asset} className="grid grid-cols-[120px_1fr_120px] items-center rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm"><span className="text-white">{asset.asset}</span><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${Math.round(asset.allocationRatio * 100)}%` }} /></div><span className="text-right text-slate-400">{formatPercent(asset.allocationRatio)}</span></div>)}</div>}</Panel></div>;
}

export function ForensicAuditPage(props: ConsoleViewProps) {
  async function openCase(): Promise<void> {
    const result = await createForensicCase(props.csrfToken, { executionId: props.data.executions[0]?.id ?? null, positionId: props.data.positions[0]?.id ?? null, signalTransactionId: props.data.signals[0]?.transactionId ?? null });
    props.pushToast(result.error ? { title: "Forensic case rejected", body: result.error, tone: "danger" } : { title: "Forensic case opened", body: result.data?.id ?? "Case created", tone: "success" });
    await props.data.reload();
  }
  return <Panel className="p-6"><SectionHeader eyebrow="Forensic Audit Mode" title="Signal-to-close evidence chain" action={<PremiumButton tone="purple" onClick={() => { void openCase(); }}>Open Case</PremiumButton>} /><div className="mt-6 space-y-3">{props.data.forensicCases.length === 0 ? <EmptyState title="No forensic cases" body="Open a case to reconstruct signal, risk checks, execution, protection and reconciliation." /> : props.data.forensicCases.map((item) => <button key={item.id} onClick={() => props.openDrawer({ title: item.id, eyebrow: "Forensic Case", body: item.caseStatus, rows: item.timeline.slice(0, 8).map((event) => ({ label: event.stage, value: event.status })) })} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left"><div className="flex items-center justify-between"><span className="font-mono text-xs text-violet-200">{item.id}</span><span className="text-xs text-slate-400">{item.caseStatus}</span></div><div className="mt-3 grid gap-2 md:grid-cols-3">{item.timeline.slice(0, 3).map((event) => <Metric key={`${item.id}-${event.stage}`} label={event.stage} value={event.status} tone={event.status === "FAILED" ? "red" : "blue"} />)}</div></button>)}</div></Panel>;
}

export function ApprovalControlPage(props: ConsoleViewProps) {
  async function requestApproval(): Promise<void> {
    const result = await createApprovalRequest(props.csrfToken, { requestType: "LIVE_ENABLE", modeRequested: "APPROVAL_REQUIRED", reason: "Operator requested human approval gate before live automation.", expiresInMinutes: 60 });
    props.pushToast(result.error ? { title: "Approval not created", body: result.error, tone: "danger" } : { title: "Approval request created", body: result.data?.id ?? "Pending", tone: "success" });
    await props.data.reload();
  }
  async function decide(id: string, status: "APPROVED" | "REJECTED"): Promise<void> {
    const password = window.prompt("Operator password required for approval decision.");
    if (!password) return;
    const result = await decideApprovalRequest(props.csrfToken, id, status, password);
    props.pushToast(result.error ? { title: "Decision rejected", body: result.error, tone: "danger" } : { title: "Approval updated", body: status, tone: status === "APPROVED" ? "success" : "warning" });
    await props.data.reload();
  }
  return <Panel className="p-6"><SectionHeader eyebrow="Human Approval Mode" title="Operator-controlled execution gates" action={<PremiumButton tone="purple" onClick={() => { void requestApproval(); }}>Request Approval</PremiumButton>} /><div className="mt-6 grid gap-4 xl:grid-cols-3"><Metric label="Observe Only" value="Available" tone="blue" /><Metric label="Approval Required" value="Recommended" tone="amber" /><Metric label="Live Auto" value="Locked" tone="red" /></div><div className="mt-6 space-y-3">{props.data.approvalRequests.map((request) => <div key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-white">{request.requestType}</div><div className="text-xs text-slate-500">{request.reason}</div></div><span className="text-xs text-slate-300">{request.status}</span></div><div className="mt-4 flex gap-2"><PremiumButton tone="green" onClick={() => { void decide(request.id, "APPROVED"); }}>Approve</PremiumButton><PremiumButton tone="red" onClick={() => { void decide(request.id, "REJECTED"); }}>Reject</PremiumButton></div></div>)}</div></Panel>;
}

export function DisasterRecoveryPage(props: ConsoleViewProps) {
  async function run(runType: "BACKUP_VERIFY" | "REDIS_OUTAGE_DRILL" | "EXCHANGE_OUTAGE_DRILL" | "VAULT_OUTAGE_DRILL" | "READ_ONLY_MODE_DRILL"): Promise<void> {
    const result = await runDisasterRecoveryDrill(props.csrfToken, runType);
    props.pushToast(result.error ? { title: "Drill rejected", body: result.error, tone: "danger" } : { title: "Drill completed", body: runType, tone: "success" });
    await props.data.reload();
  }
  return <Panel className="p-6"><SectionHeader eyebrow="Disaster Recovery" title="Operational resilience drills" action={<div className="flex gap-2"><PremiumButton onClick={() => { void run("BACKUP_VERIFY"); }}>Backup Verify</PremiumButton><PremiumButton onClick={() => { void run("READ_ONLY_MODE_DRILL"); }}>Read-only Drill</PremiumButton></div>} /><div className="mt-6 grid gap-3 md:grid-cols-2">{props.data.disasterRecoveryRuns.map((runItem) => <div key={runItem.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex justify-between"><span className="text-sm font-semibold text-white">{runItem.runType}</span><span className="text-xs text-slate-400">{runItem.status}</span></div><div className="mt-3 space-y-2">{runItem.steps.map((step) => <div key={`${runItem.id}-${step.label}`} className="flex justify-between text-xs"><span className="text-slate-400">{step.label}</span><span className="text-emerald-300">{step.status}</span></div>)}</div></div>)}</div></Panel>;
}

export function ComplianceCenterPage(props: ConsoleViewProps) {
  const policies: readonly { key: "risk_disclosure" | "terms" | "live_trading_consent" | "api_permission_warning" | "jurisdiction_warning" | "suitability_questionnaire"; label: string }[] = [
    { key: "risk_disclosure", label: "Risk Disclosure" },
    { key: "terms", label: "Terms" },
    { key: "live_trading_consent", label: "Live Trading Consent" },
    { key: "api_permission_warning", label: "API Permission Warning" },
    { key: "jurisdiction_warning", label: "Jurisdiction Warning" },
    { key: "suitability_questionnaire", label: "Suitability Questionnaire" }
  ];
  async function accept(key: typeof policies[number]["key"]): Promise<void> {
    const result = await acceptCompliance(props.csrfToken, { policyKey: key, version: "2026.06", accepted: true });
    props.pushToast(result.error ? { title: "Compliance update failed", body: result.error, tone: "danger" } : { title: "Compliance accepted", body: key, tone: "success" });
    await props.data.reload();
  }
  return <Panel className="p-6"><SectionHeader eyebrow="Legal & Compliance Layer" title="Consent and suitability records" /><div className="mt-6 grid gap-3 md:grid-cols-2">{policies.map((policy) => { const accepted = props.data.complianceAcceptances.some((item) => item.policyKey === policy.key && item.accepted); return <div key={policy.key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{policy.label}</span><span className={accepted ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{accepted ? "Accepted" : "Pending"}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Required before any live trading mode can be unlocked.</p><PremiumButton className="mt-4" onClick={() => { void accept(policy.key); }}>Accept</PremiumButton></div>; })}</div></Panel>;
}

export function TestEvidencePage(props: ConsoleViewProps) {
  async function createReport(): Promise<void> {
    const result = await createTestEvidenceReport(props.csrfToken, { reportType: "CI", status: "PENDING", summary: { requestedBy: "operator", scope: "institutional_finalization" } });
    props.pushToast(result.error ? { title: "Report not created", body: result.error, tone: "danger" } : { title: "Evidence report created", body: result.data?.id ?? "Report", tone: "success" });
    await props.data.reload();
  }
  return <Panel className="p-6"><SectionHeader eyebrow="Test Evidence Report" title="Verification proof surface" action={<PremiumButton tone="purple" onClick={() => { void createReport(); }}>Generate Report</PremiumButton>} /><div className="mt-6 grid gap-3 md:grid-cols-3">{["CI", "DOCKER", "E2E", "TESTNET", "SECURITY", "LOAD"].map((kind) => <Metric key={kind} label={kind} value={props.data.testEvidenceReports.find((item) => item.reportType === kind)?.status ?? "Pending"} tone="blue" />)}</div><div className="mt-6 space-y-3">{props.data.testEvidenceReports.map((report) => <div key={report.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex justify-between"><span className="font-mono text-xs text-violet-200">{report.id}</span><span className="text-xs text-slate-300">{report.reportType} · {report.status}</span></div><p className="mt-3 text-xs text-slate-500">Generated {formatShortDate(report.generatedAt)}</p></div>)}</div></Panel>;
}

function HealthGrid({ title, values }: Readonly<{ title: string; values: Readonly<Record<string, string | number | boolean | null>> }>) {
  return <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-sm font-semibold text-white">{title}</div><div className="mt-3 space-y-2">{Object.entries(values).map(([key, value]) => <div key={key} className="flex justify-between text-xs"><span className="text-slate-500">{key}</span><span className="text-slate-200">{String(value)}</span></div>)}</div></div>;
}
