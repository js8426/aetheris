// Aetheris\aetheris-frontend\pages\earn.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { aetherisApi } from "@/lib/api";
import { useAetherisUser } from "@/hooks/useAetherisUser";
import {
  getContracts,
  USDC_ABI,
  PROFIT_DISTRIBUTOR_ABI,
  // BUG FIX: Import the canonical AGENT_ALPHA_ABI from contracts.ts instead of
  // defining a local ABI stub that only contained `paused` and `getTotalProfit`.
  // The local stub was missing `activateForUser` and `deactivateForUser`, so
  // every call from AgentAlphaCard was silently failing — wagmi cannot encode
  // a transaction for a function that does not exist in the provided ABI.
  AGENT_ALPHA_ABI,
} from "@/lib/contracts";
import { parseUnits, formatUnits } from "viem";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: string | bigint | undefined | null, dp = 2): string {
  if (val === undefined || val === null) return "0.00";
  const n = typeof val === "bigint"
    ? parseFloat(formatUnits(val, 6))
    : parseFloat(val as string);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

type TxStatus = "idle" | "approving" | "depositing" | "withdrawing" | "claiming" | "success" | "error";
type AgentTxStatus = "idle" | "activating" | "deactivating" | "success" | "error";

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = 80, h = 14 }: { w?: number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.2, 0.45, 0.2] }}
      transition={{ duration: 1.7, repeat: Infinity }}
      style={{ width: w, height: h, background: "rgba(255,255,255,0.08)", borderRadius: 6 }}
    />
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⬡" },
  { href: "/stake",     label: "Stake",     icon: "⚡" },
  { href: "/earn",      label: "Earn",      icon: "💸" },
  { href: "/account",   label: "Account",   icon: "🔑" },
] as const;

function AppSidebar({ active }: { active: string }) {
  return (
    <motion.nav
      initial={{ x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      style={{
        position: "fixed", left: 0, top: 72, bottom: 0, width: 216,
        background: "rgba(2,6,23,0.97)",
        borderRight: "1px solid rgba(6,182,212,0.09)",
        backdropFilter: "blur(24px)", zIndex: 40,
        display: "flex", flexDirection: "column", padding: "28px 14px", gap: 3,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: 14, paddingLeft: 10 }}>
        App
      </div>
      {NAV.map((item) => {
        const isActive = active === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
            <motion.div
              whileHover={{ x: 3, background: "rgba(6,182,212,0.07)" }}
              style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "11px 10px", borderRadius: 11,
                background: isActive ? "rgba(6,182,212,0.1)" : "transparent",
                border: isActive ? "1px solid rgba(6,182,212,0.24)" : "1px solid transparent",
                color: isActive ? "#06b6d4" : "rgba(255,255,255,0.5)",
                fontWeight: isActive ? 700 : 500, fontSize: 13, cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {item.label}
              {isActive && (
                <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 6px #06b6d4" }} />
              )}
            </motion.div>
          </Link>
        );
      })}
      <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 18 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <motion.div whileHover={{ x: 3 }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px", borderRadius: 11, color: "rgba(255,255,255,0.28)", fontSize: 13, cursor: "pointer" }}>
            <span style={{ fontSize: 17 }}>←</span> Back to Site
          </motion.div>
        </Link>
      </div>
    </motion.nav>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ status, txHash, onClose }: { status: TxStatus; txHash?: string; onClose: () => void }) {
  useEffect(() => {
    if (status === "success" || status === "error") {
      const t = setTimeout(onClose, 6000);
      return () => clearTimeout(t);
    }
  }, [status, onClose]);

  const cfg: Partial<Record<TxStatus, { color: string; icon: string; text: string }>> = {
    approving:   { color: "#06b6d4", icon: "⏳", text: "Approving USDC spend…"              },
    depositing:  { color: "#22c55e", icon: "↓",  text: "Depositing USDC…"                   },
    withdrawing: { color: "#eab308", icon: "↑",  text: "Withdrawing USDC…"                  },
    claiming:    { color: "#a855f7", icon: "💸", text: "Claiming profits…"                  },
    success:     { color: "#22c55e", icon: "✓",  text: "Transaction confirmed!"             },
    error:       { color: "#ef4444", icon: "✗",  text: "Transaction failed — check wallet"  },
  };

  const c = cfg[status];
  if (!c || status === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.95 }}
      style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 200,
        padding: "14px 18px", borderRadius: 14,
        background: "rgba(2,6,23,0.97)",
        border: `1px solid ${c.color}40`,
        boxShadow: `0 0 30px ${c.color}1a`,
        display: "flex", alignItems: "center", gap: 12,
        backdropFilter: "blur(20px)", maxWidth: 340,
      }}
    >
      <span style={{ fontSize: 20 }}>{c.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.text}</div>
        {txHash && (
          <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontFamily: "monospace" }}>
            {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
          </a>
        )}
      </div>
      {(status === "success" || status === "error") && (
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
      )}
    </motion.div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DepositDonut({ deposited, claimable }: { deposited: number; claimable: number }) {
  const total = deposited + claimable || 1;
  const R = 54;
  const circ = 2 * Math.PI * R;
  const depositedDash = ((deposited / total) * 100 / 100) * circ;
  const claimableDash  = ((claimable  / total) * 100 / 100) * circ;

  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
        <motion.circle cx="70" cy="70" r={R} fill="none" stroke="#22c55e" strokeWidth="14"
          strokeDasharray={`${depositedDash} ${circ - depositedDash}`}
          strokeDashoffset={circ * 0.25} strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${depositedDash} ${circ - depositedDash}` }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }}
        />
        <motion.circle cx="70" cy="70" r={R} fill="none" stroke="#a855f7" strokeWidth="14"
          strokeDasharray={`${claimableDash} ${circ - claimableDash}`}
          strokeDashoffset={circ * 0.25 - (-depositedDash)} strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${claimableDash} ${circ - claimableDash}` }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.5 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#22c55e" }}>${fmt(String(deposited))}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>deposited</div>
      </div>
    </div>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: "01", color: "#22c55e", title: "Deposit USDC",    body: "Lock USDC into the ProfitDistributor vault. Your deposit earns a proportional share of all agent-generated profits." },
    { n: "02", color: "#06b6d4", title: "Agents Trade",    body: "Agent Alpha executes arbitrage and yield strategies on-chain 24/7. Profits flow into the vault automatically." },
    { n: "03", color: "#a855f7", title: "Claim Profits",   body: "Your claimable balance updates in real time. Claim whenever you want — no lockups, no penalties, no minimums." },
    { n: "04", color: "#eab308", title: "Withdraw Freely", body: "Withdraw your principal at any time. Pending profits are preserved until you claim them separately." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {steps.map((s, i) => (
        <motion.div key={s.n}
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.08 }}
          style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${s.color}14`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>
            {s.n}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.6 }}>{s.body}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Agent Alpha Card ─────────────────────────────────────────────────────────
function AgentAlphaCard({
  contracts,
  address,
  globalBusy,
  totalDistributed,
}: {
  contracts: ReturnType<typeof getContracts>;
  address: `0x${string}`;
  globalBusy: boolean;
  totalDistributed: bigint | undefined;
}) {
  const queryClient = useQueryClient();
  const [agentTxStatus, setAgentTxStatus] = useState<AgentTxStatus>("idle");
  const [agentTxHash,   setAgentTxHash]   = useState<string | undefined>();

  // ── Global agent status from backend ────────────────────────────────────────
  const { data: globalStatus, refetch: refetchGlobal } = useQuery({
    queryKey: ["agent-global-status"],
    queryFn: () => aetherisApi.getGlobalAgentStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ── Per-user agent status from backend ──────────────────────────────────────
  // BUG FIX: The backend previously returned the global paused flag as the
  // user's `active` status. After the agent.ts fix, this now returns the
  // result of isUserActive(address) on the contract — each user gets their
  // individual opt-in state.
  const { data: userStatus, refetch: refetchUser } = useQuery({
    queryKey: ["agent-user-status", address],
    queryFn: () => aetherisApi.getAgentStatus(address),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const globalActive    = globalStatus?.agentAlpha?.active;
  const userActive      = userStatus?.agentAlpha?.active;
  const totalProfitStr  = globalStatus?.agentAlpha?.totalProfitUSDC ?? "0";

  const refetchAgent = useCallback(() => {
    refetchGlobal();
    refetchUser();
  }, [refetchGlobal, refetchUser]);

  // BUG FIX: Use the canonical AGENT_ALPHA_ABI imported from contracts.ts.
  // The previous local ABI stub only declared `paused` and `getTotalProfit`
  // and did not include `activateForUser` or `deactivateForUser`. wagmi
  // encodes transactions by looking up the function selector in the ABI,
  // so calling a function absent from the ABI produces no transaction at all.
  const { writeContractAsync: writeAgent } = useWriteContract();

  const { isLoading: waitingAgent } = useWaitForTransactionReceipt({
    hash: agentTxHash as `0x${string}` | undefined,
    query: { enabled: !!agentTxHash },
  });

  useEffect(() => {
    if (
      agentTxHash &&
      !waitingAgent &&
      agentTxStatus !== "idle" &&
      agentTxStatus !== "success" &&
      agentTxStatus !== "error"
    ) {
      setAgentTxStatus("success");
      setTimeout(() => {
        refetchAgent();
        queryClient.invalidateQueries({ queryKey: ["aetheris-user"] });
      }, 2000);
      setTimeout(() => {
        setAgentTxStatus("idle");
        setAgentTxHash(undefined);
      }, 3000);
    }
  }, [waitingAgent, agentTxHash, agentTxStatus, refetchAgent, queryClient]);

  const handleActivate = useCallback(async () => {
    try {
      setAgentTxStatus("activating");
      const hash = await writeAgent({
        address:      contracts.AGENT_ALPHA,
        abi:          AGENT_ALPHA_ABI, // ← now the canonical ABI with activateForUser
        functionName: "activateForUser",
      });
      setAgentTxHash(hash);
    } catch (e) {
      console.error("activateForUser failed:", e);
      setAgentTxStatus("error");
      setTimeout(() => setAgentTxStatus("idle"), 3000);
    }
  }, [writeAgent, contracts]);

  const handleDeactivate = useCallback(async () => {
    try {
      setAgentTxStatus("deactivating");
      const hash = await writeAgent({
        address:      contracts.AGENT_ALPHA,
        abi:          AGENT_ALPHA_ABI, // ← now the canonical ABI with deactivateForUser
        functionName: "deactivateForUser",
      });
      setAgentTxHash(hash);
    } catch (e) {
      console.error("deactivateForUser failed:", e);
      setAgentTxStatus("error");
      setTimeout(() => setAgentTxStatus("idle"), 3000);
    }
  }, [writeAgent, contracts]);

  const agentBusy    = ["activating", "deactivating"].includes(agentTxStatus) || waitingAgent || globalBusy;
  const displayProfit = totalDistributed !== undefined
    ? parseFloat(formatUnits(totalDistributed, 6))
    : parseFloat(totalProfitStr);
  const borderColor  = userActive ? "rgba(34,197,94,0.25)" : "rgba(6,182,212,0.18)";
  const glowColor    = userActive ? "#22c55e" : "#06b6d4";

  return (
    <div className="glass-panel" style={{
      borderRadius: 20, border: `1px solid ${borderColor}`,
      padding: "22px", position: "relative", overflow: "hidden",
      transition: "border-color 0.3s",
    }}>
      <div style={{
        position: "absolute", top: -40, right: -40, width: 160, height: 160,
        background: glowColor, filter: "blur(70px)", opacity: 0.06, borderRadius: "50%",
        transition: "background 0.3s",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Agent Alpha</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {globalActive === undefined ? <Skeleton w={50} h={14} /> : globalActive ? (
              <>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em" }}>LIVE</span>
              </>
            ) : (
              <>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#64748b" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em" }}>OFFLINE</span>
              </>
            )}
          </div>
        </div>

        {/* User activation status pill */}
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: userActive ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${userActive ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}`,
          display: "flex", alignItems: "center", gap: 10,
          transition: "all 0.3s",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: userActive ? "#22c55e" : "#64748b",
            boxShadow: userActive ? "0 0 6px #22c55e" : "none",
            transition: "all 0.3s",
          }} />
          <span style={{ fontSize: 12, color: userActive ? "#22c55e" : "rgba(255,255,255,0.4)", fontWeight: 700 }}>
            {userActive === undefined
              ? "Checking status…"
              : userActive
              ? "Active for your account"
              : "Not active for your account"}
          </span>
        </div>

        {/* Description */}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.6, marginBottom: 14 }}>
          {userActive
            ? "Agent Alpha is trading on your behalf. Profits are automatically distributed to your deposit balance."
            : "Activate Agent Alpha to allow it to execute arbitrage strategies and generate profits for your deposits."}
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["Arbitrage", "Base L2", "Auto-compound"].map((tag) => (
            <span key={tag} style={{
              fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#06b6d4",
            }}>{tag}</span>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Total Distributed</div>
            {displayProfit !== undefined
              ? <div style={{ fontSize: 16, fontWeight: 900, color: "#06b6d4" }}>
                  ${fmt(String(displayProfit))}
                </div>
              : <Skeleton w={80} h={18} />
            }
          </div>
          <Link href="/agents" style={{ textDecoration: "none" }}>
            <motion.div whileHover={{ scale: 1.04 }} style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
              background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)",
              color: "#06b6d4", cursor: "pointer",
            }}>View Agents →</motion.div>
          </Link>
        </div>

        {/* Activate / Deactivate button */}
        <motion.button
          onClick={userActive ? handleDeactivate : handleActivate}
          disabled={agentBusy || userActive === undefined || globalActive === false}
          whileHover={!agentBusy && userActive !== undefined && globalActive !== false ? {
            scale: 1.02,
            boxShadow: userActive
              ? "0 0 20px rgba(239,68,68,0.3)"
              : "0 0 20px rgba(34,197,94,0.3)",
          } : {}}
          whileTap={!agentBusy ? { scale: 0.98 } : {}}
          style={{
            width: "100%", padding: "13px",
            background: agentBusy || userActive === undefined
              ? "rgba(255,255,255,0.05)"
              : userActive
              ? "rgba(239,68,68,0.1)"
              : "linear-gradient(90deg, #16a34a, #22c55e)",
            border: agentBusy || userActive === undefined
              ? "1px solid rgba(255,255,255,0.08)"
              : userActive
              ? "1px solid rgba(239,68,68,0.3)"
              : "none",
            borderRadius: 12,
            color: agentBusy || userActive === undefined
              ? "rgba(255,255,255,0.22)"
              : userActive ? "#ef4444" : "#fff",
            fontWeight: 900, fontSize: 13,
            cursor: agentBusy || userActive === undefined || globalActive === false
              ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {agentBusy ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
              {agentTxStatus === "activating" ? "Activating…" : agentTxStatus === "deactivating" ? "Deactivating…" : "Processing…"}
            </span>
          ) : agentTxStatus === "success" ? (
            `✓ ${userActive ? "Deactivated" : "Activated"} successfully`
          ) : globalActive === false ? (
            "Agent offline — unavailable"
          ) : userActive ? (
            "⏹ Deactivate Agent Alpha"
          ) : (
            "▶ Activate Agent Alpha"
          )}
        </motion.button>

        {globalActive === false && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 8 }}>
            The agent is currently offline. Activation will be available when it goes live.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EarnPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal }     = useConnectModal();
  const chainId                  = useChainId();
  const contracts                = getContracts(chainId);
  const queryClient              = useQueryClient();

  const [tab,         setTab]         = useState<"deposit" | "withdraw">("deposit");
  const [input,       setInput]       = useState("");
  const [txStatus,    setTxStatus]    = useState<TxStatus>("idle");
  const [txHash,      setTxHash]      = useState<string | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── User data from hook ───────────────────────────────────────────────────
  const { isLoading, refetch, depositedUSDC, claimableProfit, totalClaimed } = useAetherisUser();

  // ── On-chain reads ────────────────────────────────────────────────────────
  const { data: reads, refetch: refetchChain } = useReadContracts({
    contracts: address ? [
      { address: contracts.USDC,               abi: USDC_ABI,               functionName: "balanceOf",             args: [address] },
      { address: contracts.USDC,               abi: USDC_ABI,               functionName: "allowance",             args: [address, contracts.PROFIT_DISTRIBUTOR] },
      { address: contracts.PROFIT_DISTRIBUTOR, abi: PROFIT_DISTRIBUTOR_ABI, functionName: "totalValueLocked"                      },
      { address: contracts.PROFIT_DISTRIBUTOR, abi: PROFIT_DISTRIBUTOR_ABI, functionName: "totalProfitDistributed"                },
    ] : [],
    query: {
      enabled: !!address,
      // Poll on-chain data every 30 seconds so profit numbers update without
      // a page refresh. The agent may distribute profit at any time.
      refetchInterval:      30_000,
      refetchOnWindowFocus: true,
    },
  });

  const usdcBalanceRaw   = reads?.[0]?.result as bigint | undefined;
  const usdcAllowanceRaw = reads?.[1]?.result as bigint | undefined;
  const tvlRaw           = reads?.[2]?.result as bigint | undefined;
  const totalDistributed = reads?.[3]?.result as bigint | undefined;

  // Track when data was last fetched so the investor sees a live "updated Xs ago" indicator
  useEffect(() => {
    if (reads) setLastUpdated(new Date());
  }, [reads]);

  const usdcBalance   = usdcBalanceRaw   ? parseFloat(formatUnits(usdcBalanceRaw,   6)) : 0;
  const usdcAllowance = usdcAllowanceRaw ? parseFloat(formatUnits(usdcAllowanceRaw, 6)) : 0;
  const tvl           = tvlRaw           ? parseFloat(formatUnits(tvlRaw,           6)) : 0;

  // ── Write contracts ───────────────────────────────────────────────────────
  const { writeContractAsync: approveUsdc } = useWriteContract();
  const { writeContractAsync: deposit     } = useWriteContract();
  const { writeContractAsync: withdraw    } = useWriteContract();
  const { writeContractAsync: claimProfit } = useWriteContract();

  // ── Tx receipt watcher ────────────────────────────────────────────────────
  const { isLoading: waitingTx } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (txHash && !waitingTx && txStatus !== "success" && txStatus !== "idle") {
      setTxStatus("success");
      setInput("");
      refetch();
      refetchChain();
      queryClient.invalidateQueries({ queryKey: ["aetheris-user"] });
    }
  }, [waitingTx, txHash, txStatus, refetch, refetchChain, queryClient]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const parsed       = parseFloat(input) || 0;
  const depositedNum = parseFloat(depositedUSDC   || "0") || 0;
  const claimableNum = parseFloat(claimableProfit || "0") || 0;
  const maxAmt       = tab === "deposit" ? usdcBalance : depositedNum;
  const needsApproval = tab === "deposit" && parsed > 0 && usdcAllowance < parsed;
  const isInvalid    = parsed <= 0 || parsed > maxAmt;
  const errMsg       = parsed > maxAmt && parsed > 0
    ? `Insufficient ${tab === "deposit" ? "USDC wallet balance" : "deposited USDC"}`
    : null;

  const estimatedAPY = depositedNum > 0 && claimableNum > 0
    ? ((claimableNum / depositedNum) * 12 * 100).toFixed(1)
    : null;

  const isBusy = ["approving", "depositing", "withdrawing", "claiming"].includes(txStatus) || waitingTx;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDeposit = useCallback(async () => {
    if (!address || isInvalid) return;
    try {
      const amount = parseUnits(input, 6);
      if (needsApproval) {
        setTxStatus("approving");
        const approveTx = await approveUsdc({
          address: contracts.USDC,
          abi: USDC_ABI,
          functionName: "approve",
          args: [contracts.PROFIT_DISTRIBUTOR, amount],
        });
        setTxHash(approveTx);
        await new Promise(r => setTimeout(r, 3500));
        await refetchChain();
      }
      setTxStatus("depositing");
      const hash = await deposit({
        address: contracts.PROFIT_DISTRIBUTOR,
        abi: PROFIT_DISTRIBUTOR_ABI,
        functionName: "deposit",
        args: [parseUnits(input, 6)],
      });
      setTxHash(hash);
    } catch (e) {
      console.error("deposit failed:", e);
      setTxStatus("error");
    }
  }, [address, input, isInvalid, needsApproval, approveUsdc, deposit, contracts, refetchChain]);

  const handleWithdraw = useCallback(async () => {
    if (!address || isInvalid) return;
    try {
      setTxStatus("withdrawing");
      const hash = await withdraw({
        address: contracts.PROFIT_DISTRIBUTOR,
        abi: PROFIT_DISTRIBUTOR_ABI,
        functionName: "withdraw",
        args: [parseUnits(input, 6)],
      });
      setTxHash(hash);
    } catch (e) {
      console.error("withdraw failed:", e);
      setTxStatus("error");
    }
  }, [address, input, isInvalid, withdraw, contracts]);

  const handleClaim = useCallback(async () => {
    if (!address || claimableNum <= 0) return;
    try {
      setTxStatus("claiming");
      const hash = await claimProfit({
        address: contracts.PROFIT_DISTRIBUTOR,
        abi: PROFIT_DISTRIBUTOR_ABI,
        functionName: "claimProfit",
      });
      setTxHash(hash);
    } catch (e) {
      console.error("claimProfit failed:", e);
      setTxStatus("error");
    }
  }, [address, claimableNum, claimProfit, contracts]);

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
        <Header />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24, textAlign: "center", padding: 24 }}>
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
            <span style={{ fontSize: 60 }}>💸</span>
          </motion.div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Connect Wallet</h1>
          <p style={{ color: "rgba(255,255,255,0.38)", maxWidth: 340, margin: 0, lineHeight: 1.6 }}>
            Connect your wallet to deposit USDC and earn agent profits.
          </p>
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(6,182,212,0.4)" }}
            whileTap={{ scale: 0.96 }}
            onClick={openConnectModal}
            style={{ padding: "16px 40px", background: "linear-gradient(90deg, #06b6d4, #2563eb)", borderRadius: 99, border: "none", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer" }}
          >CONNECT WALLET ⚡</motion.button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
      <style jsx global>{`
        html, body { background: #020617 !important; overflow-x: hidden !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 4px; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(circle at 20% 30%, rgba(34,197,94,0.06), transparent 50%), radial-gradient(circle at 85% 70%, rgba(168,85,247,0.05), transparent 50%)",
        zIndex: 0, pointerEvents: "none",
      }} />

      <Header />
      <AppSidebar active="/earn" />

      <main style={{ marginLeft: 216, paddingTop: 72, minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "38px 28px 80px" }}>

          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}
            style={{ marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6 }}>
                Profit Distributor
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Earn</h1>
            </div>
            <Link href="/dashboard">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>← Dashboard</span>
            </Link>
          </motion.div>

          {/* Stats banner */}
          {/* Live refresh indicator */}
          {lastUpdated && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}
              />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: "monospace", letterSpacing: "0.08em" }}>
                LIVE · refreshes every 30s · last updated {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}
          >
            {[
              { label: "Your Deposit",  value: isLoading ? null : `$${fmt(depositedUSDC)}`,      accent: "#22c55e" },
              { label: "Claimable",     value: isLoading ? null : `$${fmt(claimableProfit, 4)}`,  accent: "#a855f7" },
              { label: "Total Claimed", value: isLoading ? null : `$${fmt(totalClaimed)}`,        accent: "#06b6d4" },
              { label: "Protocol TVL",  value: tvlRaw === undefined ? null : `$${fmt(String(tvl), 0)}`, accent: "#eab308" },
            ].map((s) => (
              <div key={s.label} className="glass-panel" style={{ padding: "16px 18px", borderRadius: 14, border: `1px solid ${s.accent}18`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, background: s.accent, filter: "blur(50px)", opacity: 0.08, borderRadius: "50%" }} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
                {s.value === null ? <Skeleton w={100} h={20} /> : <div style={{ fontSize: 18, fontWeight: 900, color: s.accent, fontStyle: "italic" }}>{s.value}</div>}
              </div>
            ))}
          </motion.div>

          {/* Main layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>

            {/* LEFT */}
            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>

              {/* Claim profits hero card */}
              <div className="glass-panel" style={{ padding: "28px 26px", borderRadius: 20, border: "1px solid rgba(168,85,247,0.22)", marginBottom: 16, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: "#a855f7", filter: "blur(80px)", opacity: 0.07, borderRadius: "50%" }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                      <DepositDonut deposited={depositedNum} claimable={claimableNum} />
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
                          💸 Claimable Profits
                        </div>
                        {isLoading ? <Skeleton w={140} h={40} /> : (
                          <div style={{ fontSize: 40, fontWeight: 900, color: "#a855f7", fontStyle: "italic", lineHeight: 1 }}>
                            ${fmt(claimableProfit, 4)}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", marginRight: 5 }} />
                            Deposited: <span style={{ color: "#22c55e", fontWeight: 700 }}>${fmt(depositedUSDC)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7", display: "inline-block", marginRight: 5 }} />
                            Claimable: <span style={{ color: "#a855f7", fontWeight: 700 }}>${fmt(claimableProfit, 4)}</span>
                          </div>
                        </div>
                        {estimatedAPY && (
                          <div style={{ marginTop: 8, fontSize: 11, color: "#22c55e", fontWeight: 700 }}>
                            ≈ {estimatedAPY}% annualised based on current earnings
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                      <motion.button
                        onClick={handleClaim}
                        disabled={claimableNum <= 0 || isBusy}
                        whileHover={claimableNum > 0 && !isBusy ? { scale: 1.04, boxShadow: "0 0 28px rgba(168,85,247,0.4)" } : {}}
                        whileTap={claimableNum > 0 && !isBusy ? { scale: 0.96 } : {}}
                        style={{
                          padding: "16px 32px",
                          background: claimableNum > 0 && !isBusy ? "linear-gradient(90deg, #7c3aed, #a855f7)" : "rgba(255,255,255,0.05)",
                          border: "none", borderRadius: 14,
                          color: claimableNum > 0 && !isBusy ? "#fff" : "rgba(255,255,255,0.22)",
                          fontWeight: 900, fontSize: 15,
                          cursor: claimableNum <= 0 || isBusy ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {txStatus === "claiming" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
                            Claiming…
                          </span>
                        ) : "💸 Claim Profits"}
                      </motion.button>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "right" }}>
                        Total ever claimed: ${fmt(totalClaimed)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deposit / Withdraw tabs */}
              <div className="glass-panel" style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {(["deposit", "withdraw"] as const).map((t) => (
                    <button key={t} onClick={() => { setTab(t); setInput(""); }}
                      style={{
                        flex: 1, padding: "16px",
                        background: tab === t ? "rgba(34,197,94,0.08)" : "transparent",
                        border: "none",
                        borderBottom: tab === t ? "2px solid #22c55e" : "2px solid transparent",
                        color: tab === t ? "#22c55e" : "rgba(255,255,255,0.4)",
                        fontWeight: 900, fontSize: 13, cursor: "pointer",
                        letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s",
                      }}
                    >
                      {t === "deposit" ? "↓ Deposit" : "↑ Withdraw"}
                    </button>
                  ))}
                </div>

                <div style={{ padding: "28px 24px" }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24, lineHeight: 1.7, marginTop: 0 }}>
                    {tab === "deposit"
                      ? "Deposit USDC to earn a share of all profits generated by Aetheris agents. Earnings accumulate in real time — claim whenever you want."
                      : "Withdraw your USDC principal at any time. Your claimable profits are not affected and remain available to claim separately."}
                  </p>

                  {/* Amount input */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", textTransform: "uppercase" }}>Amount (USDC)</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                        Available: <span style={{ color: "#fff", fontWeight: 700 }}>${tab === "deposit" ? fmt(String(usdcBalance)) : fmt(depositedUSDC)} USDC</span>
                      </span>
                    </div>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number" value={input} onChange={(e) => setInput(e.target.value)}
                        placeholder="0.00" disabled={isBusy}
                        style={{
                          width: "100%", padding: "18px 112px 18px 18px",
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${errMsg ? "#ef444466" : input ? "#22c55e66" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: 14, color: "#fff", fontSize: 22, fontWeight: 900, fontStyle: "italic",
                          outline: "none", transition: "border-color 0.2s",
                        }}
                      />
                      <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => setInput(String(maxAmt))} disabled={isBusy}
                          style={{ padding: "4px 10px", fontSize: 10, fontWeight: 900, background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, color: "#22c55e", cursor: "pointer" }}>
                          MAX
                        </button>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>USDC</span>
                      </div>
                    </div>
                    <AnimatePresence>
                      {errMsg && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          style={{ fontSize: 11, color: "#ef4444", marginTop: 7, paddingLeft: 2 }}>
                          ⚠ {errMsg}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Deposit preview */}
                  <AnimatePresence>
                    {tab === "deposit" && parsed > 0 && !isInvalid && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        style={{ margin: "18px 0", padding: "14px 16px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>Deposit Preview</div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>New total deposit</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>${fmt(String(depositedNum + parsed))} USDC</span>
                        </div>
                        {tvl > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Pool share</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#06b6d4" }}>
                              {(((depositedNum + parsed) / (tvl + parsed)) * 100).toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Approval notice */}
                  <AnimatePresence>
                    {needsApproval && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ margin: "14px 0", padding: "10px 14px", fontSize: 11, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 10, color: "#06b6d4", lineHeight: 1.5 }}>
                        ℹ This requires 2 transactions: first an <strong>approval</strong> for the USDC spend, then the <strong>deposit</strong>.
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CTA button */}
                  <motion.button
                    onClick={tab === "deposit" ? handleDeposit : handleWithdraw}
                    disabled={isInvalid || isBusy}
                    whileHover={!isInvalid && !isBusy ? { scale: 1.02, boxShadow: `0 0 28px ${tab === "deposit" ? "rgba(34,197,94,0.35)" : "rgba(234,179,8,0.3)"}` } : {}}
                    whileTap={!isInvalid && !isBusy ? { scale: 0.98 } : {}}
                    style={{
                      marginTop: 22, width: "100%", padding: "18px",
                      background: isInvalid || isBusy ? "rgba(255,255,255,0.05)" : tab === "deposit" ? "linear-gradient(90deg, #16a34a, #22c55e)" : "rgba(234,179,8,0.11)",
                      border: isInvalid || isBusy ? "1px solid rgba(255,255,255,0.08)" : tab === "deposit" ? "none" : "1px solid rgba(234,179,8,0.3)",
                      borderRadius: 14,
                      color: isInvalid || isBusy ? "rgba(255,255,255,0.22)" : tab === "deposit" ? "#fff" : "#eab308",
                      fontWeight: 900, fontSize: 15, letterSpacing: "0.04em",
                      cursor: isInvalid || isBusy ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {isBusy ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
                        {txStatus === "approving" ? "Approving…" : txStatus === "depositing" ? "Depositing…" : txStatus === "withdrawing" ? "Withdrawing…" : "Processing…"}
                      </span>
                    ) : tab === "deposit" ? (
                      `↓ Deposit ${parsed > 0 ? "$" + fmt(input) + " " : ""}USDC`
                    ) : (
                      `↑ Withdraw ${parsed > 0 ? "$" + fmt(input) + " " : ""}USDC`
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* RIGHT */}
            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <AgentAlphaCard
                contracts={contracts}
                address={address as `0x${string}`}
                globalBusy={isBusy}
                totalDistributed={totalDistributed}
              />

              <div className="glass-panel" style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", padding: "22px", position: "sticky", top: 96 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
                  How it works
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 18 }}>Four simple steps</div>
                <HowItWorks />
              </div>
            </motion.div>

          </div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            style={{ marginTop: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 20, fontSize: 10, color: "rgba(255,255,255,0.18)", fontFamily: "monospace", letterSpacing: "0.12em", flexWrap: "wrap" }}
          >
            <span><span style={{ color: "#22c55e" }}>●</span> BASE SEPOLIA</span>
            <span>|</span>
            <span>USDC: {contracts.USDC.slice(0, 6)}…{contracts.USDC.slice(-4)}</span>
            <span>|</span>
            <span>DISTRIBUTOR: {contracts.PROFIT_DISTRIBUTOR.slice(0, 6)}…{contracts.PROFIT_DISTRIBUTOR.slice(-4)}</span>
          </motion.div>

        </div>
      </main>

      <AnimatePresence>
        {txStatus !== "idle" && (
          <Toast status={txStatus} txHash={txHash} onClose={() => { setTxStatus("idle"); setTxHash(undefined); }} />
        )}
      </AnimatePresence>
    </div>
  );
}