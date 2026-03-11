// Aetheris\aetheris-frontend\pages\stake.tsx

// Aetheris\aetheris-frontend\pages\stake.tsx
// UPDATED: Revised Whitepaper v3 — correct tier names, AX minimums, yield multipliers, USDC distributions, 7-day unstaking delay

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { useAetherisUser } from "@/hooks/useAetherisUser";
import { getContracts, AX_TOKEN_ABI, STAKING_ABI } from "@/lib/contracts";
import { parseUnits, formatUnits } from "viem";

// ─── Tier Config ── Whitepaper v3, Section 5.4 ────────────────────────────────
// Multipliers are vault yield share-weighting mechanisms, not additional profit creation.
// Rewards distributed in USDC from the 20% protocol fee on agent profits.
const TIERS = [
  {
    level: 0, name: "BASE",     color: "#64748b", min: 0,         multiplier: "1.00×", icon: "◌",
    perks: [
      "Standard vault yield (proportional share)",
      "USDC distributions from protocol fee",
      "Basic governance participation",
    ],
  },
  {
    level: 1, name: "BRONZE",   color: "#b45309", min: 1_000,     multiplier: "1.10×", icon: "◎",
    perks: [
      "1.10× vault yield share multiplier",
      "USDC distributions from protocol fee",
      "Governance voting rights",
    ],
  },
  {
    level: 2, name: "SILVER",   color: "#94a3b8", min: 10_000,    multiplier: "1.25×", icon: "◈",
    perks: [
      "1.25× vault yield share multiplier",
      "USDC distributions from protocol fee",
      "Governance voting rights",
    ],
  },
  {
    level: 3, name: "GOLD",     color: "#eab308", min: 100_000,   multiplier: "1.50×", icon: "◆",
    perks: [
      "1.50× vault yield share multiplier",
      "Enhanced USDC distributions",
      "Full governance voting + proposal creation",
    ],
  },
  {
    level: 4, name: "PLATINUM", color: "#06b6d4", min: 1_000_000, multiplier: "2.00×", icon: "★",
    perks: [
      "2.00× vault yield share multiplier",
      "Maximum USDC distributions",
      "Full governance — all parameters",
    ],
  },
] as const;

type Tier = (typeof TIERS)[number];

function getTierByLevel(level: number): Tier {
  return TIERS[Math.min(Math.max(level, 0), TIERS.length - 1)];
}
function getTierByAmount(amount: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (amount >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: string | undefined | null, dp = 2): string {
  if (!val) return "0.00";
  const n = parseFloat(val);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

type TxStatus = "idle" | "approving" | "staking" | "unstaking" | "claiming" | "success" | "error";

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
      <div style={{
        fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)",
        letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: 14, paddingLeft: 10,
      }}>App</div>

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
          <motion.div whileHover={{ x: 3 }} style={{
            display: "flex", alignItems: "center", gap: 11,
            padding: "11px 10px", borderRadius: 11,
            color: "rgba(255,255,255,0.28)", fontSize: 13, cursor: "pointer",
          }}>
            <span style={{ fontSize: 17 }}>←</span> Back to Site
          </motion.div>
        </Link>
      </div>
    </motion.nav>
  );
}

// ─── Tier Ladder ──────────────────────────────────────────────────────────────
function TierLadder({ currentLevel, previewLevel }: { currentLevel: number; previewLevel: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {TIERS.map((t) => {
        const isCurrent  = t.level === currentLevel;
        const isPreview  = t.level === previewLevel && previewLevel !== currentLevel;
        const isPast     = t.level < currentLevel;
        const isUpcoming = !isCurrent && !isPreview && !isPast;

        return (
          <motion.div
            key={t.level}
            animate={{
              borderColor: isPreview
                ? [`${t.color}00`, `${t.color}55`, `${t.color}00`]
                : isCurrent ? `${t.color}40` : "rgba(255,255,255,0.05)",
            }}
            transition={isPreview ? { duration: 1.4, repeat: Infinity } : { duration: 0.3 }}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 13px", borderRadius: 12,
              border: "1px solid",
              background: isCurrent ? `${t.color}0d` : isPreview ? `${t.color}07` : "rgba(255,255,255,0.01)",
              opacity: isPast ? 0.35 : isUpcoming ? 0.32 : 1,
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: isCurrent || isPreview ? `${t.color}16` : "rgba(255,255,255,0.04)",
              border: `1px solid ${isCurrent || isPreview ? t.color + "40" : "rgba(255,255,255,0.06)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: t.color,
            }}>
              {t.icon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: t.color, letterSpacing: "0.06em" }}>
                  {t.name}
                </span>
                {/* Multiplier badge */}
                <span style={{
                  fontSize: 9, fontWeight: 900, color: t.color,
                  border: `1px solid ${t.color}44`, padding: "1px 7px",
                  borderRadius: 99, background: `${t.color}10`, letterSpacing: "0.05em",
                }}>
                  {t.multiplier}
                </span>
                {isCurrent && (
                  <span style={{
                    fontSize: 8, fontWeight: 900, color: t.color,
                    border: `1px solid ${t.color}`, padding: "1px 7px",
                    borderRadius: 99, background: `${t.color}14`, letterSpacing: "0.1em",
                  }}>NOW</span>
                )}
                {isPreview && (
                  <motion.span
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    style={{
                      fontSize: 8, fontWeight: 900, color: t.color,
                      border: `1px solid ${t.color}`, padding: "1px 7px",
                      borderRadius: 99, background: `${t.color}14`, letterSpacing: "0.1em",
                    }}
                  >PREVIEW</motion.span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.3 }}>
                {t.perks[0]}
              </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
                {t.min === 0 ? "0 AX" : `${t.min.toLocaleString()} AX`}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
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
    approving: { color: "#06b6d4", icon: "⏳", text: "Approving AX spend…"        },
    staking:   { color: "#a855f7", icon: "⚡", text: "Staking AX tokens…"         },
    unstaking: { color: "#eab308", icon: "↩",  text: "Initiating unstake (7-day delay)…" },
    claiming:  { color: "#22c55e", icon: "💸", text: "Claiming USDC rewards…"     },
    success:   { color: "#22c55e", icon: "✓",  text: "Transaction confirmed!"     },
    error:     { color: "#ef4444", icon: "✗",  text: "Transaction failed — check wallet" },
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
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontFamily: "monospace" }}
          >
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function StakePage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const contracts = getContracts(chainId);
  const queryClient = useQueryClient();

  const [tab, setTab]           = useState<"stake" | "unstake">("stake");
  const [inputAmount, setInput] = useState("");
  const [txStatus, setStatus]   = useState<TxStatus>("idle");
  const [txHash, setTxHash]     = useState<string | undefined>();

  // ── User data ─────────────────────────────────────────────────────────────
  const {
    isLoading, refetch,
    axBalance, stakedAmount, stakingRewards, data: userData,
  } = useAetherisUser();

  const tierLevel: number  = userData?.staking?.tierLevel ?? 0;
  const currentTier        = getTierByLevel(tierLevel);

  // ── Allowance ─────────────────────────────────────────────────────────────
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: contracts.AX_TOKEN,
    abi: AX_TOKEN_ABI,
    functionName: "allowance",
    args: address ? [address, contracts.STAKING] : undefined,
    query: { enabled: !!address },
  });

  // ── Write contracts ───────────────────────────────────────────────────────
  const { writeContractAsync: approve  } = useWriteContract();
  const { writeContractAsync: stake    } = useWriteContract();
  const { writeContractAsync: unstake  } = useWriteContract();
  const { writeContractAsync: claim    } = useWriteContract();

  // ── Wait for receipt ──────────────────────────────────────────────────────
  const { isLoading: waitingTx } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (txHash && !waitingTx && txStatus !== "success" && txStatus !== "idle") {
      setStatus("success");
      setInput("");
      refetch();
      refetchAllowance();
      queryClient.invalidateQueries({ queryKey: ["aetheris-user"] });
    }
  }, [waitingTx, txHash, txStatus, refetch, refetchAllowance, queryClient]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const parsed       = parseFloat(inputAmount) || 0;
  const balanceNum   = parseFloat(axBalance    || "0") || 0;
  const stakedNum    = parseFloat(stakedAmount || "0") || 0;
  const rewardsNum   = parseFloat(stakingRewards || "0") || 0;
  const allowanceNum = allowanceRaw ? parseFloat(formatUnits(allowanceRaw, 18)) : 0;
  const needsApproval = tab === "stake" && parsed > 0 && allowanceNum < parsed;

  const maxAmt    = tab === "stake" ? balanceNum : stakedNum;
  const isInvalid = parsed <= 0 || parsed > maxAmt;
  const errMsg    = parsed > maxAmt && parsed > 0
    ? `Insufficient ${tab === "stake" ? "wallet balance" : "staked AX"}`
    : null;

  const previewStaked = tab === "stake" ? stakedNum + parsed : Math.max(0, stakedNum - parsed);
  const previewTier   = parsed > 0 ? getTierByAmount(previewStaked) : currentTier;
  const tierChanged   = previewTier.level !== currentTier.level;

  const isBusy = ["approving","staking","unstaking","claiming"].includes(txStatus) || waitingTx;

  // Next tier data for upgrade nudge
  const nextTier = currentTier.level < TIERS.length - 1 ? getTierByLevel(currentTier.level + 1) : null;
  const toNextTier = nextTier ? Math.max(0, nextTier.min - stakedNum) : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStake = useCallback(async () => {
    if (!address || isInvalid) return;
    try {
      const amount = parseUnits(inputAmount, 18);

      if (needsApproval) {
        setStatus("approving");
        const approveTx = await approve({
          address: contracts.AX_TOKEN,
          abi: AX_TOKEN_ABI,
          functionName: "approve",
          args: [contracts.STAKING, amount],
        });
        setTxHash(approveTx);
        await new Promise(r => setTimeout(r, 3500));
        await refetchAllowance();
      }

      setStatus("staking");
      const hash = await stake({
        address: contracts.STAKING,
        abi: STAKING_ABI,
        functionName: "stake",
        args: [parseUnits(inputAmount, 18)],
      });
      setTxHash(hash);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [address, inputAmount, isInvalid, needsApproval, approve, stake, contracts, refetchAllowance]);

  const handleUnstake = useCallback(async () => {
    if (!address || isInvalid) return;
    try {
      setStatus("unstaking");
      const hash = await unstake({
        address: contracts.STAKING,
        abi: STAKING_ABI,
        functionName: "unstake",
        args: [parseUnits(inputAmount, 18)],
      });
      setTxHash(hash);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [address, inputAmount, isInvalid, unstake, contracts]);

  const handleClaim = useCallback(async () => {
    if (!address || rewardsNum <= 0) return;
    try {
      setStatus("claiming");
      const hash = await claim({
        address: contracts.STAKING,
        abi: STAKING_ABI,
        functionName: "claimRewards",
      });
      setTxHash(hash);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [address, rewardsNum, claim, contracts]);

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
        <Header />
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", gap: 24, textAlign: "center", padding: 24,
        }}>
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
            <span style={{ fontSize: 60 }}>⚡</span>
          </motion.div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Connect Wallet</h1>
          <p style={{ color: "rgba(255,255,255,0.38)", maxWidth: 340, margin: 0, lineHeight: 1.6 }}>
            Connect your wallet to stake AX and earn USDC distributions from protocol revenue.
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
        background: "radial-gradient(circle at 25% 20%, rgba(6,182,212,0.06), transparent 50%), radial-gradient(circle at 80% 75%, rgba(6,182,212,0.04), transparent 50%)",
        zIndex: 0, pointerEvents: "none",
      }} />

      <Header />
      <AppSidebar active="/stake" />

      <main style={{ marginLeft: 216, paddingTop: 72, minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "38px 28px 80px" }}>

          {/* ── Page header ── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
            style={{ marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#06b6d4", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6 }}>
                AX Token
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Stake & Earn USDC</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "6px 0 0", lineHeight: 1.5 }}>
                Stake AX to earn USDC from protocol revenue and unlock a vault yield multiplier up to 2.00×
              </p>
            </div>
            <Link href="/dashboard">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>← Dashboard</span>
            </Link>
          </motion.div>

          {/* ── Summary bar ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}
          >
            {[
              { label: "AX Balance",     value: `${fmt(axBalance)} AX`,              accent: "#06b6d4" },
              { label: "Staked",         value: `${fmt(stakedAmount)} AX`,            accent: "#a855f7" },
              { label: "USDC Rewards",   value: `$${fmt(stakingRewards, 4)}`,         accent: "#22c55e" },
              { label: "Current Tier",   value: `${currentTier.name} · ${currentTier.multiplier}`, accent: currentTier.color },
            ].map((s) => (
              <div key={s.label} className="glass-panel" style={{
                padding: "16px 18px", borderRadius: 14,
                border: `1px solid ${s.accent}18`, position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: -30, right: -30,
                  width: 100, height: 100,
                  background: s.accent, filter: "blur(50px)", opacity: 0.08, borderRadius: "50%",
                }} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
                  {s.label}
                </div>
                {isLoading
                  ? <Skeleton w={100} h={20} />
                  : <div style={{ fontSize: 18, fontWeight: 900, color: s.accent, fontStyle: "italic" }}>{s.value}</div>
                }
              </div>
            ))}
          </motion.div>

          {/* ── Main 2-col ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 370px", gap: 20, alignItems: "start" }}>

            {/* LEFT — action panel */}
            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>

              {/* Stake / Unstake tabs */}
              <div className="glass-panel" style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>

                {/* Tab bar */}
                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {(["stake", "unstake"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTab(t); setInput(""); }}
                      style={{
                        flex: 1, padding: "16px",
                        background: tab === t ? "rgba(6,182,212,0.08)" : "transparent",
                        border: "none",
                        borderBottom: tab === t ? "2px solid #06b6d4" : "2px solid transparent",
                        color: tab === t ? "#06b6d4" : "rgba(255,255,255,0.4)",
                        fontWeight: 900, fontSize: 13, cursor: "pointer",
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        transition: "all 0.2s",
                      }}
                    >
                      {t === "stake" ? "⚡ Stake" : "↩ Unstake"}
                    </button>
                  ))}
                </div>

                <div style={{ padding: "28px 24px" }}>
                  {/* Subtext */}
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24, lineHeight: 1.7, marginTop: 0 }}>
                    {tab === "stake"
                      ? "Stake AX to earn USDC distributions from the 20% protocol fee on all agent profits. Also unlocks a vault yield share multiplier — the more you stake, the larger your proportional share of vault returns."
                      : (<>Initiating an unstake starts a <strong style={{ color: "rgba(255,255,255,0.65)" }}>7-day delay</strong> before AX is returned to your wallet. This prevents governance flash-stake attacks. Your pending USDC rewards are preserved — claim them separately.</>)
                    }
                  </p>

                  {/* Amount input */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                        Amount
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                        Available:{" "}
                        <span style={{ color: "#fff", fontWeight: 700 }}>
                          {fmt(tab === "stake" ? axBalance : stakedAmount)} AX
                        </span>
                      </span>
                    </div>

                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        value={inputAmount}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="0.00"
                        disabled={isBusy}
                        style={{
                          width: "100%",
                          padding: "18px 96px 18px 18px",
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${errMsg ? "#ef444466" : inputAmount ? "#06b6d466" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: 14,
                          color: "#fff", fontSize: 22, fontWeight: 900, fontStyle: "italic",
                          outline: "none", transition: "border-color 0.2s",
                        }}
                      />
                      <div style={{
                        position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <button
                          onClick={() => setInput(String(maxAmt))}
                          disabled={isBusy}
                          style={{
                            padding: "4px 10px", fontSize: 10, fontWeight: 900,
                            background: "rgba(6,182,212,0.12)",
                            border: "1px solid rgba(6,182,212,0.3)",
                            borderRadius: 6, color: "#06b6d4", cursor: "pointer",
                          }}
                        >MAX</button>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>AX</span>
                      </div>
                    </div>

                    <AnimatePresence>
                      {errMsg && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ fontSize: 11, color: "#ef4444", marginTop: 7, paddingLeft: 2 }}
                        >
                          ⚠ {errMsg}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Tier change preview */}
                  <AnimatePresence>
                    {parsed > 0 && tierChanged && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        style={{
                          margin: "18px 0",
                          padding: "12px 16px",
                          background: `${previewTier.color}0d`,
                          border: `1px solid ${previewTier.color}33`,
                          borderRadius: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: currentTier.color }}>{currentTier.name}</span>
                          <motion.span
                            animate={{ x: [0, 5, 0] }}
                            transition={{ duration: 0.9, repeat: Infinity }}
                            style={{ color: previewTier.color, fontSize: 18 }}
                          >→</motion.span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: previewTier.color }}>{previewTier.name}</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
                            {tab === "stake" ? "🎉 Tier upgrade!" : "Tier change"}
                          </span>
                        </div>
                        {/* Multiplier delta */}
                        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                          <div style={{ color: "rgba(255,255,255,0.35)" }}>
                            Vault multiplier: <span style={{ color: currentTier.color, fontWeight: 700 }}>{currentTier.multiplier}</span>
                            {" → "}
                            <span style={{ color: previewTier.color, fontWeight: 700 }}>{previewTier.multiplier}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Next tier nudge (stake tab, no tier change in preview) */}
                  <AnimatePresence>
                    {tab === "stake" && parsed === 0 && nextTier && toNextTier > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                          margin: "14px 0",
                          padding: "10px 14px", fontSize: 11,
                          background: `${nextTier.color}09`,
                          border: `1px solid ${nextTier.color}22`,
                          borderRadius: 10, color: nextTier.color, lineHeight: 1.5,
                        }}
                      >
                        Stake <strong>{toNextTier.toLocaleString()} more AX</strong> to reach <strong>{nextTier.name}</strong> ({nextTier.multiplier} vault multiplier)
                        <button
                          onClick={() => setInput(String(toNextTier))}
                          style={{
                            marginLeft: 10, padding: "2px 9px", fontSize: 10, fontWeight: 900,
                            background: `${nextTier.color}16`, border: `1px solid ${nextTier.color}44`,
                            borderRadius: 6, color: nextTier.color, cursor: "pointer",
                          }}
                        >Fill</button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Approval notice */}
                  <AnimatePresence>
                    {needsApproval && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                          margin: "14px 0",
                          padding: "10px 14px", fontSize: 11,
                          background: "rgba(6,182,212,0.06)",
                          border: "1px solid rgba(6,182,212,0.2)",
                          borderRadius: 10, color: "#06b6d4", lineHeight: 1.5,
                        }}
                      >
                        ℹ This requires 2 transactions: first an <strong>approval</strong> for the AX spend, then the <strong>stake</strong> itself.
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Unstake delay warning */}
                  <AnimatePresence>
                    {tab === "unstake" && parsed > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                          margin: "14px 0",
                          padding: "10px 14px", fontSize: 11,
                          background: "rgba(234,179,8,0.06)",
                          border: "1px solid rgba(234,179,8,0.2)",
                          borderRadius: 10, color: "#eab308", lineHeight: 1.5,
                        }}
                      >
                        ⏳ <strong>7-day unstaking delay.</strong> Your AX will be available to withdraw after the delay period ends.
                        USDC rewards continue to accrue during the delay and can be claimed at any time.
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CTA button */}
                  <motion.button
                    onClick={tab === "stake" ? handleStake : handleUnstake}
                    disabled={isInvalid || isBusy}
                    whileHover={!isInvalid && !isBusy ? { scale: 1.02, boxShadow: "0 0 28px rgba(6,182,212,0.28)" } : {}}
                    whileTap={!isInvalid && !isBusy ? { scale: 0.98 } : {}}
                    style={{
                      marginTop: 22, width: "100%", padding: "18px",
                      background: isInvalid || isBusy
                        ? "rgba(255,255,255,0.05)"
                        : tab === "stake"
                        ? "linear-gradient(90deg, #0891b2, #06b6d4)"
                        : "rgba(234,179,8,0.11)",
                      border: isInvalid || isBusy
                        ? "1px solid rgba(255,255,255,0.08)"
                        : tab === "stake" ? "none" : "1px solid rgba(234,179,8,0.3)",
                      borderRadius: 14,
                      color: isInvalid || isBusy ? "rgba(255,255,255,0.22)" : tab === "stake" ? "#fff" : "#eab308",
                      fontWeight: 900, fontSize: 15, letterSpacing: "0.04em",
                      cursor: isInvalid || isBusy ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {isBusy ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          style={{ display: "inline-block" }}
                        >◌</motion.span>
                        {txStatus === "approving" ? "Approving…"
                          : txStatus === "staking" ? "Staking…"
                          : txStatus === "unstaking" ? "Initiating unstake…"
                          : "Processing…"}
                      </span>
                    ) : tab === "stake" ? (
                      `⚡ Stake ${parsed > 0 ? fmt(inputAmount) + " " : ""}AX`
                    ) : (
                      `↩ Unstake ${parsed > 0 ? fmt(inputAmount) + " " : ""}AX`
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Claim USDC rewards */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="glass-panel"
                style={{
                  marginTop: 16, padding: "24px", borderRadius: 20,
                  border: "1px solid rgba(34,197,94,0.18)",
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  position: "absolute", top: -40, right: -40,
                  width: 160, height: 160,
                  background: "#22c55e", filter: "blur(70px)", opacity: 0.05, borderRadius: "50%",
                }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
                        💸 Claimable USDC
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                        From 20% protocol fee on agent profits
                      </div>
                      {isLoading
                        ? <Skeleton w={130} h={28} />
                        : <div style={{ fontSize: 28, fontWeight: 900, color: "#22c55e", fontStyle: "italic" }}>
                            ${fmt(stakingRewards, 4)}
                          </div>
                      }
                    </div>
                    <motion.button
                      onClick={handleClaim}
                      disabled={rewardsNum <= 0 || isBusy}
                      whileHover={rewardsNum > 0 && !isBusy ? { scale: 1.04, boxShadow: "0 0 22px rgba(34,197,94,0.28)" } : {}}
                      whileTap={rewardsNum > 0 && !isBusy ? { scale: 0.96 } : {}}
                      style={{
                        padding: "14px 28px",
                        background: rewardsNum > 0 && !isBusy ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${rewardsNum > 0 && !isBusy ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 12,
                        color: rewardsNum > 0 && !isBusy ? "#22c55e" : "rgba(255,255,255,0.22)",
                        fontWeight: 900, fontSize: 14,
                        cursor: rewardsNum <= 0 || isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      {txStatus === "claiming" ? "Claiming…" : "Claim USDC"}
                    </motion.button>
                  </div>

                  {rewardsNum <= 0 && !isLoading && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 12, marginBottom: 0 }}>
                      USDC distributions accumulate continuously from agent-generated protocol fees. Claim any time — unclaimed rewards keep accruing.
                    </p>
                  )}
                </div>
              </motion.div>
            </motion.div>

            {/* RIGHT — tier ladder */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="glass-panel" style={{
                borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)",
                padding: "24px", position: "sticky", top: 96,
              }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
                    Tier Progression
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>Stake more, multiply your share</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4, lineHeight: 1.5 }}>
                    Multipliers increase your weighted share of vault yield relative to non-staking depositors.
                  </div>
                </div>

                <TierLadder currentLevel={currentTier.level} previewLevel={previewTier.level} />

                {/* Current tier perks */}
                <div style={{
                  marginTop: 18, padding: "16px",
                  background: `${currentTier.color}0a`,
                  border: `1px solid ${currentTier.color}20`,
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: currentTier.color, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
                    Your benefits — {currentTier.name}
                  </div>
                  {currentTier.perks.map((perk, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < currentTier.perks.length - 1 ? 7 : 0 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: currentTier.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{perk}</span>
                    </div>
                  ))}
                </div>

                {/* Staking mechanics note */}
                <div style={{
                  marginTop: 14, padding: "12px 14px", fontSize: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6,
                }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>No minimum.</span> No lock-up to earn. Stake any amount and start earning immediately.
                  </div>
                  <div>
                    <span style={{ color: "#eab308", fontWeight: 700 }}>7-day unstaking delay.</span> Prevents governance flash-stake attacks. Required to maintain protocol integrity.
                  </div>
                </div>
              </div>
            </motion.div>

          </div>

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
            <span>AX: {contracts.AX_TOKEN.slice(0, 6)}…{contracts.AX_TOKEN.slice(-4)}</span>
            <span>|</span>
            <span>STAKING: {contracts.STAKING.slice(0, 6)}…{contracts.STAKING.slice(-4)}</span>
          </motion.div>

        </div>
      </main>

      {/* Toast notifications */}
      <AnimatePresence>
        {txStatus !== "idle" && (
          <Toast
            status={txStatus}
            txHash={txHash}
            onClose={() => { setStatus("idle"); setTxHash(undefined); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// "use client";

// import { useState, useEffect, useCallback } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import Link from "next/link";
// import Header from "@/components/Header";
// import {
//   useAccount,
//   useChainId,
//   useReadContract,
//   useWriteContract,
//   useWaitForTransactionReceipt,
// } from "wagmi";
// import { useConnectModal } from "@rainbow-me/rainbowkit";
// import { useQueryClient } from "@tanstack/react-query";
// import { useAetherisUser } from "@/hooks/useAetherisUser";
// import { getContracts, AX_TOKEN_ABI, STAKING_ABI } from "@/lib/contracts";
// import { parseUnits, formatUnits } from "viem";

// // ─── Tier Config ──────────────────────────────────────────────────────────────
// const TIERS = [
//   { level: 0, name: "RECRUIT",   color: "#64748b", min: 0,       icon: "◌",
//     perks: ["Basic protocol access", "Standard reward rate"] },
//   { level: 1, name: "OPERATIVE", color: "#06b6d4", min: 1_000,   icon: "◎",
//     perks: ["1.5× reward multiplier", "Agent Alpha access", "Priority support"] },
//   { level: 2, name: "SENTINEL",  color: "#a855f7", min: 10_000,  icon: "◈",
//     perks: ["2× reward multiplier", "All agents access", "Governance voting"] },
//   { level: 3, name: "VANGUARD",  color: "#eab308", min: 50_000,  icon: "◆",
//     perks: ["3× reward multiplier", "Early feature access", "Revenue share boost"] },
//   { level: 4, name: "SOVEREIGN", color: "#ef4444", min: 200_000, icon: "★",
//     perks: ["5× reward multiplier", "Protocol governance", "Direct team access", "Max yield"] },
// ] as const;

// type Tier = (typeof TIERS)[number];

// function getTierByLevel(level: number): Tier {
//   return TIERS[Math.min(Math.max(level, 0), TIERS.length - 1)];
// }
// function getTierByAmount(amount: number): Tier {
//   for (let i = TIERS.length - 1; i >= 0; i--) {
//     if (amount >= TIERS[i].min) return TIERS[i];
//   }
//   return TIERS[0];
// }

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// function fmt(val: string | undefined | null, dp = 2): string {
//   if (!val) return "0.00";
//   const n = parseFloat(val);
//   if (isNaN(n)) return "0.00";
//   return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
// }

// type TxStatus = "idle" | "approving" | "staking" | "unstaking" | "claiming" | "success" | "error";

// // ─── Skeleton ─────────────────────────────────────────────────────────────────
// function Skeleton({ w = 80, h = 14 }: { w?: number; h?: number }) {
//   return (
//     <motion.div
//       animate={{ opacity: [0.2, 0.45, 0.2] }}
//       transition={{ duration: 1.7, repeat: Infinity }}
//       style={{ width: w, height: h, background: "rgba(255,255,255,0.08)", borderRadius: 6 }}
//     />
//   );
// }

// // ─── Sidebar ──────────────────────────────────────────────────────────────────
// const NAV = [
//   { href: "/dashboard", label: "Dashboard", icon: "⬡" },
//   { href: "/stake",     label: "Stake",     icon: "⚡" },
//   { href: "/earn",      label: "Earn",      icon: "💸" },
//   { href: "/account",   label: "Account",   icon: "🔑" },
// ] as const;

// function AppSidebar({ active }: { active: string }) {
//   return (
//     <motion.nav
//       initial={{ x: -60, opacity: 0 }}
//       animate={{ x: 0, opacity: 1 }}
//       transition={{ duration: 0.38, ease: "easeOut" }}
//       style={{
//         position: "fixed", left: 0, top: 72, bottom: 0, width: 216,
//         background: "rgba(2,6,23,0.97)",
//         borderRight: "1px solid rgba(6,182,212,0.09)",
//         backdropFilter: "blur(24px)", zIndex: 40,
//         display: "flex", flexDirection: "column", padding: "28px 14px", gap: 3,
//       }}
//     >
//       <div style={{
//         fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)",
//         letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: 14, paddingLeft: 10,
//       }}>App</div>

//       {NAV.map((item) => {
//         const isActive = active === item.href;
//         return (
//           <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
//             <motion.div
//               whileHover={{ x: 3, background: "rgba(6,182,212,0.07)" }}
//               style={{
//                 display: "flex", alignItems: "center", gap: 11,
//                 padding: "11px 10px", borderRadius: 11,
//                 background: isActive ? "rgba(6,182,212,0.1)" : "transparent",
//                 border: isActive ? "1px solid rgba(6,182,212,0.24)" : "1px solid transparent",
//                 color: isActive ? "#06b6d4" : "rgba(255,255,255,0.5)",
//                 fontWeight: isActive ? 700 : 500, fontSize: 13, cursor: "pointer",
//               }}
//             >
//               <span style={{ fontSize: 17 }}>{item.icon}</span>
//               {item.label}
//               {isActive && (
//                 <div style={{
//                   marginLeft: "auto", width: 5, height: 5,
//                   borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 6px #06b6d4",
//                 }} />
//               )}
//             </motion.div>
//           </Link>
//         );
//       })}

//       <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 18 }}>
//         <Link href="/" style={{ textDecoration: "none" }}>
//           <motion.div whileHover={{ x: 3 }} style={{
//             display: "flex", alignItems: "center", gap: 11,
//             padding: "11px 10px", borderRadius: 11,
//             color: "rgba(255,255,255,0.28)", fontSize: 13, cursor: "pointer",
//           }}>
//             <span style={{ fontSize: 17 }}>←</span> Back to Site
//           </motion.div>
//         </Link>
//       </div>
//     </motion.nav>
//   );
// }

// // ─── Tier Ladder ──────────────────────────────────────────────────────────────
// function TierLadder({ currentLevel, previewLevel }: { currentLevel: number; previewLevel: number }) {
//   return (
//     <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
//       {TIERS.map((t) => {
//         const isCurrent  = t.level === currentLevel;
//         const isPreview  = t.level === previewLevel && previewLevel !== currentLevel;
//         const isPast     = t.level < currentLevel;
//         const isUpcoming = !isCurrent && !isPreview && !isPast;

//         return (
//           <motion.div
//             key={t.level}
//             animate={{
//               borderColor: isPreview
//                 ? [`${t.color}00`, `${t.color}55`, `${t.color}00`]
//                 : isCurrent ? `${t.color}40` : "rgba(255,255,255,0.05)",
//             }}
//             transition={isPreview ? { duration: 1.4, repeat: Infinity } : { duration: 0.3 }}
//             style={{
//               display: "flex", alignItems: "center", gap: 12,
//               padding: "12px 13px", borderRadius: 12,
//               border: "1px solid",
//               background: isCurrent ? `${t.color}0d` : isPreview ? `${t.color}07` : "rgba(255,255,255,0.01)",
//               opacity: isPast ? 0.35 : isUpcoming ? 0.32 : 1,
//             }}
//           >
//             <div style={{
//               width: 34, height: 34, borderRadius: 9, flexShrink: 0,
//               background: isCurrent || isPreview ? `${t.color}16` : "rgba(255,255,255,0.04)",
//               border: `1px solid ${isCurrent || isPreview ? t.color + "40" : "rgba(255,255,255,0.06)"}`,
//               display: "flex", alignItems: "center", justifyContent: "center",
//               fontSize: 16, color: t.color,
//             }}>
//               {t.icon}
//             </div>

//             <div style={{ flex: 1, minWidth: 0 }}>
//               <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
//                 <span style={{ fontSize: 12, fontWeight: 900, color: t.color, letterSpacing: "0.06em" }}>
//                   {t.name}
//                 </span>
//                 {isCurrent && (
//                   <span style={{
//                     fontSize: 8, fontWeight: 900, color: t.color,
//                     border: `1px solid ${t.color}`, padding: "1px 7px",
//                     borderRadius: 99, background: `${t.color}14`, letterSpacing: "0.1em",
//                   }}>NOW</span>
//                 )}
//                 {isPreview && (
//                   <motion.span
//                     animate={{ opacity: [0.6, 1, 0.6] }}
//                     transition={{ duration: 1.2, repeat: Infinity }}
//                     style={{
//                       fontSize: 8, fontWeight: 900, color: t.color,
//                       border: `1px solid ${t.color}`, padding: "1px 7px",
//                       borderRadius: 99, background: `${t.color}14`, letterSpacing: "0.1em",
//                     }}
//                   >PREVIEW</motion.span>
//                 )}
//               </div>
//               <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", lineHeight: 1.3 }}>
//                 {t.perks[0]}
//               </div>
//             </div>

//             <div style={{ textAlign: "right", flexShrink: 0 }}>
//               <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
//                 {t.min === 0 ? "Free" : `${t.min.toLocaleString()} AX`}
//               </div>
//             </div>
//           </motion.div>
//         );
//       })}
//     </div>
//   );
// }

// // ─── Toast ────────────────────────────────────────────────────────────────────
// function Toast({ status, txHash, onClose }: { status: TxStatus; txHash?: string; onClose: () => void }) {
//   useEffect(() => {
//     if (status === "success" || status === "error") {
//       const t = setTimeout(onClose, 6000);
//       return () => clearTimeout(t);
//     }
//   }, [status, onClose]);

//   const cfg: Partial<Record<TxStatus, { color: string; icon: string; text: string }>> = {
//     approving: { color: "#06b6d4", icon: "⏳", text: "Approving AX spend…"    },
//     staking:   { color: "#a855f7", icon: "⚡", text: "Staking AX tokens…"     },
//     unstaking: { color: "#eab308", icon: "↩",  text: "Unstaking AX tokens…"   },
//     claiming:  { color: "#22c55e", icon: "💸", text: "Claiming rewards…"      },
//     success:   { color: "#22c55e", icon: "✓",  text: "Transaction confirmed!" },
//     error:     { color: "#ef4444", icon: "✗",  text: "Transaction failed — check wallet" },
//   };

//   const c = cfg[status];
//   if (!c || status === "idle") return null;

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 40, scale: 0.92 }}
//       animate={{ opacity: 1, y: 0, scale: 1 }}
//       exit={{ opacity: 0, y: 16, scale: 0.95 }}
//       style={{
//         position: "fixed", bottom: 28, right: 28, zIndex: 200,
//         padding: "14px 18px", borderRadius: 14,
//         background: "rgba(2,6,23,0.97)",
//         border: `1px solid ${c.color}40`,
//         boxShadow: `0 0 30px ${c.color}1a`,
//         display: "flex", alignItems: "center", gap: 12,
//         backdropFilter: "blur(20px)", maxWidth: 340,
//       }}
//     >
//       <span style={{ fontSize: 20 }}>{c.icon}</span>
//       <div style={{ flex: 1 }}>
//         <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.text}</div>
//         {txHash && (
//           <a
//             href={`https://sepolia.basescan.org/tx/${txHash}`}
//             target="_blank" rel="noreferrer"
//             style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontFamily: "monospace" }}
//           >
//             {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
//           </a>
//         )}
//       </div>
//       {(status === "success" || status === "error") && (
//         <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
//       )}
//     </motion.div>
//   );
// }

// // ─── Main Page ─────────────────────────────────────────────────────────────────
// export default function StakePage() {
//   const { address, isConnected } = useAccount();
//   const { openConnectModal } = useConnectModal();
//   const chainId = useChainId();
//   const contracts = getContracts(chainId);
//   const queryClient = useQueryClient();

//   const [tab, setTab]           = useState<"stake" | "unstake">("stake");
//   const [inputAmount, setInput] = useState("");
//   const [txStatus, setStatus]   = useState<TxStatus>("idle");
//   const [txHash, setTxHash]     = useState<string | undefined>();

//   // ── User data ─────────────────────────────────────────────────────────────
//   const {
//     isLoading, refetch,
//     axBalance, stakedAmount, stakingRewards, data: userData,
//   } = useAetherisUser();

//   const tierLevel: number  = userData?.staking?.tierLevel ?? 0;
//   const currentTier        = getTierByLevel(tierLevel);

//   // ── Allowance ─────────────────────────────────────────────────────────────
//   const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
//     address: contracts.AX_TOKEN,
//     abi: AX_TOKEN_ABI,
//     functionName: "allowance",
//     args: address ? [address, contracts.STAKING] : undefined,
//     query: { enabled: !!address },
//   });

//   // ── Write contracts ───────────────────────────────────────────────────────
//   const { writeContractAsync: approve  } = useWriteContract();
//   const { writeContractAsync: stake    } = useWriteContract();
//   const { writeContractAsync: unstake  } = useWriteContract();
//   const { writeContractAsync: claim    } = useWriteContract();

//   // ── Wait for receipt ──────────────────────────────────────────────────────
//   const { isLoading: waitingTx } = useWaitForTransactionReceipt({
//     hash: txHash as `0x${string}` | undefined,
//     query: { enabled: !!txHash },
//   });

//   useEffect(() => {
//     if (txHash && !waitingTx && txStatus !== "success" && txStatus !== "idle") {
//       setStatus("success");
//       setInput("");
//       refetch();
//       refetchAllowance();
//       queryClient.invalidateQueries({ queryKey: ["aetheris-user"] });
//     }
//   }, [waitingTx, txHash, txStatus, refetch, refetchAllowance, queryClient]);

//   // ── Derived ───────────────────────────────────────────────────────────────
//   const parsed       = parseFloat(inputAmount) || 0;
//   const balanceNum   = parseFloat(axBalance    || "0") || 0;
//   const stakedNum    = parseFloat(stakedAmount || "0") || 0;
//   const rewardsNum   = parseFloat(stakingRewards || "0") || 0;
//   const allowanceNum = allowanceRaw ? parseFloat(formatUnits(allowanceRaw, 18)) : 0;
//   const needsApproval = tab === "stake" && parsed > 0 && allowanceNum < parsed;

//   const maxAmt   = tab === "stake" ? balanceNum : stakedNum;
//   const isInvalid = parsed <= 0 || parsed > maxAmt;
//   const errMsg   = parsed > maxAmt && parsed > 0
//     ? `Insufficient ${tab === "stake" ? "wallet balance" : "staked AX"}`
//     : null;

//   const previewStaked = tab === "stake" ? stakedNum + parsed : Math.max(0, stakedNum - parsed);
//   const previewTier   = parsed > 0 ? getTierByAmount(previewStaked) : currentTier;
//   const tierChanged   = previewTier.level !== currentTier.level;

//   const isBusy = ["approving","staking","unstaking","claiming"].includes(txStatus) || waitingTx;

//   // ── Handlers ─────────────────────────────────────────────────────────────
//   const handleStake = useCallback(async () => {
//     if (!address || isInvalid) return;
//     try {
//       const amount = parseUnits(inputAmount, 18);

//       if (needsApproval) {
//         setStatus("approving");
//         const approveTx = await approve({
//           address: contracts.AX_TOKEN,
//           abi: AX_TOKEN_ABI,
//           functionName: "approve",
//           args: [contracts.STAKING, amount],
//         });
//         setTxHash(approveTx);
//         // Brief pause so allowance can be re-read
//         await new Promise(r => setTimeout(r, 3500));
//         await refetchAllowance();
//       }

//       setStatus("staking");
//       const hash = await stake({
//         address: contracts.STAKING,
//         abi: STAKING_ABI,
//         functionName: "stake",
//         args: [parseUnits(inputAmount, 18)],
//       });
//       setTxHash(hash);
//     } catch (e) {
//       console.error(e);
//       setStatus("error");
//     }
//   }, [address, inputAmount, isInvalid, needsApproval, approve, stake, contracts, refetchAllowance]);

//   const handleUnstake = useCallback(async () => {
//     if (!address || isInvalid) return;
//     try {
//       setStatus("unstaking");
//       const hash = await unstake({
//         address: contracts.STAKING,
//         abi: STAKING_ABI,
//         functionName: "unstake",
//         args: [parseUnits(inputAmount, 18)],
//       });
//       setTxHash(hash);
//     } catch (e) {
//       console.error(e);
//       setStatus("error");
//     }
//   }, [address, inputAmount, isInvalid, unstake, contracts]);

//   const handleClaim = useCallback(async () => {
//     if (!address || rewardsNum <= 0) return;
//     try {
//       setStatus("claiming");
//       const hash = await claim({
//         address: contracts.STAKING,
//         abi: STAKING_ABI,
//         functionName: "claimRewards",
//       });
//       setTxHash(hash);
//     } catch (e) {
//       console.error(e);
//       setStatus("error");
//     }
//   }, [address, rewardsNum, claim, contracts]);

//   // ── Not connected ─────────────────────────────────────────────────────────
//   if (!isConnected) {
//     return (
//       <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
//         <Header />
//         <div style={{
//           display: "flex", flexDirection: "column", alignItems: "center",
//           justifyContent: "center", minHeight: "100vh", gap: 24, textAlign: "center", padding: 24,
//         }}>
//           <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
//             <span style={{ fontSize: 60 }}>⚡</span>
//           </motion.div>
//           <h1 style={{ fontSize: 34, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Connect Wallet</h1>
//           <p style={{ color: "rgba(255,255,255,0.38)", maxWidth: 340, margin: 0, lineHeight: 1.6 }}>
//             Connect your wallet to stake AX and unlock tier benefits.
//           </p>
//           <motion.button
//             whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(6,182,212,0.4)" }}
//             whileTap={{ scale: 0.96 }}
//             onClick={openConnectModal}
//             style={{
//               padding: "16px 40px",
//               background: "linear-gradient(90deg, #06b6d4, #2563eb)",
//               borderRadius: 99, border: "none",
//               color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
//             }}
//           >CONNECT WALLET ⚡</motion.button>
//         </div>
//       </div>
//     );
//   }

//   // ── Render ────────────────────────────────────────────────────────────────
//   return (
//     <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
//       <style jsx global>{`
//         html, body { background: #020617 !important; overflow-x: hidden !important; }
//         * { box-sizing: border-box; }
//         ::-webkit-scrollbar { width: 6px; }
//         ::-webkit-scrollbar-track { background: #020617; }
//         ::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 4px; }
//         input[type=number]::-webkit-inner-spin-button,
//         input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
//         input[type=number] { -moz-appearance: textfield; }
//       `}</style>

//       <div style={{
//         position: "fixed", inset: 0,
//         background: "radial-gradient(circle at 25% 20%, rgba(168,85,247,0.07), transparent 50%), radial-gradient(circle at 80% 75%, rgba(6,182,212,0.05), transparent 50%)",
//         zIndex: 0, pointerEvents: "none",
//       }} />

//       <Header />
//       <AppSidebar active="/stake" />

//       <main style={{ marginLeft: 216, paddingTop: 72, minHeight: "100vh", position: "relative", zIndex: 1 }}>
//         <div style={{ maxWidth: 1060, margin: "0 auto", padding: "38px 28px 80px" }}>

//           {/* ── Page header ── */}
//           <motion.div
//             initial={{ opacity: 0, y: 18 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.38 }}
//             style={{ marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}
//           >
//             <div>
//               <div style={{ fontSize: 10, fontWeight: 700, color: "#a855f7", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6 }}>
//                 AX Token
//               </div>
//               <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Stake & Earn</h1>
//             </div>
//             <Link href="/dashboard">
//               <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>← Dashboard</span>
//             </Link>
//           </motion.div>

//           {/* ── Summary bar ── */}
//           <motion.div
//             initial={{ opacity: 0, y: 16 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: 0.1 }}
//             style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}
//           >
//             {[
//               { label: "AX Balance",   value: `${fmt(axBalance)} AX`,         accent: "#06b6d4" },
//               { label: "Staked",       value: `${fmt(stakedAmount)} AX`,       accent: "#a855f7" },
//               { label: "Rewards",      value: `${fmt(stakingRewards, 4)} AX`,  accent: "#22c55e" },
//               { label: "Current Tier", value: currentTier.name,               accent: currentTier.color },
//             ].map((s) => (
//               <div key={s.label} className="glass-panel" style={{
//                 padding: "16px 18px", borderRadius: 14,
//                 border: `1px solid ${s.accent}18`, position: "relative", overflow: "hidden",
//               }}>
//                 <div style={{
//                   position: "absolute", top: -30, right: -30,
//                   width: 100, height: 100,
//                   background: s.accent, filter: "blur(50px)", opacity: 0.08, borderRadius: "50%",
//                 }} />
//                 <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
//                   {s.label}
//                 </div>
//                 {isLoading
//                   ? <Skeleton w={100} h={20} />
//                   : <div style={{ fontSize: 18, fontWeight: 900, color: s.accent, fontStyle: "italic" }}>{s.value}</div>
//                 }
//               </div>
//             ))}
//           </motion.div>

//           {/* ── Main 2-col ── */}
//           <div style={{ display: "grid", gridTemplateColumns: "1fr 370px", gap: 20, alignItems: "start" }}>

//             {/* LEFT — action panel */}
//             <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>

//               {/* Stake / Unstake tabs */}
//               <div className="glass-panel" style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>

//                 {/* Tab bar */}
//                 <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
//                   {(["stake", "unstake"] as const).map((t) => (
//                     <button
//                       key={t}
//                       onClick={() => { setTab(t); setInput(""); }}
//                       style={{
//                         flex: 1, padding: "16px",
//                         background: tab === t ? "rgba(168,85,247,0.1)" : "transparent",
//                         border: "none",
//                         borderBottom: tab === t ? "2px solid #a855f7" : "2px solid transparent",
//                         color: tab === t ? "#a855f7" : "rgba(255,255,255,0.4)",
//                         fontWeight: 900, fontSize: 13, cursor: "pointer",
//                         letterSpacing: "0.1em", textTransform: "uppercase",
//                         transition: "all 0.2s",
//                       }}
//                     >
//                       {t === "stake" ? "⚡ Stake" : "↩ Unstake"}
//                     </button>
//                   ))}
//                 </div>

//                 <div style={{ padding: "28px 24px" }}>
//                   {/* Subtext */}
//                   <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24, lineHeight: 1.7, marginTop: 0 }}>
//                     {tab === "stake"
//                       ? "Stake AX tokens to earn protocol rewards and unlock higher tiers. Higher tiers multiply your earning rate."
//                       : "Withdraw your staked AX at any time. Your pending rewards are preserved — claim them separately below."
//                     }
//                   </p>

//                   {/* Amount input */}
//                   <div style={{ marginBottom: 6 }}>
//                     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
//                       <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
//                         Amount
//                       </span>
//                       <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
//                         Available:{" "}
//                         <span style={{ color: "#fff", fontWeight: 700 }}>
//                           {fmt(tab === "stake" ? axBalance : stakedAmount)} AX
//                         </span>
//                       </span>
//                     </div>

//                     <div style={{ position: "relative" }}>
//                       <input
//                         type="number"
//                         value={inputAmount}
//                         onChange={(e) => setInput(e.target.value)}
//                         placeholder="0.00"
//                         disabled={isBusy}
//                         style={{
//                           width: "100%",
//                           padding: "18px 96px 18px 18px",
//                           background: "rgba(255,255,255,0.04)",
//                           border: `1px solid ${errMsg ? "#ef444466" : inputAmount ? "#a855f766" : "rgba(255,255,255,0.1)"}`,
//                           borderRadius: 14,
//                           color: "#fff", fontSize: 22, fontWeight: 900, fontStyle: "italic",
//                           outline: "none", transition: "border-color 0.2s",
//                         }}
//                       />
//                       <div style={{
//                         position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
//                         display: "flex", alignItems: "center", gap: 8,
//                       }}>
//                         <button
//                           onClick={() => setInput(String(maxAmt))}
//                           disabled={isBusy}
//                           style={{
//                             padding: "4px 10px", fontSize: 10, fontWeight: 900,
//                             background: "rgba(168,85,247,0.15)",
//                             border: "1px solid rgba(168,85,247,0.3)",
//                             borderRadius: 6, color: "#a855f7", cursor: "pointer",
//                           }}
//                         >MAX</button>
//                         <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>AX</span>
//                       </div>
//                     </div>

//                     <AnimatePresence>
//                       {errMsg && (
//                         <motion.div
//                           initial={{ opacity: 0, height: 0 }}
//                           animate={{ opacity: 1, height: "auto" }}
//                           exit={{ opacity: 0, height: 0 }}
//                           style={{ fontSize: 11, color: "#ef4444", marginTop: 7, paddingLeft: 2 }}
//                         >
//                           ⚠ {errMsg}
//                         </motion.div>
//                       )}
//                     </AnimatePresence>
//                   </div>

//                   {/* Tier change preview */}
//                   <AnimatePresence>
//                     {parsed > 0 && tierChanged && (
//                       <motion.div
//                         initial={{ opacity: 0, y: -8 }}
//                         animate={{ opacity: 1, y: 0 }}
//                         exit={{ opacity: 0, y: -8 }}
//                         style={{
//                           margin: "18px 0",
//                           padding: "12px 16px",
//                           background: `${previewTier.color}0d`,
//                           border: `1px solid ${previewTier.color}33`,
//                           borderRadius: 12,
//                           display: "flex", alignItems: "center", gap: 14,
//                         }}
//                       >
//                         <span style={{ fontSize: 13, fontWeight: 900, color: currentTier.color }}>{currentTier.name}</span>
//                         <motion.span
//                           animate={{ x: [0, 5, 0] }}
//                           transition={{ duration: 0.9, repeat: Infinity }}
//                           style={{ color: previewTier.color, fontSize: 18 }}
//                         >→</motion.span>
//                         <span style={{ fontSize: 13, fontWeight: 900, color: previewTier.color }}>{previewTier.name}</span>
//                         <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>
//                           {tab === "stake" ? "🎉 Tier upgrade!" : "Tier change"}
//                         </span>
//                       </motion.div>
//                     )}
//                   </AnimatePresence>

//                   {/* Approval notice */}
//                   <AnimatePresence>
//                     {needsApproval && (
//                       <motion.div
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         exit={{ opacity: 0 }}
//                         style={{
//                           margin: "14px 0",
//                           padding: "10px 14px", fontSize: 11,
//                           background: "rgba(6,182,212,0.06)",
//                           border: "1px solid rgba(6,182,212,0.2)",
//                           borderRadius: 10, color: "#06b6d4", lineHeight: 1.5,
//                         }}
//                       >
//                         ℹ This requires 2 transactions: first an <strong>approval</strong> for the AX spend, then the <strong>stake</strong> itself.
//                       </motion.div>
//                     )}
//                   </AnimatePresence>

//                   {/* CTA button */}
//                   <motion.button
//                     onClick={tab === "stake" ? handleStake : handleUnstake}
//                     disabled={isInvalid || isBusy}
//                     whileHover={!isInvalid && !isBusy ? { scale: 1.02, boxShadow: "0 0 28px rgba(168,85,247,0.35)" } : {}}
//                     whileTap={!isInvalid && !isBusy ? { scale: 0.98 } : {}}
//                     style={{
//                       marginTop: 22, width: "100%", padding: "18px",
//                       background: isInvalid || isBusy
//                         ? "rgba(255,255,255,0.05)"
//                         : tab === "stake"
//                         ? "linear-gradient(90deg, #7c3aed, #a855f7)"
//                         : "rgba(234,179,8,0.11)",
//                       border: isInvalid || isBusy
//                         ? "1px solid rgba(255,255,255,0.08)"
//                         : tab === "stake" ? "none" : "1px solid rgba(234,179,8,0.3)",
//                       borderRadius: 14,
//                       color: isInvalid || isBusy ? "rgba(255,255,255,0.22)" : tab === "stake" ? "#fff" : "#eab308",
//                       fontWeight: 900, fontSize: 15, letterSpacing: "0.04em",
//                       cursor: isInvalid || isBusy ? "not-allowed" : "pointer",
//                       transition: "all 0.2s",
//                     }}
//                   >
//                     {isBusy ? (
//                       <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
//                         <motion.span
//                           animate={{ rotate: 360 }}
//                           transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
//                           style={{ display: "inline-block" }}
//                         >◌</motion.span>
//                         {txStatus === "approving" ? "Approving…"
//                           : txStatus === "staking" ? "Staking…"
//                           : txStatus === "unstaking" ? "Unstaking…"
//                           : "Processing…"}
//                       </span>
//                     ) : tab === "stake" ? (
//                       `⚡ Stake ${parsed > 0 ? fmt(inputAmount) + " " : ""}AX`
//                     ) : (
//                       `↩ Unstake ${parsed > 0 ? fmt(inputAmount) + " " : ""}AX`
//                     )}
//                   </motion.button>
//                 </div>
//               </div>

//               {/* Claim rewards */}
//               <motion.div
//                 initial={{ opacity: 0, y: 16 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ delay: 0.25 }}
//                 className="glass-panel"
//                 style={{
//                   marginTop: 16, padding: "24px", borderRadius: 20,
//                   border: "1px solid rgba(34,197,94,0.18)",
//                   position: "relative", overflow: "hidden",
//                 }}
//               >
//                 <div style={{
//                   position: "absolute", top: -40, right: -40,
//                   width: 160, height: 160,
//                   background: "#22c55e", filter: "blur(70px)", opacity: 0.05, borderRadius: "50%",
//                 }} />
//                 <div style={{ position: "relative", zIndex: 1 }}>
//                   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
//                     <div>
//                       <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
//                         🎁 Pending Rewards
//                       </div>
//                       {isLoading
//                         ? <Skeleton w={130} h={28} />
//                         : <div style={{ fontSize: 28, fontWeight: 900, color: "#22c55e", fontStyle: "italic" }}>
//                             {fmt(stakingRewards, 4)} AX
//                           </div>
//                       }
//                     </div>
//                     <motion.button
//                       onClick={handleClaim}
//                       disabled={rewardsNum <= 0 || isBusy}
//                       whileHover={rewardsNum > 0 && !isBusy ? { scale: 1.04, boxShadow: "0 0 22px rgba(34,197,94,0.28)" } : {}}
//                       whileTap={rewardsNum > 0 && !isBusy ? { scale: 0.96 } : {}}
//                       style={{
//                         padding: "14px 28px",
//                         background: rewardsNum > 0 && !isBusy ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
//                         border: `1px solid ${rewardsNum > 0 && !isBusy ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.08)"}`,
//                         borderRadius: 12,
//                         color: rewardsNum > 0 && !isBusy ? "#22c55e" : "rgba(255,255,255,0.22)",
//                         fontWeight: 900, fontSize: 14,
//                         cursor: rewardsNum <= 0 || isBusy ? "not-allowed" : "pointer",
//                       }}
//                     >
//                       {txStatus === "claiming" ? "Claiming…" : "Claim AX"}
//                     </motion.button>
//                   </div>
//                   {rewardsNum <= 0 && !isLoading && (
//                     <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 12, marginBottom: 0 }}>
//                       Rewards accumulate continuously while you have AX staked.
//                     </p>
//                   )}
//                 </div>
//               </motion.div>
//             </motion.div>

//             {/* RIGHT — tier ladder */}
//             <motion.div
//               initial={{ opacity: 0, x: 20 }}
//               animate={{ opacity: 1, x: 0 }}
//               transition={{ delay: 0.2 }}
//             >
//               <div className="glass-panel" style={{
//                 borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)",
//                 padding: "24px", position: "sticky", top: 96,
//               }}>
//                 <div style={{ marginBottom: 20 }}>
//                   <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
//                     Tier Progression
//                   </div>
//                   <div style={{ fontSize: 15, fontWeight: 900 }}>Stake more, unlock more</div>
//                 </div>

//                 <TierLadder currentLevel={currentTier.level} previewLevel={previewTier.level} />

//                 {/* Current tier perks */}
//                 <div style={{
//                   marginTop: 18, padding: "16px",
//                   background: `${currentTier.color}0a`,
//                   border: `1px solid ${currentTier.color}20`,
//                   borderRadius: 12,
//                 }}>
//                   <div style={{ fontSize: 10, fontWeight: 700, color: currentTier.color, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
//                     Your perks — {currentTier.name}
//                   </div>
//                   {currentTier.perks.map((perk, i) => (
//                     <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < currentTier.perks.length - 1 ? 7 : 0 }}>
//                       <div style={{ width: 5, height: 5, borderRadius: "50%", background: currentTier.color, flexShrink: 0 }} />
//                       <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{perk}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </motion.div>

//           </div>

//           {/* Footer */}
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             transition={{ delay: 0.7 }}
//             style={{
//               marginTop: 44, display: "flex", alignItems: "center", justifyContent: "center",
//               gap: 20, fontSize: 10, color: "rgba(255,255,255,0.18)",
//               fontFamily: "monospace", letterSpacing: "0.12em", flexWrap: "wrap",
//             }}
//           >
//             <span><span style={{ color: "#22c55e" }}>●</span> BASE SEPOLIA</span>
//             <span>|</span>
//             <span>AX: {contracts.AX_TOKEN.slice(0, 6)}…{contracts.AX_TOKEN.slice(-4)}</span>
//             <span>|</span>
//             <span>STAKING: {contracts.STAKING.slice(0, 6)}…{contracts.STAKING.slice(-4)}</span>
//           </motion.div>

//         </div>
//       </main>

//       {/* Toast notifications */}
//       <AnimatePresence>
//         {txStatus !== "idle" && (
//           <Toast
//             status={txStatus}
//             txHash={txHash}
//             onClose={() => { setStatus("idle"); setTxHash(undefined); }}
//           />
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }