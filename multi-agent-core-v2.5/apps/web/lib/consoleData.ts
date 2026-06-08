import type { AgentEnvelope, AdapterStatus, StrategyRule, TradeSignal } from "@ma-core/shared";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  CircleGauge,
  ClipboardCheck,
  Command,
  DatabaseZap,
  Gauge,
  KeyRound,
  LineChart,
  LockKeyhole,
  LucideIcon,
  Network,
  Radar,
  RadioTower,
  ReceiptText,
  Siren,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  TrendingUp,
  WalletCards
} from "lucide-react";

export type ConsoleViewId =
  | "overview"
  | "terminal"
  | "strategies"
  | "signals"
  | "market"
  | "agents"
  | "vault"
  | "risk"
  | "positions"
  | "incidents"
  | "readiness"
  | "operations"
  | "portfolio"
  | "forensics"
  | "approvals"
  | "disaster"
  | "compliance"
  | "evidence"
  | "ops"
  | "settings";

export interface NavigationItem {
  readonly id: ConsoleViewId;
  readonly label: string;
  readonly eyebrow: string;
  readonly icon: LucideIcon;
  readonly description: string;
}

export interface DashboardStat {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly change: string;
  readonly tone: "green" | "red" | "purple" | "blue" | "amber";
  readonly points: readonly number[];
  readonly detail: string;
}

export interface MarketRow {
  readonly pair: string;
  readonly price: string;
  readonly change: string;
  readonly pnl: string;
  readonly tone: "green" | "red";
  readonly points: readonly number[];
  readonly liquidity: string;
  readonly regime: string;
}

export interface AgentNode {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly uptime: string;
  readonly accuracy: string;
  readonly latency: string;
  readonly status: "online" | "syncing" | "degraded";
  readonly load: number;
  readonly accent: "blue" | "green" | "purple" | "amber" | "red";
}

export interface RiskPolicy {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly severity: "low" | "medium" | "high";
}

export interface ActivityRecord {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly body: string;
  readonly tone: "green" | "purple" | "blue" | "amber" | "red";
}

export interface CommandAction {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly targetView: ConsoleViewId;
  readonly icon: LucideIcon;
}

export const navigationItems: readonly NavigationItem[] = [
  { id: "overview", label: "Overview", eyebrow: "Command", icon: CircleGauge, description: "Executive operating picture" },
  { id: "terminal", label: "Live Terminal", eyebrow: "Telemetry", icon: TerminalSquare, description: "Real-time agent event stream" },
  { id: "strategies", label: "Strategy Feed", eyebrow: "OSINT", icon: BrainCircuit, description: "Accepted and quarantined strategy intelligence" },
  { id: "signals", label: "Signal Terminal", eyebrow: "Execution Prep", icon: RadioTower, description: "Generated signals before risk authorization" },
  { id: "market", label: "Market Analysis", eyebrow: "Exchange Data", icon: LineChart, description: "Market vectors, orderbook pressure and adapters" },
  { id: "agents", label: "Agent Network", eyebrow: "Core Mesh", icon: Network, description: "Multi-agent health and operational controls" },
  { id: "vault", label: "API Vault", eyebrow: "Security", icon: LockKeyhole, description: "Encrypted exchange credential management" },
  { id: "risk", label: "Risk Manager", eyebrow: "Policy", icon: ShieldCheck, description: "Exposure, drawdown and guardrail configuration" },
  { id: "positions", label: "Positions", eyebrow: "Lifecycle", icon: ReceiptText, description: "Open, closing and closed position lifecycle control" },
  { id: "incidents", label: "Incidents", eyebrow: "Forensics", icon: Siren, description: "Critical execution, stream and reconciliation incidents" },
  { id: "readiness", label: "Live Readiness", eyebrow: "Certification", icon: ClipboardCheck, description: "Step-by-step institutional live trading gate" },
  { id: "operations", label: "Command Center", eyebrow: "Operations", icon: Activity, description: "Safe mode, infrastructure, exchange and agent health" },
  { id: "portfolio", label: "Portfolio", eyebrow: "Capital", icon: WalletCards, description: "Capital protection, allocation and exposure map" },
  { id: "forensics", label: "Forensic Audit", eyebrow: "Evidence", icon: Search, description: "Signal-to-close evidence chain and trade reconstruction" },
  { id: "approvals", label: "Approvals", eyebrow: "Human Control", icon: KeyRound, description: "Observe, suggest, approval and live-auto control modes" },
  { id: "disaster", label: "Recovery", eyebrow: "Resilience", icon: Boxes, description: "Backup, read-only, exchange and vault outage drills" },
  { id: "compliance", label: "Compliance", eyebrow: "Legal", icon: LockKeyhole, description: "Risk disclosure, consent and suitability records" },
  { id: "evidence", label: "Evidence", eyebrow: "Proof", icon: BarChart3, description: "CI, Docker, e2e, testnet and security evidence reports" },
  { id: "ops", label: "Ops", eyebrow: "Infrastructure", icon: DatabaseZap, description: "Streams, metrics, incidents and audit surface" },
  { id: "settings", label: "Settings", eyebrow: "Workspace", icon: Settings, description: "Profile, display density and notifications" }
];

export const commandActions: readonly CommandAction[] = [
  { id: "open-overview", label: "Open institutional overview", hint: "Dashboard", targetView: "overview", icon: Gauge },
  { id: "inspect-terminal", label: "Inspect live terminal", hint: "SSE events", targetView: "terminal", icon: TerminalSquare },
  { id: "review-strategies", label: "Review strategy intelligence", hint: "OSINT feed", targetView: "strategies", icon: BrainCircuit },
  { id: "open-signals", label: "Open signal terminal", hint: "Pre-risk signals", targetView: "signals", icon: RadioTower },
  { id: "market-adapters", label: "Check market adapters", hint: "Binance / Bybit", targetView: "market", icon: LineChart },
  { id: "agent-network", label: "Open agent network", hint: "Mesh status", targetView: "agents", icon: Network },
  { id: "credential-vault", label: "Manage API vault", hint: "Exchange credentials", targetView: "vault", icon: KeyRound },
  { id: "risk-control", label: "Open risk policy", hint: "Guardrails", targetView: "risk", icon: ShieldCheck },
  { id: "positions-page", label: "Open position lifecycle", hint: "Fills / TTL", targetView: "positions", icon: ReceiptText },
  { id: "incident-center", label: "Open incident center", hint: "Critical alerts", targetView: "incidents", icon: Siren },
  { id: "readiness-wizard", label: "Open live readiness wizard", hint: "Certification", targetView: "readiness", icon: ClipboardCheck },
  { id: "operations-command", label: "Open operations command center", hint: "Safe mode", targetView: "operations", icon: Activity },
  { id: "portfolio-protection", label: "Open capital protection", hint: "Portfolio", targetView: "portfolio", icon: WalletCards },
  { id: "forensic-audit", label: "Open forensic audit", hint: "Evidence chain", targetView: "forensics", icon: Search },
  { id: "approval-mode", label: "Open approval controls", hint: "Human gate", targetView: "approvals", icon: KeyRound },
  { id: "disaster-recovery", label: "Open disaster recovery", hint: "Resilience", targetView: "disaster", icon: Boxes },
  { id: "compliance-center", label: "Open compliance records", hint: "Consent", targetView: "compliance", icon: LockKeyhole },
  { id: "test-evidence", label: "Open test evidence", hint: "Proof", targetView: "evidence", icon: BarChart3 },
  { id: "ops-center", label: "Open operations center", hint: "Metrics", targetView: "ops", icon: DatabaseZap },
  { id: "workspace-settings", label: "Open workspace settings", hint: "Profile", targetView: "settings", icon: Settings }
];

export const dashboardStats: readonly DashboardStat[] = [
  { id: "agents", label: "Active Agents", value: "6/6", change: "All systems operational", tone: "blue", points: [20, 27, 22, 31, 29, 37, 45, 42, 51], detail: "Agent mesh heartbeat is stable across analysis, strategy, risk and execution stages." },
  { id: "regime", label: "Market Regime", value: "BULLISH", change: "High momentum", tone: "green", points: [22, 25, 28, 29, 35, 38, 43, 41, 52], detail: "BTC and ETH momentum confirm higher highs while orderbook pressure remains constructive." },
  { id: "signals", label: "Total Signals (24h)", value: "247", change: "+23.5% vs yesterday", tone: "purple", points: [10, 13, 18, 16, 24, 27, 35, 33, 44], detail: "Signal production increased after strategy ingestion found stronger mean-reversion and momentum setups." },
  { id: "winrate", label: "Win Rate (30d)", value: "68.2%", change: "+4.3% vs previous 30d", tone: "blue", points: [40, 39, 43, 41, 48, 47, 51, 56, 60], detail: "Model confidence improved after filtering low-evidence social strategies from the active knowledge base." },
  { id: "pnl", label: "PnL (30d)", value: "+24.7%", change: "+$47,392.21", tone: "green", points: [10, 11, 15, 17, 24, 27, 31, 38, 46], detail: "The PnL module is represented as terminal state until execution agents are enabled in the next system phase." },
  { id: "risk", label: "Risk Score", value: "23/100", change: "Low Risk", tone: "amber", points: [28, 27, 25, 23, 24, 22, 21, 24, 23], detail: "Portfolio risk remains low because private stream health, reconciliation and protection supervisors are enforcing live-readiness gates." }
];

export const marketRows: readonly MarketRow[] = [
  { pair: "BTCUSDT", price: "67,432.50", change: "+2.45%", pnl: "+1,612.50", tone: "green", points: [21, 24, 23, 31, 29, 34, 38, 42, 46], liquidity: "Deep", regime: "Momentum" },
  { pair: "ETHUSDT", price: "3,245.80", change: "+1.87%", pnl: "+59.60", tone: "green", points: [20, 22, 21, 25, 29, 28, 34, 36, 39], liquidity: "Deep", regime: "Strength" },
  { pair: "BNBUSDT", price: "598.45", change: "-0.23%", pnl: "-1.37", tone: "red", points: [40, 36, 34, 35, 31, 30, 29, 27, 24], liquidity: "Medium", regime: "Compression" },
  { pair: "SOLUSDT", price: "162.34", change: "+3.21%", pnl: "+5.06", tone: "green", points: [14, 18, 19, 22, 28, 33, 32, 39, 45], liquidity: "Deep", regime: "Breakout" },
  { pair: "ADAUSDT", price: "0.4856", change: "+0.98%", pnl: "+0.0047", tone: "green", points: [16, 18, 17, 21, 23, 22, 25, 28, 29], liquidity: "Medium", regime: "Accumulation" },
  { pair: "XRPUSDT", price: "0.6123", change: "-1.45%", pnl: "-0.0090", tone: "red", points: [42, 39, 37, 33, 32, 29, 31, 28, 26], liquidity: "Medium", regime: "Distribution" },
  { pair: "DOGEUSDT", price: "0.1234", change: "+2.34%", pnl: "+0.0028", tone: "green", points: [18, 20, 21, 19, 26, 30, 28, 34, 36], liquidity: "Thin", regime: "Speculative" },
  { pair: "AVAXUSDT", price: "34.56", change: "+1.23%", pnl: "+0.42", tone: "green", points: [25, 26, 27, 30, 29, 31, 35, 34, 37], liquidity: "Medium", regime: "Rotation" }
];

export const agentNodes: readonly AgentNode[] = [
  { id: "agent-1", name: "Agent 1", role: "Market Data Collector", uptime: "99.9%", accuracy: "94.1%", latency: "42 ms", status: "online", load: 62, accent: "blue" },
  { id: "agent-2", name: "Agent 2", role: "Strategy Discovery", uptime: "99.8%", accuracy: "91.6%", latency: "68 ms", status: "online", load: 71, accent: "green" },
  { id: "agent-3", name: "Agent 3", role: "Order Executor", uptime: "99.7%", accuracy: "99.1%", latency: "19 ms", status: "online", load: 54, accent: "blue" },
  { id: "agent-4", name: "Agent 4", role: "Daily Drawdown Guard", uptime: "99.9%", accuracy: "99.4%", latency: "37 ms", status: "online", load: 45, accent: "purple" },
  { id: "agent-5", name: "Agent 5", role: "Daily Profit Cap Guard", uptime: "99.8%", accuracy: "99.0%", latency: "39 ms", status: "online", load: 43, accent: "amber" },
  { id: "agent-6", name: "Agent 6", role: "Time Horizon Guard", uptime: "99.7%", accuracy: "98.8%", latency: "50 ms", status: "online", load: 49, accent: "green" }
];

export const riskPolicies: readonly RiskPolicy[] = [
  { id: "max-drawdown", label: "Maximum Daily Drawdown", value: "5%", description: "All positions are force-closed and trading is locked if daily equity drawdown breaches this boundary.", severity: "medium" },
  { id: "profit-cap", label: "Daily Profit Cap", value: "15%", description: "New entries are locked after the daily realized profit cap is reached while open positions finish their TP/SL path.", severity: "medium" },
  { id: "correlation", label: "Correlation Exposure", value: "37%", description: "BTC-beta clustering is kept below the institutional policy threshold.", severity: "low" },
  { id: "session-window", label: "Trade Time Window", value: "< 3h", description: "Time manager rejects setups that exceed the scalp and intraday mandate.", severity: "low" },
  { id: "news-lock", label: "Macro News Lock", value: "Armed", description: "High-impact macro events require human confirmation before any execution stage.", severity: "high" }
];

export const activityRecords: readonly ActivityRecord[] = [
  { id: "activity-1", time: "14:32:41", title: "Market Data", body: "BTCUSDT orderbook imbalance detected · bid 55.2% / ask 44.8%", tone: "blue" },
  { id: "activity-2", time: "14:32:38", title: "Strategy Discovery", body: "New high-conviction strategy identified · 89.3% win rate · 2.8 R:R", tone: "purple" },
  { id: "activity-3", time: "14:32:35", title: "Technical Analysis", body: "RSI divergence detected on 4H timeframe · bullish divergence forming", tone: "amber" },
  { id: "activity-4", time: "14:32:31", title: "Signal Generation", body: "LONG signal generated · BTCUSDT · entry 67,432.50 · target 69,250.00", tone: "green" },
  { id: "activity-5", time: "14:32:28", title: "News Analysis", body: "Fed interest rate decision impact analyzed · positive sentiment for risk assets", tone: "blue" },
  { id: "activity-6", time: "14:32:25", title: "Risk Management", body: "Position size adjusted · risk score 23/100 · position 2.45%", tone: "green" }
];

export function inferMarketRowsFromSignals(signals: readonly TradeSignal[]): readonly MarketRow[] {
  if (signals.length === 0) return marketRows;
  const derived = signals.slice(0, 8).map((signal, index): MarketRow => {
    const tone = signal.action === "SHORT" ? "red" : "green";
    const confidence = Math.round(signal.confidenceScore * 100);
    return {
      pair: signal.pair.replace("/", ""),
      price: index === 0 ? "67,432.50" : `${(3200 + index * 187.42).toFixed(2)}`,
      change: tone === "green" ? `+${(1.1 + index / 5).toFixed(2)}%` : `-${(0.8 + index / 7).toFixed(2)}%`,
      pnl: tone === "green" ? `+${(confidence * 2.7).toFixed(2)}` : `-${(confidence * 1.2).toFixed(2)}`,
      tone,
      points: tone === "green" ? [18, 20, 23, 21, 27, 30, 34, 38, 42] : [44, 42, 39, 41, 36, 33, 30, 27, 25],
      liquidity: confidence > 75 ? "Deep" : "Medium",
      regime: signal.action === "NO_TRADE" ? "Neutral" : signal.action === "LONG" ? "Momentum" : "Distribution"
    };
  });
  return derived.length >= 4 ? derived : marketRows;
}

export function buildAgentActivity(events: readonly AgentEnvelope[]): readonly ActivityRecord[] {
  if (events.length === 0) return activityRecords;
  return events.slice(0, 8).map((event, index): ActivityRecord => ({
    id: `${event.idempotency_key}-${index}`,
    time: new Date(event.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    title: event.sender_agent.replaceAll("_", " "),
    body: event.agent_log,
    tone: event.channel === "security.audit" ? "amber" : event.channel === "agent.strategy.signal" ? "green" : event.channel === "agent.strategy.feed" ? "purple" : "blue"
  }));
}

export function adapterStatusSummary(statuses: readonly AdapterStatus[]): string {
  if (statuses.length === 0) return "Adapters warming up";
  const unhealthy = statuses.filter((status) => status.stale || status.errorReason !== null || !status.connected).length;
  if (unhealthy === 0) return "All feeds live";
  return `${unhealthy}/${statuses.length} feeds need attention`;
}

export const systemModules = [
  { id: "redis", label: "Redis Streams", icon: Boxes, status: "Connected", value: "0.8 ms", tone: "green" },
  { id: "database", label: "PostgreSQL", icon: DatabaseZap, status: "Healthy", value: "12 ms", tone: "green" },
  { id: "vault", label: "API Vault", icon: WalletCards, status: "Secured", value: "AES-256", tone: "purple" },
  { id: "osint", label: "OSINT Mesh", icon: Search, status: "Filtering", value: "Top sources", tone: "blue" },
  { id: "risk", label: "Risk Engine", icon: Radar, status: "Armed", value: "23/100", tone: "amber" },
  { id: "audit", label: "Audit Trail", icon: ReceiptText, status: "Immutable", value: "Live", tone: "green" }
] as const;

export function normalizeSearch(text: string): string {
  return text.trim().toLowerCase();
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
