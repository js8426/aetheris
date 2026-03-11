// Aetheris\aetheris-frontend\pages\whitepaper.tsx

// Aetheris\aetheris-frontend\pages\whitepaper.tsx
// UPDATED: Revised Whitepaper v3 — correct agents (22), fee model (20% perf fee), tokenomics, roadmap, security

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function WhitepaperPage() {
  const [activeSection, setActiveSection] = useState<
    "abstract" | "problems" | "agents" | "vault" | "fees" | "tokenomics" | "security" | "roadmap" | "risks"
  >("abstract");

  const handleDownloadPDF = () => {
    alert("PDF download will be available soon. The whitepaper is currently being finalized.");
  };

  const handleViewGitHub = () => {
    window.open("https://github.com/aetheris-protocol/whitepaper", "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />

      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="w-32 h-32 mx-auto mb-6 rounded-full border-4 border-cyan-400 overflow-hidden">
              <Image
                src="/aetherisLogo.jpg"
                alt="Aetheris Logo"
                width={128} height={128}
                className="w-full h-full object-cover"
              />
            </div>

            <h1 className="text-4xl md:text-6xl font-black mb-4">AETHERIS WHITEPAPER</h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-2">
              Autonomous Yield Infrastructure for the Onchain Economy
            </p>
            <p className="text-sm text-gray-500 mb-2">22 Agents · Base L2 · ERC-4337 Gasless · OFT Omnichain</p>
            <p className="text-sm text-gray-500 mb-8">Version 1.0 · March 2026</p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleDownloadPDF}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black"
              >
                Download PDF ⬇️
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleViewGitHub}
                className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10"
              >
                View on GitHub →
              </motion.button>
            </div>
          </motion.div>

          {/* Tab Nav */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex gap-2 border-b border-white/10 overflow-x-auto pb-2">
              {[
                { id: "abstract",   label: "Abstract"    },
                { id: "problems",   label: "Problems"    },
                { id: "agents",     label: "Agents"      },
                { id: "vault",      label: "The Vault"   },
                { id: "fees",       label: "Fees"        },
                { id: "tokenomics", label: "Tokenomics"  },
                { id: "security",   label: "Security"    },
                { id: "roadmap",    label: "Roadmap"     },
                { id: "risks",      label: "Risks"       },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`px-4 py-2 font-bold transition-colors relative whitespace-nowrap text-sm md:text-base ${
                    activeSection === tab.id ? "text-cyan-400" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                  {activeSection === tab.id && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Tab Content */}
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-panel p-8 md:p-12"
          >

            {/* ── ABSTRACT ── */}
            {activeSection === "abstract" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">Abstract</h2>
                <div className="text-gray-300 leading-relaxed space-y-4">
                  <p>
                    Aetheris is an autonomous yield protocol deployed on Base L2. It deploys 22 purpose-built AI agents
                    that continuously execute arbitrage, yield optimisation, funding rate harvesting, liquidity management,
                    and risk mitigation strategies on behalf of vault depositors. Users deposit USDC once; agents generate
                    yield continuously with no active management required. All transactions are gasless via ERC-4337 account
                    abstraction. The AX governance token, issued as a LayerZero OFT, distributes a share of all protocol
                    fees to stakers across any supported chain.
                  </p>
                  <p>
                    The protocol is designed to operate across five chains at maturity: Base, Arbitrum, Ethereum mainnet,
                    Hyperliquid, and Solana.
                  </p>

                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-6 mt-6">
                    <p className="text-sm italic text-gray-300">
                      Aetheris is not a trading platform, a lending protocol, or a yield aggregator. It is an autonomous
                      financial infrastructure layer that makes institutional-grade DeFi execution accessible through a
                      single vault deposit.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                    {[
                      { stat: "22",       label: "Purpose-built agents"   },
                      { stat: "5",        label: "Chains at maturity"     },
                      { stat: "ERC-4337", label: "Gasless transactions"   },
                      { stat: "OFT",      label: "Omnichain AX token"     },
                    ].map((s, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                        <div className="text-2xl font-black text-cyan-400 mb-1">{s.stat}</div>
                        <div className="text-xs text-gray-400">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── PROBLEMS ── */}
            {activeSection === "problems" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">The Problems Aetheris Solves</h2>
                <div className="text-gray-300 leading-relaxed space-y-8">
                  <p>
                    DeFi has delivered on its core technical promise. Yet retail participation remains a fraction of its
                    potential. Four structural barriers compound on each other and collectively make active DeFi participation
                    inaccessible to the majority of users.
                  </p>

                  {[
                    {
                      num: "2.1", title: "The Gas Barrier", color: "red",
                      body: "Every transaction requires ETH. A user holding USDC cannot execute a single transaction without first acquiring ETH — a multi-step prerequisite costing $20–40 and 30–60 minutes before a deposit even executes. Over 40 million ERC-4337 accounts have been created globally — a direct measure of how many users found the gas requirement sufficiently painful.",
                      solution: "Agent Gas eliminates this via ERC-4337 smart accounts and a paymaster contract. Every transaction executes without ETH. Fees deducted in USDC."
                    },
                    {
                      num: "2.2", title: "The Trust Crisis", color: "red",
                      body: "In H1 2025, $1.1B was lost to DeFi exploits — 52% from smart contract vulnerabilities or developer backdoors, 62% resulting in total permanent loss. ~90% of protocols use upgradeable proxy contracts — a legitimate pattern that also allows malicious developers to replace code with a drain function at any time. A protocol can pass multiple audits and be emptied in a single transaction at 3AM.",
                      solution: "Agent V monitors every contract the protocol interacts with at the bytecode level. Any proxy implementation swap, ownership transfer, or anomalous admin action triggers emergency withdrawal within a single block."
                    },
                    {
                      num: "2.3", title: "Dead Capital", color: "yellow",
                      body: "The average DeFi stablecoin pool yields ~9.8% APY vs. 0.01–0.50% in savings accounts. Beyond lending yields, arbitrage, funding rate arbitrage (50–100%+ annualised during bull markets), yield optimisation, and concentrated liquidity management (15–40% APY vs 2–5% unmanaged) are all completely inaccessible to retail — they require superhuman reaction speed or 24/7 monitoring.",
                      solution: "8 revenue-generating agents execute these strategies autonomously on behalf of vault depositors. Deposit once. Agents work continuously."
                    },
                    {
                      num: "2.4", title: "Fragmented Infrastructure", color: "yellow",
                      body: "An optimal yield strategy in 2026 requires positions on Base, Arbitrum, Ethereum mainnet, and Hyperliquid simultaneously. Managing this manually — with different wallets, bridges, and gas tokens — is beyond any individual user's practical capacity.",
                      solution: "Aetheris is chain-agnostic. The vault lives on Base. Agents deploy wherever execution is optimal. AX as OFT means stakers on any chain receive yield from agents on any chain — no bridging."
                    },
                  ].map((problem, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-6">
                      <h3 className="text-xl font-black mb-3">{problem.num} {problem.title}</h3>
                      <p className="text-sm text-gray-400 mb-4 leading-relaxed">{problem.body}</p>
                      <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded">
                        <span className="text-green-400 text-sm mt-0.5">→</span>
                        <p className="text-sm text-gray-300"><strong className="text-green-400">Solution: </strong>{problem.solution}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── AGENTS ── */}
            {activeSection === "agents" && (
              <div>
                <h2 className="text-4xl font-black mb-2 text-cyan-400">The Aetheris Agent Ecosystem</h2>
                <p className="text-gray-400 mb-8">22 purpose-built autonomous agents across 4 functional categories. Each agent is an independent smart contract with its own execution logic and profit contribution.</p>

                <div className="space-y-8">
                  {/* Revenue */}
                  <div>
                    <h3 className="text-2xl font-black mb-4 text-green-400">Revenue Generation (8 Agents)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { name: "Agent Alpha", sub: "DEX Arbitrageur", phase: "Phase 1", desc: "Monitors price discrepancies between DEXs in real time. Flash loan-funded atomic arbitrage. No user capital required. Rust implementation, sub-20ms scan times.", color: "#06b6d4" },
                        { name: "Agent Beta", sub: "Funding Rate Harvester", phase: "Phase 1", desc: "Delta-neutral positions across spot and perpetual markets collect funding rate payments. 50–100%+ annualised during bull markets. Base (Synthetix) → Arbitrum (GMX) → Hyperliquid.", color: "#22c55e" },
                        { name: "Agent Delta", sub: "Yield Architect", phase: "Phase 2", desc: "Routes vault capital to the highest-yielding lending deployment continuously. Integrates RWA yield (Ondo USDY, BlackRock BUIDL).", color: "#a855f7" },
                        { name: "Agent Anchor", sub: "Stablecoin Optimiser", phase: "Phase 2", desc: "Manages stablecoin yield specifically. Monitors depeg risk in real time, auto-exits if peg deviation exceeds thresholds.", color: "#06b6d4" },
                        { name: "Agent LP", sub: "Liquidity Position Manager", phase: "Phase 2", desc: "Manages concentrated liquidity on Uniswap V3 and Aerodrome. Active management: 15–40% APY vs 2–5% unmanaged.", color: "#eab308" },
                        { name: "Agent Borrow", sub: "Loan Rate Optimiser", phase: "Phase 2", desc: "Automatically refinances user debt positions to the lowest available rate across lending protocols. Accounts for gas, migration risk, and liquidation exposure.", color: "#f97316" },
                        { name: "Agent Pi", sub: "Prediction Market Arb", phase: "Phase 3*", desc: "Identifies pricing inefficiencies between on-chain prediction markets. Outcome-agnostic — returns uncorrelated with crypto direction.", color: "#ec4899" },
                        { name: "Agent Options", sub: "Structured Yield Engine", phase: "Phase 4*", desc: "Covered call and cash-secured put strategies on Arbitrum (Lyra, Premia). Net short volatility — earns premium in range-bound markets.", color: "#64748b" },
                      ].map((agent, i) => (
                        <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-black text-white">{agent.name}</span>
                              <span className="text-sm ml-2" style={{ color: agent.color }}>{agent.sub}</span>
                            </div>
                            <span className="text-xs border rounded-full px-2 py-0.5" style={{ color: agent.color, borderColor: agent.color + "40" }}>{agent.phase}</span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{agent.desc}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 italic">* Deployment contingent on on-chain liquidity maturation.</p>
                  </div>

                  {/* Security */}
                  <div>
                    <h3 className="text-2xl font-black mb-4 text-red-400">Security & Risk (4 Agents)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { name: "Agent V", sub: "Smart Contract Monitor", phase: "Phase 1", desc: "Monitors every contract at bytecode level — proxy implementation swaps, ownership transfers, oracle manipulation precursors. Detection → emergency withdrawal within a single block.", color: "#22c55e" },
                        { name: "Agent Omega", sub: "Liquidation Guardian", phase: "Phase 2", desc: "Monitors health factors on all leveraged positions. Auto-intervenes at 30% buffer (add collateral), 15% (reduce size), 10% (emergency close). Eliminates liquidation penalty cliff.", color: "#06b6d4" },
                        { name: "Agent Shield", sub: "Autonomous Insurance", phase: "Phase 3", desc: "Continuously assesses exploit probability, autonomously purchases and manages coverage from Nexus Mutual, InsurAce, Sherlock. Increases coverage when V detects elevated threat.", color: "#a855f7" },
                        { name: "Agent Armor", sub: "MEV Protection", phase: "Phase 2", desc: "Routes all protocol transactions through Flashbots Protect and MEV Blocker — private mempool, invisible to sandwich bots. One integration protects every agent simultaneously.", color: "#eab308" },
                      ].map((agent, i) => (
                        <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-black text-white">{agent.name}</span>
                              <span className="text-sm ml-2" style={{ color: agent.color }}>{agent.sub}</span>
                            </div>
                            <span className="text-xs border rounded-full px-2 py-0.5" style={{ color: agent.color, borderColor: agent.color + "40" }}>{agent.phase}</span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{agent.desc}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-gray-300">
                      <strong className="text-white">Three-layer defence: </strong>
                      Agent V detects threats → Agent Omega prevents liquidation losses → Agent Shield compensates if prevention fails. Together they cover the complete threat surface.
                    </div>
                  </div>

                  {/* Infrastructure + Specialised (brief) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xl font-black mb-3 text-blue-400">Infrastructure (5 Agents)</h3>
                      <div className="space-y-2 text-sm">
                        {[
                          ["Agent Gas", "ERC-4337 gasless layer — paymaster sponsors gas in USDC", "Phase 1"],
                          ["Agent Sigma", "On-chain intelligence — feeds signal to Alpha, Beta, V", "Phase 2"],
                          ["Agent Pulse", "Market intelligence aggregation — TVL flows, OI, funding history", "Phase 2"],
                          ["Agent Restake", "EigenLayer AVS allocation management on Ethereum mainnet", "Phase 3–4*"],
                          ["Agent Nexus", "Cross-chain capital coordinator — evolves into M2M settlement layer", "Phase 5"],
                        ].map(([name, desc, phase], i) => (
                          <div key={i} className="flex items-start gap-2 p-3 bg-white/5 rounded">
                            <div className="text-xs">
                              <span className="font-bold text-white">{name}</span>
                              <span className="text-blue-400 ml-2 text-[10px]">{phase}</span>
                              <div className="text-gray-500 mt-0.5">{desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-black mb-3 text-purple-400">Specialised (5 Agents)</h3>
                      <div className="space-y-2 text-sm">
                        {[
                          ["Agent Ghost", "Copy trader — mirrors curated profitable on-chain wallets", "Phase 4"],
                          ["Agent Vault Tax", "Real-time crypto tax accounting, cost basis, tax-loss harvesting", "Phase 4"],
                          ["Agent Legacy", "Programmable DeFi inheritance — time-based beneficiary triggers", "Phase 5"],
                          ["Agent Sovereign", "Personal endowment — principal preservation + autonomous distributions", "Phase 5"],
                          ["Agent Genesis", "Protocol launcher — takes permanent LP stake in every launch", "Phase 5*"],
                        ].map(([name, desc, phase], i) => (
                          <div key={i} className="flex items-start gap-2 p-3 bg-white/5 rounded">
                            <div className="text-xs">
                              <span className="font-bold text-white">{name}</span>
                              <span className="text-purple-400 ml-2 text-[10px]">{phase}</span>
                              <div className="text-gray-500 mt-0.5">{desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── VAULT ── */}
            {activeSection === "vault" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">How the Protocol Works</h2>
                <div className="text-gray-300 space-y-8">

                  <div>
                    <h3 className="text-2xl font-black mb-4">4.1 The Vault</h3>
                    <p className="mb-4">Single USDC vault deployed on Base. Accepts deposits, issues vault shares in return. As agents generate profit and return it, NAV per share increases — all shareholders benefit proportionally without taking any action.</p>

                    <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-sm">
                      <h4 className="font-bold mb-3">Vault Share Mechanics</h4>
                      <div className="space-y-2 text-gray-400">
                        <div>Deposit 1,000 USDC at 1.05 NAV → receive ~952 shares</div>
                        <div>6 months later, NAV grows to 1.18 → those 952 shares = 1,123 USDC</div>
                        <div className="text-green-400 font-bold pt-1">12.3% earned with zero actions taken. Gas paid in USDC via Agent Gas — no ETH required.</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                        <div className="font-bold mb-2 text-cyan-400">Standard Withdrawal</div>
                        <div className="text-gray-400">24-hour notice period. Allows allocation engine to unwind positions without slippage. No fee.</div>
                      </div>
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <div className="font-bold mb-2 text-yellow-400">Emergency Withdrawal</div>
                        <div className="text-gray-400">Immediate execution. Small fee calculated at time of withdrawal based on open position exposure.</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black mb-4">4.2 Agent Execution Model</h3>
                    <p className="mb-4 text-sm text-gray-400">Each agent operates with bounded permissions. No agent can access vault capital beyond its approved allocation limit or transfer funds outside its whitelisted protocol set.</p>
                    <div className="bg-black/30 border border-white/10 rounded-lg p-6">
                      <h4 className="font-bold mb-4 text-sm">Example: Agent Beta Position Lifecycle</h4>
                      <div className="space-y-2">
                        {[
                          "Scan loop detects ETH-PERP funding rate at 78% APY on Synthetix",
                          "Dynamic threshold confirms net profit is positive after all fees",
                          "Beta requests $20,000 USDC allocation from vault",
                          "Beta executes: buys WETH → wraps to wstETH → opens short on Synthetix Perps v3",
                          "Monitor loop tracks position every 30 seconds — funding rate, margin, delta drift",
                          "After 48 hours, funding rate drops below exit threshold",
                          "Beta closes both legs, returns $20,000 + $180 net profit to vault",
                          "Vault NAV per share increases proportionally across all depositors",
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xs flex-shrink-0">{i + 1}</div>
                            <div className="text-sm text-gray-400 pt-0.5">{step}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-4 italic">The entire sequence is autonomous. No human intervention is involved at any stage.</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black mb-4">4.3 Gasless User Experience</h3>
                    <p className="text-sm text-gray-400 mb-4">Every interaction — depositing, withdrawing, claiming staking rewards, adjusting settings — executes via ERC-4337 smart accounts. Users never hold ETH. Session keys allow the protocol to execute pre-approved actions without requiring a wallet confirmation for each individual transaction — enabling true autonomous execution.</p>
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-gray-300">
                      As of early 2026, over 40 million ERC-4337 accounts have been created globally — a direct measure of how many users found the gas requirement sufficiently painful to seek a workaround. Aetheris makes this the default, not an afterthought.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── FEES ── */}
            {activeSection === "fees" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">Fee Structure & Protocol Economics</h2>
                <div className="text-gray-300 space-y-8">

                  <div className="text-center">
                    <div className="text-8xl font-black text-cyan-400 mb-2">20%</div>
                    <div className="text-xl text-gray-300 mb-1">Performance fee on all agent-generated profits</div>
                    <div className="text-sm text-gray-500">Consistent with industry-standard quantitative fund management · No management fee · No deposit fee</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
                      <div className="text-5xl font-black text-green-400 mb-3">80%</div>
                      <div className="font-bold text-white mb-2">Vault Depositors</div>
                      <div className="text-sm text-gray-400">Accrues directly as increased NAV per share. No claim action needed.</div>
                    </div>
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-6 text-center">
                      <div className="text-5xl font-black text-cyan-400 mb-3">20%</div>
                      <div className="font-bold text-white mb-2">AX Stakers</div>
                      <div className="text-sm text-gray-400">Flows to ProfitDistributor. Distributed in USDC, proportional to staked AX. Claim any time.</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Complete Fee Distribution</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-white/10">
                        <th className="text-left py-2 px-3">Revenue Stream</th>
                        <th className="text-center py-2 px-3">Vault Depositors</th>
                        <th className="text-center py-2 px-3">AX Stakers</th>
                      </tr></thead>
                      <tbody className="text-gray-400">
                        {[
                          ["Agent-generated profits", "80%", "20% (protocol fee)"],
                          ["Gas fee spread (USDC collected vs ETH cost)", "—", "100%"],
                          ["MEV savings captured by Agent Armor", "100% (improved NAV)", "—"],
                          ["Borrow refinancing savings", "100% (reduced cost)", "—"],
                        ].map(([stream, vault, stakers], i) => (
                          <tr key={i} className="border-b border-white/10">
                            <td className="py-2 px-3">{stream}</td>
                            <td className="text-center py-2 px-3 text-green-400">{vault}</td>
                            <td className="text-center py-2 px-3 text-cyan-400">{stakers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Vault Yield Multiplier Tiers</h3>
                    <p className="text-sm text-gray-400 mb-4">Vault depositors who also stake AX receive a weighted share multiplier. Multipliers increase relative share — they don't create additional profit. If all depositors stake at maximum tier, everyone earns their proportional share unchanged.</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { tier: "Base",     stake: "0",     mult: "1.00×" },
                        { tier: "Bronze",   stake: "1,000", mult: "1.10×" },
                        { tier: "Silver",   stake: "10,000",mult: "1.25×" },
                        { tier: "Gold",     stake: "100,000",mult:"1.50×" },
                        { tier: "Platinum", stake: "1,000,000",mult:"2.00×",highlight: true },
                      ].map((t) => (
                        <div key={t.tier} className={`p-3 rounded-lg text-center ${t.highlight ? "bg-cyan-500/10 border border-cyan-500/40" : "bg-white/5 border border-white/10"}`}>
                          <div className="font-black text-sm mb-1">{t.tier}</div>
                          <div className="text-xs text-gray-500 mb-2">{t.stake} AX</div>
                          <div className={`text-lg font-black ${t.highlight ? "text-cyan-400" : ""}`}>{t.mult}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Protocol Economics at Scale</h3>
                    <p className="text-sm text-gray-400 mb-4">Assuming 15% blended annual return. Actual returns vary by market conditions and agent phase.</p>
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-white/10">
                        <th className="text-left py-2 px-3">Vault TVL</th>
                        <th className="text-center py-2 px-3">Annual Return (15%)</th>
                        <th className="text-center py-2 px-3">Depositor Share (80%)</th>
                        <th className="text-center py-2 px-3">Protocol Revenue (20%)</th>
                      </tr></thead>
                      <tbody className="text-gray-400">
                        {[
                          ["$1M", "$150K", "$120K", "$30K"],
                          ["$10M", "$1.5M", "$1.2M", "$300K"],
                          ["$100M", "$15M", "$12M", "$3M"],
                          ["$500M", "$75M", "$60M", "$15M"],
                        ].map(([tvl, ret, dep, prot], i) => (
                          <tr key={i} className="border-b border-white/10">
                            <td className="py-2 px-3 font-black text-cyan-400">{tvl}</td>
                            <td className="text-center py-2 px-3">{ret}</td>
                            <td className="text-center py-2 px-3 text-green-400 font-bold">{dep}</td>
                            <td className="text-center py-2 px-3 text-cyan-400 font-bold">{prot}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TOKENOMICS ── */}
            {activeSection === "tokenomics" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">The AX Token</h2>
                <div className="text-gray-300 space-y-8">

                  <div>
                    <h3 className="text-xl font-black mb-3">Total Supply: 1,000,000,000 AX — Fixed Forever</h3>
                    <p className="text-sm text-gray-400 mb-4">No inflation mechanism exists. Staking yield comes entirely from real protocol revenue — not from printing new tokens. AX is not required to use the vault. Vault depositors and AX stakers grow independently.</p>

                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-gray-400 mb-6">
                      <strong className="text-yellow-400">No Public Sale.</strong> Public sales in the current regulatory climate create securities exposure in most jurisdictions. The community earns AX through vault participation and protocol usage — a more aligned distribution than a token sale.
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Token Distribution</h3>
                    <div className="space-y-3">
                      {[
                        { cat: "Community Rewards",     pct: 35, amt: "350M", color: "#22c55e", desc: "Released over 4 years, milestone-gated by vault TVL" },
                        { cat: "Ecosystem & Treasury",  pct: 20, amt: "200M", color: "#06b6d4", desc: "Governance-controlled from day one — no team access" },
                        { cat: "Team & Founders",       pct: 18, amt: "180M", color: "#a855f7", desc: "12-month cliff, 36-month linear vest" },
                        { cat: "Private / Seed Round",  pct: 10, amt: "100M", color: "#eab308", desc: "6-month cliff, 24-month linear vest" },
                        { cat: "Liquidity Provision",   pct:  7, amt: "70M",  color: "#ef4444", desc: "100% at TGE — deployed to Aerodrome & Uniswap V3" },
                        { cat: "Advisors",              pct:  5, amt: "50M",  color: "#f97316", desc: "6-month cliff, 18-month linear vest" },
                        { cat: "Bug Bounty & Security", pct:  3, amt: "30M",  color: "#ec4899", desc: "Per-bounty; unspent rolls to treasury" },
                        { cat: "Reserve",               pct:  2, amt: "20M",  color: "#64748b", desc: "Locked 24 months — supermajority vote required" },
                      ].map((item, i) => (
                        <div key={i}>
                          <div className="flex justify-between mb-1 text-sm">
                            <span className="font-bold">{item.cat}</span>
                            <span style={{ color: item.color }} className="font-bold">{item.pct}% ({item.amt})</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden mb-1">
                            <div className="h-full rounded-full" style={{ width: `${item.pct * 2}%`, backgroundColor: item.color }} />
                          </div>
                          <div className="text-xs text-gray-500">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-4 italic">Community majority (55%) is enforced in the token contract — not just documentation. Cannot be changed without a full token migration requiring community approval.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Staking Mechanics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {[
                        { title: "No minimum stake", desc: "Any amount earns distributions from the first event after staking." },
                        { title: "USDC distributions", desc: "Yield paid in USDC from real agent profit — not AX inflation." },
                        { title: "7-day unstaking delay", desc: "Prevents governance flash-stake attacks. Ensures sustained skin-in-the-game for governance participants." },
                        { title: "Omnichain OFT", desc: "AX is a LayerZero OFT. Stakers on any supported chain receive USDC distributions locally — no bridging required." },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-white/5 rounded-lg">
                          <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xs flex-shrink-0 mt-0.5">✓</div>
                          <div>
                            <div className="font-bold text-white mb-1">{item.title}</div>
                            <div className="text-gray-400 text-xs">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Governance</h3>
                    <p className="text-sm text-gray-400 mb-4">Staked AX governs the protocol. Unstaked AX has zero voting weight. The AX token contract and vault core contract are immutable — no governance override possible. This removes the attack vector of a governance takeover changing the fundamental rules.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {[
                        ["Protocol fee rate", "Bounded: 5%–25%"],
                        ["New agent additions", "Requires audit before vote"],
                        ["Agent protocol whitelist", "48-hr time lock"],
                        ["Vault allocation limits", "Cannot exceed safety bounds"],
                        ["Treasury spending", "Supermajority + 72-hr lock"],
                        ["Agent contract upgrades", "48-hr community review"],
                      ].map(([param, constraint], i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-white/5 rounded">
                          <span className="text-cyan-400">✓</span>
                          <div><span className="text-white font-bold">{param}</span><span className="text-gray-500 ml-2">{constraint}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECURITY ── */}
            {activeSection === "security" && (
              <div>
                <h2 className="text-4xl font-black mb-6 text-cyan-400">Security Architecture</h2>
                <div className="text-gray-300 space-y-8">

                  <p>Aetheris treats security as a continuous operational system — not a pre-launch checklist. The architecture operates across three layers: detection, prevention, and compensation. Each layer handles a different failure mode.</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { layer: "Layer 1 — Detection", agent: "Agent V", color: "#22c55e", desc: "Monitors every contract at bytecode level. Proxy implementation swaps, ownership transfers, hidden function activation, oracle manipulation precursors. Emergency withdrawal within one block of detection." },
                      { layer: "Layer 2 — Prevention", agent: "Agent Omega + Armor", color: "#06b6d4", desc: "Omega monitors health factors on leveraged positions — auto-intervenes at 30%, 15%, 10% buffer. Armor routes all transactions through private mempool — Flashbots Protect + MEV Blocker." },
                      { layer: "Layer 3 — Compensation", agent: "Agent Shield", color: "#a855f7", desc: "Autonomous insurance — Nexus Mutual, InsurAce, Sherlock. Coverage adjusts dynamically. When V detects elevated threat, Shield increases coverage before an event makes it unavailable." },
                    ].map((l, i) => (
                      <div key={i} className="p-6 rounded-lg border" style={{ borderColor: l.color + "30", background: l.color + "08" }}>
                        <div className="text-xs font-bold mb-1" style={{ color: l.color }}>{l.layer}</div>
                        <div className="font-black text-white mb-3">{l.agent}</div>
                        <p className="text-xs text-gray-400 leading-relaxed">{l.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-xl font-black mb-4">Smart Contract Security</h3>
                    <div className="space-y-3 text-sm">
                      {[
                        { title: "Audit-first policy", desc: "Every contract — vault, each agent, ProfitDistributor, AX token — undergoes a full audit before mainnet deployment. Audit reports published in full. No contract deploys with unresolved high or critical findings." },
                        { title: "Immutable core contracts", desc: "Vault contract and AX token contract are immutable after deployment. No upgrade mechanism. Bug fixes require a new deployment with full migration and community approval." },
                        { title: "Upgradeable agents with time locks", desc: "Agent contracts use a proxy pattern for fixes. All upgrades require governance approval and a minimum 48-hour time lock — publicly visible before execution." },
                        { title: "Bounded permissions", desc: "No agent can access vault capital beyond its approved allocation limit or transfer funds to addresses outside its whitelisted protocol set — enforced at the contract level." },
                        { title: "Permanent bug bounty", desc: "Active from mainnet launch. Severity-tiered rewards covering every contract. Responsible disclosure is consistently more valuable than exploitation." },
                        { title: "Multi-signature key management", desc: "Admin keys require M-of-N signatures. Geographically distributed keyholders with hardware wallet enforcement. No single person can execute administrative functions." },
                      ].map((item, i) => (
                        <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                          <div className="font-bold text-white mb-1">{item.title}</div>
                          <div className="text-gray-400 text-xs">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <h3 className="text-lg font-black mb-3 text-red-400">What Security Cannot Guarantee</h3>
                    <div className="space-y-2 text-sm text-gray-400">
                      <div>• <strong className="text-white">Systemic DeFi risk</strong> — catastrophic failure of Uniswap, Aave, or Base L2 itself would affect Aetheris alongside every other protocol.</div>
                      <div>• <strong className="text-white">Novel attack vectors</strong> — V's detection model is built on known attack patterns. A genuinely novel exploit may not trigger existing logic.</div>
                      <div>• <strong className="text-white">Oracle risk</strong> — price oracle manipulation remains a viable vector; a sufficiently sophisticated single-block attack may not be preventable.</div>
                      <div>• <strong className="text-white">Bridge risk</strong> — cross-chain profit repatriation uses LayerZero; bridge risk is real and is why cross-chain expansion is phased, not simultaneous.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ROADMAP ── */}
            {activeSection === "roadmap" && (
              <div>
                <h2 className="text-4xl font-black mb-4 text-cyan-400">Roadmap</h2>
                <p className="text-gray-400 mb-8">
                  Milestone-gated progression — not calendar-gated. Each phase begins when the previous phase's completion criteria are satisfied on-chain, not when a date arrives.
                </p>

                <div className="space-y-6">
                  {[
                    {
                      phase: "Phase 1 — Foundation",
                      status: "ACTIVE",
                      color: "#22c55e",
                      goal: "Two agents profitable on mainnet. Vault architecture built and audited. AX token deployed.",
                      items: [
                        "Agent Alpha — stealth mainnet validation (sub-20ms Rust, 400+ passing tests)",
                        "Agent Beta — ETH-PERP funding rate arb on Synthetix Perps v3",
                        "Agent Gas deployed — gasless transaction infrastructure live",
                        "Agent V monitoring infrastructure operational",
                        "Vault smart contract developed and audited",
                        "AX token deployed on Base as ERC-20",
                      ],
                      gate: "Alpha + Beta both validated profitable across 30+ mainnet days. Vault audited. AX deployed with verified vesting contracts."
                    },
                    {
                      phase: "Phase 2 — Vault Launch",
                      status: "PLANNED",
                      color: "#06b6d4",
                      goal: "Public vault with two proven revenue streams. Core infrastructure agents deployed. AX staking live.",
                      items: [
                        "Vault opens to public deposits with conservative TVL cap",
                        "AX staking live — real USDC distributions from vault protocol fees",
                        "Governance module activated — AX stakers vote from day one",
                        "Agent Delta, Anchor, Omega, Armor, LP, Sigma, Pulse all deployed",
                        "Agent Beta expands: BTC-PERP, SOL-PERP, stETH-PERP + Arbitrum (GMX v2)",
                        "AX upgrades from Base ERC-20 to LayerZero OFT",
                      ],
                      gate: "TVL cap raised at least twice. All 7 Phase 2 agents live. AX OFT on Base + Arbitrum. At least one governance proposal processed."
                    },
                    {
                      phase: "Phase 3 — Ecosystem Expansion",
                      status: "PLANNED",
                      color: "#a855f7",
                      goal: "Full defensive stack live. Complete three-layer security architecture for the first time.",
                      items: [
                        "Agent Shield deployed — V-to-Shield intelligence loop live",
                        "Agent Borrow — automated loan rate optimisation",
                        "Agent Pi — prediction market arb (contingent on liquidity scale)",
                        "Agent Restake — EigenLayer AVS management on Ethereum mainnet",
                        "Agent Beta adds Hyperliquid as third chain dropdown",
                        "V-PROOFS — ZK-SNARK cryptographic protocol attestations",
                        "First institutional vault allocations targeted",
                      ],
                      gate: "All three defensive layer agents live and integrated. Beta on three chains. First institutional deposits received."
                    },
                    {
                      phase: "Phase 4 — Advanced Strategies",
                      status: "PLANNED",
                      color: "#eab308",
                      goal: "Full strategy diversification across all major on-chain yield surfaces.",
                      items: [
                        "Agent Options — covered calls and cash-secured puts on Arbitrum",
                        "Agent Ghost — copy trader, curated profitable wallets",
                        "Agent Vault Tax — real-time tax accounting and loss harvesting",
                        "Agent Beta adds statistical arb, volatility harvesting, Solana (Drift)",
                      ],
                      gate: "Options and Ghost each contributing measurable vault yield. Beta statistical arb active. Solana live as fourth dropdown."
                    },
                    {
                      phase: "Phase 5 — Protocol Maturity",
                      status: "2027 HORIZON",
                      color: "#64748b",
                      goal: "Complete 22-agent ecosystem. 5-chain operation. Full governance decentralisation.",
                      items: [
                        "Agent Legacy — programmable DeFi inheritance",
                        "Agent Sovereign — personal endowment with principal preservation",
                        "Agent Nexus — cross-chain coordinator + M2M settlement layer",
                        "Agent Genesis — autonomous protocol launcher (requires $100M+ TVL)",
                        "All 22 agents live across Base, Arbitrum, Ethereum, Hyperliquid, Solana",
                        "AX OFT on all five chains. No team multisig for any operational decision.",
                      ],
                      gate: "All 22 agents live. 5-chain operation stable. Protocol governance fully decentralised."
                    },
                  ].map((p, i) => (
                    <div key={i} className="rounded-lg border p-6" style={{ borderColor: p.color + "30", background: p.color + "05" }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-black">{p.phase}</h3>
                        <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ color: p.color, borderColor: p.color + "40" }}>{p.status}</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-4 italic">{p.goal}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mb-4">
                        {p.items.map((item, j) => (
                          <div key={j} className="flex items-start gap-2 text-xs text-gray-400">
                            <span style={{ color: p.color }}>→</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded text-xs text-gray-500 border border-white/10 bg-white/5">
                        <strong className="text-gray-300">Completion gate: </strong>{p.gate}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-sm text-gray-300 italic">
                  Phase 1 is active now. Alpha and Beta are in simultaneous development. Phase 2 vault launch will be announced when Phase 1 completion criteria are satisfied on-chain — not before. Progress updates published via the protocol's public channels, including on-chain transaction records from the stealth validation addresses once Phase 1 is complete.
                </div>
              </div>
            )}

            {/* ── RISKS ── */}
            {activeSection === "risks" && (
              <div>
                <h2 className="text-4xl font-black mb-4 text-cyan-400">Risk Factors</h2>
                <p className="text-gray-400 mb-8">Stated without mitigation spin. Each risk exists as described. Participants should read this before depositing capital or acquiring AX.</p>

                <div className="space-y-6">
                  {[
                    {
                      title: "9.1 Smart Contract Risk",
                      items: [
                        ["Protocol contracts", "Audited before deployment. Audits reduce but don't eliminate exploitable vulnerabilities. An exploit of the vault, agent, or ProfitDistributor contract could result in partial or total loss."],
                        ["Third-party protocol contracts", "Agents interact with Uniswap, Aave, Synthetix, GMX, etc. A vulnerability in any of these could cause loss even if Aetheris contracts are secure."],
                        ["Upgradeable agent contracts", "Agent upgrades require governance approval and 48-hour time lock. A governance attack by an entity accumulating sufficient AX could theoretically pass a malicious upgrade."],
                      ]
                    },
                    {
                      title: "9.2 Strategy Risk",
                      items: [
                        ["Agent Alpha — market efficiency", "As Base DEX liquidity grows and more bots enter, spreads narrow. Alpha's returns will trend toward zero in a fully efficient market."],
                        ["Agent Beta — funding rate risk", "Persistently near-zero or negative rates generate reduced yield or losses. Dynamic thresholds keep Beta out of these positions, but the strategy generates no yield during these periods."],
                        ["Agent Beta — liquidation risk", "The short perpetual leg can approach liquidation on extreme ETH moves (>20% in a short period). The long spot leg offsets economically, but realised loss on the perpetual may exceed accumulated funding income."],
                        ["Agent LP — impermanent loss", "Concentrated liquidity positions are exposed to impermanent loss when price moves outside the managed range."],
                        ["Agent Restake — slashing risk", "EigenLayer AVS allocations carry slashing risk. Slashing is irreversible — lost capital cannot be recovered."],
                      ]
                    },
                    {
                      title: "9.3 Operational Risk",
                      items: [
                        ["Off-chain infrastructure", "Monitoring bots run on cloud VPS. Outage, RPC failure, or network partition leaves open positions unmonitored. PM2 auto-restart reduces downtime but cannot guarantee zero."],
                        ["Oracle dependency", "Price oracles determine liquidation thresholds, arbitrage spreads, and funding calculations. Oracle manipulation remains a documented attack vector."],
                        ["Key management", "Private keys for transaction signing are stored in hardened key management systems. A compromise could allow an attacker to submit transactions within bounded agent permission scope."],
                      ]
                    },
                    {
                      title: "9.4 Cross-Chain and Regulatory Risk",
                      items: [
                        ["LayerZero dependency", "AX OFT and cross-chain profit repatriation use LayerZero. A critical vulnerability could affect AX transfers and distributions."],
                        ["Regulatory risk", "DeFi regulation is evolving rapidly. Future actions could affect the protocol's operation in specific jurisdictions or require changes to the AX token structure."],
                      ]
                    },
                  ].map((section, i) => (
                    <div key={i}>
                      <h3 className="text-lg font-black mb-3">{section.title}</h3>
                      <div className="space-y-2">
                        {section.items.map(([title, desc], j) => (
                          <div key={j} className="p-4 bg-white/5 border border-white/10 rounded-lg text-sm">
                            <div className="font-bold text-white mb-1">{title}</div>
                            <div className="text-gray-400 text-xs">{desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <h3 className="text-lg font-black mb-3 text-red-400">9.8 No Guarantees</h3>
                    <p className="text-sm text-gray-400">
                      Nothing in this document constitutes a guarantee of yield, capital preservation, or AX token value. DeFi is a high-risk environment.
                      Historical yield rates do not predict future rates. Participants should not deposit capital they cannot afford to lose entirely.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

// "use client";
// import { motion } from "framer-motion";
// import { useState } from "react";
// import Image from "next/image";
// import Header from "@/components/Header";
// import Footer from "@/components/Footer";

// export default function WhitepaperPage() {
//   const [activeSection, setActiveSection] = useState<"abstract" | "intro" | "problem" | "solution" | "agents" | "features" | "tokenomics" | "security" | "roadmap" | "conclusion">("abstract");

//   const handleDownloadPDF = () => {
//     // TODO: Replace with actual PDF file URL when ready
//     alert("PDF download will be available soon. The whitepaper is currently being finalized.");
//   };

//   const handleViewGitHub = () => {
//     // TODO: Replace with actual GitHub repository URL
//     window.open("https://github.com/aetheris-protocol/whitepaper", "_blank");
//   };

//   return (
//     <div className="min-h-screen flex flex-col bg-[#020617]">
//       <Header />
      
//       <main className="flex-grow pt-32 pb-20 px-6">
//         <div className="max-w-7xl mx-auto">
          
//           {/* Hero */}
//           <motion.div 
//             initial={{ opacity: 0, y: 30 }} 
//             animate={{ opacity: 1, y: 0 }} 
//             className="text-center mb-16"
//           >
//             {/* Aetheris Logo */}
//             <div className="w-32 h-32 mx-auto mb-6 rounded-full border-4 border-cyan-400 overflow-hidden">
//               <Image 
//                 src="/aetherisLogo.jpg" 
//                 alt="Aetheris Logo" 
//                 width={128}
//                 height={128}
//                 className="w-full h-full object-cover"
//               />
//             </div>
            
//             <h1 className="text-4xl md:text-6xl font-black mb-4">AETHERIS WHITEPAPER</h1>
//             <p className="text-xl md:text-2xl text-gray-400 mb-2">
//               Autonomous AI Agents for Decentralized Finance
//             </p>
//             <p className="text-sm text-gray-500 mb-8">Version 1.0 | February 2026</p>
            
//             <div className="flex flex-col sm:flex-row justify-center gap-4">
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={handleDownloadPDF}
//                 className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black"
//               >
//                 Download PDF ⬇️
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={handleViewGitHub}
//                 className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10"
//               >
//                 View on GitHub →
//               </motion.button>
//             </div>
//           </motion.div>

//           {/* Tab Navigation - CENTERED */}
//           <motion.div
//             initial={{ opacity: 0, y: 30 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: 0.2 }}
//             className="mb-8"
//           >
//             <div className="flex gap-2 border-b border-white/10 overflow-x-auto pb-2">
//                 {[
//                   { id: "abstract", label: "Abstract" },
//                   { id: "intro", label: "Introduction" },
//                   { id: "problem", label: "Problem" },
//                   { id: "solution", label: "Solution" },
//                   { id: "agents", label: "Agents" },
//                   { id: "features", label: "Features" },
//                   { id: "tokenomics", label: "Tokenomics" },
//                   { id: "security", label: "Security" },
//                   { id: "roadmap", label: "Roadmap" },
//                   { id: "conclusion", label: "Conclusion" }
//                 ].map((tab) => (
//                   <button
//                     key={tab.id}
//                     onClick={() => setActiveSection(tab.id as any)}
//                     className={`px-4 py-2 font-bold transition-colors relative whitespace-nowrap text-sm md:text-base ${
//                       activeSection === tab.id 
//                         ? "text-cyan-400" 
//                         : "text-gray-400 hover:text-white"
//                     }`}
//                   >
//                     {tab.label}
//                     {activeSection === tab.id && (
//                       <motion.div 
//                         layoutId="activeTab"
//                         className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
//                       />
//                     )}
//                   </button>
//                 ))}
//             </div>
//           </motion.div>

//           {/* Tab Content */}
//           <motion.div
//             key={activeSection}
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.3 }}
//             className="glass-panel p-8 md:p-12"
//           >
//             {/* Abstract */}
//             {activeSection === "abstract" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">Abstract</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-4">
//                   <p>
//                     Aetheris is a decentralized protocol that deploys autonomous AI agents to solve three critical 
//                     problems preventing mass DeFi adoption: gas friction, security vulnerabilities, and passive capital.
//                   </p>
//                   <p>
//                     The protocol introduces five specialized agents operating on Base L2: Agent Gas (removes gas payment 
//                     friction via ERC-4337), Agent V (provides automated security via Proof of Exit), Agent Alpha 
//                     (generates returns via arbitrage), Agent Omega (manages portfolio risk), Agent Delta (optimizes yields), 
//                     and Agent Sigma (enables private research).
//                   </p>
//                   <p>
//                     Aetheris combines gasless transactions, active security monitoring, automated profit generation, 
//                     and cryptographic transparency (V-Proofs) into a unified protocol governed by the $AX token. 
//                     The result is the first DeFi protocol where users deposit funds, agents work autonomously 24/7, 
//                     and capital generates returns while being actively protected—all without requiring gas fees or 
//                     manual intervention.
//                   </p>
//                 </div>
//               </div>
//             )}

//             {/* Introduction */}
//             {activeSection === "intro" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">1. Introduction</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-4">
//                   <p>
//                     Decentralized finance has achieved $150 billion in total value locked, demonstrating significant 
//                     market validation. However, three fundamental barriers prevent mainstream retail adoption:
//                   </p>
                  
//                   <div className="bg-white/5 border border-white/10 rounded-lg p-6 my-6">
//                     <h3 className="font-bold text-lg mb-4">The Three Barriers</h3>
//                     <div className="space-y-4">
//                       <div>
//                         <div className="font-bold text-red-400 mb-2">1. Gas Payment Friction</div>
//                         <div className="text-sm text-gray-400">
//                           Users must acquire ETH before using any DeFi protocol. This creates a circular dependency: 
//                           to use DeFi, you need crypto, but to get crypto, you need to use an exchange (which requires 
//                           KYC), or use DeFi (which requires gas). For users with only USDC, this is a complete barrier.
//                         </div>
//                       </div>
                      
//                       <div>
//                         <div className="font-bold text-red-400 mb-2">2. Security Vulnerabilities</div>
//                         <div className="text-sm text-gray-400">
//                           In H1 2025, $1.1 billion was lost to smart contract exploits, primarily through malicious 
//                           upgrades. Traditional security measures (audits, multi-sigs, timelocks) are passive defenses 
//                           that fail when developers become malicious. Users have no active protection.
//                         </div>
//                       </div>
                      
//                       <div>
//                         <div className="font-bold text-red-400 mb-2">3. Passive Capital</div>
//                         <div className="text-sm text-gray-400">
//                           98% of crypto holders never use DeFi because it requires active management: monitoring prices, 
//                           executing trades, rebalancing portfolios, claiming rewards. Most users simply hold assets that 
//                           generate 0% returns while institutional traders profit from arbitrage and yield optimization.
//                         </div>
//                       </div>
//                     </div>
//                   </div>

//                   <p>
//                     Aetheris addresses each barrier through autonomous AI agents that operate 24/7 without user intervention, 
//                     combined with gasless transactions that remove ETH requirements and active security monitoring that 
//                     protects funds automatically.
//                   </p>
//                 </div>
//               </div>
//             )}

//             {/* Problem */}
//             {activeSection === "problem" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">2. The Problem</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-6">
//                   <div>
//                     <h3 className="font-bold text-xl mb-3">2.1 Gas Payment as a Barrier</h3>
//                     <p className="mb-4">
//                       Every Ethereum transaction requires ETH for gas. This creates a structural barrier for new users:
//                     </p>
//                     <ul className="list-disc list-inside space-y-2 text-sm text-gray-400 ml-4">
//                       <li>User has $1,000 USDC but no ETH</li>
//                       <li>Cannot deposit into any DeFi protocol (need ETH for transaction gas)</li>
//                       <li>Must use centralized exchange to buy ETH (requires KYC, fees, wait time)</li>
//                       <li>Or ask someone to send ETH (social friction, scam risk)</li>
//                       <li>Result: 90% of users give up before completing first transaction</li>
//                     </ul>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-xl mb-3">2.2 Smart Contract Upgrade Attacks</h3>
//                     <p className="mb-4">
//                       Most DeFi protocols use upgradeable smart contracts to fix bugs and add features. This creates 
//                       an attack vector:
//                     </p>
//                     <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm">
//                       <div className="font-bold mb-2">Attack Scenario:</div>
//                       <div className="space-y-1 text-gray-400">
//                         <div>1. Developer deploys legitimate protocol, operates honestly for months</div>
//                         <div>2. Users deposit $50M based on audits and track record</div>
//                         <div>3. Developer upgrades contract to malicious version (adds drain function)</div>
//                         <div>4. Developer calls emergencyDrain(), steals all $50M in 30 seconds</div>
//                         <div>5. Converts to Monero, disappears</div>
//                       </div>
//                       <div className="mt-3 font-bold text-red-400">
//                         Real examples: Uranium Finance ($50M), Merlin DEX ($1.8M), Kokomo Finance ($4M)
//                       </div>
//                     </div>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-xl mb-3">2.3 Opportunity Cost of Passive Holding</h3>
//                     <p className="mb-4">
//                       While users hold stablecoins earning 0%, institutional traders extract value:
//                     </p>
//                     <ul className="list-disc list-inside space-y-2 text-sm text-gray-400 ml-4">
//                       <li>Arbitrage opportunities exist 24/7 (price differences between DEXs)</li>
//                       <li>Yield farming strategies deliver 10-30% APY</li>
//                       <li>Portfolio rebalancing captures volatility premiums</li>
//                       <li>But all require active monitoring and execution (bots running 24/7)</li>
//                       <li>Average user doesn't have time/knowledge to capitalize</li>
//                     </ul>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Solution */}
//             {activeSection === "solution" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">3. Aetheris Solution</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-6">
//                   <p>
//                     Aetheris solves all three problems through a unified protocol combining gasless infrastructure, 
//                     autonomous AI agents, and active security monitoring.
//                   </p>

//                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//                     <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
//                       <div className="text-3xl mb-2">⚡</div>
//                       <div className="font-bold mb-2">Gasless Transactions</div>
//                       <div className="text-sm text-gray-400">
//                         ERC-4337 Account Abstraction removes ETH requirement. Users pay gas in USDC via Paymaster.
//                       </div>
//                     </div>

//                     <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
//                       <div className="text-3xl mb-2">🛡️</div>
//                       <div className="font-bold mb-2">Active Protection</div>
//                       <div className="text-sm text-gray-400">
//                         Agent V monitors all contracts 24/7, detects malicious upgrades, executes Proof of Exit in &lt;2s.
//                       </div>
//                     </div>

//                     <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
//                       <div className="text-3xl mb-2">🤖</div>
//                       <div className="font-bold mb-2">Autonomous Agents</div>
//                       <div className="text-sm text-gray-400">
//                         Five specialized AI agents work 24/7: arbitrage, security, risk management, yield optimization, research.
//                       </div>
//                     </div>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-xl mb-3">User Flow</h3>
//                     <div className="space-y-3">
//                       {[
//                         { step: 1, title: "Connect Wallet", desc: "MetaMask, Rainbow, or any wallet. No KYC, no signup." },
//                         { step: 2, title: "Deposit USDC", desc: "No ETH needed. Gas paid in USDC via Paymaster." },
//                         { step: 3, title: "Activate Agents", desc: "One-click activation. Select Alpha (profit) + V (security)." },
//                         { step: 4, title: "Agents Work 24/7", desc: "Alpha seeks arbitrage. V monitors security. Fully autonomous." },
//                         { step: 5, title: "Earn Automatically", desc: "Profits distributed. Withdraw anytime. All gasless." }
//                       ].map((item) => (
//                         <div key={item.step} className="flex items-start gap-4 p-3 bg-white/5 rounded-lg">
//                           <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center font-bold text-cyan-400 flex-shrink-0">
//                             {item.step}
//                           </div>
//                           <div>
//                             <div className="font-bold">{item.title}</div>
//                             <div className="text-sm text-gray-400">{item.desc}</div>
//                           </div>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Agents */}
//             {activeSection === "agents" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">4. The Five Agents</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-8">
//                   <p>
//                     Each agent is a specialized AI system optimized for a specific function. Agents operate autonomously, 
//                     execute on-chain, and coordinate through the Aetheris protocol.
//                   </p>

//                   {/* Agent V */}
//                   <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-6">
//                     <div className="flex items-center gap-3 mb-4">
//                       <span className="text-4xl">⚡</span>
//                       <div>
//                         <h3 className="text-2xl font-black">Agent V - The Guardian</h3>
//                         <div className="text-sm text-green-400">Launch: Q2 2026</div>
//                       </div>
//                     </div>
//                     <p className="text-sm mb-4">
//                       Monitors all approved smart contracts for malicious upgrades. Executes Proof of Exit (Kill Switch) 
//                       to rescue funds in &lt;2 seconds before attackers can drain them.
//                     </p>
//                     <div className="grid grid-cols-2 gap-3 text-sm">
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Detection Speed</div>
//                         <div className="font-bold">&lt;30 seconds</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Execution Speed</div>
//                         <div className="font-bold">&lt;2 seconds</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Monitoring</div>
//                         <div className="font-bold">24/7 Automated</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Success Rate</div>
//                         <div className="font-bold">&gt;99.9%</div>
//                       </div>
//                     </div>
//                   </div>

//                   {/* Agent Alpha */}
//                   <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-6">
//                     <div className="flex items-center gap-3 mb-4">
//                       <span className="text-4xl">🎯</span>
//                       <div>
//                         <h3 className="text-2xl font-black">Agent Alpha - The Arbitrageur</h3>
//                         <div className="text-sm text-cyan-400">Launch: Q2 2026</div>
//                       </div>
//                     </div>
//                     <p className="text-sm mb-4">
//                       Monitors DEX prices 24/7, identifies arbitrage opportunities, executes atomic trades using flash loans. 
//                       Generates profit from price inefficiencies without requiring upfront capital.
//                     </p>
//                     <div className="grid grid-cols-2 gap-3 text-sm">
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Target Win Rate</div>
//                         <div className="font-bold">&gt;90%</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Execution Speed</div>
//                         <div className="font-bold">&lt;2 seconds</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">DEXs Monitored</div>
//                         <div className="font-bold">3-12</div>
//                       </div>
//                       <div className="bg-black/30 rounded p-3">
//                         <div className="text-gray-500 mb-1">Capital Source</div>
//                         <div className="font-bold">Flash Loans</div>
//                       </div>
//                     </div>
//                   </div>

//                   {/* Other Agents (Phase 3) */}
//                   <div className="border border-yellow-500/30 rounded-lg p-6 bg-yellow-500/5">
//                     <h3 className="text-xl font-black mb-4 text-yellow-400">Phase 3 Agents (Q4 2026)</h3>
//                     <div className="space-y-4 text-sm">
//                       <div>
//                         <div className="font-bold mb-1">🛡️ Agent Omega - Risk Guardian</div>
//                         <div className="text-gray-400">
//                           Manages portfolio risk, sets stop-losses, rebalances across assets, monitors correlations.
//                         </div>
//                       </div>
//                       <div>
//                         <div className="font-bold mb-1">💎 Agent Delta - Yield Optimizer</div>
//                         <div className="text-gray-400">
//                           Scans yield farming opportunities, auto-compounds rewards, optimizes gas costs, maximizes APY.
//                         </div>
//                       </div>
//                       <div>
//                         <div className="font-bold mb-1">🔮 Agent Sigma - Privacy Research</div>
//                         <div className="text-gray-400">
//                           Private AI research assistant with 2M token context, anonymous queries, knowledge marketplace.
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Features */}
//             {activeSection === "features" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">5. Core Features</h2>
//                 <div className="space-y-8">
//                   {/* Gasless */}
//                   <div>
//                     <h3 className="text-2xl font-black mb-4">5.1 Gasless Transactions (ERC-4337)</h3>
//                     <div className="text-gray-300 space-y-4">
//                       <p>
//                         Aetheris implements ERC-4337 Account Abstraction, allowing users to pay gas fees in USDC instead 
//                         of ETH. This removes the primary barrier to DeFi adoption.
//                       </p>
//                       <div className="bg-white/5 border border-white/10 rounded-lg p-4">
//                         <h4 className="font-bold mb-3">Fee Tiers (Stake $AX for Discounts)</h4>
//                         <div className="grid grid-cols-5 gap-2 text-xs">
//                           {[
//                             { tier: "Base", stake: "0", discount: "0%", fee: "$5.25" },
//                             { tier: "Bronze", stake: "1K", discount: "10%", fee: "$4.73" },
//                             { tier: "Silver", stake: "10K", discount: "25%", fee: "$3.94" },
//                             { tier: "Gold", stake: "100K", discount: "50%", fee: "$2.63" },
//                             { tier: "Platinum", stake: "1M", discount: "100%", fee: "FREE" }
//                           ].map((t) => (
//                             <div key={t.tier} className="bg-white/5 rounded p-2 text-center">
//                               <div className="font-bold">{t.tier}</div>
//                               <div className="text-gray-500 my-1">{t.stake} $AX</div>
//                               <div className="text-cyan-400 font-bold">{t.discount}</div>
//                               <div className="text-gray-400">{t.fee}</div>
//                             </div>
//                           ))}
//                         </div>
//                       </div>
//                     </div>
//                   </div>

//                   {/* Proof of Exit */}
//                   <div>
//                     <h3 className="text-2xl font-black mb-4">5.2 Proof of Exit (Kill Switch)</h3>
//                     <div className="text-gray-300 space-y-4">
//                       <p>
//                         Agent V's automated emergency rescue system. When a malicious contract upgrade is detected, 
//                         executes atomic transaction that rescues funds in &lt;2 seconds.
//                       </p>
//                       <div className="bg-white/5 border border-white/10 rounded-lg p-4">
//                         <h4 className="font-bold mb-3">5-Step Atomic Execution:</h4>
//                         <div className="space-y-2 text-sm">
//                           {[
//                             "Revoke token approvals",
//                             "Emergency withdraw deposits",
//                             "Transfer to Cold Safe (5-of-7 multi-sig)",
//                             "Blacklist malicious contract",
//                             "Log events & notify users"
//                           ].map((step, i) => (
//                             <div key={i} className="flex items-center gap-2">
//                               <span className="text-green-400">→</span>
//                               <span className="text-gray-400">{step}</span>
//                             </div>
//                           ))}
//                         </div>
//                       </div>
//                     </div>
//                   </div>

//                   {/* V-Proofs */}
//                   <div>
//                     <h3 className="text-2xl font-black mb-4">5.3 V-Proofs (Zero-Knowledge Transparency)</h3>
//                     <div className="text-gray-300 space-y-4">
//                       <p>
//                         ZK-SNARK cryptographic attestations published every 6 hours proving protocol metrics are correct 
//                         without revealing user data. 100% transparency + 100% privacy simultaneously.
//                       </p>
//                       <div className="grid grid-cols-2 gap-4 text-sm">
//                         <div className="bg-green-500/10 border border-green-500/20 rounded p-3">
//                           <div className="font-bold mb-2 text-green-400">Proves:</div>
//                           <div className="text-gray-400 text-xs space-y-1">
//                             <div>• TVL is accurate</div>
//                             <div>• User count is real</div>
//                             <div>• Threats blocked</div>
//                             <div>• $AX burned</div>
//                           </div>
//                         </div>
//                         <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
//                           <div className="font-bold mb-2 text-red-400">Hides:</div>
//                           <div className="text-gray-400 text-xs space-y-1">
//                             <div>• Individual balances</div>
//                             <div>• Wallet addresses</div>
//                             <div>• Transaction details</div>
//                             <div>• Personal data</div>
//                           </div>
//                         </div>
//                       </div>
//                       <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-xs">
//                         <span className="font-bold text-yellow-400">Launch: Q4 2026</span>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Tokenomics */}
//             {activeSection === "tokenomics" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">6. $AX Tokenomics</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-6">
//                   <div>
//                     <h3 className="font-bold text-xl mb-3">Total Supply: 1,000,000,000 $AX (Fixed)</h3>
//                     <div className="text-sm text-gray-400">
//                       Non-inflationary. No new tokens can ever be minted. Deflationary over time via burns.
//                     </div>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-lg mb-3">Token Allocation</h3>
//                     <div className="space-y-2 text-sm">
//                       {[
//                         { cat: "Public Sale", pct: "30%", amt: "300M", desc: "Seed + Private + IDO" },
//                         { cat: "Community", pct: "25%", amt: "250M", desc: "Liquidity mining, staking, airdrops" },
//                         { cat: "Team", pct: "20%", amt: "200M", desc: "4-year vest, 12mo cliff" },
//                         { cat: "Development", pct: "15%", amt: "150M", desc: "Protocol dev, audits" },
//                         { cat: "Liquidity", pct: "10%", amt: "100M", desc: "DEX/CEX provision" }
//                       ].map((item, i) => (
//                         <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded">
//                           <div className="flex items-center gap-3">
//                             <div className="w-12 text-cyan-400 font-bold">{item.pct}</div>
//                             <div>
//                               <div className="font-bold">{item.cat}</div>
//                               <div className="text-xs text-gray-500">{item.desc}</div>
//                             </div>
//                           </div>
//                           <div className="text-gray-500 text-xs">{item.amt}</div>
//                         </div>
//                       ))}
//                     </div>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-lg mb-3">Utility & Value Accrual</h3>
//                     <div className="grid grid-cols-2 gap-3 text-sm">
//                       <div className="bg-white/5 rounded p-3">
//                         <div className="font-bold mb-1">Fee Discounts</div>
//                         <div className="text-gray-400 text-xs">Up to 100% discount</div>
//                       </div>
//                       <div className="bg-white/5 rounded p-3">
//                         <div className="font-bold mb-1">Revenue Sharing</div>
//                         <div className="text-gray-400 text-xs">30% → stakers (USDC)</div>
//                       </div>
//                       <div className="bg-white/5 rounded p-3">
//                         <div className="font-bold mb-1">Governance</div>
//                         <div className="text-gray-400 text-xs">1 $AX = 1 vote</div>
//                       </div>
//                       <div className="bg-white/5 rounded p-3">
//                         <div className="font-bold mb-1">Deflationary</div>
//                         <div className="text-gray-400 text-xs">50% revenue → buyback & burn</div>
//                       </div>
//                     </div>
//                   </div>

//                   <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
//                     <div className="font-bold mb-2 text-purple-400">Buyback-and-Burn Mechanism</div>
//                     <div className="text-sm text-gray-400 mb-3">
//                       Aetheris uses protocol revenue to buyback $AX from the market and burn it permanently. 
//                       This approach maintains standard ERC20 compatibility while creating sustained deflationary pressure.
//                     </div>
//                     <div className="grid grid-cols-2 gap-3 text-xs">
//                       <div className="flex items-start gap-2">
//                         <span className="text-green-400">✓</span>
//                         <div>
//                           <div className="font-bold text-white">DeFi Compatible</div>
//                           <div className="text-gray-500">Standard ERC20 behavior</div>
//                         </div>
//                       </div>
//                       <div className="flex items-start gap-2">
//                         <span className="text-green-400">✓</span>
//                         <div>
//                           <div className="font-bold text-white">Buy Pressure</div>
//                           <div className="text-gray-500">Protocol buys before burning</div>
//                         </div>
//                       </div>
//                       <div className="flex items-start gap-2">
//                         <span className="text-green-400">✓</span>
//                         <div>
//                           <div className="font-bold text-white">Transparent</div>
//                           <div className="text-gray-500">Public burn events</div>
//                         </div>
//                       </div>
//                       <div className="flex items-start gap-2">
//                         <span className="text-green-400">✓</span>
//                         <div>
//                           <div className="font-bold text-white">Sustainable</div>
//                           <div className="text-gray-500">Revenue-based deflation</div>
//                         </div>
//                       </div>
//                     </div>
//                     <div className="mt-3 text-xs text-gray-500 italic">
//                       Used by leading protocols: Ethereum (EIP-1559), Uniswap, Aave, MakerDAO
//                     </div>
//                   </div>

//                   <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm">
//                     <div className="font-bold mb-2 text-green-400">Fundraising: $11M Total</div>
//                     <div className="text-gray-400">
//                       Seed ($500K at $0.01) + Private ($3M at $0.03) + IDO ($7.5M at $0.05)
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Security */}
//             {activeSection === "security" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">7. Security & Audits</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-6">
//                   <div>
//                     <h3 className="font-bold text-lg mb-3">Multi-Layered Defense</h3>
//                     <div className="space-y-3 text-sm">
//                       {[
//                         { 
//                           layer: "Smart Contract Security", 
//                           items: ["Dual audits (Certik + OpenZeppelin)", "Quarterly reviews", "Formal verification", "100% open-source"] 
//                         },
//                         { 
//                           layer: "Operational Security", 
//                           items: ["5-of-7 multi-sig", "Community reps", "48hr timelock", "Emergency pause"] 
//                         },
//                         { 
//                           layer: "Economic Security", 
//                           items: ["$2M insurance fund", "105% collateral", "Transparent reserves", "Pro-rata claims"] 
//                         }
//                       ].map((sec, i) => (
//                         <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-4">
//                           <div className="font-bold mb-2">{sec.layer}</div>
//                           <ul className="space-y-1 text-gray-400 text-xs">
//                             {sec.items.map((item, j) => (
//                               <li key={j}>• {item}</li>
//                             ))}
//                           </ul>
//                         </div>
//                       ))}
//                     </div>
//                   </div>

//                   <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
//                     <div className="font-bold mb-2 text-purple-400">Bug Bounty: $100,000</div>
//                     <div className="text-sm text-gray-400">
//                       Maximum reward for critical vulnerabilities. security@aetheris.io or Immunefi
//                     </div>
//                   </div>

//                   <div>
//                     <h3 className="font-bold text-lg mb-3">Audit Schedule</h3>
//                     <div className="space-y-2 text-sm">
//                       <div className="flex items-center justify-between p-3 bg-white/5 rounded">
//                         <span className="font-bold">Certik Pre-Launch</span>
//                         <span className="text-cyan-400">Q2 2026</span>
//                       </div>
//                       <div className="flex items-center justify-between p-3 bg-white/5 rounded">
//                         <span className="font-bold">OpenZeppelin Pre-Launch</span>
//                         <span className="text-cyan-400">Q2 2026</span>
//                       </div>
//                       <div className="flex items-center justify-between p-3 bg-white/5 rounded">
//                         <span className="font-bold">Quarterly Reviews</span>
//                         <span className="text-cyan-400">Q3 2026+</span>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Roadmap */}
//             {activeSection === "roadmap" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">8. Roadmap</h2>
//                 <div className="space-y-6">
//                   {[
//                     { 
//                       phase: "Phase 1: Foundation", 
//                       time: "Q2 2026", 
//                       items: ["Agent Gas + V + Alpha", "$AX token launch", "Dual audits", "Mainnet on Base L2"]
//                     },
//                     { 
//                       phase: "Phase 2: Growth", 
//                       time: "Q3 2026", 
//                       items: ["Marketing campaign", "CEX listings", "Liquidity mining", "Bug bounty launch"]
//                     },
//                     { 
//                       phase: "Phase 3: Expansion", 
//                       time: "Q4 2026", 
//                       items: ["V-Proofs launch", "Agents Omega + Delta + Sigma", "Cross-chain", "$2M insurance"]
//                     },
//                     { 
//                       phase: "Phase 4: Maturity", 
//                       time: "2027+", 
//                       items: ["Institutional partnerships", "Advanced capabilities", "Multi-chain", "Decentralized gov"]
//                     }
//                   ].map((phase, i) => (
//                     <div key={i} className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-6">
//                       <div className="flex items-center justify-between mb-4">
//                         <h3 className="text-xl font-black">{phase.phase}</h3>
//                         <div className="text-sm text-cyan-400">{phase.time}</div>
//                       </div>
//                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-400">
//                         {phase.items.map((item, j) => (
//                           <div key={j} className="flex items-center gap-2">
//                             <span className="text-green-400">✓</span>
//                             <span>{item}</span>
//                           </div>
//                         ))}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Conclusion */}
//             {activeSection === "conclusion" && (
//               <div>
//                 <h2 className="text-4xl font-black mb-6 text-cyan-400">9. Conclusion</h2>
//                 <div className="text-gray-300 leading-relaxed space-y-4">
//                   <p>
//                     Aetheris represents a fundamental shift in how users interact with decentralized finance. By removing 
//                     gas payment friction, providing active security protection, and deploying autonomous agents that work 24/7, 
//                     Aetheris makes DeFi accessible to mainstream users for the first time.
//                   </p>

//                   <p>
//                     The protocol's multi-layered approach—gasless transactions (ERC-4337), Proof of Exit (automated security), 
//                     autonomous AI agents (passive income), and V-Proofs (cryptographic transparency)—addresses the core barriers 
//                     that have prevented mass adoption.
//                   </p>

//                   <p>
//                     With $11M in planned fundraising, dual professional audits, a $2M insurance fund, and a clear 4-phase roadmap, 
//                     Aetheris is positioned to become the leading protocol for autonomous DeFi operations.
//                   </p>

//                   <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-6 mt-8">
//                     <div className="font-bold text-2xl mb-4">The Future of DeFi</div>
//                     <div className="text-gray-400">
//                       Users deposit funds once. Agents work forever. Capital generates returns while being actively protected. 
//                       All without gas fees, manual intervention, or trust requirements. This is the future Aetheris is building.
//                     </div>
//                   </div>

//                   <div className="mt-8 text-center">
//                     <h3 className="text-2xl font-black mb-4">Join the Aetheris Ecosystem</h3>
//                     <div className="flex flex-col sm:flex-row gap-4 justify-center">
//                       <motion.button
//                         whileHover={{ scale: 1.05 }}
//                         className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black"
//                       >
//                         Join Community
//                       </motion.button>
//                       <motion.button
//                         whileHover={{ scale: 1.05 }}
//                         className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10"
//                       >
//                         Read Documentation
//                       </motion.button>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}
//           </motion.div>

//         </div>
//       </main>

//       <Footer />
//     </div>
//   );
// }