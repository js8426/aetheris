// Aetheris\aetheris-frontend\pages\account.tsx

// pages/account.tsx
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
  usePublicClient,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { getContracts } from "@/lib/contracts";
import { isAddress } from "viem";

// ─── Smart Account ABI (AetherisAccountFactory + Account) ────────────────────
const ACCOUNT_FACTORY_ABI = [
  {
    name: "getAccount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "createAccount",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const SMART_ACCOUNT_ABI = [
  {
    name: "addSessionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key",        type: "address" },
      { name: "validUntil", type: "uint48"  },
      { name: "spendLimit", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "revokeSessionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "key", type: "address" }],
    outputs: [],
  },
  {
    name: "addGuardian",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "guardian", type: "address" }],
    outputs: [],
  },
  {
    name: "removeGuardian",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "guardian", type: "address" }],
    outputs: [],
  },
  {
    name: "isSessionKeyValid",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "key", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isGuardian",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "guardian", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  // Events for fetching session keys / guardians from logs
  {
    name: "SessionKeyAdded",
    type: "event",
    inputs: [
      { name: "key",        type: "address", indexed: true  },
      { name: "validUntil", type: "uint48",  indexed: false },
    ],
  },
  {
    name: "SessionKeyRevoked",
    type: "event",
    inputs: [{ name: "key", type: "address", indexed: true }],
  },
  {
    name: "GuardianAdded",
    type: "event",
    inputs: [{ name: "guardian", type: "address", indexed: true }],
  },
  {
    name: "GuardianRemoved",
    type: "event",
    inputs: [{ name: "guardian", type: "address", indexed: true }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface SessionKey {
  address: string;
  validUntil: number;   // unix timestamp
  spendLimit: string;   // formatted
  active: boolean;
}

interface Guardian {
  address: string;
  addedAt?: number;
}

type TxStatus = "idle" | "creating" | "addingKey" | "revokingKey" | "addingGuardian" | "removingGuardian" | "success" | "error";
type Panel = "overview" | "session-keys" | "guardians" | "danger";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatExpiry(ts: number): { label: string; expired: boolean } {
  if (ts === 0) return { label: "Never", expired: false };
  const now   = Math.floor(Date.now() / 1000);
  const diff  = ts - now;
  const expired = diff < 0;
  if (expired) return { label: "Expired", expired: true };
  if (diff < 86400)    return { label: `${Math.floor(diff / 3600)}h left`, expired: false };
  if (diff < 86400 * 30) return { label: `${Math.floor(diff / 86400)}d left`, expired: false };
  return { label: new Date(ts * 1000).toLocaleDateString(), expired: false };
}

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
    creating:         { color: "#06b6d4", icon: "⚙",  text: "Deploying smart account…"  },
    addingKey:        { color: "#a855f7", icon: "🔑",  text: "Adding session key…"        },
    revokingKey:      { color: "#ef4444", icon: "✕",   text: "Revoking session key…"      },
    addingGuardian:   { color: "#22c55e", icon: "🛡",  text: "Adding guardian…"           },
    removingGuardian: { color: "#eab308", icon: "↩",   text: "Removing guardian…"         },
    success:          { color: "#22c55e", icon: "✓",   text: "Transaction confirmed!"     },
    error:            { color: "#ef4444", icon: "✗",   text: "Transaction failed"         },
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

// ─── Input Field ──────────────────────────────────────────────────────────────
function FormInput({
  label, value, onChange, placeholder, type = "text", disabled, error, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean; error?: string | null; hint?: string;
}) {
  const hasError = !!error;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{hint}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%", padding: "14px 16px",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${hasError ? "#ef444466" : value ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)"}`,
          borderRadius: 12, color: "#fff", fontSize: 13,
          fontFamily: "monospace", outline: "none", transition: "border-color 0.2s",
        }}
      />
      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ fontSize: 11, color: "#ef4444", marginTop: 5, paddingLeft: 2 }}
          >
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 900 }}>{title}</span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 99,
          background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.22)", color: "#06b6d4",
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal }     = useConnectModal();
  const chainId                  = useChainId();
  const contracts                = getContracts(chainId);
  const queryClient              = useQueryClient();
  const publicClient             = usePublicClient();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<Panel>("overview");
  const [txStatus, setTxStatus]       = useState<TxStatus>("idle");
  const [txHash, setTxHash]           = useState<string | undefined>();

  // Session key form
  const [skAddress,    setSkAddress]    = useState("");
  const [skExpiry,     setSkExpiry]     = useState("30"); // days
  const [skSpendLimit, setSkSpendLimit] = useState("");

  // Guardian form
  const [guardianAddr, setGuardianAddr] = useState("");

  // Local lists (hydrated from events)
  const [sessionKeys, setSessionKeys] = useState<SessionKey[]>([]);
  const [guardians,   setGuardians]   = useState<Guardian[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Confirm remove state
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // ── Compute smart account address (deterministic) ─────────────────────────
  const { data: smartAccountAddr, isLoading: addrLoading, refetch: refetchAddr } = useReadContract({
    address: contracts.ACCOUNT_FACTORY,
    abi: ACCOUNT_FACTORY_ABI,
    functionName: "getAccount",
    args: address ? [address, 0n] : undefined,
    query: { enabled: !!address },
  });

  const saAddress = smartAccountAddr as `0x${string}` | undefined;

  // Check if it's deployed (has code)
  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!saAddress || !publicClient) return;
    publicClient.getCode({ address: saAddress }).then((code) => {
      setIsDeployed(!!code && code !== "0x");
    }).catch(() => setIsDeployed(false));
  }, [saAddress, publicClient]);

  // ── Hydrate session keys + guardians from contract events ─────────────────
  const hydrateFromLogs = useCallback(async () => {
    if (!saAddress || !publicClient || !isDeployed) return;
    setLogsLoading(true);
    try {
      // Session key added events
      const addedLogs = await publicClient.getLogs({
        address: saAddress,
        event: SMART_ACCOUNT_ABI.find((x) => x.name === "SessionKeyAdded" && x.type === "event") as never,
        fromBlock: 0n,
      });
      // Session key revoked events
      const revokedLogs = await publicClient.getLogs({
        address: saAddress,
        event: SMART_ACCOUNT_ABI.find((x) => x.name === "SessionKeyRevoked" && x.type === "event") as never,
        fromBlock: 0n,
      });
      const revokedSet = new Set(revokedLogs.map((l: { args?: { key?: string } }) => l.args?.key?.toLowerCase()));

      const keys: SessionKey[] = (addedLogs as Array<{ args?: { key?: string; validUntil?: bigint } }>)
        .filter((l) => l.args?.key && !revokedSet.has(l.args.key.toLowerCase()))
        .map((l) => ({
          address: l.args!.key!,
          validUntil: Number(l.args?.validUntil ?? 0n),
          spendLimit: "—",
          active: true,
        }));

      setSessionKeys(keys);

      // Guardians
      const gAddedLogs = await publicClient.getLogs({
        address: saAddress,
        event: SMART_ACCOUNT_ABI.find((x) => x.name === "GuardianAdded" && x.type === "event") as never,
        fromBlock: 0n,
      });
      const gRemovedLogs = await publicClient.getLogs({
        address: saAddress,
        event: SMART_ACCOUNT_ABI.find((x) => x.name === "GuardianRemoved" && x.type === "event") as never,
        fromBlock: 0n,
      });
      const removedSet = new Set(gRemovedLogs.map((l: { args?: { guardian?: string } }) => l.args?.guardian?.toLowerCase()));

      const gs: Guardian[] = (gAddedLogs as Array<{ args?: { guardian?: string } }>)
        .filter((l) => l.args?.guardian && !removedSet.has(l.args.guardian.toLowerCase()))
        .map((l) => ({ address: l.args!.guardian! }));

      setGuardians(gs);
    } catch (e) {
      console.warn("Log fetch failed:", e);
    } finally {
      setLogsLoading(false);
    }
  }, [saAddress, publicClient, isDeployed]);

  useEffect(() => { hydrateFromLogs(); }, [hydrateFromLogs]);

  // ── Write contracts ───────────────────────────────────────────────────────
  const { writeContractAsync: createAccount  } = useWriteContract();
  const { writeContractAsync: writeAccount   } = useWriteContract();

  // ── Tx receipt watcher ────────────────────────────────────────────────────
  const { isLoading: waitingTx } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (txHash && !waitingTx && txStatus !== "success" && txStatus !== "idle") {
      setTxStatus("success");
      refetchAddr();
      hydrateFromLogs();
      queryClient.invalidateQueries({ queryKey: ["aetheris-user"] });
      // Reset forms
      setSkAddress(""); setSkExpiry("30"); setSkSpendLimit("");
      setGuardianAddr(""); setConfirmRemove(null);
    }
  }, [waitingTx, txHash, txStatus, refetchAddr, hydrateFromLogs, queryClient]);

  const isBusy = ["creating","addingKey","revokingKey","addingGuardian","removingGuardian"].includes(txStatus) || waitingTx;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCreateAccount = useCallback(async () => {
    if (!address) return;
    try {
      setTxStatus("creating");
      const hash = await createAccount({
        address: contracts.ACCOUNT_FACTORY,
        abi: ACCOUNT_FACTORY_ABI,
        functionName: "createAccount",
        args: [address, 0n],
      });
      setTxHash(hash);
    } catch (e) { console.error(e); setTxStatus("error"); }
  }, [address, createAccount, contracts]);

  const handleAddSessionKey = useCallback(async () => {
    if (!saAddress || !isAddress(skAddress)) return;
    try {
      setTxStatus("addingKey");
      const validUntil = Math.floor(Date.now() / 1000) + parseInt(skExpiry) * 86400;
      const spendLimit = skSpendLimit ? BigInt(Math.floor(parseFloat(skSpendLimit) * 1e6)) : BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const hash = await writeAccount({
        address: saAddress,
        abi: SMART_ACCOUNT_ABI,
        functionName: "addSessionKey",
        args: [skAddress as `0x${string}`, validUntil, spendLimit],
      });
      setTxHash(hash);
    } catch (e) { console.error(e); setTxStatus("error"); }
  }, [saAddress, skAddress, skExpiry, skSpendLimit, writeAccount]);

  const handleRevokeSessionKey = useCallback(async (keyAddr: string) => {
    if (!saAddress) return;
    try {
      setTxStatus("revokingKey");
      const hash = await writeAccount({
        address: saAddress,
        abi: SMART_ACCOUNT_ABI,
        functionName: "revokeSessionKey",
        args: [keyAddr as `0x${string}`],
      });
      setTxHash(hash);
    } catch (e) { console.error(e); setTxStatus("error"); }
  }, [saAddress, writeAccount]);

  const handleAddGuardian = useCallback(async () => {
    if (!saAddress || !isAddress(guardianAddr)) return;
    try {
      setTxStatus("addingGuardian");
      const hash = await writeAccount({
        address: saAddress,
        abi: SMART_ACCOUNT_ABI,
        functionName: "addGuardian",
        args: [guardianAddr as `0x${string}`],
      });
      setTxHash(hash);
    } catch (e) { console.error(e); setTxStatus("error"); }
  }, [saAddress, guardianAddr, writeAccount]);

  const handleRemoveGuardian = useCallback(async (gAddr: string) => {
    if (!saAddress) return;
    try {
      setTxStatus("removingGuardian");
      const hash = await writeAccount({
        address: saAddress,
        abi: SMART_ACCOUNT_ABI,
        functionName: "removeGuardian",
        args: [gAddr as `0x${string}`],
      });
      setTxHash(hash);
    } catch (e) { console.error(e); setTxStatus("error"); }
  }, [saAddress, writeAccount]);

  // ── Validation ────────────────────────────────────────────────────────────
  const skAddrError   = skAddress && !isAddress(skAddress) ? "Invalid Ethereum address" : null;
  const gAddrError    = guardianAddr && !isAddress(guardianAddr) ? "Invalid Ethereum address" : null;
  const skExpiryDays  = parseInt(skExpiry) || 30;

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
        <Header />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24, textAlign: "center", padding: 24 }}>
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
            <span style={{ fontSize: 60 }}>🔑</span>
          </motion.div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Connect Wallet</h1>
          <p style={{ color: "rgba(255,255,255,0.38)", maxWidth: 340, margin: 0, lineHeight: 1.6 }}>
            Connect your wallet to manage your smart account, session keys, and guardians.
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

  const panelTabs: { id: Panel; label: string; icon: string }[] = [
    { id: "overview",     label: "Overview",     icon: "⬡" },
    { id: "session-keys", label: "Session Keys", icon: "🔑" },
    { id: "guardians",    label: "Guardians",    icon: "🛡" },
  ];

  return (
    <div style={{ background: "#020617", minHeight: "100vh", color: "#fff" }}>
      <style jsx global>{`
        html, body { background: #020617 !important; overflow-x: hidden !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 4px; }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(circle at 75% 25%, rgba(168,85,247,0.06), transparent 50%), radial-gradient(circle at 20% 80%, rgba(6,182,212,0.05), transparent 50%)",
        zIndex: 0, pointerEvents: "none",
      }} />

      <Header />
      <AppSidebar active="/account" />

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
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a855f7", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 6 }}>
                ERC-4337
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", margin: 0 }}>Smart Account</h1>
            </div>
            <Link href="/dashboard">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", cursor: "pointer" }}>← Dashboard</span>
            </Link>
          </motion.div>

          {/* ── Account identity card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel"
            style={{
              padding: "24px 28px", borderRadius: 20, marginBottom: 24,
              border: "1px solid rgba(168,85,247,0.22)",
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute", top: -60, right: -60, width: 240, height: 240,
              background: "#a855f7", filter: "blur(100px)", opacity: 0.06, borderRadius: "50%",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>

                {/* EOA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 5 }}>
                      EOA (Signer)
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                      <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>
                        {address}
                      </span>
                      <a href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "#06b6d4", textDecoration: "none", border: "1px solid rgba(6,182,212,0.3)", padding: "2px 8px", borderRadius: 99 }}>
                        ↗
                      </a>
                    </div>
                  </div>

                  {/* Smart Account */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 5 }}>
                      Smart Account (4337)
                    </div>
                    {addrLoading ? (
                      <Skeleton w={340} h={20} />
                    ) : saAddress ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#a855f7" }}>
                          {saAddress}
                        </span>
                        <a href={`https://sepolia.basescan.org/address/${saAddress}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 10, color: "#a855f7", textDecoration: "none", border: "1px solid rgba(168,85,247,0.3)", padding: "2px 8px", borderRadius: 99 }}>
                          ↗
                        </a>
                        {isDeployed !== null && (
                          <span style={{
                            fontSize: 9, fontWeight: 900,
                            border: `1px solid ${isDeployed ? "#22c55e" : "#eab308"}`,
                            color: isDeployed ? "#22c55e" : "#eab308",
                            padding: "2px 8px", borderRadius: 99,
                            background: isDeployed ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                          }}>
                            {isDeployed ? "DEPLOYED" : "NOT DEPLOYED"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Computing address…</span>
                    )}
                  </div>
                </div>

                {/* Deploy button if needed */}
                {isDeployed === false && (
                  <motion.button
                    onClick={handleCreateAccount}
                    disabled={isBusy}
                    whileHover={!isBusy ? { scale: 1.04, boxShadow: "0 0 28px rgba(168,85,247,0.4)" } : {}}
                    whileTap={!isBusy ? { scale: 0.96 } : {}}
                    style={{
                      padding: "16px 28px",
                      background: isBusy ? "rgba(255,255,255,0.05)" : "linear-gradient(90deg, #7c3aed, #a855f7)",
                      border: "none", borderRadius: 14,
                      color: isBusy ? "rgba(255,255,255,0.25)" : "#fff",
                      fontWeight: 900, fontSize: 14, cursor: isBusy ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {txStatus === "creating" ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
                        Deploying…
                      </span>
                    ) : "⚙ Deploy Account"}
                  </motion.button>
                )}
              </div>

              {/* Stats row */}
              {isDeployed && (
                <div style={{ display: "flex", gap: 24, marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
                  {[
                    { label: "Session Keys", value: logsLoading ? null : sessionKeys.length, color: "#a855f7" },
                    { label: "Guardians",    value: logsLoading ? null : guardians.length,   color: "#22c55e" },
                    { label: "Entrypoint",   value: `${contracts.AX_TOKEN.slice(0,6)}…`,     color: "#06b6d4" },
                    { label: "Salt",         value: "0",                                      color: "#64748b" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{s.label}</div>
                      {s.value === null
                        ? <Skeleton w={40} h={16} />
                        : <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Panel tabs ── */}
          {isDeployed && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                style={{ display: "flex", gap: 6, marginBottom: 20 }}
              >
                {panelTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActivePanel(t.id)}
                    style={{
                      padding: "10px 18px", borderRadius: 12,
                      background: activePanel === t.id ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)",
                      border: activePanel === t.id ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.07)",
                      color: activePanel === t.id ? "#a855f7" : "rgba(255,255,255,0.45)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 7,
                      transition: "all 0.15s",
                    }}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </motion.div>

              <AnimatePresence mode="wait">

                {/* ── Overview panel ── */}
                {activePanel === "overview" && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
                  >
                    {/* Session keys summary */}
                    <div className="glass-panel" style={{ padding: "24px", borderRadius: 20, border: "1px solid rgba(168,85,247,0.18)" }}>
                      <SectionHeader icon="🔑" title="Session Keys" count={sessionKeys.length} />
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.7, marginBottom: 16, marginTop: 0 }}>
                        Session keys allow agents or delegates to perform actions on your behalf without exposing your main private key. They can have spend limits and expiry dates.
                      </p>
                      {logsLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Skeleton w="100%" h={44} />
                          <Skeleton w="100%" h={44} />
                        </div>
                      ) : sessionKeys.length === 0 ? (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>No session keys yet</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {sessionKeys.slice(0, 3).map((sk) => {
                            const exp = formatExpiry(sk.validUntil);
                            return (
                              <div key={sk.address} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{shortAddr(sk.address)}</span>
                                <span style={{ fontSize: 10, color: exp.expired ? "#ef4444" : "#22c55e", fontWeight: 700 }}>{exp.label}</span>
                              </div>
                            );
                          })}
                          {sessionKeys.length > 3 && (
                            <button onClick={() => setActivePanel("session-keys")} style={{ fontSize: 11, color: "#a855f7", background: "none", border: "none", cursor: "pointer", textAlign: "left", paddingLeft: 12 }}>
                              +{sessionKeys.length - 3} more →
                            </button>
                          )}
                        </div>
                      )}
                      <motion.button
                        onClick={() => setActivePanel("session-keys")}
                        whileHover={{ scale: 1.02 }}
                        style={{ marginTop: 16, width: "100%", padding: "11px", background: "rgba(168,85,247,0.09)", border: "1px solid rgba(168,85,247,0.22)", borderRadius: 10, color: "#a855f7", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Manage Session Keys →
                      </motion.button>
                    </div>

                    {/* Guardians summary */}
                    <div className="glass-panel" style={{ padding: "24px", borderRadius: 20, border: "1px solid rgba(34,197,94,0.18)" }}>
                      <SectionHeader icon="🛡" title="Guardians" count={guardians.length} />
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.7, marginBottom: 16, marginTop: 0 }}>
                        Guardians can help you recover your account if you lose access. Add trusted addresses — other wallets you control, or trusted contacts.
                      </p>
                      {logsLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Skeleton w="100%" h={44} />
                        </div>
                      ) : guardians.length === 0 ? (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>No guardians set</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {guardians.slice(0, 3).map((g) => (
                            <div key={g.address} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e", flexShrink: 0 }} />
                              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{shortAddr(g.address)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <motion.button
                        onClick={() => setActivePanel("guardians")}
                        whileHover={{ scale: 1.02 }}
                        style={{ marginTop: 16, width: "100%", padding: "11px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 10, color: "#22c55e", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Manage Guardians →
                      </motion.button>
                    </div>

                    {/* ERC-4337 info card */}
                    <div className="glass-panel" style={{ padding: "24px", borderRadius: 20, border: "1px solid rgba(6,182,212,0.15)", gridColumn: "span 2" }}>
                      <SectionHeader icon="⚡" title="Gasless Transactions via Paymaster" />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                        {[
                          { icon: "⛽", title: "No Gas Required", body: "The AetherisPaymaster sponsors gas fees for all transactions made through your smart account." },
                          { icon: "🔒", title: "Non-Custodial", body: "You remain the sole owner. The factory deploys to a deterministic address — no third party holds your keys." },
                          { icon: "🤖", title: "Agent Compatible", body: "Session keys enable AI agents to act on your behalf within strict limits — time-bound and spend-capped." },
                        ].map((item) => (
                          <div key={item.title} style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ fontSize: 22, marginBottom: 10 }}>{item.icon}</div>
                            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{item.title}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.6 }}>{item.body}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Session Keys panel ── */}
                {activePanel === "session-keys" && (
                  <motion.div
                    key="session-keys"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}
                  >
                    {/* Active keys list */}
                    <div>
                      <SectionHeader icon="🔑" title="Active Session Keys" count={sessionKeys.length} />

                      {logsLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[...Array(3)].map((_, i) => <Skeleton key={i} w="100%" h={72} />)}
                        </div>
                      ) : sessionKeys.length === 0 ? (
                        <div className="glass-panel" style={{ padding: "48px 24px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                          <div style={{ fontSize: 32, marginBottom: 12 }}>🔑</div>
                          No session keys yet — add one to enable agent access
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {sessionKeys.map((sk) => {
                            const exp = formatExpiry(sk.validUntil);
                            return (
                              <motion.div
                                key={sk.address}
                                layout
                                className="glass-panel"
                                style={{ padding: "16px 18px", borderRadius: 16, border: `1px solid ${exp.expired ? "rgba(239,68,68,0.2)" : "rgba(168,85,247,0.18)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: exp.expired ? "rgba(239,68,68,0.1)" : "rgba(168,85,247,0.1)", border: `1px solid ${exp.expired ? "rgba(239,68,68,0.2)" : "rgba(168,85,247,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                                    🔑
                                  </div>
                                  <div>
                                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{sk.address}</div>
                                    <div style={{ fontSize: 10, color: exp.expired ? "#ef4444" : "#22c55e", marginTop: 3, fontWeight: 700 }}>
                                      {exp.expired ? "⚠ Expired" : `✓ Active · ${exp.label}`}
                                    </div>
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {confirmRemove === sk.address ? (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => setConfirmRemove(null)} style={{ padding: "6px 12px", fontSize: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                                      <button
                                        onClick={() => { setConfirmRemove(null); handleRevokeSessionKey(sk.address); }}
                                        style={{ padding: "6px 12px", fontSize: 11, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
                                      >Confirm Revoke</button>
                                    </motion.div>
                                  ) : (
                                    <motion.button
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      onClick={() => setConfirmRemove(sk.address)}
                                      disabled={isBusy}
                                      style={{ padding: "6px 14px", fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}
                                    >Revoke</motion.button>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Add session key form */}
                    <div className="glass-panel" style={{ padding: "24px", borderRadius: 20, border: "1px solid rgba(168,85,247,0.2)", position: "sticky", top: 96 }}>
                      <SectionHeader icon="+" title="Add Session Key" />
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <FormInput
                          label="Key Address"
                          value={skAddress}
                          onChange={setSkAddress}
                          placeholder="0x…"
                          disabled={isBusy}
                          error={skAddrError}
                          hint="Agent or delegate address"
                        />
                        <FormInput
                          label="Expiry (days)"
                          value={skExpiry}
                          onChange={setSkExpiry}
                          type="number"
                          placeholder="30"
                          disabled={isBusy}
                          hint={`Expires: ${new Date(Date.now() + skExpiryDays * 86400000).toLocaleDateString()}`}
                        />
                        <FormInput
                          label="Spend Limit (USDC)"
                          value={skSpendLimit}
                          onChange={setSkSpendLimit}
                          type="number"
                          placeholder="Unlimited"
                          disabled={isBusy}
                          hint="Leave blank for unlimited"
                        />

                        <motion.button
                          onClick={handleAddSessionKey}
                          disabled={!isAddress(skAddress) || isBusy}
                          whileHover={isAddress(skAddress) && !isBusy ? { scale: 1.02, boxShadow: "0 0 22px rgba(168,85,247,0.35)" } : {}}
                          whileTap={isAddress(skAddress) && !isBusy ? { scale: 0.98 } : {}}
                          style={{
                            padding: "15px",
                            background: isAddress(skAddress) && !isBusy ? "linear-gradient(90deg, #7c3aed, #a855f7)" : "rgba(255,255,255,0.05)",
                            border: "none", borderRadius: 12,
                            color: isAddress(skAddress) && !isBusy ? "#fff" : "rgba(255,255,255,0.22)",
                            fontWeight: 900, fontSize: 14, cursor: !isAddress(skAddress) || isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          {txStatus === "addingKey" ? (
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
                              Adding…
                            </span>
                          ) : "🔑 Add Session Key"}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Guardians panel ── */}
                {activePanel === "guardians" && (
                  <motion.div
                    key="guardians"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}
                  >
                    {/* Guardian list */}
                    <div>
                      <SectionHeader icon="🛡" title="Active Guardians" count={guardians.length} />

                      <div style={{ padding: "14px 16px", background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 12, marginBottom: 16, fontSize: 12, color: "#eab308", lineHeight: 1.6 }}>
                        ⚠ Guardians can initiate account recovery. Only add addresses you fully trust. Recommended: 2–5 guardians.
                      </div>

                      {logsLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[...Array(2)].map((_, i) => <Skeleton key={i} w="100%" h={72} />)}
                        </div>
                      ) : guardians.length === 0 ? (
                        <div className="glass-panel" style={{ padding: "48px 24px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                          <div style={{ fontSize: 32, marginBottom: 12 }}>🛡</div>
                          No guardians set — add one for account recovery
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {guardians.map((g) => (
                            <motion.div
                              key={g.address}
                              layout
                              className="glass-panel"
                              style={{ padding: "16px 18px", borderRadius: 16, border: "1px solid rgba(34,197,94,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                                  🛡
                                </div>
                                <div>
                                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{g.address}</div>
                                  <div style={{ fontSize: 10, color: "#22c55e", marginTop: 3, fontWeight: 700 }}>✓ Active Guardian</div>
                                </div>
                              </div>

                              <AnimatePresence>
                                {confirmRemove === g.address ? (
                                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => setConfirmRemove(null)} style={{ padding: "6px 12px", fontSize: 11, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                                    <button
                                      onClick={() => { setConfirmRemove(null); handleRemoveGuardian(g.address); }}
                                      style={{ padding: "6px 12px", fontSize: 11, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
                                    >Confirm Remove</button>
                                  </motion.div>
                                ) : (
                                  <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    onClick={() => setConfirmRemove(g.address)}
                                    disabled={isBusy}
                                    style={{ padding: "6px 14px", fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
                                  >Remove</motion.button>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add guardian form */}
                    <div className="glass-panel" style={{ padding: "24px", borderRadius: 20, border: "1px solid rgba(34,197,94,0.2)", position: "sticky", top: 96 }}>
                      <SectionHeader icon="+" title="Add Guardian" />
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.7, marginBottom: 16, marginTop: 0 }}>
                        Enter the address of a wallet you want to designate as a guardian. This should be an address you (or someone you trust) controls.
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <FormInput
                          label="Guardian Address"
                          value={guardianAddr}
                          onChange={setGuardianAddr}
                          placeholder="0x…"
                          disabled={isBusy}
                          error={gAddrError}
                          hint="Trusted wallet address"
                        />
                        <motion.button
                          onClick={handleAddGuardian}
                          disabled={!isAddress(guardianAddr) || isBusy}
                          whileHover={isAddress(guardianAddr) && !isBusy ? { scale: 1.02, boxShadow: "0 0 22px rgba(34,197,94,0.3)" } : {}}
                          whileTap={isAddress(guardianAddr) && !isBusy ? { scale: 0.98 } : {}}
                          style={{
                            padding: "15px",
                            background: isAddress(guardianAddr) && !isBusy ? "linear-gradient(90deg, #16a34a, #22c55e)" : "rgba(255,255,255,0.05)",
                            border: "none", borderRadius: 12,
                            color: isAddress(guardianAddr) && !isBusy ? "#fff" : "rgba(255,255,255,0.22)",
                            fontWeight: 900, fontSize: 14, cursor: !isAddress(guardianAddr) || isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          {txStatus === "addingGuardian" ? (
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>◌</motion.span>
                              Adding…
                            </span>
                          ) : "🛡 Add Guardian"}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </>
          )}

          {/* ── Not deployed: explainer ── */}
          {isDeployed === false && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 8 }}
            >
              {[
                { icon: "⚡", color: "#06b6d4", title: "Gasless by Default", body: "The Paymaster covers all gas. Deploy and interact with your smart account at zero cost." },
                { icon: "🔑", color: "#a855f7", title: "Session Keys",       body: "Grant time-limited, spend-capped access to agents. Revoke at any time." },
                { icon: "🛡", color: "#22c55e", title: "Social Recovery",    body: "Add guardian addresses to recover your account if you lose your signer key." },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="glass-panel"
                  style={{ padding: "24px", borderRadius: 20, border: `1px solid ${item.color}1a` }}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: item.color, marginBottom: 8 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.7 }}>{item.body}</div>
                </motion.div>
              ))}
            </motion.div>
          )}

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
            <span>FACTORY: {contracts.ACCOUNT_FACTORY.slice(0, 6)}…{contracts.ACCOUNT_FACTORY.slice(-4)}</span>
            <span>|</span>
            <span>PAYMASTER: {contracts.PAYMASTER.slice(0, 6)}…{contracts.PAYMASTER.slice(-4)}</span>
          </motion.div>

        </div>
      </main>

      <AnimatePresence>
        {txStatus !== "idle" && (
          <Toast
            status={txStatus}
            txHash={txHash}
            onClose={() => { setTxStatus("idle"); setTxHash(undefined); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

