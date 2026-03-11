// Aetheris\aetheris-frontend\pages\agents.tsx

"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AgentAlpha from "@/components/agents/AgentAlpha";
import AgentBeta from "@/components/agents/AgentBeta";
import AgentV from "@/components/agents/AgentV";
import AgentGas from "@/components/agents/AgentGas";

type Phase = "Phase 1" | "Phase 2" | "Phase 3" | "Phase 4" | "Phase 5";
type Category = "revenue" | "security" | "infrastructure" | "specialized";

type Agent = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  phase: Phase;
  color: string;
  category: Category;
  tagline: string;
  problem: string;
  what: string;
  how: string[];
  tech: string[];
  metrics: { label: string; value: string }[];
  chain?: string;
  note?: string;
};

const CATEGORY_META: Record<Category, { label: string; icon: string; color: string; description: string }> = {
  revenue:        { label: "Revenue Generation",  icon: "📈", color: "#06b6d4", description: "Eight agents that generate yield directly — the economic engine of the protocol." },
  security:       { label: "Security & Risk",      icon: "🛡️", color: "#ef4444", description: "Four agents forming the complete defensive architecture." },
  infrastructure: { label: "Infrastructure",       icon: "⚙️", color: "#a855f7", description: "Five agents handling the operational layer." },
  specialized:    { label: "Specialised Services", icon: "✨", color: "#eab308", description: "Three agents providing unique DeFi services." },
};

const PHASE_COLORS: Record<Phase, string> = {
  "Phase 1": "#22c55e",
  "Phase 2": "#06b6d4",
  "Phase 3": "#a855f7",
  "Phase 4": "#eab308",
  "Phase 5": "#ef4444",
};

const CATEGORIES: Category[] = ["revenue", "security", "infrastructure", "specialized"];

// Map Phase 1 agent IDs to canvas components
const CANVAS_MAP: Record<string, React.ComponentType<{ compact?: boolean }>> = {
  alpha: AgentAlpha,
  beta:  AgentBeta,
  v:     AgentV,
  gas:   AgentGas,
};

const agents: Agent[] = [
  // ── REVENUE ─────────────────────────────────────────────────────────
  {
    id: "alpha", name: "AGENT ALPHA", subtitle: "DEX Arbitrageur",
    icon: "🎯", phase: "Phase 1", color: "#06b6d4", category: "revenue",
    tagline: "Makes money while you sleep",
    problem: "Your crypto earns 0% while institutional bots capture arbitrage profits 24/7. Retail users cannot react in milliseconds.",
    what: "Agent Alpha monitors price discrepancies across decentralised exchanges in real time. When ETH costs $3,000 on Uniswap but $3,003 on Aerodrome, it borrows via flash loan, buys low, sells high, repays, and deposits profit — all in one atomic transaction.",
    how: ["Scans DEX prices across Uniswap V3, Aerodrome, and Balancer every scan cycle","Calculates net profit after gas, fees, and slippage — only executes if positive","Borrows capital via flash loans — zero upfront capital required","Executes buy + sell in one atomic transaction (fails entirely if any step fails)","Profit automatically credited to vault"],
    tech: ["Sub-20ms execution via Rust implementation","Flash loans — capital-efficient, zero-collateral","Atomic execution — no partial fills","Built-in slippage protection"],
    metrics: [{ label: "Win Rate Target", value: ">90%" },{ label: "Execution Speed", value: "<20ms" },{ label: "DEXs Monitored", value: "3–12" },{ label: "Capital Source", value: "Flash Loans" }],
    chain: "Base",
  },
  {
    id: "beta", name: "AGENT BETA", subtitle: "Funding Rate Harvester",
    icon: "💹", phase: "Phase 1", color: "#a855f7", category: "revenue",
    tagline: "Delta-neutral yield at 50–100%+ APY",
    problem: "Perpetual funding rates regularly reach 50–100%+ APY in bull markets — but capturing them requires simultaneously managing two positions across two protocols around the clock.",
    what: "Agent Beta constructs delta-neutral positions: long spot ETH, short ETH perpetual. The short leg collects funding payments every 8 hours. Net directional exposure is zero. Market goes up or down — Beta keeps earning.",
    how: ["Detects when funding rate exceeds dynamic profitability threshold","Buys WETH on Uniswap, wraps as wstETH for productive spot leg","Opens short perpetual on Synthetix Perps v3 (or GMX v2 / Hyperliquid)","Monitors margin health every 30 seconds — adds collateral if needed","Closes both legs when rate falls below exit threshold; returns principal + profit"],
    tech: ["Multi-chain: Base (Synthetix), Arbitrum (GMX v2), Hyperliquid","Productive spot leg via wstETH — earns staking yield simultaneously","Abort-on-gap check prevents execution-gap losses","Dynamic thresholds — stays out during negative rates"],
    metrics: [{ label: "Peak APY Target", value: "50–100%+" },{ label: "Monitor Cycle", value: "30 sec" },{ label: "Chains", value: "3" },{ label: "Direction Risk", value: "Zero" }],
    chain: "Base → Arbitrum → Hyperliquid",
    note: "Phase 4 adds statistical arbitrage and volatility harvesting.",
  },
  { id: "pi",      name: "AGENT PI",      subtitle: "Classified", icon: "🔮", phase: "Phase 3", color: "#a855f7", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 3" }] },
  { id: "delta",   name: "AGENT DELTA",   subtitle: "Classified", icon: "📊", phase: "Phase 2", color: "#06b6d4", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "anchor",  name: "AGENT ANCHOR",  subtitle: "Classified", icon: "⚓", phase: "Phase 2", color: "#06b6d4", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "lp",      name: "AGENT LP",      subtitle: "Classified", icon: "💧", phase: "Phase 2", color: "#06b6d4", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "borrow",  name: "AGENT BORROW",  subtitle: "Classified", icon: "🏦", phase: "Phase 2", color: "#06b6d4", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "options", name: "AGENT OPTIONS", subtitle: "Classified", icon: "📋", phase: "Phase 4", color: "#eab308", category: "revenue",       tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 4" }] },
  // ── SECURITY ────────────────────────────────────────────────────────
  {
    id: "v", name: "AGENT V", subtitle: "Smart Contract Monitor",
    icon: "🔍", phase: "Phase 1", color: "#f59e0b", category: "security",
    tagline: "Never get rugged again",
    problem: "$1.1 billion lost to DeFi exploits in H1 2025. 90% of protocols use upgradeable proxies — developers can replace code with a drain function at any time, with no user consent.",
    what: "Agent V monitors every smart contract the protocol interacts with at the bytecode level, on every block. When it detects a threat — proxy swap, ownership transfer, hidden function activation — it triggers an emergency withdrawal before funds can be drained.",
    how: ["Tracks implementation slot of every proxy contract in watchlist","Monitors owner/admin addresses — unexpected transfers trigger emergency sequence","Detects hidden function activations and oracle manipulation precursors","Executes emergency withdrawal within the same block as detection","Feeds threat signals to Agent Shield for immediate coverage increase"],
    tech: ["Bytecode-level monitoring every block","Proxy implementation slot tracking","Oracle manipulation precursor detection","Single-block response — faster than attackers can exploit"],
    metrics: [{ label: "Detection Speed", value: "Same block" },{ label: "Monitoring", value: "24/7/365" },{ label: "Scope", value: "All Contracts" },{ label: "Response", value: "Auto Kill Switch" }],
    chain: "All chains",
  },
  { id: "omega",  name: "AGENT OMEGA",  subtitle: "Classified", icon: "🛡️", phase: "Phase 2", color: "#ef4444", category: "security", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "shield", name: "AGENT SHIELD", subtitle: "Classified", icon: "🏛️", phase: "Phase 3", color: "#ef4444", category: "security", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 3" }] },
  { id: "armor",  name: "AGENT ARMOR",  subtitle: "Classified", icon: "🔒", phase: "Phase 2", color: "#ef4444", category: "security", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  // ── INFRASTRUCTURE ───────────────────────────────────────────────────
  {
    id: "gas", name: "AGENT GAS", subtitle: "Gasless Transaction Layer",
    icon: "⛽", phase: "Phase 1", color: "#22c55e", category: "infrastructure",
    tagline: "No ETH required. Ever.",
    problem: "Every DeFi transaction requires ETH for gas. A user holding USDC needs to acquire ETH separately — exchange fees, withdrawal fees, 30–60 minutes of friction — before doing anything in DeFi.",
    what: "Agent Gas implements ERC-4337 account abstraction with a paymaster contract that sponsors gas fees on behalf of users. Every transaction executes without requiring users to hold ETH. Fees deducted in USDC transparently.",
    how: ["Every user gets an ERC-4337 smart account — deterministic address, no ETH needed","Paymaster contract covers gas costs for all protocol interactions","Gas fees deducted from user's USDC balance at displayed rate before confirmation","Session keys allow agents to act on behalf of users without per-tx wallet confirmation","Applies to deposits, withdrawals, staking, claiming — every protocol interaction"],
    tech: ["ERC-4337 account abstraction standard","Paymaster contract on Base","Session keys for agent delegation","No ETH prerequisite for any action"],
    metrics: [{ label: "ETH Required", value: "Zero" },{ label: "Fee Currency", value: "USDC" },{ label: "Smart Accounts", value: "ERC-4337" },{ label: "Session Keys", value: "Yes" }],
    chain: "Base",
  },
  { id: "sigma",   name: "AGENT SIGMA",   subtitle: "Classified", icon: "📡", phase: "Phase 2", color: "#a855f7", category: "infrastructure", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 2" }] },
  { id: "pulse",   name: "AGENT PULSE",   subtitle: "Classified", icon: "💓", phase: "Phase 3", color: "#a855f7", category: "infrastructure", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 3" }] },
  { id: "restake", name: "AGENT RESTAKE", subtitle: "Classified", icon: "🔄", phase: "Phase 3", color: "#a855f7", category: "infrastructure", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 3" }] },
  { id: "nexus",   name: "AGENT NEXUS",   subtitle: "Classified", icon: "🌐", phase: "Phase 5", color: "#a855f7", category: "infrastructure", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 5" }] },
  // ── SPECIALISED ──────────────────────────────────────────────────────
  { id: "legacy",    name: "AGENT LEGACY",    subtitle: "Classified", icon: "📜", phase: "Phase 5", color: "#eab308", category: "specialized", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 5" }] },
  { id: "sovereign", name: "AGENT SOVEREIGN", subtitle: "Classified", icon: "⚖️", phase: "Phase 5", color: "#eab308", category: "specialized", tagline: "", problem: "", what: "", how: [], tech: [], metrics: [{ label: "Launch", value: "Phase 5" }] },
];

// ─── Canvas Preview wrapper (scale a 400×520 canvas down) ────────────────────
function CanvasPreview({ id, scale = 0.27 }: { id: string; scale?: number }) {
  const C = CANVAS_MAP[id];
  if (!C) return null;
  const W = Math.round(400 * scale);
  const H = Math.round(520 * scale);
  return (
    <div style={{ width: W, height: H, overflow: "hidden", flexShrink: 0, pointerEvents: "none" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 400, height: 520 }}>
        <C compact />
      </div>
    </div>
  );
}

// ─── Roster Card ─────────────────────────────────────────────────────────────
function RosterCard({ agent, isActive, onClick }: { agent: Agent; isActive: boolean; onClick: () => void }) {
  const isLive = agent.phase === "Phase 1";
  const phaseColor = PHASE_COLORS[agent.phase];
  const hasCanvas = !!CANVAS_MAP[agent.id];

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="relative w-full text-left rounded-xl overflow-hidden transition-all duration-150"
      style={{
        background: isActive
          ? isLive ? `${agent.color}18` : "rgba(255,255,255,0.07)"
          : isLive ? `${agent.color}07` : "rgba(255,255,255,0.015)",
        border: `1.5px solid ${isActive
          ? isLive ? agent.color : "rgba(255,255,255,0.22)"
          : isLive ? agent.color + "28" : "rgba(255,255,255,0.05)"}`,
        boxShadow: isActive && isLive ? `0 0 18px ${agent.color}28` : "none",
        opacity: !isLive ? 0.5 : 1,
      }}
    >
      {/* Top accent line */}
      {isLive && (
        <div className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: `linear-gradient(90deg, transparent, ${agent.color}90, transparent)` }} />
      )}

      {/* Canvas preview for Phase 1 agents */}
      {isLive && hasCanvas ? (
        <div className="flex justify-center pt-1" style={{ background: "#010814" }}>
          <CanvasPreview id={agent.id} scale={0.265} />
        </div>
      ) : (
        <div className="flex items-center justify-center py-5"
          style={{ background: "rgba(0,0,0,0.2)", minHeight: 80 }}>
          <span className="text-3xl" style={{ filter: !isLive ? "grayscale(1) brightness(0.35)" : "none" }}>
            {agent.icon}
          </span>
        </div>
      )}

      {/* Label bar */}
      <div className="px-2.5 pb-2 pt-1.5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="font-black text-[10px] tracking-widest font-mono"
            style={{ color: isLive ? agent.color : "rgba(255,255,255,0.25)" }}>
            {agent.name.replace("AGENT ", "")}
          </div>
          {isLive ? (
            <span className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#22c55e" }} />
              </span>
              <span className="text-[7px] font-black tracking-wider" style={{ color: "#22c55e" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[7px] font-black px-1 py-0.5 rounded-full"
              style={{ background: `${phaseColor}12`, color: phaseColor, border: `1px solid ${phaseColor}28` }}>
              {agent.phase.replace("Phase ", "P")}
            </span>
          )}
        </div>
        {isLive ? (
          <div className="text-[9px] text-gray-500 leading-tight truncate">{agent.subtitle}</div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-[8px] opacity-35">🔒</span>
            <div className="h-1 rounded flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
        )}
      </div>
    </motion.button>
  );
}

// ─── Classified Detail ────────────────────────────────────────────────────────
function ClassifiedDetail({ agent }: { agent: Agent }) {
  const phaseColor = PHASE_COLORS[agent.phase];
  const catMeta = CATEGORY_META[agent.category];

  return (
    <motion.div key={agent.id + "-c"}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
      className="glass-panel relative overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ zIndex: 1 }}>
        <div style={{ fontSize: "clamp(36px,7vw,76px)", fontWeight: 900, letterSpacing: "0.3em", color: "rgba(255,255,255,0.025)", transform: "rotate(-22deg)", userSelect: "none", fontFamily: "monospace", whiteSpace: "nowrap" }}>CLASSIFIED</div>
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)", zIndex: 1 }} />

      <div className="relative p-7 md:p-10" style={{ zIndex: 2 }}>
        <div className="flex items-start gap-4 mb-7">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", filter: "grayscale(1) brightness(0.35) blur(1px)" }}>
            {agent.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h3 className="text-2xl font-black font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>{agent.name}</h3>
              <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-widest border"
                style={{ background: "rgba(239,68,68,0.07)", borderColor: "rgba(239,68,68,0.28)", color: "#ef4444", fontFamily: "monospace" }}>
                CLASSIFIED
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-3 py-1 rounded-full font-bold"
                style={{ background: `${phaseColor}13`, color: phaseColor, border: `1px solid ${phaseColor}28` }}>
                {agent.phase.toUpperCase()} LAUNCH
              </span>
              <span className="text-[11px] px-2 py-1 rounded-full font-bold"
                style={{ background: `${catMeta.color}10`, color: catMeta.color, border: `1px solid ${catMeta.color}22` }}>
                {catMeta.icon} {catMeta.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-5">
          {["The Problem", "What It Does", "How It Works"].map((label) => (
            <div key={label} className="p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] font-bold text-gray-700 mb-3 uppercase tracking-wider">{label}</div>
              <div className="space-y-2">
                {[100, 80, 92, 65].map((w, i) => (
                  <div key={i} className="h-2 rounded" style={{ background: "rgba(255,255,255,0.06)", width: `${w}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-3 text-center"
              style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="h-2 rounded mb-2 mx-auto" style={{ background: "rgba(255,255,255,0.05)", width: "70%" }} />
              <div className="h-3.5 rounded mx-auto" style={{ background: "rgba(255,255,255,0.08)", width: "50%" }} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: `${phaseColor}07`, border: `1px solid ${phaseColor}18` }}>
          <span className="text-xl flex-shrink-0">🔐</span>
          <div>
            <div className="text-xs font-black mb-0.5" style={{ color: phaseColor }}>INTEL ACCESS RESTRICTED</div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Full capabilities for this agent are classified until {agent.phase} deployment. Details disclosed progressively as each phase activates.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Operational Detail ───────────────────────────────────────────────────────
type DetailTab = "overview" | "how" | "tech";

function OperationalDetail({ agent }: { agent: Agent }) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const catMeta = CATEGORY_META[agent.category];
  const CanvasComponent = CANVAS_MAP[agent.id];

  const DETAIL_SCALE = 0.76;
  const CANVAS_W = Math.round(400 * DETAIL_SCALE);
  const CANVAS_H = Math.round(520 * DETAIL_SCALE);

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview"     },
    { id: "how",      label: "How It Works" },
    { id: "tech",     label: "Tech"         },
  ];

  return (
    <motion.div key={agent.id + "-o"}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
      className="glass-panel relative overflow-hidden"
      style={{ border: `1px solid ${agent.color}22` }}>

      {/* Ambient glow */}
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-[0.07] pointer-events-none" style={{ background: agent.color }} />
      <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-[0.04] pointer-events-none" style={{ background: agent.color }} />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${agent.color}90,transparent)` }} />

      <div className="flex flex-col xl:flex-row relative z-10">

        {/* ── LEFT: Canvas column ── */}
        {CanvasComponent && (
          <div className="flex-shrink-0 flex flex-col" style={{ background: "#010814", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
            {/* Header bar */}
            <div className="px-4 pt-4 pb-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${agent.color}18` }}>
              <div>
                <div className="text-[9px] font-black tracking-[0.3em] text-gray-600 uppercase mb-0.5">Phase 1</div>
                <div className="text-sm font-black font-mono" style={{ color: agent.color }}>{agent.name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{agent.subtitle}</div>
              </div>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-wider flex-shrink-0"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#22c55e" }} />
                </span>
                OPERATIONAL
              </span>
            </div>

            {/* Canvas */}
            <div style={{ width: CANVAS_W, height: CANVAS_H, overflow: "hidden", pointerEvents: "none", flexShrink: 0 }}>
              <div style={{ transform: `scale(${DETAIL_SCALE})`, transformOrigin: "top left", width: 400, height: 520 }}>
                <CanvasComponent compact />
              </div>
            </div>

            {/* Footer: chain + category */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 mt-auto" style={{ borderTop: `1px solid ${agent.color}18` }}>
              {agent.chain && <span className="text-[10px] font-mono text-gray-500">⛓ {agent.chain}</span>}
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold ml-auto"
                style={{ background: `${catMeta.color}13`, color: catMeta.color, border: `1px solid ${catMeta.color}28` }}>
                {catMeta.icon} {catMeta.label}
              </span>
            </div>
          </div>
        )}

        {/* ── RIGHT: Tab panel ── */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: CanvasComponent ? CANVAS_H + 80 : "auto" }}>

          {/* Tab bar — no AnimatePresence, no layoutId, plain CSS transitions */}
          <div className="flex items-center gap-1 px-6 pt-5 pb-0 flex-shrink-0">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="relative px-4 py-2 text-xs font-black tracking-wider rounded-lg transition-all duration-200"
                  style={{
                    color:      isActive ? agent.color : "rgba(255,255,255,0.35)",
                    background: isActive ? `${agent.color}12` : "transparent",
                    border:     `1px solid ${isActive ? agent.color + "40" : "transparent"}`,
                  }}>
                  {t.label}
                  {/* Simple CSS underline indicator — no Framer Motion */}
                  <span className="absolute bottom-0 left-2 right-2 h-px rounded-full transition-opacity duration-200"
                    style={{ background: agent.color, opacity: isActive ? 1 : 0 }} />
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-6 mt-3 mb-5 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Tab content — plain conditional render, no AnimatePresence */}
          <div className="flex-1 px-6 pb-6 overflow-y-auto">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div>
                {/* Header: icon + name + badges (matches original layout) */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-5">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl">{agent.icon}</span>
                    <div>
                      <h3 className="text-2xl md:text-3xl font-black" style={{ color: agent.color }}>{agent.name}</h3>
                      <p className="text-gray-400">{agent.subtitle}</p>
                      {agent.chain && <p className="text-xs text-gray-600 mt-0.5 font-mono">⛓ {agent.chain}</p>}
                    </div>
                  </div>
                  <div className="sm:ml-auto flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(34,197,94,0.09)", border: "1px solid rgba(34,197,94,0.28)" }}>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#22c55e" }} />
                      </span>
                      <span className="text-[10px] font-black tracking-widest" style={{ color: "#22c55e" }}>OPERATIONAL</span>
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider"
                      style={{ background: `${catMeta.color}13`, color: catMeta.color, border: `1px solid ${catMeta.color}28` }}>
                      {catMeta.icon} {catMeta.label}
                    </span>
                  </div>
                </div>

                {/* Tagline */}
                <div className="mb-5 p-4 rounded-xl text-center"
                  style={{ background: `${agent.color}07`, border: `1px solid ${agent.color}20` }}>
                  <p className="text-base md:text-lg font-black italic" style={{ color: agent.color }}>"{agent.tagline}"</p>
                </div>

                {/* Problem */}
                <div className="mb-5 p-4 rounded-xl"
                  style={{ background: `${agent.color}06`, borderLeft: `3px solid ${agent.color}` }}>
                  <h4 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">The Problem</h4>
                  <p className="text-gray-200 text-sm leading-relaxed">{agent.problem}</p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {agent.metrics.map((m, i) => (
                    <div key={i} className="rounded-xl p-3 text-center"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="text-[10px] text-gray-500 mb-1.5">{m.label}</div>
                      <div className="text-sm font-black font-mono" style={{ color: agent.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* What it does */}
                <div>
                  <h4 className="text-sm font-black mb-3 flex items-center gap-2">
                    <span style={{ color: agent.color }}>●</span>What It Does
                  </h4>
                  <p className="text-gray-300 text-sm leading-relaxed">{agent.what}</p>
                </div>
              </div>
            )}

            {/* ── HOW IT WORKS ── */}
            {tab === "how" && (
              <div>
                <h4 className="text-sm font-black mb-4 flex items-center gap-2">
                  <span style={{ color: agent.color }}>●</span>How It Works
                </h4>
                <div className="space-y-3">
                  {agent.how.map((step, i) => (
                    <div key={i} className="flex gap-3 items-start p-3.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] flex-shrink-0 mt-0.5"
                        style={{ background: `${agent.color}22`, color: agent.color, border: `1px solid ${agent.color}40` }}>
                        {i + 1}
                      </div>
                      <p className="text-gray-200 text-sm leading-relaxed pt-0.5">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TECH ── */}
            {tab === "tech" && (
              <div>
                <h4 className="text-sm font-black mb-4 flex items-center gap-2">
                  <span style={{ color: agent.color }}>●</span>Technical Features
                </h4>
                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  {agent.tech.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span className="flex-shrink-0 mt-0.5" style={{ color: agent.color }}>✓</span>
                      <span className="text-gray-200 text-sm leading-snug">{t}</span>
                    </div>
                  ))}
                </div>
                {agent.note && (
                  <div className="p-4 rounded-xl"
                    style={{ background: "rgba(234,179,8,0.04)", border: "1px solid rgba(234,179,8,0.18)" }}>
                    <p className="text-sm text-gray-300">
                      <span className="text-yellow-400 font-bold">Note: </span>{agent.note}
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [activeAgent, setActiveAgent] = useState<string>("alpha");
  const detailRef = useRef<HTMLDivElement>(null);

  const current = agents.find((a) => a.id === activeAgent) ?? agents[0];
  const isLive = current.phase === "Phase 1";
  const liveCount = agents.filter((a) => a.phase === "Phase 1").length;

  const handleSelect = (id: string) => {
    setActiveAgent(id);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />

      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">

          {/* ── Page Header ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
            <div className="text-xs font-bold text-cyan-400 tracking-[0.4em] uppercase mb-4">22 Autonomous Agents</div>
            <h1 className="text-5xl md:text-7xl font-black mb-5">
              The Aetheris<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                Agent Ecosystem
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
              22 purpose-built autonomous agents across four functional categories. Users deposit once. Agents work continuously. No active management required.
            </p>
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full"
              style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#22c55e" }} />
              </span>
              <span className="text-sm font-bold" style={{ color: "#22c55e" }}>{liveCount} Agents Operational — Phase 1 Live</span>
              <span className="text-xs text-gray-500 hidden sm:block">· Phase 2–5 classified until deployment</span>
            </div>
          </motion.div>

          {/* ── Two-column layout ──────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row gap-8 items-start">

            {/* ── LEFT: Sticky Mission Roster ──────────────────────── */}
            <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
              <div className="glass-panel p-5 rounded-2xl lg:sticky lg:top-28"
                style={{ border: "1px solid rgba(255,255,255,0.09)" }}>

                {/* Roster header */}
                <div className="flex items-center justify-between mb-5 pb-3"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <div className="text-xs font-black tracking-[0.28em] text-gray-300 uppercase mb-0.5">Mission Roster</div>
                    <div className="text-[10px] text-gray-600">{liveCount} operational · {agents.length - liveCount} classified</div>
                  </div>
                  <div className="flex flex-col gap-1.5 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#22c55e" }} />
                      </span>
                      <span className="text-[9px] font-bold text-gray-500">Live</span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[9px]">🔒</span>
                      <span className="text-[9px] font-bold text-gray-600">Classified</span>
                    </div>
                  </div>
                </div>

                {/* Category sections */}
                <div className="space-y-5">
                  {CATEGORIES.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const catAgents = agents.filter((a) => a.category === cat);
                    const liveCatCount = catAgents.filter((a) => a.phase === "Phase 1").length;

                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{meta.icon}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: meta.color }}>
                              {meta.label}
                            </span>
                          </div>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                            style={{ background: `${meta.color}13`, color: meta.color, border: `1px solid ${meta.color}22` }}>
                            {liveCatCount}/{catAgents.length}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {catAgents.map((agent) => (
                            <RosterCard
                              key={agent.id}
                              agent={agent}
                              isActive={activeAgent === agent.id}
                              onClick={() => handleSelect(agent.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Detail + Phase timeline + Stats ───────────── */}
            <div className="flex-1 min-w-0 space-y-8" ref={detailRef}>

              {/* Detail panel */}
              <AnimatePresence mode="wait">
                {isLive
                  ? <OperationalDetail key={current.id + "-o"} agent={current} />
                  : <ClassifiedDetail  key={current.id + "-c"} agent={current} />
                }
              </AnimatePresence>

              {/* Phase build sequence */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-base font-black">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                      Build Sequence
                    </span>
                  </h2>
                  <span className="text-gray-600 text-xs">— Prove before you scale</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {(["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Phase 5"] as Phase[]).map((phase) => {
                    const phaseAgents = agents.filter((a) => a.phase === phase);
                    const c = PHASE_COLORS[phase];
                    const live = phase === "Phase 1";
                    return (
                      <div key={phase} className="glass-panel p-3 rounded-xl relative overflow-hidden"
                        style={{ border: `1px solid ${live ? c + "42" : c + "16"}` }}>
                        {live && (
                          <div className="absolute top-0 left-0 right-0 h-px"
                            style={{ background: `linear-gradient(90deg,transparent,${c},transparent)` }} />
                        )}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: c }}>
                            {phase.replace("Phase ", "P")}
                          </span>
                          {live && (
                            <span className="text-[7px] font-black px-1 py-0.5 rounded"
                              style={{ background: `${c}18`, color: c }}>LIVE</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {phaseAgents.map((a) => (
                            <button key={a.id} onClick={() => handleSelect(a.id)}
                              className="flex items-center gap-1 w-full text-left group transition-opacity hover:opacity-100"
                              style={{ opacity: live ? 1 : 0.38 }}>
                              <span className="text-[11px]" style={{ filter: !live ? "grayscale(1)" : "none" }}>{a.icon}</span>
                              <span className="text-[9px] font-bold truncate group-hover:text-white transition-colors"
                                style={{ color: live ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.3)" }}>
                                {a.name.replace("AGENT ", "")}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className="glass-panel p-6 rounded-2xl text-center"
                style={{ border: "1px solid rgba(6,182,212,0.16)" }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { value: "22", label: "Total Agents" },
                    { value: "5",  label: "Build Phases" },
                    { value: "5",  label: "Blockchains" },
                    { value: "24/7", label: "Autonomous Operation" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="text-3xl font-black text-cyan-400 mb-1">{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}