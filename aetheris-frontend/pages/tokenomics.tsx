// Aetheris\aetheris-frontend\pages\tokenomics.tsx

// Aetheris\aetheris-frontend\pages\tokenomics.tsx
// UPDATED: Revised Whitepaper v3 — correct token distribution, staking multipliers, no public sale, OFT omnichain

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function TokenomicsPage() {
  const [selectedTab, setSelectedTab] = useState<"overview" | "allocation" | "utility" | "economics">("overview");

  // Correct allocation from Whitepaper v3, Section 6.1
  const allocation = [
    { category: "Community Rewards",     percentage: 35, amount: "350,000,000", color: "#22c55e", description: "Milestone-gated by vault TVL — earned through participation" },
    { category: "Ecosystem & Treasury",  percentage: 20, amount: "200,000,000", color: "#06b6d4", description: "Governance-controlled from day one — no team access" },
    { category: "Team & Founders",       percentage: 18, amount: "180,000,000", color: "#a855f7", description: "12-month cliff, 36-month linear vest" },
    { category: "Private / Seed Round",  percentage: 10, amount: "100,000,000", color: "#eab308", description: "6-month cliff, 24-month linear vest" },
    { category: "Liquidity Provision",   percentage:  7, amount: "70,000,000",  color: "#ef4444", description: "100% unlocked at TGE — deployed to Aerodrome & Uniswap V3" },
    { category: "Advisors",              percentage:  5, amount: "50,000,000",  color: "#f97316", description: "6-month cliff, 18-month linear vest" },
    { category: "Bug Bounty & Security", percentage:  3, amount: "30,000,000",  color: "#ec4899", description: "Released per-bounty; unspent rolls to treasury" },
    { category: "Reserve",               percentage:  2, amount: "20,000,000",  color: "#64748b", description: "Locked 24 months — supermajority vote required" },
  ];

  // Staking tiers from Whitepaper v3, Section 5.4 — multipliers, NOT fee discounts
  const stakingTiers = [
    { tier: "Base",     stake: "0",         multiplier: "1.00×", color: "gray"   },
    { tier: "Bronze",   stake: "1,000",     multiplier: "1.10×", color: "orange" },
    { tier: "Silver",   stake: "10,000",    multiplier: "1.25×", color: "slate"  },
    { tier: "Gold",     stake: "100,000",   multiplier: "1.50×", color: "yellow" },
    { tier: "Platinum", stake: "1,000,000", multiplier: "2.00×", color: "cyan"   },
  ];

  // Vesting from Whitepaper v3, Section 6.2
  const vestingSchedule = [
    { category: "Community Rewards",     tgeUnlock: "0%",    cliff: "None",    fullVest: "48 months (milestone-gated)", notes: "TVL-unlocked, not calendar-unlocked" },
    { category: "Ecosystem & Treasury",  tgeUnlock: "0%",    cliff: "None",    fullVest: "Governance-controlled",       notes: "Requires vote + 48hr time lock" },
    { category: "Team & Founders",       tgeUnlock: "0%",    cliff: "12 mo",   fullVest: "48 months from TGE",          notes: "Monthly linear after cliff" },
    { category: "Private / Seed Round",  tgeUnlock: "0%",    cliff: "6 mo",    fullVest: "30 months from TGE",          notes: "Monthly linear after cliff" },
    { category: "Liquidity Provision",   tgeUnlock: "100%",  cliff: "None",    fullVest: "TGE",                         notes: "Paired with USDC on Aerodrome + Uniswap V3" },
    { category: "Advisors",              tgeUnlock: "0%",    cliff: "6 mo",    fullVest: "24 months from TGE",          notes: "Monthly linear after cliff" },
    { category: "Bug Bounty & Security", tgeUnlock: "0%",    cliff: "None",    fullVest: "On-demand",                   notes: "Per validated submission; unspent → treasury" },
    { category: "Reserve",               tgeUnlock: "0%",    cliff: "24 mo",   fullVest: "Governance unlock only",      notes: "Supermajority + 7-day time lock" },
  ];

  // AX utility features
  const utilities = [
    {
      icon: "💰",
      title: "USDC Yield Distributions",
      description: "20% of all agent-generated protocol fees flow to the ProfitDistributor and are distributed to AX stakers as USDC — not in newly-printed AX. Real revenue, real yield.",
      impact: "Grows with vault TVL"
    },
    {
      icon: "📈",
      title: "Vault Yield Multiplier",
      description: "Vault depositors who also stake AX receive a weighted share multiplier on their vault returns. Platinum stakers earn up to 2× their proportional share vs. non-stakers.",
      impact: "Up to 2.00× at Platinum tier"
    },
    {
      icon: "🗳️",
      title: "Governance Rights",
      description: "Vote on protocol fee rate, new agent additions, agent protocol whitelist, vault allocation limits, treasury spending, and contract upgrades. Staked AX only — unstaked tokens have zero voting weight.",
      impact: "Proportional governance power"
    },
    {
      icon: "🌐",
      title: "Omnichain OFT",
      description: "AX is issued as a LayerZero OFT — one unified token, natively on every supported chain simultaneously. No wrapped copies, no bridge custodian. Stakers on any chain receive distributions locally.",
      impact: "Phase 2 upgrade — Base → Arbitrum → all 5 chains"
    },
    {
      icon: "🔒",
      title: "No Inflation",
      description: "Fixed 1,000,000,000 AX. No minting mechanism exists. Staking yield comes entirely from protocol revenue — not from printing new tokens. Alignment is structural, not aspirational.",
      impact: "Fixed forever"
    },
    {
      icon: "⚡",
      title: "Protocol Access Layer",
      description: "AX is not required to deposit into the vault. Any user can deposit USDC, earn yield, and withdraw without holding AX. AX represents ownership of the protocol's revenue stream.",
      impact: "Vault and AX grow independently"
    },
  ];

  // Protocol economics from Section 5
  const protocolEconomics = [
    { tvl: "$1M",    annualReturn: "$150K",  depositorShare: "$120K", protocolRevenue: "$30K"  },
    { tvl: "$10M",   annualReturn: "$1.5M",  depositorShare: "$1.2M", protocolRevenue: "$300K" },
    { tvl: "$100M",  annualReturn: "$15M",   depositorShare: "$12M",  protocolRevenue: "$3M"   },
    { tvl: "$500M",  annualReturn: "$75M",   depositorShare: "$60M",  protocolRevenue: "$15M"  },
  ];

  // OFT chain rollout from Section 6.4
  const oftRollout = [
    { phase: "Phase 1", chains: "Base (ERC-20)",                                              status: "Active development" },
    { phase: "Phase 2", chains: "Base, Arbitrum",                                             status: "Post-vault launch"  },
    { phase: "Phase 3", chains: "Base, Arbitrum, Hyperliquid",                                status: "Planned"            },
    { phase: "Phase 4", chains: "Base, Arbitrum, Hyperliquid, Ethereum mainnet",              status: "Planned"            },
    { phase: "Phase 5", chains: "Base, Arbitrum, Hyperliquid, Ethereum mainnet, Solana",      status: "2027 horizon"       },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />

      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">

          {/* ── HERO ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">$AX</span> Token
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto">
              Governance and revenue-sharing token of the Aetheris autonomous DeFi protocol
            </p>
          </motion.div>

          {/* ── TOTAL SUPPLY HERO ────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-8 md:p-12 text-center mb-16 border-2 border-cyan-500/30"
          >
            <div className="text-sm text-gray-400 mb-2 uppercase tracking-wider">Total Supply (Fixed Forever)</div>
            <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-4">
              1,000,000,000
            </div>
            <div className="text-xl text-gray-300 mb-6">One billion $AX tokens. No inflation mechanism exists.</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-3xl font-black text-green-400 mb-2">FIXED</div>
                <div className="text-sm text-gray-400">No minting mechanism — supply only shrinks through burns if governance votes one</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-3xl font-black text-cyan-400 mb-2">USDC YIELD</div>
                <div className="text-sm text-gray-400">20% of agent profits → stakers in USDC, not inflation</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-3xl font-black text-purple-400 mb-2">7% TGE FLOAT</div>
                <div className="text-sm text-gray-400">Only liquidity provision unlocks at TGE — minimal sell pressure</div>
              </div>
            </div>

            {/* No Public Sale Banner */}
            <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-3 text-left">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h4 className="font-bold mb-1 text-yellow-400">No Public Sale</h4>
                  <p className="text-sm text-gray-400">
                    AX has <strong className="text-white">no public sale, no IDO, no seed round open to the public.</strong> The community earns AX through vault participation and protocol usage.
                    Public sales in the current regulatory climate create securities exposure in most jurisdictions.
                    Users who earn AX through the protocol are more aligned than users who bought it at a token sale.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── TAB NAVIGATION ───────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex gap-4 border-b border-white/10 overflow-x-auto">
              {(["overview", "allocation", "utility", "economics"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-6 py-3 font-bold transition-colors relative capitalize whitespace-nowrap ${
                    selectedTab === tab
                      ? "text-cyan-400"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                  {selectedTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* ── TAB CONTENT ──────────────────────────────────────── */}
          <motion.div
            key={selectedTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >

            {/* ══════════════════════════════════════════════════════
                OVERVIEW TAB
            ══════════════════════════════════════════════════════ */}
            {selectedTab === "overview" && (
              <div className="space-y-8">

                {/* Key Utility Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {utilities.map((utility, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-6 hover:bg-white/5 transition-all"
                    >
                      <div className="text-5xl mb-4">{utility.icon}</div>
                      <h3 className="text-xl font-black mb-3">{utility.title}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed mb-3">{utility.description}</p>
                      <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider">{utility.impact}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Staking Yield Multiplier Tiers */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-4 text-center">Vault Yield Multiplier Tiers</h3>
                  <p className="text-center text-gray-400 mb-2">
                    Vault depositors who also stake $AX receive a weighted share multiplier on their vault returns.
                  </p>
                  <p className="text-center text-xs text-gray-500 mb-8">
                    Multipliers are weighting mechanisms — if all depositors stake at the same tier, everyone earns their proportional share unchanged.
                    Multipliers benefit those who stake when others don't.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {stakingTiers.map((tier, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className={`p-6 rounded-lg text-center border-2 ${
                          tier.tier === "Platinum"
                            ? "bg-cyan-500/10 border-cyan-500"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <div className="text-2xl font-black mb-2">{tier.tier}</div>
                        <div className="text-xs text-gray-500 mb-3">Stake {tier.stake} $AX</div>
                        <div className="text-4xl font-black text-cyan-400 mb-2">{tier.multiplier}</div>
                        <div className="text-xs text-gray-400">share multiplier</div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">💡</span>
                      <div>
                        <h4 className="font-bold mb-2">Example: Gold Tier (100K AX staked)</h4>
                        <p className="text-sm text-gray-400">
                          A vault depositor at Gold tier receives a <strong className="text-white">1.50× share multiplier</strong> on their vault yield allocation,
                          meaning they earn 50% more than their raw proportional share when others are unstaked.
                          Additionally, they receive USDC staking distributions from the 20% protocol fee — two simultaneous yield streams from one capital deployment.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Staking Mechanics */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Staking Mechanics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {[
                        { title: "No minimum stake", desc: "Any amount of AX earns distributions from the first distribution event after staking." },
                        { title: "No lock-up to earn", desc: "Staked AX earns USDC distributions immediately — no commitment period required to qualify." },
                        { title: "7-day unstaking delay", desc: "Prevents governance flash-stake attacks. Ensures governance voters have sustained economic exposure." },
                        { title: "USDC distributions", desc: "Yield is paid in USDC — real revenue from agent profits. Not new AX tokens that dilute existing holders." },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-white/5 rounded-lg">
                          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-cyan-400 flex-shrink-0 text-xs font-bold mt-0.5">✓</div>
                          <div>
                            <div className="font-bold text-sm text-white mb-1">{item.title}</div>
                            <div className="text-xs text-gray-400">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="bg-white/5 rounded-lg p-6 h-full">
                        <h4 className="font-bold mb-4 text-cyan-400">Distribution Formula</h4>
                        <div className="font-mono text-sm bg-black/40 border border-white/10 rounded p-4 mb-4 text-green-400">
                          staker_share = (staker_AX / total_staked_AX) × distribution_amount
                        </div>
                        <div className="space-y-3 text-sm text-gray-400">
                          <div className="flex justify-between">
                            <span>Distribution currency:</span>
                            <span className="text-white font-bold">USDC</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distribution source:</span>
                            <span className="text-white font-bold">ProfitDistributor contract</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Claim:</span>
                            <span className="text-white font-bold">Any time (accrues)</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Auto-compound option:</span>
                            <span className="text-white font-bold">USDC → AX → stake</span>
                          </div>
                          <div className="pt-3 border-t border-white/10 text-xs italic text-gray-500">
                            When agents make money, stakers make money. When agents make nothing, stakers receive nothing. That alignment is structural.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* OFT Omnichain */}
                <div className="glass-panel p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-4xl">🌐</span>
                    <h3 className="text-3xl font-black">Omnichain OFT Architecture</h3>
                  </div>

                  <p className="text-gray-300 mb-6">
                    AX is issued as a <strong className="text-white">LayerZero OFT (Omnichain Fungible Token)</strong> — not a Base token with bridged copies on other chains.
                    It is a single unified token with a globally consistent total supply, existing natively on every supported chain simultaneously.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-green-400 text-2xl">✓</span>
                        <h4 className="font-bold text-green-400">OFT Model (Aetheris)</h4>
                      </div>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-1">→</span><span>Arbitrum staker receives yield directly on Arbitrum</span></li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-1">→</span><span>AX price is identical across all chains — one token</span></li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-1">→</span><span>Single global supply — no aggregation needed</span></li>
                        <li className="flex items-start gap-2"><span className="text-green-400 mt-1">→</span><span>Burn on origin chain, mint on destination — no custodian</span></li>
                      </ul>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-red-400 text-2xl">✗</span>
                        <h4 className="font-bold text-red-400">Bridged Token Model (others)</h4>
                      </div>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-start gap-2"><span className="text-red-400 mt-1">→</span><span>Arbitrum staker must bridge to Base first to claim</span></li>
                        <li className="flex items-start gap-2"><span className="text-red-400 mt-1">→</span><span>Price can diverge — two separate tokens on different chains</span></li>
                        <li className="flex items-start gap-2"><span className="text-red-400 mt-1">→</span><span>Total supply requires aggregating across all chains</span></li>
                        <li className="flex items-start gap-2"><span className="text-red-400 mt-1">→</span><span>Bridge failures lock tokens in transit</span></li>
                      </ul>
                    </div>
                  </div>

                  <h4 className="font-bold mb-3 text-gray-300">OFT Deployment Rollout</h4>
                  <div className="space-y-2">
                    {oftRollout.map((row, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div className="font-bold text-cyan-400 w-20">{row.phase}</div>
                        <div className="text-sm text-gray-300 flex-1 px-4">{row.chains}</div>
                        <div className={`text-xs font-bold px-3 py-1 rounded-full border ${
                          row.status === "Active development"
                            ? "text-green-400 border-green-500/30 bg-green-500/10"
                            : row.status === "Post-vault launch"
                            ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                            : row.status === "2027 horizon"
                            ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                            : "text-gray-400 border-gray-500/30 bg-gray-500/10"
                        }`}>{row.status}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4 italic">
                    AX launches on Base as a standard ERC-20 in Phase 1. The OFT upgrade is implemented in Phase 2, timed with Agent Beta's Arbitrum expansion.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ALLOCATION TAB
            ══════════════════════════════════════════════════════ */}
            {selectedTab === "allocation" && (
              <div className="space-y-8">

                {/* Allocation bars */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Token Distribution</h3>

                  <div className="space-y-4 mb-8">
                    {allocation.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.07 }}
                        className="relative"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="font-bold">{item.category}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-cyan-400">{item.percentage}%</div>
                            <div className="text-xs text-gray-500">{item.amount} $AX</div>
                          </div>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.percentage}%` }}
                            transition={{ delay: 0.5 + i * 0.07, duration: 0.8 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-1 ml-7">{item.description}</div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-green-400">Why This Distribution Works</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✓ 55% community + ecosystem = Community majority enforced in token contract</li>
                        <li>✓ 35% community rewards = Earned through vault participation, not bought</li>
                        <li>✓ 18% team = Well-vested, 12-month cliff enforced</li>
                        <li>✓ 20% treasury = Under governance from day one</li>
                        <li>✓ Only 7% liquid at TGE = Genuine price discovery</li>
                      </ul>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-red-400">Red Flags Avoided</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✗ No public sale → no securities exposure</li>
                        <li>✗ No VC domination → community majority is contractual</li>
                        <li>✗ No immediate team unlocks → 12-month cliff enforced on-chain</li>
                        <li>✗ No inflationary minting mechanism</li>
                        <li>✗ No hidden allocations → all categories published</li>
                      </ul>
                    </div>
                  </div>

                  {/* Community majority enforcement note */}
                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🔐</span>
                      <div>
                        <h4 className="font-bold mb-2">Community Majority — Contract-Enforced</h4>
                        <p className="text-sm text-gray-400">
                          Combined community + ecosystem allocation: <strong className="text-white">55%</strong>. Combined team + investor allocation: <strong className="text-white">28%</strong>.
                          The community majority is enforced in the token contract — not stated in documentation and then quietly violated.
                          No upgrade can change this ratio without a full token migration requiring community approval.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vesting Schedule */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Vesting Schedule</h3>
                  <p className="text-center text-gray-400 mb-8">
                    Long vesting ensures every stakeholder is aligned with long-term protocol success.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4">Category</th>
                          <th className="text-center py-3 px-4">TGE Unlock</th>
                          <th className="text-center py-3 px-4">Cliff</th>
                          <th className="text-center py-3 px-4">Full Vest</th>
                          <th className="text-left py-3 px-4">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300">
                        {vestingSchedule.map((item, i) => (
                          <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-4 font-bold">{item.category}</td>
                            <td className="text-center py-3 px-4">
                              <span className={item.tgeUnlock === "100%" ? "text-green-400 font-bold" : "text-gray-400"}>{item.tgeUnlock}</span>
                            </td>
                            <td className="text-center py-3 px-4 text-cyan-400">{item.cliff}</td>
                            <td className="text-center py-3 px-4">{item.fullVest}</td>
                            <td className="py-3 px-4 text-xs text-gray-500 italic">{item.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🔒</span>
                      <div>
                        <h4 className="font-bold mb-2">Vesting Protects Alignment</h4>
                        <p className="text-sm text-gray-400">
                          Team vesting: <strong className="text-white">12-month cliff + 36-month monthly linear</strong> = zero tokens for the first year, then slow unlock over 3 years.
                          Community rewards are milestone-gated to vault TVL targets — not calendar-based — so the protocol cannot distribute community tokens before the product has proven itself.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Circulating Supply Timeline */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Circulating Supply Over Time</h3>
                  <div className="space-y-3">
                    {[
                      { time: "TGE (Month 0)",    supply: "70M",           percent: "7%",   note: "Liquidity provision only — intentionally low float" },
                      { time: "Month 6",           supply: "~100–130M",    percent: "~12%", note: "Early community emissions; advisors/seed post-cliff" },
                      { time: "Month 12",          supply: "~200–250M",    percent: "~22%", note: "Team cliff ends — monthly unlock begins" },
                      { time: "Month 30",          supply: "~450–550M",    percent: "~50%", note: "Most investor/advisor vesting complete" },
                      { time: "Month 48",          supply: "~700–800M",    percent: "~75%", note: "Team fully vested; community rewards ongoing" },
                      { time: "Year 5+",           supply: "Milestone-gated", percent: "≤100%", note: "Community rewards unlock tied to vault TVL targets" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div className="font-bold w-36">{item.time}</div>
                        <div className="flex items-center gap-4 flex-1 justify-end">
                          <div className="text-cyan-400 font-mono">{item.supply}</div>
                          <div className="text-gray-500 w-12 text-right">({item.percent})</div>
                          <div className="text-xs text-gray-400 italic hidden md:block">{item.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4 italic text-center">
                    Supply figures are estimates. Community rewards vesting is milestone-gated — actual circulating supply depends on vault TVL progression.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                UTILITY TAB
            ══════════════════════════════════════════════════════ */}
            {selectedTab === "utility" && (
              <div className="space-y-8">

                {/* USDC Distributions */}
                <div className="glass-panel p-8">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-5xl">💰</div>
                    <div>
                      <h3 className="text-2xl font-black mb-2">USDC Yield Distributions (Primary Utility)</h3>
                      <p className="text-gray-400">
                        20% of all agent-generated profits flow to the ProfitDistributor contract and are distributed to AX stakers as USDC.
                        Distributions are denominated in USDC — not in AX. Staking yield from the protocol's own token is inflation by another name.
                        Aetheris staking yield comes entirely from real revenue.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-6 mt-4">
                    <h4 className="font-bold mb-4">Yield Calculation Example (at $10M TVL):</h4>
                    <div className="space-y-2 text-sm text-gray-300">
                      <div className="flex justify-between">
                        <span>Annual agent profit at $10M TVL (15% return):</span>
                        <span className="text-white">$1,500,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>20% performance fee → ProfitDistributor:</span>
                        <span className="text-cyan-400">$300,000/year</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Distributed to all AX stakers pro-rata</span>
                        <span className="text-white">weekly</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                        <span>Your stake: 1,000,000 AX (0.1% of 1B total supply)</span>
                        <span className="text-green-400">~$300/year USDC</span>
                      </div>
                      <div className="text-xs text-gray-500 italic pt-2">
                        Real staker yield = (your AX / total staked AX) × 20% of all agent profits. Grows with vault TVL.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vault Yield Multiplier Deep Dive */}
                <div className="glass-panel p-8">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-5xl">📈</div>
                    <div>
                      <h3 className="text-2xl font-black mb-2">Vault Yield Multiplier</h3>
                      <p className="text-gray-400">
                        Vault depositors who also stake AX receive a weighted share multiplier applied to their vault share calculation.
                        Platinum stakers earn up to 2.00× their raw proportional vault yield when compared to non-staking depositors.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-6 mt-4">
                    <h4 className="font-bold mb-4">How Multipliers Work:</h4>
                    <div className="space-y-3 text-sm text-gray-300">
                      <div className="p-3 bg-black/30 rounded">
                        <div className="font-bold text-white mb-1">Scenario: $100K vault, 2 depositors, equal capital</div>
                        <div className="flex justify-between mt-2">
                          <span>Depositor A — no AX staked (1.00×):</span>
                          <span className="text-gray-400">earns proportional share × 1.00</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span>Depositor B — Platinum AX staked (2.00×):</span>
                          <span className="text-green-400">earns proportional share × 2.00</span>
                        </div>
                        <div className="text-xs text-gray-500 italic mt-2">
                          Depositor B's 2× weight means they receive a larger proportion of the distributed vault yield.
                          Multipliers don't create additional profit — they redistribute the existing share.
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 italic border-t border-white/10 pt-3">
                        If all depositors stake at maximum tier, everyone earns their exact proportional share unchanged. Multipliers only benefit those who stake when others don't.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Governance */}
                <div className="glass-panel p-8">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-5xl">🗳️</div>
                    <div>
                      <h3 className="text-2xl font-black mb-2">Governance Rights</h3>
                      <p className="text-gray-400">
                        AX stakers govern the protocol. Governance rights are proportional to staked AX balance.
                        Unstaked AX has zero voting weight — ensuring governance participants have ongoing economic skin in the game.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-6 mt-4">
                    <h4 className="font-bold mb-4">What Governance Controls:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {[
                        { param: "Protocol fee rate", note: "Bounded: 5%–25% of agent profits" },
                        { param: "New agent additions", note: "Requires audit completion before vote" },
                        { param: "Agent protocol whitelist", note: "48-hour time lock on execution" },
                        { param: "Vault allocation limits per agent", note: "Cannot exceed defined safety bounds" },
                        { param: "Treasury spending", note: "Supermajority + 72-hour time lock" },
                        { param: "Agent contract upgrades", note: "48-hour time lock — community review window" },
                        { param: "Reserve fund access", note: "Supermajority + 7-day time lock" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-black/20 rounded">
                          <span className="text-cyan-400 mt-0.5">✓</span>
                          <div>
                            <div className="font-bold text-white">{item.param}</div>
                            <div className="text-xs text-gray-500">{item.note}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-gray-400">
                      <strong className="text-white">Immutable (no governance override):</strong> AX token contract & vault core contract.
                      These are the two contracts users must trust absolutely. Making them ungovernable removes the attack vector of a governance takeover that changes the fundamental rules.
                    </div>
                  </div>
                </div>

                {/* Combined Value Proposition */}
                <div className="glass-panel p-8 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
                  <h3 className="text-2xl font-black mb-4 text-center">Combined Value Proposition</h3>
                  <p className="text-center text-gray-300 mb-6">
                    Holding and staking $AX provides multiple simultaneous benefits:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-black/30 rounded-lg p-4 text-center">
                      <div className="text-2xl font-black text-cyan-400 mb-2">USDC Yield</div>
                      <div className="text-xs text-gray-400">20% of all agent profits distributed as USDC — grows with vault TVL</div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-4 text-center">
                      <div className="text-2xl font-black text-green-400 mb-2">Up to 2.00×</div>
                      <div className="text-xs text-gray-400">Vault yield multiplier for depositors who also stake at Platinum tier</div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-4 text-center">
                      <div className="text-2xl font-black text-purple-400 mb-2">Governance</div>
                      <div className="text-xs text-gray-400">Vote on fee rates, new agents, treasury — proportional to staked balance</div>
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-400 mt-6">
                    AX is not required to use the vault. Vault depositors and AX stakers grow independently — neither is held hostage to the other.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ECONOMICS TAB
            ══════════════════════════════════════════════════════ */}
            {selectedTab === "economics" && (
              <div className="space-y-8">

                {/* Fee Structure */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Fee Structure</h3>

                  <div className="text-center mb-8">
                    <div className="text-6xl font-black text-cyan-400 mb-2">20%</div>
                    <div className="text-xl text-gray-300 mb-1">Performance Fee on all agent-generated profits</div>
                    <div className="text-sm text-gray-500">No management fee · No subscription fee · No deposit fee</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
                      <div className="text-5xl font-black text-green-400 mb-3">80%</div>
                      <div className="text-lg font-bold text-white mb-2">Vault Depositors</div>
                      <div className="text-sm text-gray-400">Accrues directly as increased NAV per share. No claim required — the value of shares grows automatically.</div>
                    </div>
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-6 text-center">
                      <div className="text-5xl font-black text-cyan-400 mb-3">20%</div>
                      <div className="text-lg font-bold text-white mb-2">AX Stakers</div>
                      <div className="text-sm text-gray-400">Flows to ProfitDistributor. Distributed in USDC, proportional to staked AX. Claim any time.</div>
                    </div>
                  </div>

                  {/* Full fee distribution table */}
                  <h4 className="font-bold mb-4 text-gray-300">Complete Fee Distribution by Revenue Stream</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4">Revenue Stream</th>
                          <th className="text-center py-3 px-4">Vault Depositors</th>
                          <th className="text-center py-3 px-4">AX Stakers</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300">
                        {[
                          { stream: "Agent-generated profits",              vault: "80%",               stakers: "20% (protocol fee)" },
                          { stream: "Gas fee spread (USDC collected vs ETH cost)", vault: "—",          stakers: "100%" },
                          { stream: "MEV savings captured by Agent Armor",  vault: "100% (improved NAV)", stakers: "—" },
                          { stream: "Borrow refinancing savings",           vault: "100% (reduced cost)", stakers: "—" },
                        ].map((row, i) => (
                          <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-4 font-bold">{row.stream}</td>
                            <td className="text-center py-3 px-4 text-green-400">{row.vault}</td>
                            <td className="text-center py-3 px-4 text-cyan-400">{row.stakers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Protocol Economics at Scale */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-4 text-center">Protocol Economics at Scale</h3>
                  <p className="text-center text-gray-400 mb-8">
                    Assuming 15% blended annual return across all active agents. Actual returns vary by market conditions, agent phase, and deployed strategy mix.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4">Vault TVL</th>
                          <th className="text-center py-3 px-4">Annual Return (15%)</th>
                          <th className="text-center py-3 px-4">Depositor Share (80%)</th>
                          <th className="text-center py-3 px-4">Protocol Revenue (20%)</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300">
                        {protocolEconomics.map((row, i) => (
                          <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-4 font-black text-cyan-400">{row.tvl}</td>
                            <td className="text-center py-3 px-4">{row.annualReturn}</td>
                            <td className="text-center py-3 px-4 text-green-400 font-bold">{row.depositorShare}</td>
                            <td className="text-center py-3 px-4 text-cyan-400 font-bold">{row.protocolRevenue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📊</span>
                      <div>
                        <h4 className="font-bold mb-2">AX Staker Yield at Scale</h4>
                        <p className="text-sm text-gray-400">
                          At <strong className="text-white">$100M TVL</strong>, protocol revenue is <strong className="text-white">$3M/year</strong> distributed to all AX stakers as USDC.
                          If 30% of supply is staked (300M AX), a staker with 1M AX (0.33% of staked supply) earns approximately <strong className="text-white">$10,000/year in USDC</strong> — growing proportionally with vault TVL.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Withdrawal Terms */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Withdrawal Terms</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-green-400">Standard Withdrawal</h4>
                      <div className="space-y-3 text-sm text-gray-400">
                        <div className="flex justify-between"><span>Notice period:</span><span className="text-white font-bold">24 hours</span></div>
                        <div className="flex justify-between"><span>Fee:</span><span className="text-white font-bold">None</span></div>
                        <div className="flex justify-between"><span>Purpose:</span><span className="text-white text-right">Allows allocation engine to unwind positions without slippage</span></div>
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-yellow-400">Emergency Withdrawal</h4>
                      <div className="space-y-3 text-sm text-gray-400">
                        <div className="flex justify-between"><span>Notice period:</span><span className="text-white font-bold">Immediate</span></div>
                        <div className="flex justify-between"><span>Fee:</span><span className="text-white font-bold">Small fee (calculated at time of withdrawal)</span></div>
                        <div className="flex justify-between"><span>Purpose:</span><span className="text-white text-right">Covers cost of unwinding positions ahead of schedule</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seed / Private round note */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Private / Seed Round</h3>
                  <p className="text-gray-400 mb-6 text-center">
                    There is a 10% Private/Seed allocation (100,000,000 AX) reserved for strategic investors and early backers.
                    There is <strong className="text-white">no public sale</strong> — AX tokens are not available for purchase by the general public.
                    The community earns AX through vault participation and protocol usage.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-xs text-gray-500 mb-2">Allocation</div>
                      <div className="text-2xl font-black text-cyan-400">100M AX</div>
                      <div className="text-xs text-gray-500 mt-1">10% of total supply</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-xs text-gray-500 mb-2">Cliff</div>
                      <div className="text-2xl font-black text-purple-400">6 months</div>
                      <div className="text-xs text-gray-500 mt-1">Zero tokens before month 6</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-xs text-gray-500 mb-2">Full Vest</div>
                      <div className="text-2xl font-black text-green-400">30 months</div>
                      <div className="text-xs text-gray-500 mt-1">Monthly linear after cliff</div>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-sm text-gray-400">
                        <strong className="text-white">Regulatory context:</strong> Public token sales in the current regulatory climate create securities exposure in most jurisdictions.
                        Aetheris deliberately avoids a public IDO. Community distribution is achieved through vault participation rewards — ensuring tokens reach users who are most aligned with the protocol's success.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </motion.div>

          {/* ── CTA ──────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass-panel p-12 text-center mt-16"
          >
            <h2 className="text-4xl font-black mb-4">Ready to Explore Further?</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Understand the agents generating the protocol revenue that backs $AX staking yield — or read the full whitepaper.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black shadow-lg"
                >
                  EXPLORE THE AGENTS
                </motion.button>
              </Link>
              <Link href="/whitepaper">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10 transition-colors"
                >
                  READ WHITEPAPER
                </motion.button>
              </Link>
            </div>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}