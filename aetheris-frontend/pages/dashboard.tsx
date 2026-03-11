// pages/dashboard.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useAetherisUser } from "@/hooks/useAetherisUser";
import { getContracts, STAKING_ABI } from "@/lib/contracts";
import { aetherisApi, type Transaction } from "@/lib/api";

// ─── Tier Config ──────────────────────────────────────────────────────────────
const TIERS = [
  { level: 0, name: "RECRUIT",   color: "#64748b", min: 0,       max: 1_000    },
  { level: 1, name: "OPERATIVE", color: "#06b6d4", min: 1_000,   max: 10_000   },
  { level: 2, name: "SENTINEL",  color: "#a855f7", min: 10_000,  max: 50_000   },
  { level: 3, name: "VANGUARD",  color: "#eab308", min: 50_000,  max: 200_000  },
  { level: 4, name: "SOVEREIGN", color: "#ef4444", min: 200_000, max: Infinity },
] as const;

type Tier = (typeof TIERS)[number];

function getTierByLevel(level: number): Tier {
  return TIERS[Math.min(Math.max(level, 0), TIERS.length - 1)];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAmount(val: string | undefined | null, dp = 2): string {
  if (val === undefined || val === null) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function txLabel(type: Transaction["type"]) {
  return { DEPOSIT: "Deposit", WITHDRAWAL: "Withdraw", CLAIM: "Claim" }[type] ?? type;
}
function txIcon(type: Transaction["type"]) {
  return { DEPOSIT: "↓", WITHDRAWAL: "↑", CLAIM: "💸" }[type] ?? "•";
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = 100, h = 12 }: { w?: number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.2, 0.45, 0.2] }}
      transition={{ duration: 1.7, repeat: Infinity }}
      style={{ width: w, height: h, background: "rgba(255,255,255,0.08)", borderRadius: 6 }}
    />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, accent, loading,
}: {
  icon: string; label: string; value: string;
  sub?: string; accent: string; loading?: boolean;
}) {
  return (
    <motion.div
      className="glass-panel"
      style={{
        padding: "26px 22px", borderRadius: 20,
        border: `1px solid ${accent}22`,
        position: "relative", overflow: "hidden", minHeight: 134,
      }}
      whileHover={{ borderColor: `${accent}50`, boxShadow: `0 0 28px ${accent}18` }}
      transition={{ duration: 0.2 }}
    >
      <div style={{
        position: "absolute", top: -50, right: -50,
        width: 160, height: 160,
        background: accent, filter: "blur(70px)", opacity: 0.07, borderRadius: "50%",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            {label}
          </span>
        </div>
        {loading
          ? <Skeleton w={130} h={30} />
          : <div style={{
              fontSize: 28, fontWeight: 900, color: "#fff",
              letterSpacing: "-0.02em", fontStyle: "italic",
            }}>
              {value}
            </div>
        }
        {sub && !loading && (
          <div style={{ fontSize: 11, color: accent, marginTop: 5, fontWeight: 600 }}>
            {sub}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Tier Card ────────────────────────────────────────────────────────────────
function TierCard({ tier, stakedNum, loading }: { tier: Tier; stakedNum: number; loading: boolean }) {
  const nextTier = TIERS[tier.level + 1] as Tier | undefined;
  const progress = nextTier
    ? Math.min(((stakedNum - tier.min) / (nextTier.min - tier.min)) * 100, 100)
    : 100;

  return (
    <motion.div
      className="glass-panel"
      style={{
        padding: "28px 24px", borderRadius: 20,
        border: `1px solid ${tier.color}28`,
        position: "relative", overflow: "hidden",
      }}
      whileHover={{ boxShadow: `0 0 36px ${tier.color}16` }}
    >
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 220, height: 220,
        background: tier.color, filter: "blur(90px)", opacity: 0.06, borderRadius: "50%",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8,
            }}>
              🏆 Staking Tier
            </div>
            {loading ? <Skeleton w={120} h={24} /> : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 24, fontWeight: 900, color: tier.color,
                  letterSpacing: "0.08em", textShadow: `0 0 20px ${tier.color}55`,
                }}>
                  {tier.name}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 900,
                  border: `1px solid ${tier.color}`, color: tier.color,
                  padding: "3px 10px", borderRadius: 99, background: `${tier.color}11`,
                  letterSpacing: "0.1em",
                }}>
                  TIER {tier.level}
                </span>
              </div>
            )}
          </div>
          {nextTier && !loading && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginBottom: 4 }}>
                Next: {nextTier.name}
              </div>
              <div style={{ fontSize: 12, color: tier.color, fontWeight: 700 }}>
                {Math.max(0, nextTier.min - stakedNum).toLocaleString()} AX needed
              </div>
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: loading ? "0%" : `${progress}%` }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
            style={{
              height: "100%",
              background: `linear-gradient(90deg, ${tier.color}66, ${tier.color})`,
              borderRadius: 99,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {tier.min.toLocaleString()} AX
          </span>
          {nextTier && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
              {nextTier.min.toLocaleString()} AX
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Claimable Card ───────────────────────────────────────────────────────────
function ClaimableCard({ claimable, totalClaimed, loading }: {
  claimable: string; totalClaimed: string; loading: boolean;
}) {
  return (
    <motion.div
      className="glass-panel"
      style={{
        padding: "28px 24px", borderRadius: 20,
        border: "1px solid rgba(34,197,94,0.2)",
        position: "relative", overflow: "hidden",
      }}
      whileHover={{ boxShadow: "0 0 36px rgba(34,197,94,0.12)" }}
    >
      <div style={{
        position: "absolute", bottom: -50, left: -50,
        width: 180, height: 180,
        background: "#22c55e", filter: "blur(80px)", opacity: 0.05, borderRadius: "50%",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14,
        }}>
          💸 Claimable Profit
        </div>
        {loading
          ? <Skeleton w={110} h={34} />
          : <div style={{
              fontSize: 32, fontWeight: 900, color: "#22c55e",
              fontStyle: "italic", letterSpacing: "-0.02em",
            }}>
              ${fmtAmount(claimable, 4)}
            </div>
        }
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 6 }}>
          Total claimed: ${fmtAmount(totalClaimed, 2)} USDC
        </div>
        <Link href="/earn">
          <motion.button
            whileHover={{ scale: 1.03, boxShadow: "0 0 18px rgba(34,197,94,0.28)" }}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop: 22, width: "100%", padding: "12px",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.28)",
              borderRadius: 12, color: "#22c55e",
              fontWeight: 900, fontSize: 13, cursor: "pointer",
            }}
          >
            Claim Profits →
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: Transaction }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
      }}
      whileHover={{ background: "rgba(6,182,212,0.04)", borderColor: "rgba(6,182,212,0.14)" }}
      onClick={() => window.open(`https://sepolia.basescan.org/tx/${tx.txHash}`, "_blank")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(6,182,212,0.08)",
          border: "1px solid rgba(6,182,212,0.14)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>
          {txIcon(tx.type)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{txLabel(tx.type)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: "monospace" }}>
            {tx.txHash.slice(0, 8)}…{tx.txHash.slice(-6)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtAmount(tx.amount, 4)} USDC</div>
        <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, textTransform: "uppercase" }}>
          confirmed
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⬡" },
  { href: "/stake",     label: "Stake",     icon: "⚡" },
  { href: "/earn",      label: "Earn",      icon: "💸" },
  { href: "/account",   label: "Account",   icon: "🔑" },
] as const;

export function AppSidebar({ active }: { active: string }) {
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
      <div style={{
        fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)",
        letterSpacing: "0.35em", textTransform: "uppercase",
        marginBottom: 14, paddingLeft: 10,
      }}>
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
                fontWeight: isActive ? 700 : 500,
                fontSize: 13, cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {item.label}
              {isActive && (
                <div style={{
                  marginLeft: "auto", width: 5, height: 5,
                  borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 6px #06b6d4",
                }} />
              )}
            </motion.div>
          </Link>
        );
      })}
      <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 18 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <motion.div
            whileHover={{ x: 3 }}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "11px 10px", borderRadius: 11,
              color: "rgba(255,255,255,0.28)", fontSize: 13, cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 17 }}>←</span> Back to Site
          </motion.div>
        </Link>
      </div>
    </motion.nav>
  );
}

// ─── Protocol Banner ──────────────────────────────────────────────────────────
function ProtocolBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["protocol-stats"],
    queryFn: () => aetherisApi.getProtocolStats(),
    staleTime: 60_000,
  });

  const stats = [
    { label: "TVL",        value: data ? `$${fmtAmount(data.protocol.tvlUSDC, 0)}` : null },
    { label: "Users",      value: data ? data.protocol.totalUsers.toLocaleString() : null },
    { label: "Arb Profit", value: data ? `$${fmtAmount(data.protocol.totalArbitrageProfit, 2)}` : null },
    { label: "Uptime",     value: data ? `${data.protocol.uptimePercent}%` : null },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      style={{
        display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap",
        padding: "12px 20px",
        background: "rgba(6,182,212,0.04)",
        border: "1px solid rgba(6,182,212,0.1)",
        borderRadius: 14, marginBottom: 28,
      }}
    >
      {stats.map((s) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.15em", textTransform: "uppercase",
          }}>
            {s.label}
          </span>
          {isLoading || s.value === null
            ? <Skeleton w={48} />
            : <span style={{ fontSize: 13, fontWeight: 900, color: "#06b6d4" }}>{s.value}</span>
          }
        </div>
      ))}
      <div style={{
        marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
        fontSize: 10, color: "rgba(255,255,255,0.25)",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22c55e", boxShadow: "0 0 6px #22c55e",
        }} />
        BASE SEPOLIA
      </div>
    </motion.div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const contracts = getContracts(chainId);

  // Primary: aggregated backend call via useAetherisUser
  const {
    isLoading,
    isError,
    refetch,
    axBalance,
    stakingTier,   // e.g. "Operative"  — the string label
    stakedAmount,  // e.g. "5000.00"
    stakingRewards,
    depositedUSDC,
    claimableProfit,
    totalClaimed,
    data,
  } = useAetherisUser();

  // tierLevel as a number — comes from data.staking.tierLevel
  const tierLevel: number = data?.staking?.tierLevel ?? 0;
  const tier = getTierByLevel(tierLevel);
  const stakedNum = parseFloat(stakedAmount || "0") || 0;

  // Fallback: direct contract read for tier when API errors
  const { data: contractStakingInfo } = useReadContract({
    address: contracts.STAKING,
    abi: STAKING_ABI,
    functionName: "getStakingInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isError },
  });
  const resolvedTier = isError && contractStakingInfo
    ? getTierByLevel(contractStakingInfo[1])
    : tier;

  // Transaction history
  const {
    data: txData,
    isLoading: txLoading,
    refetch: refetchTx,
  } = useQuery({
    queryKey: ["transactions", address],
    queryFn: () => aetherisApi.getTransactions(address!, 8),
    enabled: !!address && isConnected,
    staleTime: 30_000,
  });
  const transactions = txData?.transactions ?? [];

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
        <Header />
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh",
          gap: 24, textAlign: "center", padding: 24,
        }}>
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ fontSize: 60 }}
          >
            ⬡
          </motion.div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontStyle: "italic", margin: 0 }}>
            Connect to Continue
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.38)", maxWidth: 340,
            lineHeight: 1.6, margin: 0,
          }}>
            Connect your wallet to access the Aetheris dashboard.
          </p>
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(6,182,212,0.4)" }}
            whileTap={{ scale: 0.96 }}
            onClick={openConnectModal}
            style={{
              padding: "16px 40px",
              background: "linear-gradient(90deg, #06b6d4, #2563eb)",
              borderRadius: 99, border: "none",
              color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
            }}
          >
            CONNECT WALLET ⚡
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
      <style jsx global>{`
        html, body { background: #020617 !important; overflow-x: hidden !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 4px; }
      `}</style>
      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(circle at 65% 15%, rgba(6,182,212,0.07), transparent 55%)",
        zIndex: 0, pointerEvents: "none",
      }} />

      <Header />
      <AppSidebar active="/dashboard" />

      <main style={{ marginLeft: 216, paddingTop: 72, minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "38px 28px 80px" }}>

          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 14, marginBottom: 32,
            }}
          >
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#06b6d4",
                letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6,
              }}>
                Overview
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", margin: 0 }}>
                Dashboard
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#22c55e", boxShadow: "0 0 7px #22c55e",
              }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", fontFamily: "monospace" }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              <a
                href={`https://sepolia.basescan.org/address/${address}`}
                target="_blank" rel="noreferrer"
                style={{
                  fontSize: 10, color: "#06b6d4", textDecoration: "none",
                  border: "1px solid rgba(6,182,212,0.28)", padding: "3px 10px", borderRadius: 99,
                }}
              >
                BaseScan ↗
              </a>
              <motion.button
                onClick={() => { refetch(); refetchTx(); }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  fontSize: 11, color: "#06b6d4", background: "transparent",
                  border: "1px solid rgba(6,182,212,0.2)",
                  padding: "3px 12px", borderRadius: 99, cursor: "pointer", fontWeight: 700,
                }}
              >
                ↻ Refresh
              </motion.button>
            </div>
          </motion.div>

          {/* Protocol banner */}
          <ProtocolBanner />

          {/* Error banner */}
          <AnimatePresence>
            {isError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginBottom: 20, padding: "12px 16px",
                  background: "rgba(234,179,8,0.07)",
                  border: "1px solid rgba(234,179,8,0.25)",
                  borderRadius: 12, fontSize: 12, color: "#eab308",
                }}
              >
                ⚠ Could not reach backend — falling back to on-chain data.{" "}
                <button
                  onClick={() => refetch()}
                  style={{
                    background: "none", border: "none",
                    color: "#eab308", cursor: "pointer",
                    textDecoration: "underline", fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4 stat cards */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14, marginBottom: 16,
            }}
          >
            <StatCard
              icon="◈" label="AX Balance"
              value={`${fmtAmount(axBalance)} AX`}
              sub="Aetheris Token"
              accent="#06b6d4" loading={isLoading}
            />
            <StatCard
              icon="⚡" label="Staked AX"
              value={`${fmtAmount(stakedAmount)} AX`}
              sub={stakingTier || "Not staking"}
              accent="#a855f7" loading={isLoading}
            />
            <StatCard
              icon="🎁" label="Pending Rewards"
              value={`${fmtAmount(stakingRewards, 4)} AX`}
              sub="Unclaimed staking rewards"
              accent="#22c55e" loading={isLoading}
            />
            <StatCard
              icon="💵" label="USDC Deposited"
              value={`$${fmtAmount(depositedUSDC)}`}
              sub="In ProfitDistributor"
              accent="#eab308" loading={isLoading}
            />
          </motion.div>

          {/* Tier + Claimable */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 280px",
              gap: 14, marginBottom: 16,
            }}
          >
            <TierCard tier={resolvedTier} stakedNum={stakedNum} loading={isLoading} />
            <ClaimableCard
              claimable={claimableProfit}
              totalClaimed={totalClaimed}
              loading={isLoading}
            />
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.26 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 30 }}
          >
            {[
              { href: "/stake",   label: "Stake AX",       icon: "⚡", color: "#06b6d4", desc: "Earn rewards & unlock tiers" },
              { href: "/earn",    label: "Deposit USDC",   icon: "💵", color: "#22c55e", desc: "Earn from agent profits"     },
              { href: "/account", label: "Manage Account", icon: "🔑", color: "#a855f7", desc: "Session keys & guardians"    },
            ].map((a, i) => (
              <Link key={a.href} href={a.href} style={{ textDecoration: "none" }}>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="glass-panel"
                  style={{
                    padding: "20px 18px", borderRadius: 16,
                    border: `1px solid ${a.color}1f`, cursor: "pointer",
                  }}
                  whileHover={{ borderColor: `${a.color}50`, scale: 1.02, boxShadow: `0 0 22px ${a.color}14` }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{a.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>{a.desc}</div>
                </motion.div>
              </Link>
            ))}
          </motion.div>

          {/* Transaction History */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.34 }}
          >
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 14,
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.05em" }}>
                Recent Transactions
              </div>
              {txData?.total !== undefined && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  {txData.total} total
                </span>
              )}
            </div>

            <div
              className="glass-panel"
              style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}
            >
              {txLoading ? (
                <div style={{ padding: "28px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <motion.div
                        animate={{ opacity: [0.12, 0.35, 0.12] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.12 }}
                        style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.05)", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                        <Skeleton w={90} /> <Skeleton w={180} />
                      </div>
                      <Skeleton w={70} />
                    </div>
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div style={{ padding: "52px 24px", textAlign: "center", color: "rgba(255,255,255,0.22)", fontSize: 13 }}>
                  <div style={{ fontSize: 30, marginBottom: 12 }}>📋</div>
                  No transactions yet
                </div>
              ) : (
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <AnimatePresence>
                    {transactions.map((tx, i) => (
                      <motion.div
                        key={tx.txHash}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <TxRow tx={tx} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            style={{
              marginTop: 44, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 20, fontSize: 10, color: "rgba(255,255,255,0.18)",
              fontFamily: "monospace", letterSpacing: "0.12em", flexWrap: "wrap",
            }}
          >
            <span><span style={{ color: "#22c55e" }}>●</span> BASE SEPOLIA</span>
            <span>|</span>
            <span>V-PROOFS: VERIFIED</span>
            <span>|</span>
            <span>AETHERIS PROTOCOL v1.0</span>
          </motion.div>

        </div>
      </main>
    </div>
  );
}